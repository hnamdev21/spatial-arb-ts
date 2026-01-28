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

    // In Phase 2 optimization, we will hardcode the Pool ID we found to skip this search
    const data = await raydium.api.fetchPoolByMints({ mint1: USDC_MINT, mint2: SKR_MINT });
    const pools = (data as any).data || (Array.isArray(data) ? data : []);

    const clmmPools = pools.filter((p: any) => p.programId === CLMM_PROGRAM_ID.toBase58());
    if (clmmPools.length === 0) throw new Error('No CLMM pool found for SKR/USDC');

    clmmPools.sort((a: any, b: any) => b.tvl - a.tvl);
    const pool = clmmPools[0];

    const rpcData = await raydium.clmm.getRpcClmmPoolInfo({ poolId: pool.id });

    let priceDecimal = new Decimal(rpcData.currentPrice);

    const baseMint = pool.mintA.address;
    const inputMint = isBuy ? USDC_MINT : SKR_MINT;

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
