import {
    PublicKey,
    Transaction,
    VersionedTransaction
} from '@solana/web3.js';
import {
    Raydium,
    CLMM_PROGRAM_ID,
    TxVersion,
    ApiV3PoolInfoConcentratedItem,
    PoolUtils,
    ComputeClmmPoolInfo,
    ReturnTypeFetchMultiplePoolTickArrays
} from '@raydium-io/raydium-sdk-v2';
import {
    WhirlpoolContext,
    buildWhirlpoolClient,
    swapQuoteByInputToken
} from '@orca-so/whirlpools-sdk';
import { DecimalUtil, Percentage } from '@orca-so/common-sdk';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { connection, wallet, SKR_MINT, USDC_MINT, SKR_TOKEN, USDC_TOKEN, ORCA_POOL_ADDRESS } from './config';

// Custom Wallet Adapter
const createWalletAdapter = () => {
  return {
    publicKey: wallet.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([wallet]);
      } else {
        (tx as Transaction).sign(wallet);
      }
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return txs.map((tx) => {
        if (tx instanceof VersionedTransaction) {
          tx.sign([wallet]);
        } else {
          (tx as Transaction).sign(wallet);
        }
        return tx;
      });
    }
  };
};

const getRaydium = async () => Raydium.load({ connection, owner: wallet });

const getOrca = () => {
  const ctx = WhirlpoolContext.from(connection, createWalletAdapter());
  return buildWhirlpoolClient(ctx);
};


/**
 * EXECUTE RAYDIUM SWAP (CLMM)
 */
const swapRaydium = async (
  inputToken: any,
  outputToken: any,
  amountIn: string
): Promise<string> => {
  try {
    const raydium = await getRaydium();

    // 1. Get Pool Info
    const data = await raydium.api.fetchPoolByMints({ mint1: USDC_MINT, mint2: SKR_MINT });
    const pools = (data as any).data || data;
    const poolInfo = pools.find((p: any) => p.programId === CLMM_PROGRAM_ID.toBase58()) as ApiV3PoolInfoConcentratedItem | undefined;

    if (!poolInfo) throw new Error('Raydium CLMM Pool not found');

    // Validate input mint matches pool
    const inputMint = new PublicKey(inputToken.mint);
    if (inputMint.toBase58() !== poolInfo.mintA.address && inputMint.toBase58() !== poolInfo.mintB.address) {
      throw new Error('Input mint does not match pool');
    }

    // 2. Fetch Compute Pool Info and Tick Arrays
    let clmmPoolInfo: ComputeClmmPoolInfo;
    let tickCache: ReturnTypeFetchMultiplePoolTickArrays;
    let poolKeys: any;

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

    // 3. Calculate amount in and determine base direction
    const amountInBN = new BN(
      new Decimal(amountIn).mul(new Decimal(10).pow(inputToken.decimals)).toFixed(0)
    );

    const baseIn = inputMint.toBase58() === poolInfo.mintA.address;
    const tokenOut = baseIn ? poolInfo.mintB : poolInfo.mintA;

    // 4. Compute amount out with slippage (1% slippage)
    const tickArrayCache = tickCache[poolInfo.id];
    if (!tickArrayCache) {
      throw new Error(`Tick array cache not found for pool ${poolInfo.id}`);
    }

    const { minAmountOut, remainingAccounts } = await PoolUtils.computeAmountOutFormat({
      poolInfo: clmmPoolInfo,
      tickArrayCache,
      amountIn: amountInBN,
      tokenOut,
      slippage: 0.01,
      epochInfo: await raydium.fetchEpochInfo(),
    });

    // 5. Build and execute swap
    console.log(`[Raydium] Swapping ${amountIn} ${inputToken.symbol}...`);

    const { execute } = await raydium.clmm.swap({
      poolInfo,
      poolKeys,
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
};

/**
 * EXECUTE ORCA SWAP
 */
const swapOrca = async (
  inputToken: any,
  outputToken: any,
  amountIn: string
): Promise<string> => {
  try {
    const client = getOrca();
    const whirlpool = await client.getPool(new PublicKey(ORCA_POOL_ADDRESS));

    const amountAtomic = DecimalUtil.toBN(new Decimal(amountIn), inputToken.decimals);
    const slippage = Percentage.fromFraction(200, 10000); // 2%

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
};

export const executeArbitrage = async (direction: 'A' | 'B', amountUSDC: string) => {
  console.log(`\n🚨 EXECUTING STRATEGY ${direction} with ${amountUSDC} USDC`);

  try {
    if (direction === 'A') {
      await swapRaydium(USDC_TOKEN, SKR_TOKEN, amountUSDC);
      const skrBalance = await connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(new PublicKey(SKR_TOKEN.mint), wallet.publicKey)
      );
      console.log(`[Arbitrage] Acquired ${skrBalance.value.uiAmount} SKR. Selling on Orca...`);
      if (skrBalance.value.uiAmount && skrBalance.value.uiAmount > 0) {
        await swapOrca(SKR_TOKEN, USDC_TOKEN, skrBalance.value.uiAmount.toString());
      }
    } else {
      await swapOrca(USDC_TOKEN, SKR_TOKEN, amountUSDC);
      const skrBalance = await connection.getTokenAccountBalance(
        await getAssociatedTokenAddress(new PublicKey(SKR_TOKEN.mint), wallet.publicKey)
      );
      console.log(`[Arbitrage] Acquired ${skrBalance.value.uiAmount} SKR. Selling on Raydium...`);
      if (skrBalance.value.uiAmount && skrBalance.value.uiAmount > 0) {
        await swapRaydium(SKR_TOKEN, USDC_TOKEN, skrBalance.value.uiAmount.toString());
      }
    }
    console.log(`✅ Strategy ${direction} Completed Successfully!`);
  } catch (e) {
    console.error('❌ Execution Stopped:', e);
  }
};
