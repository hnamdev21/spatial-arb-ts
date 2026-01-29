import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'USD' },
    gateway: {
      type: String,
      enum: ['STRIPE', 'CRYPTO'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'],
      required: true,
      default: 'PENDING',
      index: true,
    },
    transactionDetails: {
      stripeSessionId: String,
      stripePaymentIntentId: String,
      txHash: String,
      senderAddress: String,
      chain: String,
      metadata: mongoose.Schema.Types.Mixed,
    },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ status: 1, gateway: 1 });

export const Payment = mongoose.model('Payment', PaymentSchema);
