import { getOrcaQuote } from './orca_quoter';
import { getRaydiumQuote } from './raydium_quoter';

const main = async (): Promise<void> => {
  const testInputAmount = '1'; // 1000 SKR in human units
  const isBuy = false; // selling SKR for USDC

  console.log('Spatial Arbitrage Bot - Phase 1');
  console.log(`Comparing quotes for ${testInputAmount} SKR (${isBuy ? 'BUY' : 'SELL'})\n`);

  const [orcaResult, raydiumResult] = await Promise.allSettled([
    getOrcaQuote(testInputAmount, isBuy),
    getRaydiumQuote(testInputAmount, isBuy),
  ]);

  const rows: Array<{ DEX: string; Output: string; Price: string; Status: string }> = [];

  if (orcaResult.status === 'fulfilled') {
    rows.push({
      DEX: orcaResult.value.dex,
      Output: orcaResult.value.output,
      Price: orcaResult.value.price,
      Status: 'OK',
    });
  } else {
    rows.push({
      DEX: 'Orca',
      Output: 'ERROR',
      Price: 'ERROR',
      Status: orcaResult.reason instanceof Error ? orcaResult.reason.message : 'Unknown error',
    });
  }

  if (raydiumResult.status === 'fulfilled') {
    rows.push({
      DEX: raydiumResult.value.dex,
      Output: raydiumResult.value.output,
      Price: raydiumResult.value.price,
      Status: 'OK',
    });
  } else {
    rows.push({
      DEX: 'Raydium',
      Output: 'ERROR',
      Price: 'ERROR',
      Status:
        raydiumResult.reason instanceof Error ? raydiumResult.reason.message : 'Unknown error',
    });
  }

  console.table(rows);
};

void main();


