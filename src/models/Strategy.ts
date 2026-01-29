import mongoose from 'mongoose';

const StrategySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },

    name: { type: String, required: true },
    isActive: { type: Boolean, default: false, index: true },

    pair: {
      baseSymbol: { type: String, required: true },
      baseMint: { type: String, required: true },
      quoteSymbol: { type: String, required: true },
      quoteMint: { type: String, required: true },
      orcaPoolAddress: { type: String, required: true },
      raydiumPoolId: { type: String, required: true },
    },

    config: {
      amountInQuote: { type: String, required: true },
      minProfitPercent: { type: Number, default: 1.0 },
      stopLossLimit: { type: Number, default: 0 },
      gasCapSol: { type: Number, default: 0.05 },
    },

    stats: {
      totalTrades: { type: Number, default: 0 },
      totalProfitUsd: { type: Number, default: 0 },
      lastExecutedAt: { type: Date },
    },
  },
  { timestamps: true }
);

export const Strategy = mongoose.model('Strategy', StrategySchema);
