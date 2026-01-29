import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  strategyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Strategy',
    index: true,
  },

  txHash: { type: String, required: true, unique: true },
  status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },

  display: {
    baseSymbol: String,
    quoteSymbol: String,
    dexName: String,
    scanUrl: String,
  },

  performance: {
    profitUsd: Number,
    gasFeeUsd: Number,
    netProfitUsd: Number,
    executionTimeMs: Number,
  },

  details: {
    direction: { type: String, enum: ['A', 'B'] },
    inputAmount: { type: String },
    outputAmount: { type: String },
    dexPath: { type: String },
  },

  financials: {
    grossProfitUsd: { type: Number },
    gasCostUsd: { type: Number },
    netProfitUsd: { type: Number },
  },

  timestamp: { type: Date, default: Date.now, index: true },
});

export const Transaction = mongoose.model('Transaction', TransactionSchema);
