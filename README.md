# Spatial Arbitrage – Documentation

## Overview

Spatial arbitrage bot that tracks price spreads between **Orca** and **Raydium** for a base/quote pair (e.g. SKR/USDC). When net profit (after gas) exceeds a minimum percent of input, it executes a two-leg swap (buy on one DEX, sell on the other) to capture profit.

**Profit logic:** `Net Profit = (Output Leg 2 − Input Leg 1) − (Gas cost in USD)`. Input/output use actual quotes (LP fee and slippage included). Gas cost is estimated in real time (priority fee + SOL price). Execution runs only when `Net Profit > Input × minProfitPercent%`. Designed for future multi-pair scaling with generic base/quote naming.

---

## Tech Stack

| Layer       | Technology                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Runtime     | Node.js                                                                                                               |
| Language    | TypeScript                                                                                                            |
| Blockchain  | Solana                                                                                                                |
| DEX / Quote | Orca (Whirlpools), Raydium (CLMM)                                                                                     |
| Key libs    | `@solana/web3.js`, `@orca-so/whirlpools-sdk`, `@raydium-io/raydium-sdk-v2`, `@solana/spl-token`, `decimal.js`, `bs58` |
| Tooling     | ESLint, Prettier, Husky, Nodemon                                                                                      |
| Infra       | Docker Compose (MongoDB, mongo-express)                                                                               |

---

## Codebase Structure

```
src/
├── index.ts              # Entry: config, quoters, gas, price, executor, tracker
├── config/
│   └── index.ts          # Env, connection, wallet, tokens, pool addresses, profit/gas defaults
├── types/
│   └── index.ts          # Shared types: TokenInfo, Quote<TDex>
├── quoter/
│   ├── index.ts          # Re-exports Orca + Raydium quoters
│   ├── orca.ts           # Orca Whirlpool quote factory
│   └── raydium.ts        # Raydium CLMM quote factory
├── gas/
│   └── index.ts          # Real-time gas estimate (SOL) via getRecentPrioritizationFees
├── price/
│   └── index.ts          # Real-time SOL/USD (Binance, Jupiter, CoinGecko)
├── executor/
│   └── index.ts          # Swap execution (Raydium + Orca) and arbitrage flow
└── tracker/
    └── index.ts          # Account subscription, quotes, net profit, balance, execution trigger
```

---

## Modules

### 1. `config`

**Purpose:** Load env, create Solana connection and wallet, define base/quote tokens and pool addresses, and default values for gas and min profit. Single source for runtime config; overridable via env.

**Exports (usage):**

- `connection` – Solana `Connection` (RPC from `RPC_URL`).
- `wallet` – `Keypair` from `WALLET_PRIVATE_KEY`.
- `BASE_MINT`, `QUOTE_MINT` – mint addresses (strings).
- `BASE_MINT_PUBKEY`, `QUOTE_MINT_PUBKEY` – `PublicKey`s.
- `BASE_TOKEN`, `QUOTE_TOKEN` – `TokenInfo` (symbol, mint, decimals).
- `ORCA_POOL_ADDRESS`, `ORCA_POOL_PUBKEY`, `RAYDIUM_V4_PROGRAM_ID`.
- `GAS_EST_SOL`, `SOL_PRICE_USD` – fallbacks when real-time fetch fails (used by `gas` and `price`).
- `MIN_PROFIT_PERCENT` – min profit as % of input to trigger execution (e.g. `1` = 1%).

**Env (optional):** `RPC_URL`, `WALLET_PRIVATE_KEY`, `BASE_MINT`, `QUOTE_MINT`, `BASE_SYMBOL`, `QUOTE_SYMBOL`, `BASE_DECIMALS`, `QUOTE_DECIMALS`, `ORCA_POOL_ADDRESS`, `GAS_EST_SOL`, `SOL_PRICE_USD`, `MIN_PROFIT_PERCENT`. Legacy: `SKR_MINT`, `USDC_MINT`.

---

### 2. `types`

**Purpose:** Shared types used across config, quoter, executor, and tracker.

**Exports:**

| Type          | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `TokenInfo`   | `{ symbol, mint: PublicKey, decimals }`                        |
| `Quote<TDex>` | `{ dex: TDex, price: string, output: string }` (generic quote) |

---

### 3. `quoter`

**Purpose:** Get swap quotes for a given base/quote pair from Orca and Raydium. Each DEX is a factory that returns a quote function (no direct config import; all inputs via params).

#### 3.1 Orca – `createOrcaQuoter(params): GetOrcaQuote`

**Params – `OrcaQuoterParams`:**

| Field         | Type         | Description             |
| ------------- | ------------ | ----------------------- |
| `connection`  | `Connection` | Solana RPC connection   |
| `wallet`      | `Keypair`    | Wallet (for context)    |
| `poolAddress` | `string`     | Orca Whirlpool address  |
| `baseToken`   | `TokenInfo`  | Base token (e.g. SKR)   |
| `quoteToken`  | `TokenInfo`  | Quote token (e.g. USDC) |

**Returns:** `GetOrcaQuote` = `(inputAmount: string, isBuy: boolean) => Promise<OrcaQuote>`.

**Return type `OrcaQuote`:** `Quote<'Orca'>` = `{ dex: 'Orca', price: string, output: string }`.

---

#### 3.2 Raydium – `createRaydiumQuoter(params): GetRaydiumQuote`

**Params – `RaydiumQuoterParams`:**

| Field        | Type         | Description              |
| ------------ | ------------ | ------------------------ |
| `connection` | `Connection` | Solana RPC connection    |
| `wallet`     | `Keypair`    | Wallet (for SDK)         |
| `baseMint`   | `string`     | Base token mint address  |
| `quoteMint`  | `string`     | Quote token mint address |

**Returns:** `GetRaydiumQuote` = `(inputAmount: string, isBuy: boolean) => Promise<RaydiumQuote>`.

**Return type `RaydiumQuote`:** `Quote<'Raydium'>` = `{ dex: 'Raydium', price: string, output: string }`.

---

### 4. `gas`

**Purpose:** Estimate gas cost in SOL for two swap transactions using real-time priority fees from the RPC. Used to compute gas cost in USD (with SOL price) for net-profit calculation.

#### `getGasEstSol(params): Promise<GetGasEstSolReturn>`

**Params – `GetGasEstSolParams`:**

| Field        | Type         | Description       |
| ------------ | ------------ | ----------------- |
| `connection` | `Connection` | Solana connection |

**Returns:** `Promise<number>` – estimated SOL for 2 txs (base fee + p75 priority fee × estimated CU per swap). On RPC failure or empty fees, returns `GAS_EST_SOL` from env (default `0.005`).

**Env (fallback):** `GAS_EST_SOL`.

---

### 5. `price`

**Purpose:** Fetch current SOL price in USD from external APIs. Used for gas cost in USD and balance value. Tries multiple sources; falls back to env if all fail.

#### `getSolPriceUsd(): Promise<GetSolPriceUsdReturn>`

**Returns:** `Promise<number>` – SOL/USD price.

**Source order:** Binance (SOLUSDT, public) → Jupiter Price API v3 (optional `JUPITER_API_KEY`) → CoinGecko (public) → `SOL_PRICE_USD` from env (default `200`).

**Env (fallback / optional):** `SOL_PRICE_USD`, `JUPITER_API_KEY`.

---

### 6. `executor`

**Purpose:** Run two-leg arbitrage: swap quote→base on one DEX, then base→quote on the other. Handles Raydium CLMM and Orca Whirlpool swaps; reports balance and PnL in quote token.

#### `executeArbitrage(params, direction, amountInQuote): Promise<void>`

**Params – `ExecutorParams`:**

| Field             | Type         | Description       |
| ----------------- | ------------ | ----------------- |
| `connection`      | `Connection` | Solana connection |
| `wallet`          | `Keypair`    | Signer wallet     |
| `quoteMint`       | `string`     | Quote token mint  |
| `baseMint`        | `string`     | Base token mint   |
| `quoteToken`      | `TokenInfo`  | Quote token info  |
| `baseToken`       | `TokenInfo`  | Base token info   |
| `orcaPoolAddress` | `string`     | Orca pool address |

**Arguments:**

| Arg             | Type         | Description                                                |
| --------------- | ------------ | ---------------------------------------------------------- |
| `direction`     | `'A' \| 'B'` | A = buy Raydium → sell Orca; B = buy Orca → sell Raydium   |
| `amountInQuote` | `string`     | Amount in quote token (e.g. USDC) to use for the first leg |

**Exported type:** `ExecuteArbitrageFn` = `(direction: 'A' \| 'B', amountInQuote: string) => Promise<void>` (used by tracker).

---

### 7. `tracker`

**Purpose:** Subscribe to pool account changes (Orca + Raydium), refresh quotes, compute net profit (output − input − gas) and recommend volume, and call the executor when net profit exceeds `minProfitPercent` of input. Displays pair price, strategy output, balance (with value and % vs start), and volume (input vs recommend) in table form.

#### `startTracking(params): void`

**Params – `TrackerParams`:**

| Field              | Type                             | Description                                               |
| ------------------ | -------------------------------- | --------------------------------------------------------- |
| `connection`       | `Connection`                     | Solana connection (for `onAccountChange`)                 |
| `orcaPoolAddress`  | `string`                         | Orca pool to watch                                        |
| `raydiumPoolId`    | `string`                         | Raydium pool to watch                                     |
| `getOrcaQuote`     | `GetOrcaQuote`                   | Orca quote function from `createOrcaQuoter`               |
| `getRaydiumQuote`  | `GetRaydiumQuote`                | Raydium quote function from `createRaydiumQuoter`         |
| `executeArbitrage` | `ExecuteArbitrageFn`             | Bound executor (direction + amountInQuote)                |
| `amountToCheck`    | `string`                         | Quote amount used for price check (e.g. `"1"`)            |
| `profitThreshold`  | `number`                         | Legacy spread % (e.g. `1.0`); execution uses min profit % |
| `quoteSymbol?`     | `string`                         | Optional; used in logs (e.g. `"USDC"`)                    |
| `baseSymbol?`      | `string`                         | Optional; used in pair-price and logs (e.g. `"SKR"`)      |
| `getGasCostUsd`    | `() => Promise<number>`          | Returns current gas cost in USD (gas SOL × SOL price)     |
| `minProfitPercent` | `number`                         | Min profit as % of input to execute (e.g. `1` = 1%)       |
| `getBalance`       | `() => Promise<BalanceSnapshot>` | Returns USDC, SOL, and SOL price for display              |

**Exported type – `BalanceSnapshot`:** `{ usdc: number, sol: number, solPriceUsd: number }`.

**Display:** Console tables for pair price (1 BASE → quote, % changed vs start), strategy (output, net, % changed), balance (USDC, SOL, total value, % changed), and volume (input vs recommend). SOL/quote price and time refresh every 1s; quote and net-profit data refresh on each account-change event.

**Real-time updates:** The tracker subscribes to pool account changes via `connection.onAccountChange` (WebSocket over the configured RPC). Price and net-profit updates are driven by these account-change events; a 1s interval only re-renders the display (e.g. clock and "Last eval") without re-fetching quotes. For truly real-time or lowest-latency updates (e.g. sub-second reaction to on-chain changes), use an RPC that supports **gRPC** or dedicated account streaming, or a provider that pushes account updates reliably.

**RPC rate limiting protection:** To prevent 429 (Too Many Requests) errors when using free-tier RPC providers (e.g. Helius), the tracker implements **debouncing** on account-change callbacks. Multiple rapid account changes (e.g. 10 changes in 1 second) are coalesced into a single quote evaluation after a 300ms delay. This reduces RPC calls from N events to 1 evaluation, significantly lowering the risk of rate limit errors while maintaining responsive price tracking.

---

### 8. Entry – `src/index.ts`

**Purpose:** Compose config and modules: create Orca and Raydium quoters, implement `getGasCostUsd` (gas SOL × SOL price) and `getBalance` (USDC + SOL + SOL price), wrap `executeArbitrage` with fixed `ExecutorParams`, then start the tracker with pool IDs, quoters, executor, gas, balance, and min profit. Reads optional env: `RAYDIUM_POOL_ID`, `AMOUNT_TO_CHECK`, `PROFIT_THRESHOLD`, `MIN_PROFIT_PERCENT`.

**Flow:** `main()` → `createOrcaQuoter` / `createRaydiumQuoter` → `getGasEstSol` + `getSolPriceUsd` (for `getGasCostUsd` and `getBalance`) → `startTracking({ ... runArbitrage, getGasCostUsd, getBalance, minProfitPercent, baseSymbol ... })` → keeps process alive with `setInterval`.

---

## Scripts

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `npm start`            | Run app with `ts-node src/index.ts`  |
| `npm run dev`          | Run with Nodemon (restart on change) |
| `npm run build`        | Compile TypeScript to `dist/`        |
| `npm run format`       | Format with Prettier                 |
| `npm run format:check` | Check formatting                     |
| `npm run lint`         | Run ESLint                           |
| `npm run lint:fix`     | ESLint with auto-fix                 |
| `npm run prepare`      | Husky install (post-install)         |

---

## Environment Summary

**Required:** `WALLET_PRIVATE_KEY`.

**Optional:** `RPC_URL`, `BASE_MINT`, `QUOTE_MINT`, `BASE_SYMBOL`, `QUOTE_SYMBOL`, `BASE_DECIMALS`, `QUOTE_DECIMALS`, `ORCA_POOL_ADDRESS`, `RAYDIUM_POOL_ID`, `AMOUNT_TO_CHECK`, `PROFIT_THRESHOLD`, `GAS_EST_SOL`, `SOL_PRICE_USD`, `MIN_PROFIT_PERCENT`, `JUPITER_API_KEY`. Legacy: `SKR_MINT`, `USDC_MINT`.
