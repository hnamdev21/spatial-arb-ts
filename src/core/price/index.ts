const JUPITER_WSOL_MINT = 'So11111111111111111111111111111111111111112';
const COINGECKO_SOL_ID = 'solana';
const FALLBACK_SOL_PRICE_USD = Number(
  process.env.SOL_PRICE_USD?.trim() || '200'
);

export type GetSolPriceUsdReturn = number;

async function fetchBinanceSolPrice(): Promise<number | null> {
  const url = 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) return null;

  const data = (await res.json()) as { price?: string };
  const price = data.price != null ? parseFloat(data.price) : NaN;
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

async function fetchJupiterSolPrice(): Promise<number | null> {
  const url = `https://api.jup.ag/price/v3?ids=${JUPITER_WSOL_MINT}`;
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  const headers: HeadersInit = apiKey ? { 'x-api-key': apiKey } : {};
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    headers,
  });
  if (!res.ok) return null;

  const raw = (await res.json()) as unknown;
  const map: Record<string, { usdPrice?: number }> =
    raw != null &&
    typeof raw === 'object' &&
    'data' in raw &&
    raw.data != null &&
    typeof raw.data === 'object'
      ? (raw as { data: Record<string, { usdPrice?: number }> }).data
      : (raw as Record<string, { usdPrice?: number }>);
  const price = map[JUPITER_WSOL_MINT]?.usdPrice;
  if (typeof price !== 'number' || price <= 0) return null;
  return price;
}

async function fetchCoinGeckoSolPrice(): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_SOL_ID}&vs_currencies=usd`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    solana?: { usd?: number };
  };
  const price = data.solana?.usd;
  if (typeof price !== 'number' || price <= 0) return null;
  return price;
}

export async function getSolPriceUsd(): Promise<GetSolPriceUsdReturn> {
  const binancePrice = await fetchBinanceSolPrice();
  if (binancePrice !== null) return binancePrice;

  const jupiterPrice = await fetchJupiterSolPrice();
  if (jupiterPrice !== null) return jupiterPrice;

  const coingeckoPrice = await fetchCoinGeckoSolPrice();
  if (coingeckoPrice !== null) return coingeckoPrice;

  return FALLBACK_SOL_PRICE_USD;
}
