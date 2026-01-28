import Decimal from 'decimal.js';
import { Raydium, CLMM_PROGRAM_ID } from '@raydium-io/raydium-sdk-v2';
import { connection, wallet, SKR_MINT, USDC_MINT } from './config';

export type RaydiumQuote = {
  dex: 'Raydium';
  price: string;
  output: string;
};

let raydiumInstance: Raydium | null = null;

const getRaydium = async (): Promise<Raydium> => {
  if (raydiumInstance) return raydiumInstance;
  raydiumInstance = await Raydium.load({ connection, owner: wallet });
  return raydiumInstance;
};

export const getRaydiumQuote = async (inputAmount: string, isBuy: boolean): Promise<RaydiumQuote> => {
  try {
    const raydium = await getRaydium();

    // 1. Fetch ALL pools
    const data = await raydium.api.fetchPoolByMints({ mint1: USDC_MINT, mint2: SKR_MINT });
    const pools = (data as any).data || (Array.isArray(data) ? data : []);

    // 2. Filter for CLMM
    const clmmPools = pools.filter((p: any) => p.programId === CLMM_PROGRAM_ID.toBase58());
    if (clmmPools.length === 0) throw new Error('No CLMM pool found for SKR/USDC');

    // Sort by TVL to get the main pool
    clmmPools.sort((a: any, b: any) => b.tvl - a.tvl);
    const pool = clmmPools[0];

    // 3. Fetch Real-Time On-Chain Data (Spot Price)
    const rpcData = await raydium.clmm.getRpcClmmPoolInfo({ poolId: pool.id });

    // 4. Calculate Price & Output based on Spot Price
    // CLMM Price is always Price of MintA in terms of MintB (or vice versa depending on config)
    // usually price = TokenB / TokenA

    let priceDecimal = new Decimal(rpcData.currentPrice);

    // Adjust for direction (The pool keys A/B are fixed, but our swap direction changes)
    const baseMint = pool.mintA.address;
    const quoteMint = pool.mintB.address;
    const inputMint = isBuy ? USDC_MINT : SKR_MINT;

    // If our Input is Token B, we need to invert the price (Price is usually A/B)
    // IMPORTANT: Verify logic with a small test, but standard is:
    // If Input == MintA, Output = Input * Price
    // If Input == MintB, Output = Input * (1 / Price)

    if (inputMint !== baseMint) {
        priceDecimal = new Decimal(1).div(priceDecimal);
    }

    const outputAmount = new Decimal(inputAmount).mul(priceDecimal);

    return {
      dex: 'Raydium',
      price: priceDecimal.toString(),
      output: outputAmount.toString(),
    };

  } catch (error) {
    throw new Error(`Raydium CLMM quote failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
