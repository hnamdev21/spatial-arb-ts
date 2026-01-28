import { PublicKey } from '@solana/web3.js';
import { connection, ORCA_POOL_ADDRESS } from './config';
import { getOrcaQuote } from './orca_quoter';
import { getRaydiumQuote } from './raydium_quoter';

// Hardcoded for now based on your previous logs (SKR/USDC CLMM)
// Ideally, export this from config or find it dynamically once
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

const AMOUNT_TO_CHECK = '1000'; // Standardize size

const calculateSpread = () => {
  if (market.orca === 0 || market.raydium === 0) return;

  // Direction 1: Buy Raydium -> Sell Orca
  // Profit if Orca Price > Raydium Price
  const spread1 = ((market.orca - market.raydium) / market.raydium) * 100;

  // Direction 2: Buy Orca -> Sell Raydium
  // Profit if Raydium Price > Orca Price
  const spread2 = ((market.raydium - market.orca) / market.orca) * 100;

  console.clear(); // Keep terminal clean
  console.log(`--- 🛰 Spatial Arbitrage Tracker (WS) ---`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Token: SKR / USDC`);
  console.log(`-----------------------------------------`);
  console.log(`Orca Price:    $${market.orca.toFixed(6)}`);
  console.log(`Raydium Price: $${market.raydium.toFixed(6)}`);
  console.log(`-----------------------------------------`);

  if (spread1 > 0) {
    console.log(`Strategy A (Buy Ray -> Sell Orca): ${spread1.toFixed(4)}% ${spread1 > 0.5 ? '✅ EXECUTE' : ''}`);
  } else {
    console.log(`Strategy A (Buy Ray -> Sell Orca): ${spread1.toFixed(4)}%`);
  }

  if (spread2 > 0) {
    console.log(`Strategy B (Buy Orca -> Sell Ray): ${spread2.toFixed(4)}% ${spread2 > 0.5 ? '✅ EXECUTE' : ''}`);
  } else {
    console.log(`Strategy B (Buy Orca -> Sell Ray): ${spread2.toFixed(4)}%`);
  }
};

const updateOrca = async () => {
  try {
    const q = await getOrcaQuote(AMOUNT_TO_CHECK, false); // Sell Side Price (approx)
    market.orca = parseFloat(q.price);
    market.lastUpdate = Date.now();
    calculateSpread();
  } catch (e) {
    console.error('Error updating Orca:', e);
  }
};

const updateRaydium = async () => {
  try {
    const q = await getRaydiumQuote(AMOUNT_TO_CHECK, false);
    market.raydium = parseFloat(q.price);
    market.lastUpdate = Date.now();
    calculateSpread();
  } catch (e) {
    console.error('Error updating Raydium:', e);
  }
};

export const startTracking = () => {
  console.log('Initializing WebSocket connections...');

  // 1. Subscribe to Orca Whirlpool Account
  connection.onAccountChange(
    new PublicKey(ORCA_POOL_ADDRESS),
    () => {
        // When slot changes, fetch new price
        // Debounce can be added here if updates are too frequent
        updateOrca();
    },
    'processed'
  );

  // 2. Subscribe to Raydium CLMM Pool Account
  connection.onAccountChange(
    new PublicKey(RAYDIUM_POOL_ID),
    () => {
        updateRaydium();
    },
    'processed'
  );

  console.log(`Listening for updates on:\n- Orca: ${ORCA_POOL_ADDRESS}\n- Raydium: ${RAYDIUM_POOL_ID}`);

  // Initial Fetch
  updateOrca();
  updateRaydium();
};
