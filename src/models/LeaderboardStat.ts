import mongoose from 'mongoose';

const LeaderboardStatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String },
  avatar: { type: String },

  period: { type: String, required: true, index: true },

  totalProfitUsd: { type: Number, default: 0, index: -1 },
  winRate: { type: Number, default: 0 },
  totalTrades: { type: Number, default: 0 },
  totalVolumeUsd: { type: Number, default: 0 },

  roiPercent: { type: Number, default: 0 },
});

LeaderboardStatSchema.index({ period: 1, totalProfitUsd: -1 });

export const LeaderboardStat = mongoose.model(
  'LeaderboardStat',
  LeaderboardStatSchema
);
