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
  getGasCostUsd: () => Promise<number>;
  minProfitPercent: number;
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
    getGasCostUsd,
    minProfitPercent,
  } = params;

  const market: PriceData = {
    orca: 0,
    raydium: 0,
    lastUpdate: 0,
  };

  let isSwapping = false;

  async function evaluateStrategies(): Promise<void> {
    if (isSwapping) return;

    const inputUsdc = parseFloat(amountToCheck);
    const [gasCostUsd] = await Promise.all([getGasCostUsd()]);
    const minProfitThreshold = inputUsdc * (minProfitPercent / 100);

    let netProfitA: number | null = null;
    let netProfitB: number | null = null;
    let outputLeg2A: string | null = null;
    let outputLeg2B: string | null = null;

    try {
      const rayBuy = await getRaydiumQuote(amountToCheck, true);
      const orcaSellA = await getOrcaQuote(rayBuy.output, false);
      const outputA = parseFloat(orcaSellA.output);
      netProfitA = outputA - inputUsdc - gasCostUsd;
      outputLeg2A = orcaSellA.output;
    } catch {
      // skip Strategy A on quote failure
    }

    try {
      const orcaBuy = await getOrcaQuote(amountToCheck, true);
      const raySellB = await getRaydiumQuote(orcaBuy.output, false);
      const outputB = parseFloat(raySellB.output);
      netProfitB = outputB - inputUsdc - gasCostUsd;
      outputLeg2B = raySellB.output;
    } catch {
      // skip Strategy B on quote failure
    }

    if (netProfitA !== null) market.orca = parseFloat(outputLeg2A!);
    if (netProfitB !== null) market.raydium = parseFloat(outputLeg2B!);
    market.lastUpdate = Date.now();

    console.clear();
    console.log(
      `--- 🛰 Spatial Arbitrage (Net Profit > ${minProfitPercent}% ≈ $${minProfitThreshold.toFixed(2)}, Gas ≈ $${gasCostUsd.toFixed(2)}) ---`
    );
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Input Leg 1: ${amountToCheck} ${quoteSymbol}`);
    console.log(`-----------------------------------------`);
    if (netProfitA !== null) {
      console.log(
        `Strategy A (Buy Ray → Sell Orca): Output $${outputLeg2A}, Net $${netProfitA.toFixed(4)}`
      );
    }
    if (netProfitB !== null) {
      console.log(
        `Strategy B (Buy Orca → Sell Ray): Output $${outputLeg2B}, Net $${netProfitB.toFixed(4)}`
      );
    }
    console.log(`-----------------------------------------`);

    const bestNet = Math.max(netProfitA ?? -Infinity, netProfitB ?? -Infinity);
    if (bestNet > minProfitThreshold) {
      const preferB =
        netProfitB !== null &&
        (netProfitA === null || netProfitB >= netProfitA);
      if (preferB) {
        isSwapping = true;
        await executeArbitrage('B', amountToCheck);
        isSwapping = false;
      } else if (netProfitA !== null) {
        isSwapping = true;
        await executeArbitrage('A', amountToCheck);
        isSwapping = false;
      }
    }
  }

  async function updateOrca(): Promise<void> {
    if (isSwapping) return;
    try {
      await evaluateStrategies();
    } catch (e) {
      console.error(e);
    }
  }

  async function updateRaydium(): Promise<void> {
    if (isSwapping) return;
    try {
      await evaluateStrategies();
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
