import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  Raydium,
  CLMM_PROGRAM_ID,
  TxVersion,
  ApiV3PoolInfoConcentratedItem,
  PoolUtils,
  ComputeClmmPoolInfo,
  ReturnTypeFetchMultiplePoolTickArrays,
} from '@raydium-io/raydium-sdk-v2';
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from '@orca-so/whirlpools-sdk';
import { DecimalUtil, Percentage } from '@orca-so/common-sdk';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import type { Connection, Keypair } from '@solana/web3.js';
import type { TokenInfo } from '../types';

export type ExecutorParams = {
  connection: Connection;
  wallet: Keypair;
  quoteMint: string;
  baseMint: string;
  quoteToken: TokenInfo;
  baseToken: TokenInfo;
  orcaPoolAddress: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getQuoteBalance(
  connection: Connection,
  wallet: Keypair,
  quoteMint: string
): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(
      new PublicKey(quoteMint),
      wallet.publicKey
    );
    const bal = await connection.getTokenAccountBalance(ata);
    return bal.value.uiAmount ?? 0;
  } catch (e) {
    console.warn('Could not fetch quote token balance:', e);
    return 0;
  }
}

function createWalletAdapter(wallet: Keypair) {
  return {
    publicKey: wallet.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([wallet]);
      } else {
        (tx as Transaction).sign(wallet);
      }
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> => {
      return txs.map((tx) => {
        if (tx instanceof VersionedTransaction) {
          tx.sign([wallet]);
        } else {
          (tx as Transaction).sign(wallet);
        }
        return tx;
      });
    },
  };
}

async function getRaydiumInstance(connection: Connection, wallet: Keypair) {
  return Raydium.load({ connection, owner: wallet });
}

function getOrcaClient(connection: Connection, wallet: Keypair) {
  const ctx = WhirlpoolContext.from(connection, createWalletAdapter(wallet));
  return buildWhirlpoolClient(ctx);
}

async function swapRaydium(
  params: ExecutorParams,
  inputToken: TokenInfo,
  _outputToken: TokenInfo,
  amountIn: string
): Promise<string> {
  const { connection, wallet, quoteMint, baseMint } = params;
  try {
    const raydium = await getRaydiumInstance(connection, wallet);

    const data = await raydium.api.fetchPoolByMints({
      mint1: quoteMint,
      mint2: baseMint,
    });
    const rawPools = (data as { data?: unknown[] }).data ?? data;
    const pools = Array.isArray(rawPools)
      ? (rawPools as { programId: string }[])
      : [];
    const found = pools.find((p) => p.programId === CLMM_PROGRAM_ID.toBase58());
    const poolInfo = found as ApiV3PoolInfoConcentratedItem | undefined;

    if (!poolInfo) throw new Error('Raydium CLMM Pool not found');

    const inputMint = new PublicKey(inputToken.mint);
    if (
      inputMint.toBase58() !== poolInfo.mintA.address &&
      inputMint.toBase58() !== poolInfo.mintB.address
    ) {
      throw new Error('Input mint does not match pool');
    }

    let clmmPoolInfo: ComputeClmmPoolInfo;
    let tickCache: ReturnTypeFetchMultiplePoolTickArrays;
    let poolKeys: Parameters<typeof raydium.clmm.swap>[0]['poolKeys'];

    if (raydium.cluster === 'mainnet') {
      clmmPoolInfo = await PoolUtils.fetchComputeClmmInfo({
        connection: raydium.connection,
        poolInfo,
      });
      tickCache = await PoolUtils.fetchMultiplePoolTickArrays({
        connection: raydium.connection,
        poolKeys: [clmmPoolInfo],
      });
    } else {
      const rpcData = await raydium.clmm.getPoolInfoFromRpc(poolInfo.id);
      poolKeys = rpcData.poolKeys;
      clmmPoolInfo = rpcData.computePoolInfo;
      tickCache = rpcData.tickData;
    }

    const amountInBN = new BN(
      new Decimal(amountIn)
        .mul(new Decimal(10).pow(inputToken.decimals))
        .toFixed(0)
    );

    const baseIn = inputMint.toBase58() === poolInfo.mintA.address;
    const tokenOut = baseIn ? poolInfo.mintB : poolInfo.mintA;

    const tickArrayCache = tickCache[poolInfo.id];
    if (!tickArrayCache) {
      throw new Error(`Tick array cache not found for pool ${poolInfo.id}`);
    }

    const { minAmountOut, remainingAccounts } =
      await PoolUtils.computeAmountOutFormat({
        poolInfo: clmmPoolInfo,
        tickArrayCache,
        amountIn: amountInBN,
        tokenOut,
        slippage: 0.01,
        epochInfo: await raydium.fetchEpochInfo(),
      });

    console.log(`[Raydium] Swapping ${amountIn} ${inputToken.symbol}...`);

    const { execute } = await raydium.clmm.swap({
      poolInfo,
      poolKeys: poolKeys!,
      inputMint: inputMint.toBase58(),
      amountIn: amountInBN,
      amountOutMin: minAmountOut.amount.raw,
      observationId: clmmPoolInfo.observationId,
      ownerInfo: {
        useSOLBalance: true,
      },
      remainingAccounts,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 100000,
      },
    });

    const { txId } = await execute();
    console.log(`[Raydium] Confirmed: https://solscan.io/tx/${txId}`);

    return txId;
  } catch (e) {
    console.error('[Raydium] Swap Failed:', e);
    throw e;
  }
}

async function swapOrca(
  params: ExecutorParams,
  inputToken: TokenInfo,
  _outputToken: TokenInfo,
  amountIn: string
): Promise<string> {
  const { connection, wallet, orcaPoolAddress } = params;
  try {
    const client = getOrcaClient(connection, wallet);
    const whirlpool = await client.getPool(new PublicKey(orcaPoolAddress));

    const amountAtomic = DecimalUtil.toBN(
      new Decimal(amountIn),
      inputToken.decimals
    );
    const slippage = Percentage.fromFraction(200, 10000);

    const quote = await swapQuoteByInputToken(
      whirlpool,
      new PublicKey(inputToken.mint),
      amountAtomic,
      slippage,
      client.getContext().program.programId,
      client.getContext().fetcher,
      undefined
    );

    console.log(`[Orca] Swapping ${amountIn} ${inputToken.symbol}...`);

    const txBuilder = await whirlpool.swap(quote);
    const tx = await txBuilder.buildAndExecute();

    console.log(`[Orca] Confirmed: https://solscan.io/tx/${tx}`);

    return tx;
  } catch (e) {
    console.error('[Orca] Swap Failed:', e);
    throw e;
  }
}

export type ExecuteArbitrageResult = {
  txSignature: string;
  netProfit: number;
};

export type ExecuteArbitrageFn = (
  direction: 'A' | 'B',
  amountInQuote: string
) => Promise<ExecuteArbitrageResult | undefined>;

export async function executeArbitrage(
  params: ExecutorParams,
  direction: 'A' | 'B',
  amountInQuote: string
): Promise<ExecuteArbitrageResult | undefined> {
  const { connection, wallet, quoteMint, quoteToken, baseToken } = params;

  // console.log(
  //   `\n🚨 EXECUTING STRATEGY ${direction} with ${amountInQuote} ${quoteToken.symbol}`
  // );

  const startQuote = await getQuoteBalance(connection, wallet, quoteMint);
  // console.log(`[Balance] Start: ${startQuote.toFixed(6)} ${quoteToken.symbol}`);

  try {
    let lastTxSignature = '';
    if (direction === 'A') {
      lastTxSignature = await swapRaydium(
        params,
        quoteToken,
        baseToken,
        amountInQuote
      );

      // await sleep(1000);

      const baseBalance = await connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(
          new PublicKey(baseToken.mint),
          wallet.publicKey
        )
      );

      console.log(
        `[Arbitrage] Acquired ${baseBalance.value.uiAmount} ${baseToken.symbol}. Selling on Orca...`
      );

      if (
        baseBalance.value.uiAmount != null &&
        baseBalance.value.uiAmount > 0
      ) {
        lastTxSignature = await swapOrca(
          params,
          baseToken,
          quoteToken,
          baseBalance.value.uiAmount.toString()
        );
      }
    } else {
      lastTxSignature = await swapOrca(
        params,
        quoteToken,
        baseToken,
        amountInQuote
      );

      // await sleep(1000);

      const baseBalance = await connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(
          new PublicKey(baseToken.mint),
          wallet.publicKey
        )
      );

      console.log(
        `[Arbitrage] Acquired ${baseBalance.value.uiAmount} ${baseToken.symbol}. Selling on Raydium...`
      );

      if (
        baseBalance.value.uiAmount != null &&
        baseBalance.value.uiAmount > 0
      ) {
        lastTxSignature = await swapRaydium(
          params,
          baseToken,
          quoteToken,
          baseBalance.value.uiAmount.toString()
        );
      }
    }

    // await sleep(2000);
    const endQuote = await getQuoteBalance(connection, wallet, quoteMint);
    const profit = endQuote - startQuote;
    // const profitPercent = (profit / parseFloat(amountInQuote)) * 100;

    // console.log(`\n=========================================`);
    // console.log(`✅ EXECUTION COMPLETED`);
    // console.log(`-----------------------------------------`);
    // console.log(`Start Balance: ${startQuote.toFixed(6)} ${quoteToken.symbol}`);
    // console.log(`End Balance:   ${endQuote.toFixed(6)} ${quoteToken.symbol}`);
    // console.log(`-----------------------------------------`);
    // if (profit > 0) {
    //   console.log(
    //     `💰 PROFIT:      +${profit.toFixed(6)} (+${profitPercent.toFixed(2)}%)`
    //   );
    // } else {
    //   console.log(
    //     `📉 LOSS:        -${Math.abs(profit).toFixed(6)} (${profitPercent.toFixed(2)}%)`
    //   );
    // }
    // console.log(`=========================================\n`);

    return { txSignature: lastTxSignature, netProfit: profit };
  } catch (e) {
    console.error('❌ Execution Stopped:', e);
    return undefined;
  }
}
