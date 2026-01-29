import { PublicKey } from '@solana/web3.js';
import type { Connection } from '@solana/web3.js';
import type { GetOrcaQuote } from '../quoter/orca';
import type { GetRaydiumQuote } from '../quoter/raydium';
import type { ExecuteArbitrageFn } from '../executor';

export type BalanceSnapshot = {
  usdc: number;
  sol: number;
  solPriceUsd: number;
};

export type GasBreakdownWithUsd = {
  networkSol: number;
  prioritySol: number;
  totalSol: number;
  networkUsd: number;
  priorityUsd: number;
  totalUsd: number;
};

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
  baseSymbol?: string;
  getGasBreakdown: () => Promise<GasBreakdownWithUsd>;
  getPoolFeeUsd: (amountUsdc: number) => Promise<number>;
  minProfitPercent: number;
  getBalance: () => Promise<BalanceSnapshot>;
};

type PriceData = {
  orca: number;
  raydium: number;
  lastUpdate: number;
};

type DisplayState = {
  minProfitPercent: number;
  minProfitThreshold: number;
  gasNetworkSol: number;
  gasPrioritySol: number;
  gasTotalSol: number;
  gasNetworkUsd: number;
  gasPriorityUsd: number;
  gasTotalUsd: number;
  poolFeeUsd: number;
  amountToCheck: string;
  quoteSymbol: string;
  baseSymbol: string;
  orcaPairPrice: string | null;
  raydiumPairPrice: string | null;
  startOrcaPairPrice: number | null;
  startRaydiumPairPrice: number | null;
  netProfitA: number | null;
  netProfitB: number | null;
  outputLeg2A: string | null;
  outputLeg2B: string | null;
  recommendVolume: number | null;
  bestNet: number;
  startOutputA: number | null;
  startOutputB: number | null;
  usdc: number;
  sol: number;
  solPriceUsd: number;
  startUsdc: number | null;
  startSol: number | null;
  startTotalValue: number | null;
  lastEvalTime: number;
};

export type TradeRecord = {
  txSignature: string;
  status: 'SUCCESS' | 'FAILED';
  strategy: 'A' | 'B';
  leg?: 'BUY' | 'SELL';
  orderLabel: string;
  inputVolume: string;
  netProfit: number | null;
  failReason?: string;
  timestamp: string;
};

function render(state: DisplayState, trades: TradeRecord[]): void {
  const now = new Date();
  const lastEvalAgo =
    state.lastEvalTime > 0
      ? `${Math.round((Date.now() - state.lastEvalTime) / 1000)}s ago`
      : '';

  console.clear();

  console.log(
    `Time: ${now.toISOString()}${lastEvalAgo ? `  |  Last eval: ${lastEvalAgo}` : ''}`
  );

  console.log('Config');
  console.table([
    { Config: 'Min profit %', Value: `${state.minProfitPercent}%` },
    {
      Config: 'Min profit ($)',
      Value: `$${state.minProfitThreshold.toFixed(2)}`,
    },
    {
      Config: `SOL/${state.quoteSymbol}`,
      Value: `$${state.solPriceUsd.toFixed(4)}`,
    },
  ]);

  console.log('Fee');
  console.table([
    {
      Fee: 'Network',
      'Amount (SOL)': state.gasNetworkSol.toFixed(6),
      'Value ($)': `$${state.gasNetworkUsd.toFixed(4)}`,
    },
    {
      Fee: 'Priority',
      'Amount (SOL)': state.gasPrioritySol.toFixed(6),
      'Value ($)': `$${state.gasPriorityUsd.toFixed(4)}`,
    },
    {
      Fee: 'Pool',
      'Amount (SOL)': '—',
      'Value ($)':
        state.poolFeeUsd > 0 ? `$${state.poolFeeUsd.toFixed(4)}` : '—',
    },
    {
      Fee: 'Exchange',
      'Amount (SOL)': '—',
      'Value ($)': '—',
    },
    {
      Fee: 'Total (gas)',
      'Amount (SOL)': state.gasTotalSol.toFixed(6),
      'Value ($)': `$${state.gasTotalUsd.toFixed(4)}`,
    },
    {
      Fee: 'Total (est.)',
      'Amount (SOL)': '—',
      'Value ($)':
        state.poolFeeUsd > 0
          ? `$${(state.gasTotalUsd + state.poolFeeUsd).toFixed(4)}`
          : `$${state.gasTotalUsd.toFixed(4)}`,
    },
  ]);

  console.log('Balance');
  const usdcPct =
    state.startUsdc != null && state.startUsdc !== 0
      ? (((state.usdc - state.startUsdc) / state.startUsdc) * 100).toFixed(2) +
        '%'
      : '—';
  const solPct =
    state.startSol != null && state.startSol !== 0
      ? (((state.sol - state.startSol) / state.startSol) * 100).toFixed(2) + '%'
      : '—';
  const usdcValue = state.usdc;
  const solValue = state.sol * state.solPriceUsd;
  const totalValue = usdcValue + solValue;
  const totalPct =
    state.startTotalValue != null && state.startTotalValue !== 0
      ? (
          ((totalValue - state.startTotalValue) / state.startTotalValue) *
          100
        ).toFixed(2) + '%'
      : '—';
  console.table([
    {
      Asset: state.quoteSymbol,
      'Amount (USDC)': state.usdc.toFixed(4),
      'Value ($)': `$${usdcValue.toFixed(2)}`,
      '% changed': usdcPct,
    },
    {
      Asset: 'SOL',
      'Amount (SOL)': state.sol.toFixed(6),
      'Value ($)': `$${solValue.toFixed(2)}`,
      '% changed': solPct,
    },
    {
      Asset: 'Total',
      Amount: '—',
      'Value ($)': `$${totalValue.toFixed(2)}`,
      '% changed': totalPct,
    },
  ]);

  console.log('Volume');
  const inputAmount = `${state.amountToCheck} ${state.quoteSymbol}`;
  const inputValue = `$${parseFloat(state.amountToCheck).toFixed(2)}`;
  const inputEstNet = `$${state.bestNet.toFixed(4)}`;
  const recommendAmount =
    state.recommendVolume !== null
      ? `${state.recommendVolume.toFixed(2)} ${state.quoteSymbol}`
      : '—';
  const recommendValue =
    state.recommendVolume !== null
      ? `$${state.recommendVolume.toFixed(2)}`
      : '—';
  console.table([
    {
      Volume: 'Input',
      Amount: inputAmount,
      'Value ($)': inputValue,
      'Est Net ($)': inputEstNet,
    },
    {
      Volume: 'Recommend',
      Amount: recommendAmount,
      'Value ($)': recommendValue,
      'Est Net ($)': 'Break-even',
    },
  ]);

  if (state.orcaPairPrice !== null || state.raydiumPairPrice !== null) {
    const orcaNum =
      state.orcaPairPrice !== null ? parseFloat(state.orcaPairPrice) : null;
    const rayNum =
      state.raydiumPairPrice !== null
        ? parseFloat(state.raydiumPairPrice)
        : null;
    const orcaUsdcPerBase =
      orcaNum !== null && orcaNum > 0 ? 1 / orcaNum : null;
    const rayUsdcPerBase = rayNum !== null && rayNum > 0 ? 1 / rayNum : null;
    const orcaPct =
      state.startOrcaPairPrice != null &&
      orcaNum !== null &&
      state.startOrcaPairPrice > 0
        ? (
            ((1 / orcaNum - 1 / state.startOrcaPairPrice) /
              (1 / state.startOrcaPairPrice)) *
            100
          ).toFixed(2) + '%'
        : '—';
    const rayPct =
      state.startRaydiumPairPrice != null &&
      rayNum !== null &&
      state.startRaydiumPairPrice > 0
        ? (
            ((1 / rayNum - 1 / state.startRaydiumPairPrice) /
              (1 / state.startRaydiumPairPrice)) *
            100
          ).toFixed(2) + '%'
        : '—';
    const pairPriceLabel = `Price (1 ${state.baseSymbol} → ${state.quoteSymbol})`;
    console.table([
      {
        DEX: 'Orca',
        [pairPriceLabel]:
          orcaUsdcPerBase !== null ? `$${orcaUsdcPerBase.toFixed(6)}` : '—',
        '% changed': orcaPct,
      },
      {
        DEX: 'Raydium',
        [pairPriceLabel]:
          rayUsdcPerBase !== null ? `$${rayUsdcPerBase.toFixed(6)}` : '—',
        '% changed': rayPct,
      },
    ]);
  }
  console.log(`-----------------------------------------`);
  if (state.netProfitA !== null || state.netProfitB !== null) {
    const inputUsdc = parseFloat(state.amountToCheck);
    const pctNetA =
      state.netProfitA !== null && inputUsdc > 0
        ? ((state.netProfitA / inputUsdc) * 100).toFixed(2) + '%'
        : '—';
    const pctNetB =
      state.netProfitB !== null && inputUsdc > 0
        ? ((state.netProfitB / inputUsdc) * 100).toFixed(2) + '%'
        : '—';
    const strategyRows: Array<{
      Strategy: string;
      Output: string;
      'Net ($)': string;
      'Net (%)': string;
    }> = [];
    if (state.netProfitA !== null && state.outputLeg2A !== null) {
      strategyRows.push({
        Strategy: 'A (Buy Ray → Sell Orca)',
        Output: `$${Number(state.outputLeg2A).toFixed(4)}`,
        'Net ($)': `$${state.netProfitA.toFixed(4)}`,
        'Net (%)': pctNetA,
      });
    }
    if (state.netProfitB !== null && state.outputLeg2B !== null) {
      strategyRows.push({
        Strategy: 'B (Buy Orca → Sell Ray)',
        Output: `$${Number(state.outputLeg2B).toFixed(4)}`,
        'Net ($)': `$${state.netProfitB.toFixed(4)}`,
        'Net (%)': pctNetB,
      });
    }
    if (strategyRows.length > 0) console.table(strategyRows);
  }

  if (trades.length > 0) {
    console.log('Transactions');
    const lastTrades = trades.slice(-10);
    const startNum = Math.max(1, trades.length - lastTrades.length + 1);
    const tradeRows = lastTrades.map((t, i) => ({
      '#': startNum + i,
      Address: t.txSignature || '—',
      Status: t.status,
      Order: t.orderLabel,
      'Input volume': t.inputVolume,
      'Net ($)': t.netProfit != null ? `$${t.netProfit.toFixed(4)}` : '—',
      'Fail reason': t.failReason ?? '—',
      Time: t.timestamp,
    }));
    console.table(tradeRows);
  }

  console.log(`-----------------------------------------`);
}

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
    baseSymbol = 'BASE',
    getGasBreakdown,
    getPoolFeeUsd,
    minProfitPercent,
    getBalance,
  } = params;

  const market: PriceData = {
    orca: 0,
    raydium: 0,
    lastUpdate: 0,
  };

  let isSwapping = false;
  let startOutputA: number | null = null;
  let startOutputB: number | null = null;
  let startOrcaPairPrice: number | null = null;
  let startRaydiumPairPrice: number | null = null;
  let startUsdc: number | null = null;
  let startSol: number | null = null;
  let startTotalValue: number | null = null;
  let lastDisplayState: DisplayState | null = null;
  const completedTrades: TradeRecord[] = [];

  async function evaluateStrategies(): Promise<void> {
    if (isSwapping) return;

    const inputUsdc = parseFloat(amountToCheck);
    const [gasBreakdown, balance, poolFeeUsd] = await Promise.all([
      getGasBreakdown(),
      getBalance(),
      getPoolFeeUsd(inputUsdc),
    ]);
    const gasTotalUsd = gasBreakdown.totalUsd;
    if (startUsdc === null) startUsdc = balance.usdc;
    if (startSol === null) startSol = balance.sol;
    const totalValue = balance.usdc + balance.sol * balance.solPriceUsd;
    if (startTotalValue === null) startTotalValue = totalValue;
    const minProfitThreshold = inputUsdc * (minProfitPercent / 100);

    let netProfitA: number | null = null;
    let netProfitB: number | null = null;
    let outputLeg2A: string | null = null;
    let outputLeg2B: string | null = null;
    let orcaPairPrice: string | null = null;
    let raydiumPairPrice: string | null = null;

    try {
      const rayBuy = await getRaydiumQuote(amountToCheck, true);
      raydiumPairPrice = rayBuy.price;
      const orcaSellA = await getOrcaQuote(rayBuy.output, false);
      const outputA = parseFloat(orcaSellA.output);
      netProfitA = outputA - inputUsdc - gasTotalUsd;
      outputLeg2A = orcaSellA.output;
    } catch {
      // skip Strategy A on quote failure
    }

    try {
      const orcaBuy = await getOrcaQuote(amountToCheck, true);
      orcaPairPrice = orcaBuy.price;
      const raySellB = await getRaydiumQuote(orcaBuy.output, false);
      const outputB = parseFloat(raySellB.output);
      netProfitB = outputB - inputUsdc - gasTotalUsd;
      outputLeg2B = raySellB.output;
    } catch {
      // skip Strategy B on quote failure
    }

    if (netProfitA !== null) market.orca = parseFloat(outputLeg2A!);
    if (netProfitB !== null) market.raydium = parseFloat(outputLeg2B!);
    market.lastUpdate = Date.now();

    const outputA = outputLeg2A !== null ? parseFloat(outputLeg2A) : 0;
    const outputB = outputLeg2B !== null ? parseFloat(outputLeg2B) : 0;
    if (outputA > 0 && startOutputA === null) startOutputA = outputA;
    if (outputB > 0 && startOutputB === null) startOutputB = outputB;
    if (orcaPairPrice !== null && startOrcaPairPrice === null)
      startOrcaPairPrice = parseFloat(orcaPairPrice);
    if (raydiumPairPrice !== null && startRaydiumPairPrice === null)
      startRaydiumPairPrice = parseFloat(raydiumPairPrice);

    const grossA = outputA - inputUsdc;
    const grossB = outputB - inputUsdc;
    const recommendVolumeA =
      grossA > 0 ? (gasTotalUsd * inputUsdc) / grossA : null;
    const recommendVolumeB =
      grossB > 0 ? (gasTotalUsd * inputUsdc) / grossB : null;
    const recommendVolumes: number[] = [];
    if (recommendVolumeA !== null) recommendVolumes.push(recommendVolumeA);
    if (recommendVolumeB !== null) recommendVolumes.push(recommendVolumeB);
    const recommendVolume =
      recommendVolumes.length > 0 ? Math.min(...recommendVolumes) : null;
    const bestNet = Math.max(netProfitA ?? -Infinity, netProfitB ?? -Infinity);

    const displayState: DisplayState = {
      minProfitPercent,
      minProfitThreshold,
      gasNetworkSol: gasBreakdown.networkSol,
      gasPrioritySol: gasBreakdown.prioritySol,
      gasTotalSol: gasBreakdown.totalSol,
      gasNetworkUsd: gasBreakdown.networkUsd,
      gasPriorityUsd: gasBreakdown.priorityUsd,
      gasTotalUsd: gasBreakdown.totalUsd,
      poolFeeUsd,
      amountToCheck,
      quoteSymbol,
      baseSymbol,
      orcaPairPrice,
      raydiumPairPrice,
      startOrcaPairPrice,
      startRaydiumPairPrice,
      netProfitA,
      netProfitB,
      outputLeg2A,
      outputLeg2B,
      recommendVolume,
      bestNet,
      startOutputA,
      startOutputB,
      usdc: balance.usdc,
      sol: balance.sol,
      solPriceUsd: balance.solPriceUsd,
      startUsdc,
      startSol,
      startTotalValue,
      lastEvalTime: market.lastUpdate,
    };
    lastDisplayState = displayState;
    render(displayState, completedTrades);

    if (bestNet > minProfitThreshold) {
      if (isSwapping) return;
      isSwapping = true;
      const preferB =
        netProfitB !== null &&
        (netProfitA === null || netProfitB >= netProfitA);
      const strategy: 'A' | 'B' | null = preferB
        ? 'B'
        : netProfitA !== null
          ? 'A'
          : null;
      const result =
        strategy !== null
          ? await executeArbitrage(strategy, amountToCheck)
          : null;
      if (strategy !== null && result !== null) {
        const success = result.success;
        const timestamp = new Date().toISOString();
        const inputVolume = `${amountToCheck} ${quoteSymbol}`;

        if (success) {
          const alreadyRecorded =
            result.leg2TxSignature !== '' &&
            completedTrades.some(
              (t) => t.txSignature === result.leg2TxSignature
            );
          if (!alreadyRecorded) {
            const orderBuy =
              strategy === 'A'
                ? 'Order 1: Buy Ray (USDC→Ray)'
                : 'Order 1: Buy Orca (USDC→Orca)';
            const orderSell =
              strategy === 'A'
                ? 'Order 2: Sell Orca (Ray→USDC)'
                : 'Order 2: Sell Ray (Orca→USDC)';
            if (result.leg1TxSignature) {
              completedTrades.push({
                txSignature: result.leg1TxSignature,
                status: 'SUCCESS',
                strategy,
                leg: 'BUY',
                orderLabel: orderBuy,
                inputVolume,
                netProfit: null,
                timestamp,
              });
            }
            if (result.leg2TxSignature) {
              completedTrades.push({
                txSignature: result.leg2TxSignature,
                status: 'SUCCESS',
                strategy,
                leg: 'SELL',
                orderLabel: orderSell,
                inputVolume,
                netProfit: result.netProfit,
                timestamp,
              });
            }
          }
        } else {
          completedTrades.push({
            txSignature: '',
            status: 'FAILED',
            strategy,
            orderLabel:
              strategy === 'A'
                ? 'A (Buy Ray → Sell Orca)'
                : 'B (Buy Orca → Sell Ray)',
            inputVolume,
            netProfit: null,
            ...(result.error ? { failReason: result.error } : {}),
            timestamp,
          });
        }
        if (lastDisplayState) render(lastDisplayState, completedTrades);
      }
      isSwapping = false;
    }
  }

  let orcaDebounceTimer: NodeJS.Timeout | null = null;
  let raydiumDebounceTimer: NodeJS.Timeout | null = null;
  const DEBOUNCE_DELAY_MS = 1000;

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

  function debouncedUpdateOrca(): void {
    if (orcaDebounceTimer !== null) {
      clearTimeout(orcaDebounceTimer);
    }
    orcaDebounceTimer = setTimeout(() => {
      void updateOrca();
      orcaDebounceTimer = null;
    }, DEBOUNCE_DELAY_MS);
  }

  function debouncedUpdateRaydium(): void {
    if (raydiumDebounceTimer !== null) {
      clearTimeout(raydiumDebounceTimer);
    }
    raydiumDebounceTimer = setTimeout(() => {
      void updateRaydium();
      raydiumDebounceTimer = null;
    }, DEBOUNCE_DELAY_MS);
  }

  console.log('Initializing WebSocket connections...');
  connection.onAccountChange(
    new PublicKey(orcaPoolAddress),
    debouncedUpdateOrca,
    { commitment: 'processed' }
  );
  connection.onAccountChange(
    new PublicKey(raydiumPoolId),
    debouncedUpdateRaydium,
    { commitment: 'processed' }
  );
  setInterval(() => {
    if (lastDisplayState) render(lastDisplayState, completedTrades);
  }, 1000);
  void updateOrca();
  void updateRaydium();
}
