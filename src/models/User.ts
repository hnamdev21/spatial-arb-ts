import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true },
  avatar: { type: String },
  email: { type: String, unique: true, sparse: true },

  subscription: {
    plan: { type: String, enum: ['FREE', 'PRO', 'WHALE'], default: 'FREE' },
    expiresAt: { type: Date },
    autoRenew: { type: Boolean, default: false },
    stripeCustomerId: { type: String },
  },

  isOnboarded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', UserSchema);
