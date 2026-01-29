const COINGECKO_SOL_ID = 'solana';
const FALLBACK_SOL_PRICE_USD = Number(
  process.env.SOL_PRICE_USD?.trim() || '200'
);

export type GetSolPriceUsdReturn = number;

export async function getSolPriceUsd(): Promise<GetSolPriceUsdReturn> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_SOL_ID}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return FALLBACK_SOL_PRICE_USD;

    const data = (await res.json()) as {
      solana?: { usd?: number };
    };
    const price = data.solana?.usd;
    if (typeof price !== 'number' || price <= 0) return FALLBACK_SOL_PRICE_USD;

    return price;
  } catch {
    return FALLBACK_SOL_PRICE_USD;
  }
}
