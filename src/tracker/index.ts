import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import type { GetOrcaQuote } from '../quoter/orca';
import type { GetRaydiumQuote } from '../quoter/raydium';
import type { ExecuteArbitrageFn } from '../executor';

export type TrackerParams = {
  connection: Connection;
  orcaPoolAddress: string;
  raydiumPoolId: string;
  getOrcaQuote: GetOrcaQuote;
  getRaydiumQuote: GetRaydiumQuote;
  executeArbitrage: ExecuteArbitrageFn;
  amountToCheck: string;
  profitThreshold: number;
  quoteSymbol?: string;
};

type PriceData = {
  orca: number;
  raydium: number;
  lastUpdate: number;
};

export function startTracking(params: TrackerParams): void {
  const {
    connection,
    orcaPoolAddress,
    raydiumPoolId,
    getOrcaQuote,
    getRaydiumQuote,
    executeArbitrage,
    amountToCheck,
    profitThreshold,
    quoteSymbol = 'quote',
  } = params;

  const market: PriceData = {
    orca: 0,
    raydium: 0,
    lastUpdate: 0,
  };

  let isSwapping = false;

  async function calculateSpread(): Promise<void> {
    if (market.orca === 0 || market.raydium === 0) return;

    const spreadA = ((market.orca - market.raydium) / market.raydium) * 100;
    const spreadB = ((market.raydium - market.orca) / market.orca) * 100;

    console.clear();
    console.log(
      `--- 🛰 Spatial Arbitrage Tracker (Executing > ${profitThreshold}%) ---`
    );
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Prices for ${amountToCheck} ${quoteSymbol}:`);
    console.log(`Orca:    $${market.orca.toFixed(6)}`);
    console.log(`Raydium: $${market.raydium.toFixed(6)}`);
    console.log(`-----------------------------------------`);
    console.log(`Strategy A (Buy Ray -> Sell Orca): ${spreadA.toFixed(4)}%`);
    console.log(`Strategy B (Buy Orca -> Sell Ray): ${spreadB.toFixed(4)}%`);

    if (isSwapping) {
      console.log(`\n⚠️ SWAP IN PROGRESS... Pausing tracker.`);
      return;
    }

    if (spreadA > profitThreshold) {
      isSwapping = true;
      await executeArbitrage('A', amountToCheck);
      isSwapping = false;
    } else if (spreadB > profitThreshold) {
      isSwapping = true;
      await executeArbitrage('B', amountToCheck);
      isSwapping = false;
    }
  }

  async function updateOrca(): Promise<void> {
    if (isSwapping) return;
    try {
      const q = await getOrcaQuote(amountToCheck, false);
      market.orca = parseFloat(q.price);
      market.lastUpdate = Date.now();
      await calculateSpread();
    } catch (e) {
      console.error(e);
    }
  }

  async function updateRaydium(): Promise<void> {
    if (isSwapping) return;
    try {
      const q = await getRaydiumQuote(amountToCheck, false);
      market.raydium = parseFloat(q.price);
      market.lastUpdate = Date.now();
      await calculateSpread();
    } catch (e) {
      console.error(e);
    }
  }

  console.log('Initializing WebSocket connections...');
  connection.onAccountChange(
    new PublicKey(orcaPoolAddress),
    () => void updateOrca(),
    'processed'
  );
  connection.onAccountChange(
    new PublicKey(raydiumPoolId),
    () => void updateRaydium(),
    'processed'
  );
  void updateOrca();
  void updateRaydium();
}
