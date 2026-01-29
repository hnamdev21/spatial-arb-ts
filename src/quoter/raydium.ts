import Decimal from 'decimal.js';
import { Raydium, CLMM_PROGRAM_ID } from '@raydium-io/raydium-sdk-v2';
import type { Connection } from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';
import type { Quote } from '../types';

export type RaydiumQuote = Quote<'Raydium'>;

export type RaydiumQuoterParams = {
  connection: Connection;
  wallet: Keypair;
  skrMint: string;
  usdcMint: string;
};

export type GetRaydiumQuote = (
  inputAmount: string,
  isBuy: boolean
) => Promise<RaydiumQuote>;

export function createRaydiumQuoter(
  params: RaydiumQuoterParams
): GetRaydiumQuote {
  const { connection, wallet, skrMint, usdcMint } = params;

  let raydiumInstance: Raydium | null = null;

  async function getRaydium(): Promise<Raydium> {
    if (raydiumInstance) return raydiumInstance;
    raydiumInstance = await Raydium.load({ connection, owner: wallet });
    return raydiumInstance;
  }

  return async function getRaydiumQuote(
    inputAmount: string,
    isBuy: boolean
  ): Promise<RaydiumQuote> {
    try {
      const raydium = await getRaydium();

      const data = await raydium.api.fetchPoolByMints({
        mint1: usdcMint,
        mint2: skrMint,
      });
      const pools =
        (data as { data?: unknown[] }).data ??
        (Array.isArray(data) ? data : []);

      const clmmPools = (
        pools as {
          programId: string;
          id: string;
          mintA: { address: string };
          tvl: number;
        }[]
      ).filter((p) => p.programId === CLMM_PROGRAM_ID.toBase58());
      if (clmmPools.length === 0)
        throw new Error('No CLMM pool found for SKR/USDC');

      clmmPools.sort((a, b) => b.tvl - a.tvl);
      const pool = clmmPools[0];
      if (!pool) throw new Error('No CLMM pool found for SKR/USDC');

      const rpcData = await raydium.clmm.getRpcClmmPoolInfo({
        poolId: pool.id,
      });

      let priceDecimal = new Decimal(rpcData.currentPrice);

      const baseMint = pool.mintA.address;
      const inputMint = isBuy ? usdcMint : skrMint;

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
      throw new Error(
        `Raydium CLMM quote failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}
