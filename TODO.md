# 🚀 Product Roadmap: Solana Spatial Arbitrage SaaS

## Phase 1: Core Architecture & Database Design ✅

_Focus: Transitioning from a single-user script to a secure multi-tenant foundation._

- [x] **Backend Repository Initialization**
  - [x] Set up a robust Node.js server framework (Express or NestJS).
  - [x] Configure Mongoose connection to MongoDB Atlas.
- [x] **Database Schema Implementation**
  - [x] **User Schema:** Store Discord ID, Username, Avatar, Roles, and **Payment Metadata** (`stripeCustomerId`, `autoRenew`).
  - [x] **Wallet Schema:** Implement `encryptedPrivateKey` (AES-256).
  - [x] **Strategy Schema:** Dynamic configuration model (replacing `config/index.ts`).
  - [x] **Payment Schema:** Track transaction history (`amount`, `currency`, `gateway`, `status`, `transactionDetails`).
  - [x] **Analytics Schema:** Time-series collection for Equity Curves.
- [x] **Security Module**
  - [x] Build `EncryptionService` helper class.
  - [x] Set up environment variables for Master Salt/Keys.

## Phase 2: Authentication & User Onboarding (Discord-First)

_Focus: Leveraging Discord for login and community management._

- [ ] **Discord OAuth2 Integration**
  - [ ] Register Discord Developer Application.
  - [ ] Implement `Passport.js` with `passport-discord`.
  - [ ] JWT Session Management.
- [ ] **Wallet Generation Service**
  - [ ] API to generate unique "Trading Wallet" per user.
  - [ ] Encrypt and store Private Key.

## Phase 3: Monetization & Payments (New) 💰

_Focus: implementing the revenue engine with dual-gateway support._

- [ ] **Stripe Integration (Fiat Flow)**
  - [ ] **Checkout Session:** Create API to initialize Stripe Checkout for "Pro" and "Whale" plans.
  - [ ] **Webhook Handler:** Listen for `checkout.session.completed`.
    - [ ] Verify `stripeSignature`.
    - [ ] Find pending Payment record -> Update status to `COMPLETED`.
    - [ ] Update User Subscription (`expiresAt` + 30 days).
  - [ ] **Portal:** Allow users to manage/cancel subscriptions via Stripe Customer Portal.
- [ ] **Crypto Integration (Solana Flow)**
  - [ ] **Deposit Address:** UI generates a unique wallet address or QR code for the user to send USDC/SOL.
  - [ ] **Transaction Monitor:**
    - [ ] Background Job (Cron) or Helius Webhook to detect incoming transfers.
    - [ ] **Reconciliation:** Match `senderAddress` and `amount` with pending Payment records.
    - [ ] **Confirmation:** Update Payment status to `COMPLETED` after finalized commitment.
- [ ] **Subscription Enforcement**
  - [ ] Middleware `checkSubscriptionStatus` to block bot execution if `expiresAt` is in the past.
  - [ ] Notification system: Email/Discord DM user 3 days before expiration.

## Phase 4: Engine Refactoring (The "Black Box")

_Focus: Transforming the script into a scalable engine._

- [ ] **Dynamic Strategy Loader**
  - [ ] Refactor `src/index.ts` to fetch active strategies from MongoDB.
  - [ ] Remove hardcoded `BASE_MINT`/`QUOTE_MINT` dependencies.
- [ ] **RPC Rate Limiter (Helius Optimization)**
  - [ ] Implement **Token Bucket** algorithm.
  - [ ] Set global RPS limits (Start: **200 RPS** for Business Plan).
- [ ] **Execution Engine Update**
  - [ ] Update `executor/index.ts` to accept dynamic decrypted wallets.
  - [ ] Add "Dry Run" mode.

## Phase 5: Frontend Dashboard & Visualization

_Focus: Providing proof of value._

- [ ] **Real-time Dashboard**
  - [ ] **Stats Panel:** "Current Balance", "Active Pairs", "Total Profit".
  - [ ] **Log Stream:** WebSocket for live transaction logs.
- [ ] **Charting Module**
  - [ ] API `GET /api/stats/equity`.
  - [ ] Render "Asset Growth" chart.
- [ ] **Leaderboard**
  - [ ] Background Job for "Top Traders".
  - [ ] API `GET /api/leaderboard`.

## Phase 6: Infrastructure & DevOps

_Focus: Stability and Cost Management._

- [ ] **Containerization**
  - [ ] Update `docker-compose.yml` (API + Bot Engine + MongoDB).
- [ ] **Logging & Monitoring**
  - [ ] Structured Logger (Winston).
  - [ ] Discord Webhooks for critical alerts.
- [ ] **Deployment**
  - [ ] CI/CD (GitHub Actions).
  - [ ] Deploy to VPS (AWS/DigitalOcean).

## Phase 7: Launch Strategy

- [ ] **Internal Alpha** (Team wallets).
- [ ] **Beta Launch** (Discord "Whitelisted" roles).
- [ ] **Monitor & Scale** (Upgrade to Helius Professional at ~20 users).
