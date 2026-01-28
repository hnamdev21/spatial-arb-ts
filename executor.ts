import {
    PublicKey,
    Transaction,
    VersionedTransaction,
    ComputeBudgetProgram
} from '@solana/web3.js';
import {
    Raydium,
    CLMM_PROGRAM_ID,
    TxVersion,
    ApiV3PoolInfoConcentratedItem,
    TickUtils
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

// --- HELPER: Calculate Tick Array Addresses Manually ---
const getTickArrayPublicKeys = (
    currentTickIndex: number,
    tickSpacing: number,
    programId: PublicKey,
    poolId: PublicKey
): PublicKey[] => {
    // Tick Array size is 60 ticks per array in Raydium CLMM
    const TICK_ARRAY_SIZE = 60;

    // Calculate the start index of the current tick array
    // Usage: Math.floor(tick / (spacing * 60)) * spacing * 60
    const currentStart = TickUtils.getTickArrayStartIndexByTick(currentTickIndex, tickSpacing);

    // We fetch Current, Prev (-1), and Next (+1) arrays to ensure we cover the swap path
    const startIndices = [
        currentStart,
        currentStart - (tickSpacing * TICK_ARRAY_SIZE),
        currentStart + (tickSpacing * TICK_ARRAY_SIZE)
    ];

    // Derive PDAs manually (Bypassing SDK type issues)
    // Seeds: [b"tick_array", pool_pubkey, i32_start_index_bytes (Big Endian)]
    return startIndices.map(index => {
        const header = Buffer.from("tick_array", "utf8");
        const indexBuf = Buffer.alloc(4);
        indexBuf.writeInt32BE(index); // Raydium uses Big Endian for tick seeds

        return PublicKey.findProgramAddressSync(
            [header, poolId.toBuffer(), indexBuf],
            programId
        )[0];
    });
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

    // 1. Get Pool
    const data = await raydium.api.fetchPoolByMints({ mint1: USDC_MINT, mint2: SKR_MINT });
    const pools = (data as any).data || data;
    const poolInfo = pools.find((p: any) => p.programId === CLMM_PROGRAM_ID.toBase58());

    if (!poolInfo) throw new Error('Raydium CLMM Pool not found');

    const rpcData = await raydium.clmm.getRpcClmmPoolInfo({ poolId: poolInfo.id });

    // 2. Generate Tick Arrays (Fixed: Using 'currentTickIndex')
    const tickArrays = getTickArrayPublicKeys(
        (rpcData as any).currentTickIndex, // <--- FIX 2: Cast to any or use correct property
        poolInfo.config.tickSpacing,
        new PublicKey(poolInfo.programId),
        new PublicKey(poolInfo.id)
    );

    const amountInBN = new BN(
      new Decimal(amountIn).mul(new Decimal(10).pow(inputToken.decimals)).toFixed(0)
    );

    // 3. Compute & Build Swap
    const { builder } = await raydium.clmm.swap({
      poolInfo: poolInfo as ApiV3PoolInfoConcentratedItem,
      inputMint: new PublicKey(inputToken.mint),
      amountIn: amountInBN,
      amountOutMin: new BN(0),
      observationId: rpcData.observationId,
      ownerInfo: {
        useSOLBalance: true,
      },
      remainingAccounts: tickArrays,
      txVersion: TxVersion.V0,
    });

    // 4. Inject Compute Budget
    const cuInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 });
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 });

    builder.addInstruction({
      instructions: [cuInstruction, priorityFeeInstruction],
      endInstructions: [],
      signers: [],
    });

    // 5. Build Transaction
    const { transaction } = await builder.build({
        txVersion: TxVersion.V0,
    });

    // 6. Sign & Send
    console.log(`[Raydium] Swapping ${amountIn} ${inputToken.symbol}...`);

    let txId: string;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    if (transaction instanceof VersionedTransaction) {
        transaction.message.recentBlockhash = blockhash;
        transaction.sign([wallet]);

        txId = await connection.sendTransaction(transaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
        });
    } else {
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        transaction.sign(wallet);

        txId = await connection.sendTransaction(transaction, [wallet], {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
        });
    }

    console.log(`[Raydium] Confirmed: https://solscan.io/tx/${txId}`);

    await connection.confirmTransaction({
        signature: txId,
        blockhash,
        lastValidBlockHeight
    }, 'confirmed');

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
