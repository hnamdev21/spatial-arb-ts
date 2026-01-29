import mongoose from 'mongoose';

const EquitySnapshotSchema = new mongoose.Schema(
  {
    metadata: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      strategyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Strategy' },
      pair: { type: String },
    },
    timestamp: { type: Date, required: true },
    totalValueUsd: { type: Number, required: true },
    cumulativeProfitUsd: { type: Number, required: true },
  },
  {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'metadata',
      granularity: 'minutes',
    },
  }
);

export const EquitySnapshot = mongoose.model(
  'EquitySnapshot',
  EquitySnapshotSchema
);
