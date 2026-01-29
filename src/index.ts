import { startTracking } from './tracker';
import { createOrcaQuoter, createRaydiumQuoter } from './quoter';
import { executeArbitrage } from './executor';
import {
  connection,
  wallet,
  SKR_MINT,
  USDC_MINT,
  SKR_TOKEN,
  USDC_TOKEN,
  ORCA_POOL_ADDRESS,
} from './config';

const RAYDIUM_POOL_ID = 'fchJDDYsnkX6dhY7MMjvNRmYiR7DMSYisKqT2HAZmqP';
const AMOUNT_TO_CHECK = '1';
const PROFIT_THRESHOLD = 1.0;

async function main(): Promise<void> {
  const getOrcaQuote = createOrcaQuoter({
    connection,
    wallet,
    poolAddress: ORCA_POOL_ADDRESS,
    skrToken: SKR_TOKEN,
    usdcToken: USDC_TOKEN,
  });

  const getRaydiumQuote = createRaydiumQuoter({
    connection,
    wallet,
    skrMint: SKR_MINT,
    usdcMint: USDC_MINT,
  });

  const runArbitrage = (direction: 'A' | 'B', amountUSDC: string) =>
    executeArbitrage(
      {
        connection,
        wallet,
        usdcMint: USDC_MINT,
        skrMint: SKR_MINT,
        skrToken: SKR_TOKEN,
        usdcToken: USDC_TOKEN,
        orcaPoolAddress: ORCA_POOL_ADDRESS,
      },
      direction,
      amountUSDC
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
  });

  setInterval(() => {}, 1000 * 60 * 60);
}

main().catch(console.error);
