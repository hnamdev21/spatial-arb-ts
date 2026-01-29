import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import type { Keypair } from '@solana/web3.js';
import { Raydium, CLMM_PROGRAM_ID } from '@raydium-io/raydium-sdk-v2';

const FEE_RATE_DENOMINATOR = 1_000_000;

export type GetPoolFeeRatesParams = {
  connection: Connection;
  wallet: Keypair;
  orcaPoolAddress: string;
  baseMint: string;
  quoteMint: string;
};

export type PoolFeeRates = {
  orcaFeeRate: number;
  raydiumFeeRate: number;
};

const ORCA_WHIRLPOOL_FEE_RATE_OFFSET = 45;

async function getOrcaPoolFeeRate(
  connection: Connection,
  poolAddress: string
): Promise<number> {
  try {
    const accountInfo = await connection.getAccountInfo(
      new PublicKey(poolAddress)
    );
    if (
      !accountInfo?.data ||
      accountInfo.data.length < ORCA_WHIRLPOOL_FEE_RATE_OFFSET + 2
    )
      return 0;
    const data = accountInfo.data;
    const feeRate = data.readUInt16LE(ORCA_WHIRLPOOL_FEE_RATE_OFFSET);
    return feeRate;
  } catch {
    return 0;
  }
}

async function getRaydiumPoolFeeRate(
  connection: Connection,
  wallet: Keypair,
  quoteMint: string,
  baseMint: string
): Promise<{ feeRate: number; poolId: string }> {
  try {
    const raydium = await Raydium.load({ connection, owner: wallet });
    const data = await raydium.api.fetchPoolByMints({
      mint1: quoteMint,
      mint2: baseMint,
    });
    const pools =
      (data as { data?: unknown[] }).data ?? (Array.isArray(data) ? data : []);
    const clmmPools = (
      pools as { programId: string; id: string; tvl: number }[]
    ).filter((p) => p.programId === CLMM_PROGRAM_ID.toBase58());
    if (clmmPools.length === 0) return { feeRate: 0, poolId: '' };
    clmmPools.sort((a, b) => b.tvl - a.tvl);
    const poolId = clmmPools[0]?.id ?? '';
    if (!poolId) return { feeRate: 0, poolId: '' };
    const { computePoolInfo } = await raydium.clmm.getPoolInfoFromRpc(poolId);
    const feeRate = computePoolInfo.ammConfig.tradeFeeRate ?? 0;
    return { feeRate, poolId };
  } catch {
    return { feeRate: 0, poolId: '' };
  }
}

export async function getPoolFeeRates(
  params: GetPoolFeeRatesParams
): Promise<PoolFeeRates> {
  const { connection, wallet, orcaPoolAddress, baseMint, quoteMint } = params;
  const [orcaFeeRate, raydiumResult] = await Promise.all([
    getOrcaPoolFeeRate(connection, orcaPoolAddress),
    getRaydiumPoolFeeRate(connection, wallet, quoteMint, baseMint),
  ]);
  const raydiumFeeRate = raydiumResult.feeRate;
  return { orcaFeeRate, raydiumFeeRate };
}

export function feeRateToPercent(rate: number): string {
  return ((rate / FEE_RATE_DENOMINATOR) * 100).toFixed(4);
}

export function poolFeeUsdFromRates(
  amountUsdc: number,
  rates: PoolFeeRates
): number {
  const totalRate =
    (rates.orcaFeeRate + rates.raydiumFeeRate) / FEE_RATE_DENOMINATOR;
  return amountUsdc * totalRate;
}
