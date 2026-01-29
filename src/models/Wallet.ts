import mongoose from 'mongoose';

const WalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    publicKey: { type: String, required: true, unique: true },
    encryptedPrivateKey: { type: String, required: true },
    label: { type: String, default: 'Trading Wallet' },
  },
  { timestamps: true }
);

WalletSchema.index({ userId: 1 });

export const Wallet = mongoose.model('Wallet', WalletSchema);
