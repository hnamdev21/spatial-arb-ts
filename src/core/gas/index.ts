import type { Connection } from '@solana/web3.js';

const LAMPORTS_PER_SIGNATURE = 5_000;
const LAMPORTS_PER_SOL = 1e9;
const ESTIMATED_CU_PER_SWAP = 350_000;
const NUM_TXS = 2;

const FALLBACK_GAS_EST_SOL = Number(process.env.GAS_EST_SOL?.trim() || '0.005');

export type GetGasEstSolParams = {
  connection: Connection;
};

export type GetGasEstSolReturn = number;

export type GasBreakdown = {
  networkSol: number;
  prioritySol: number;
  totalSol: number;
};

export async function getGasBreakdown(
  params: GetGasEstSolParams
): Promise<GasBreakdown> {
  const { connection } = params;
  const networkLamports = NUM_TXS * LAMPORTS_PER_SIGNATURE;
  const networkSol = networkLamports / LAMPORTS_PER_SOL;
  let prioritySol = 0;
  try {
    const fees = await connection.getRecentPrioritizationFees();
    if (fees.length > 0) {
      const sorted = [...fees].sort(
        (a, b) => b.prioritizationFee - a.prioritizationFee
      );
      const p75Index = Math.min(
        Math.floor(sorted.length * 0.75),
        sorted.length - 1
      );
      const priorityFeePerCu = sorted[p75Index]?.prioritizationFee ?? 0;
      const priorityLamports =
        NUM_TXS * ESTIMATED_CU_PER_SWAP * priorityFeePerCu * 1e-6;
      prioritySol = priorityLamports / LAMPORTS_PER_SOL;
    }
  } catch {
    // keep prioritySol 0
  }
  const totalSol = Math.max(
    networkSol + prioritySol,
    FALLBACK_GAS_EST_SOL * 0.5
  );
  return { networkSol, prioritySol, totalSol };
}

export async function getGasEstSol(
  params: GetGasEstSolParams
): Promise<GetGasEstSolReturn> {
  const { totalSol } = await getGasBreakdown(params);
  return totalSol;
}
