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
  usdcMint: string;
  skrMint: string;
  skrToken: TokenInfo;
  usdcToken: TokenInfo;
  orcaPoolAddress: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getUsdcBalance(
  connection: Connection,
  wallet: Keypair,
  usdcMint: string
): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(
      new PublicKey(usdcMint),
      wallet.publicKey
    );
    const bal = await connection.getTokenAccountBalance(ata);
    return bal.value.uiAmount ?? 0;
  } catch (e) {
    console.warn('Could not fetch USDC balance:', e);
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
  const { connection, wallet, usdcMint, skrMint } = params;
  try {
    const raydium = await getRaydiumInstance(connection, wallet);

    const data = await raydium.api.fetchPoolByMints({
      mint1: usdcMint,
      mint2: skrMint,
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

export type ExecuteArbitrageFn = (
  direction: 'A' | 'B',
  amountUSDC: string
) => Promise<void>;

export async function executeArbitrage(
  params: ExecutorParams,
  direction: 'A' | 'B',
  amountUSDC: string
): Promise<void> {
  const { connection, wallet, usdcMint, skrToken, usdcToken } = params;

  console.log(`\n🚨 EXECUTING STRATEGY ${direction} with ${amountUSDC} USDC`);

  const startUsdc = await getUsdcBalance(connection, wallet, usdcMint);
  console.log(`[Balance] Start: $${startUsdc.toFixed(6)} USDC`);

  try {
    if (direction === 'A') {
      await swapRaydium(params, usdcToken, skrToken, amountUSDC);

      await sleep(1000);

      const skrBalance = await connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(
          new PublicKey(skrToken.mint),
          wallet.publicKey
        )
      );

      console.log(
        `[Arbitrage] Acquired ${skrBalance.value.uiAmount} SKR. Selling on Orca...`
      );

      if (skrBalance.value.uiAmount != null && skrBalance.value.uiAmount > 0) {
        await swapOrca(
          params,
          skrToken,
          usdcToken,
          skrBalance.value.uiAmount.toString()
        );
      }
    } else {
      await swapOrca(params, usdcToken, skrToken, amountUSDC);

      await sleep(1000);

      const skrBalance = await connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(
          new PublicKey(skrToken.mint),
          wallet.publicKey
        )
      );

      console.log(
        `[Arbitrage] Acquired ${skrBalance.value.uiAmount} SKR. Selling on Raydium...`
      );

      if (skrBalance.value.uiAmount != null && skrBalance.value.uiAmount > 0) {
        await swapRaydium(
          params,
          skrToken,
          usdcToken,
          skrBalance.value.uiAmount.toString()
        );
      }
    }

    await sleep(2000);
    const endUsdc = await getUsdcBalance(connection, wallet, usdcMint);
    const profit = endUsdc - startUsdc;
    const profitPercent = (profit / parseFloat(amountUSDC)) * 100;

    console.log(`\n=========================================`);
    console.log(`✅ EXECUTION COMPLETED`);
    console.log(`-----------------------------------------`);
    console.log(`Start Balance: $${startUsdc.toFixed(6)}`);
    console.log(`End Balance:   $${endUsdc.toFixed(6)}`);
    console.log(`-----------------------------------------`);
    if (profit > 0) {
      console.log(
        `💰 PROFIT:      +$${profit.toFixed(6)} (+${profitPercent.toFixed(2)}%)`
      );
    } else {
      console.log(
        `📉 LOSS:        -$${Math.abs(profit).toFixed(6)} (${profitPercent.toFixed(2)}%)`
      );
    }
    console.log(`=========================================\n`);
  } catch (e) {
    console.error('❌ Execution Stopped:', e);
  }
}
