import { PublicKey } from '@solana/web3.js';
import { connection, ORCA_POOL_ADDRESS } from './config';
import { getOrcaQuote } from './orca_quoter';
import { getRaydiumQuote } from './raydium_quoter';
import { executeArbitrage } from './executor'; // <--- IMPORT THIS

const RAYDIUM_POOL_ID = 'fchJDDYsnkX6dhY7MMjvNRmYiR7DMSYisKqT2HAZmqP';

type PriceData = {
  orca: number;
  raydium: number;
  lastUpdate: number;
};

const market: PriceData = {
  orca: 0,
  raydium: 0,
  lastUpdate: 0,
};

const AMOUNT_TO_CHECK = '1'; // <--- CHANGED TO 1 USDC
const PROFIT_THRESHOLD = 1.0; // Execute if > 1% spread

let isSwapping = false; // <--- LOCK

const calculateSpread = async () => {
  if (market.orca === 0 || market.raydium === 0) return;

  // Strategy A: Buy Raydium (Low) -> Sell Orca (High)
  const spreadA = ((market.orca - market.raydium) / market.raydium) * 100;

  // Strategy B: Buy Orca (Low) -> Sell Raydium (High)
  const spreadB = ((market.raydium - market.orca) / market.orca) * 100;

  console.clear();
  console.log(`--- 🛰 Spatial Arbitrage Tracker (Executing > ${PROFIT_THRESHOLD}%) ---`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Prices for ${AMOUNT_TO_CHECK} USDC:`);
  console.log(`Orca:    $${market.orca.toFixed(6)}`);
  console.log(`Raydium: $${market.raydium.toFixed(6)}`);
  console.log(`-----------------------------------------`);
  console.log(`Strategy A (Buy Ray -> Sell Orca): ${spreadA.toFixed(4)}%`);
  console.log(`Strategy B (Buy Orca -> Sell Ray): ${spreadB.toFixed(4)}%`);

  if (isSwapping) {
    console.log(`\n⚠️ SWAP IN PROGRESS... Pausing tracker.`);
    return;
  }

  // EXECUTION LOGIC
  if (spreadA > PROFIT_THRESHOLD) {
    isSwapping = true;
    await executeArbitrage('A', AMOUNT_TO_CHECK);
    isSwapping = false;
  } else if (spreadB > PROFIT_THRESHOLD) {
    isSwapping = true;
    await executeArbitrage('B', AMOUNT_TO_CHECK);
    isSwapping = false;
  }
};

const updateOrca = async () => {
  if (isSwapping) return;
  try {
    const q = await getOrcaQuote(AMOUNT_TO_CHECK, false);
    market.orca = parseFloat(q.price);
    market.lastUpdate = Date.now();
    calculateSpread();
  } catch (e) { console.error(e); }
};

const updateRaydium = async () => {
  if (isSwapping) return;
  try {
    const q = await getRaydiumQuote(AMOUNT_TO_CHECK, false);
    market.raydium = parseFloat(q.price);
    market.lastUpdate = Date.now();
    calculateSpread();
  } catch (e) { console.error(e); }
};

export const startTracking = () => {
  console.log('Initializing WebSocket connections...');
  connection.onAccountChange(new PublicKey(ORCA_POOL_ADDRESS), () => updateOrca(), 'processed');
  connection.onAccountChange(new PublicKey(RAYDIUM_POOL_ID), () => updateRaydium(), 'processed');
  updateOrca();
  updateRaydium();
};
