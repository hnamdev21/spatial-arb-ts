# Spatial Arbitrage – Documentation

## Overview

Spatial arbitrage bot that tracks price spreads between **Orca** and **Raydium** for a base/quote pair (e.g. SKR/USDC). When the spread exceeds a threshold, it executes a two-leg swap (buy on one DEX, sell on the other) to capture profit. Designed for future multi-pair scaling with generic base/quote naming.

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
├── index.ts              # Entry: loads config, wires quoters/executor/tracker
├── config/
│   └── index.ts          # Env, Solana connection, wallet, base/quote tokens, pool addresses
├── types/
│   └── index.ts          # Shared types: TokenInfo, Quote<TDex>
├── quoter/
│   ├── index.ts          # Re-exports Orca + Raydium quoters
│   ├── orca.ts           # Orca Whirlpool quote factory
│   └── raydium.ts        # Raydium CLMM quote factory
├── executor/
│   └── index.ts          # Swap execution (Raydium + Orca) and arbitrage flow
└── tracker/
    └── index.ts          # Price tracking, spread calculation, execution trigger
```

---

## Modules

### 1. `config`

**Purpose:** Load env, create Solana connection and wallet, define base/quote tokens and pool addresses. Single source for runtime config; overridable via env.

**Exports (usage):**

- `connection` – Solana `Connection` (RPC from `RPC_URL`).
- `wallet` – `Keypair` from `WALLET_PRIVATE_KEY`.
- `BASE_MINT`, `QUOTE_MINT` – mint addresses (strings).
- `BASE_MINT_PUBKEY`, `QUOTE_MINT_PUBKEY` – `PublicKey`s.
- `BASE_TOKEN`, `QUOTE_TOKEN` – `TokenInfo` (symbol, mint, decimals).
- `ORCA_POOL_ADDRESS`, `ORCA_POOL_PUBKEY`, `RAYDIUM_V4_PROGRAM_ID`.

**Env (optional):** `RPC_URL`, `WALLET_PRIVATE_KEY`, `BASE_MINT`, `QUOTE_MINT`, `BASE_SYMBOL`, `QUOTE_SYMBOL`, `BASE_DECIMALS`, `QUOTE_DECIMALS`, `ORCA_POOL_ADDRESS`. Legacy: `SKR_MINT`, `USDC_MINT`.

---

### 2. `types`

**Purpose:** Shared types used across config, quoter, and executor.

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

### 4. `executor`

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

### 5. `tracker`

**Purpose:** Subscribe to pool account changes (Orca + Raydium), refresh quotes, compute spread, and call the executor when spread exceeds threshold.

#### `startTracking(params): void`

**Params – `TrackerParams`:**

| Field              | Type                 | Description                                       |
| ------------------ | -------------------- | ------------------------------------------------- |
| `connection`       | `Connection`         | Solana connection (for `onAccountChange`)         |
| `orcaPoolAddress`  | `string`             | Orca pool to watch                                |
| `raydiumPoolId`    | `string`             | Raydium pool to watch                             |
| `getOrcaQuote`     | `GetOrcaQuote`       | Orca quote function from `createOrcaQuoter`       |
| `getRaydiumQuote`  | `GetRaydiumQuote`    | Raydium quote function from `createRaydiumQuoter` |
| `executeArbitrage` | `ExecuteArbitrageFn` | Bound executor (direction + amountInQuote)        |
| `amountToCheck`    | `string`             | Quote amount used for price check (e.g. `"1"`)    |
| `profitThreshold`  | `number`             | Min spread % to trigger execution (e.g. `1.0`)    |
| `quoteSymbol?`     | `string`             | Optional; used in logs (e.g. `"USDC"`)            |

---

### 6. Entry – `src/index.ts`

**Purpose:** Compose config and modules: create one Orca quoter and one Raydium quoter, wrap `executeArbitrage` with fixed `ExecutorParams`, then start the tracker with pool IDs, quoters, executor, and threshold. Reads optional env: `RAYDIUM_POOL_ID`, `AMOUNT_TO_CHECK`, `PROFIT_THRESHOLD`.

**Flow:** `main()` → `createOrcaQuoter` / `createRaydiumQuoter` → `startTracking({ ... runArbitrage ... })` → keeps process alive with `setInterval`.

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

Required: `WALLET_PRIVATE_KEY`.

Optional: `RPC_URL`, `BASE_MINT`, `QUOTE_MINT`, `BASE_SYMBOL`, `QUOTE_SYMBOL`, `BASE_DECIMALS`, `QUOTE_DECIMALS`, `ORCA_POOL_ADDRESS`, `RAYDIUM_POOL_ID`, `AMOUNT_TO_CHECK`, `PROFIT_THRESHOLD`.
