import { getAssociatedTokenAddress } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { startTracking } from './core/tracker';
import type { BalanceSnapshot } from './core/tracker';
import { createOrcaQuoter, createRaydiumQuoter } from './core/quoter';
import { executeArbitrage } from './core/executor';
import { getGasEstSol } from './core/gas';
import { getSolPriceUsd } from './core/price';
import {
  connection,
  wallet,
  BASE_MINT,
  QUOTE_MINT,
  BASE_TOKEN,
  QUOTE_TOKEN,
  ORCA_POOL_ADDRESS,
  MIN_PROFIT_PERCENT,
} from './config';

const RAYDIUM_POOL_ID =
  process.env.RAYDIUM_POOL_ID?.trim() ||
  'fchJDDYsnkX6dhY7MMjvNRmYiR7DMSYisKqT2HAZmqP';
const AMOUNT_TO_CHECK = process.env.AMOUNT_TO_CHECK?.trim() || '1';
const PROFIT_THRESHOLD = Number(process.env.PROFIT_THRESHOLD?.trim() || '1');

async function main(): Promise<void> {
  const getOrcaQuote = createOrcaQuoter({
    connection,
    wallet,
    poolAddress: ORCA_POOL_ADDRESS,
    baseToken: BASE_TOKEN,
    quoteToken: QUOTE_TOKEN,
  });

  const getRaydiumQuote = createRaydiumQuoter({
    connection,
    wallet,
    baseMint: BASE_MINT,
    quoteMint: QUOTE_MINT,
  });

  const runArbitrage = (direction: 'A' | 'B', amountInQuote: string) =>
    executeArbitrage(
      {
        connection,
        wallet,
        quoteMint: QUOTE_MINT,
        baseMint: BASE_MINT,
        quoteToken: QUOTE_TOKEN,
        baseToken: BASE_TOKEN,
        orcaPoolAddress: ORCA_POOL_ADDRESS,
      },
      direction,
      amountInQuote
    );

  const getGasCostUsd = async (): Promise<number> => {
    const [gasEstSol, solPriceUsd] = await Promise.all([
      getGasEstSol({ connection }),
      getSolPriceUsd(),
    ]);
    return gasEstSol * solPriceUsd;
  };

  const getBalance = async (): Promise<BalanceSnapshot> => {
    let usdc = 0;
    try {
      const ata = await getAssociatedTokenAddress(
        new PublicKey(QUOTE_MINT),
        wallet.publicKey
      );
      const bal = await connection.getTokenAccountBalance(ata);
      usdc = bal.value.uiAmount ?? 0;
    } catch {
      // ignore
    }
    const [lamports, solPriceUsd] = await Promise.all([
      connection.getBalance(wallet.publicKey),
      getSolPriceUsd(),
    ]);
    const sol = lamports / 1e9;
    return { usdc, sol, solPriceUsd };
  };

  await startTracking({
    connection,
    orcaPoolAddress: ORCA_POOL_ADDRESS,
    raydiumPoolId: RAYDIUM_POOL_ID,
    getOrcaQuote,
    getRaydiumQuote,
    executeArbitrage: runArbitrage,
    amountToCheck: AMOUNT_TO_CHECK,
    profitThreshold: PROFIT_THRESHOLD,
    quoteSymbol: QUOTE_TOKEN.symbol,
    baseSymbol: BASE_TOKEN.symbol,
    getGasCostUsd,
    minProfitPercent: MIN_PROFIT_PERCENT,
    getBalance,
  });

  setInterval(() => {}, 1000 * 60 * 60);
}

main().catch(console.error);
