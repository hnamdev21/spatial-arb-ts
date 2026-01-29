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
| Backend API | Express (Phase 1–2), Mongoose, Passport (Discord OAuth), JWT, wallet encryption (AES-256)                             |
| Tooling     | ESLint, Prettier, Husky, Nodemon                                                                                      |
| Infra       | Docker Compose (MongoDB, mongo-express)                                                                               |

---

## Codebase Structure

```
src/
├── index.ts              # Entry: bot (config + core tracker)
├── config/
│   └── index.ts          # Env, connection, wallet, tokens, pool addresses, profit/gas defaults
├── core/                 # Arbitrage engine: types, quoters, gas, price, executor, tracker
│   ├── types/
│   │   └── index.ts      # Shared types: TokenInfo, Quote<TDex>
│   ├── quoter/
│   │   ├── index.ts      # Re-exports Orca + Raydium quoters
│   │   ├── orca.ts       # Orca Whirlpool quote factory
│   │   └── raydium.ts    # Raydium CLMM quote factory
│   ├── gas/
│   │   └── index.ts      # Real-time gas estimate (SOL) via getRecentPrioritizationFees
│   ├── price/
│   │   └── index.ts      # Real-time SOL/USD (Binance, Jupiter, CoinGecko)
│   ├── executor/
│   │   └── index.ts      # Swap execution (Raydium + Orca) and arbitrage flow
│   └── tracker/
│       └── index.ts      # Account subscription, quotes, net profit, balance, execution trigger
├── server/               # Express API (Phase 1–2). Structure: Route → Controller → Service
│   ├── index.ts          # Start server + Mongoose connect
│   ├── app.ts            # Express app (passport, route mounting)
│   ├── db.ts             # connectMongo / disconnectMongo
│   ├── passport.ts       # Discord OAuth2 strategy (find/create User, ensureFirstWallet for new user)
│   ├── config/
│   │   └── auth.ts       # DISCORD_*, JWT_*, FRONTEND_URL, isAuthConfigured
│   ├── constants/
│   │   └── wallet.ts     # WALLET_LIMITS (FREE=1, PRO=10, WHALE=∞), getWalletLimit(plan)
│   ├── middleware/
│   │   └── auth.ts       # requireAuth: JWT from Bearer or query, attach req.user
│   ├── types/
│   │   └── express.d.ts  # Request.user (UserDocument)
│   ├── controllers/      # Request/response only; call services
│   │   ├── health.ts
│   │   ├── auth.ts
│   │   ├── user.ts
│   │   └── wallet.ts
│   ├── services/         # Business logic (server-scoped)
│   │   └── wallet.ts   # createWallet, listWallets, ensureFirstWallet
│   └── routes/           # Thin: mount controller handlers
│       ├── health.ts     # GET /health
│       ├── auth.ts       # GET /auth/discord, GET /auth/discord/callback
│       ├── users.ts      # GET /api/users/me
│       └── wallets.ts    # POST /api/wallets, GET /api/wallets
├── services/
│   └── EncryptionService.ts   # AES-256-GCM for wallet private keys (ENCRYPTION_KEY)
└── models/               # Mongoose schemas (MongoDB)
    ├── User.ts
    ├── Wallet.ts         # userId, publicKey, encryptedPrivateKey
    ├── Strategy.ts
    ├── Transaction.ts
    ├── LeaderboardStat.ts
    ├── EquitySnapshot.ts
    └── Payment.ts        # amount, currency, gateway, status, transactionDetails
```

---

## Modules

### 1. `config`

**Purpose:** Load env, create Solana connection and wallet, define base/quote tokens and pool addresses, and default values for gas and min profit. Single source for runtime config; overridable via env. Uses `TokenInfo` from `core/types`.

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

### 2. `core/types`

**Purpose:** Shared types used across config, quoter, executor, and tracker.

**Exports:**

| Type          | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `TokenInfo`   | `{ symbol, mint: PublicKey, decimals }`                        |
| `Quote<TDex>` | `{ dex: TDex, price: string, output: string }` (generic quote) |

---

### 3. `core/quoter`

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

### 4. `core/gas`

**Purpose:** Estimate gas cost in SOL for two swap transactions using real-time priority fees from the RPC. Used to compute gas cost in USD (with SOL price) for net-profit calculation.

#### `getGasEstSol(params): Promise<GetGasEstSolReturn>`

**Params – `GetGasEstSolParams`:**

| Field        | Type         | Description       |
| ------------ | ------------ | ----------------- |
| `connection` | `Connection` | Solana connection |

**Returns:** `Promise<number>` – estimated SOL for 2 txs (base fee + p75 priority fee × estimated CU per swap). On RPC failure or empty fees, returns `GAS_EST_SOL` from env (default `0.005`).

**Env (fallback):** `GAS_EST_SOL`.

---

### 5. `core/price`

**Purpose:** Fetch current SOL price in USD from external APIs. Used for gas cost in USD and balance value. Tries multiple sources; falls back to env if all fail.

#### `getSolPriceUsd(): Promise<GetSolPriceUsdReturn>`

**Returns:** `Promise<number>` – SOL/USD price.

**Source order:** Binance (SOLUSDT, public) → Jupiter Price API v3 (optional `JUPITER_API_KEY`) → CoinGecko (public) → `SOL_PRICE_USD` from env (default `200`).

**Env (fallback / optional):** `SOL_PRICE_USD`, `JUPITER_API_KEY`.

---

### 6. `core/executor`

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

### 7. `core/tracker`

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

### 8. `models`

**Purpose:** Mongoose schemas for MongoDB. Used by app features that persist users, strategies, transactions, leaderboard, and equity snapshots (Docker Compose: MongoDB + mongo-express).

| Model             | Description                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `User`            | Discord id, username, avatar, email, roles; subscription (plan, expiresAt, stripeCustomerId, autoRenew) |
| `Strategy`        | User/wallet ref, pair (base/quote mints, Orca/Raydium pools), config, stats                             |
| `Transaction`     | User/strategy ref, txHash, status; display, performance, details, financials                            |
| `LeaderboardStat` | User ref, period; totalProfitUsd, winRate, totalTrades, totalVolumeUsd, roi                             |
| `EquitySnapshot`  | Timeseries: metadata (user/strategy/pair), totalValueUsd, cumulativeProfitUsd                           |
| `Wallet`          | User ref, publicKey, encryptedPrivateKey (AES-256)                                                      |
| `Payment`         | User ref, amount, currency, gateway (STRIPE/CRYPTO), status, transactionDetails                         |

---

### 9. Entry – `src/index.ts`

**Purpose:** Compose config and core modules: import from `./config` and `./core/*` (quoter, gas, price, executor, tracker). Create Orca and Raydium quoters, implement `getGasCostUsd` (gas SOL × SOL price) and `getBalance` (USDC + SOL + SOL price), wrap `executeArbitrage` with fixed `ExecutorParams`, then start the tracker with pool IDs, quoters, executor, gas, balance, and min profit. Reads optional env: `RAYDIUM_POOL_ID`, `AMOUNT_TO_CHECK`, `PROFIT_THRESHOLD`, `MIN_PROFIT_PERCENT`.

**Flow:** `main()` → `createOrcaQuoter` / `createRaydiumQuoter` → `getGasEstSol` + `getSolPriceUsd` (for `getGasCostUsd` and `getBalance`) → `startTracking({ ... runArbitrage, getGasCostUsd, getBalance, minProfitPercent, baseSymbol ... })` → keeps process alive with `setInterval`.

---

### 10. API Server – `src/server/` (Phase 1–2)

**Purpose:** Express API, Mongoose, Discord OAuth + JWT, and wallet generation for multi-tenant foundation.

- **`server/index.ts`** – Connects to MongoDB via `MONGODB_URI`, then starts Express on `PORT`.
- **`server/app.ts`** – Express app with `express.json()`, `passport.initialize()`, `GET /health`, `/auth`, `/api/users`, `/api/wallets`.
- **`server/db.ts`** – `connectMongo()`, `disconnectMongo()`.
- **`server/passport.ts`** – Discord strategy: find or create User by `discordId`, sync username/avatar/email.
- **`server/config/auth.ts`** – `authConfig` (discord clientID/secret/callbackURL, frontendUrl, jwt secret/expiresIn), `isAuthConfigured()`.
- **`server/middleware/auth.ts`** – `requireAuth`: JWT from `Authorization: Bearer <token>` or `?token=`, verify and attach `req.user` (UserDocument).
- **`server/routes/auth.ts`** – `GET /auth/discord` → redirect to Discord; `GET /auth/discord/callback` → redirect to `FRONTEND_URL/auth/callback?token=<JWT>`.
- **`server/routes/users.ts`** – `GET /api/users/me` (protected): current user profile.
- **`server/routes/wallets.ts`** – `POST /api/wallets` (protected): create additional wallet (subject to plan limit); `GET /api/wallets` (protected): list user wallets and plan limit. **Wallet limits by plan:** FREE = 1, PRO = 10, WHALE = unlimited. New users get one default wallet on signup (and on first list if none). Response includes `wallets` and `limit` (number or `null` for unlimited).
- **`services/EncryptionService`** – AES-256-GCM for wallet private keys. Requires `ENCRYPTION_KEY` (32-byte hex or base64). Use `getEncryptionService()` for default instance.

**Auth flow:** User visits `GET /auth/discord` → Discord login → callback → JWT issued → redirect to frontend with `?token=...`. Frontend stores token and sends `Authorization: Bearer <token>` for `/api/*` requests.

**API structure (Route → Controller → Service):** Routes only mount middleware and controller handlers. Controllers handle HTTP (req/res) and call services. Services hold business logic (wallet limits, create/list/ensureFirstWallet). Shared helpers (e.g. EncryptionService) live under `src/services/`; server-scoped services under `src/server/services/`.

**Run API:** `npm run start:server` or `npm run dev:server` (with Nodemon).

---

## Scripts

| Command                | Description                                |
| ---------------------- | ------------------------------------------ |
| `npm start`            | Run bot with `ts-node src/index.ts`        |
| `npm run start:server` | Run API with `ts-node src/server/index.ts` |
| `npm run dev`          | Bot with Nodemon (restart on change)       |
| `npm run dev:server`   | API with Nodemon (restart on change)       |
| `npm run build`        | Compile TypeScript to `dist/`              |
| `npm run format`       | Format with Prettier                       |
| `npm run format:check` | Check formatting                           |
| `npm run lint`         | Run ESLint                                 |
| `npm run lint:fix`     | ESLint with auto-fix                       |
| `npm run prepare`      | Husky install (post-install)               |

---

## Environment Summary

Copy `.env.example` to `.env` and fill values.

**API (Phase 1–2):** `PORT`, `MONGODB_URI`, `ENCRYPTION_KEY` (required for wallet encryption). For Discord auth: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `JWT_SECRET`; optional: `API_BASE_URL`, `DISCORD_CALLBACK_URL`, `FRONTEND_URL`, `JWT_EXPIRES_IN`.

**Bot:** `WALLET_PRIVATE_KEY` (required for legacy single-wallet mode).

**Optional (bot):** `RPC_URL`, `BASE_MINT`, `QUOTE_MINT`, `BASE_SYMBOL`, `QUOTE_SYMBOL`, `BASE_DECIMALS`, `QUOTE_DECIMALS`, `ORCA_POOL_ADDRESS`, `RAYDIUM_POOL_ID`, `AMOUNT_TO_CHECK`, `PROFIT_THRESHOLD`, `GAS_EST_SOL`, `SOL_PRICE_USD`, `MIN_PROFIT_PERCENT`, `JUPITER_API_KEY`. Legacy: `SKR_MINT`, `USDC_MINT`.
