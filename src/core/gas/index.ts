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

export async function getGasEstSol(
  params: GetGasEstSolParams
): Promise<GetGasEstSolReturn> {
  const { connection } = params;
  try {
    const fees = await connection.getRecentPrioritizationFees();
    if (!fees.length) return FALLBACK_GAS_EST_SOL;

    const sorted = [...fees].sort(
      (a, b) => b.prioritizationFee - a.prioritizationFee
    );
    const p75Index = Math.min(
      Math.floor(sorted.length * 0.75),
      sorted.length - 1
    );
    const priorityFeePerCu = sorted[p75Index]?.prioritizationFee ?? 0;

    const priorityLamportsPerTx =
      ESTIMATED_CU_PER_SWAP * priorityFeePerCu * 1e-6;
    const lamportsPerTx = LAMPORTS_PER_SIGNATURE + priorityLamportsPerTx;
    const solPerTx = lamportsPerTx / LAMPORTS_PER_SOL;
    const gasEstSol = NUM_TXS * solPerTx;

    return Math.max(gasEstSol, FALLBACK_GAS_EST_SOL * 0.5);
  } catch {
    return FALLBACK_GAS_EST_SOL;
  }
}
