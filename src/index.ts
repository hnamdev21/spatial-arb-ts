import { startTracking } from './tracker';
import { createOrcaQuoter, createRaydiumQuoter } from './quoter';
import { executeArbitrage } from './executor';
import {
  connection,
  wallet,
  BASE_MINT,
  QUOTE_MINT,
  BASE_TOKEN,
  QUOTE_TOKEN,
  ORCA_POOL_ADDRESS,
} from './config';

const RAYDIUM_POOL_ID =
  process.env.RAYDIUM_POOL_ID?.trim() ||
  'fchJDDYsnkX6dhY7MMjvNRmYiR7DMSYisKqT2HAZmqP';
const AMOUNT_TO_CHECK = process.env.AMOUNT_TO_CHECK?.trim() || '1';
const PROFIT_THRESHOLD = Number(
  process.env.PROFIT_THRESHOLD?.trim() || '1.0'
);

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
  });

  setInterval(() => {}, 1000 * 60 * 60);
}

main().catch(console.error);
