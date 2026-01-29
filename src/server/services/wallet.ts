import type { Types } from 'mongoose';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { User } from '../../models/User';
import { Wallet } from '../../models/Wallet';
import { getEncryptionService } from '../../services/EncryptionService';
import { getWalletLimit } from '../constants/wallet';

export type CreateWalletParams = {
  userId: Types.ObjectId;
  label?: string;
};

export type CreateWalletResult =
  | { ok: true; publicKey: string; label: string }
  | { ok: false; code: 'LIMIT_EXCEEDED'; limit: number; current: number }
  | { ok: false; code: 'ENCRYPTION_UNAVAILABLE' };

export type WalletListItem = {
  publicKey: string;
  label: string;
  createdAt: Date;
};

export async function createWallet(
  params: CreateWalletParams
): Promise<CreateWalletResult> {
  const { userId, label = 'Trading Wallet' } = params;

  let encryption;
  try {
    encryption = getEncryptionService();
  } catch {
    return { ok: false, code: 'ENCRYPTION_UNAVAILABLE' };
  }

  const user = await User.findById(userId).select('subscription.plan').lean();
  const plan = user?.subscription?.plan ?? 'FREE';
  const limit = getWalletLimit(plan);
  const current = await Wallet.countDocuments({ userId });
  if (current >= limit) {
    return { ok: false, code: 'LIMIT_EXCEEDED', limit, current };
  }

  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const secretKeyBase58 = bs58.encode(keypair.secretKey);
  const encryptedPrivateKey = encryption.encrypt(secretKeyBase58);

  await Wallet.create({
    userId,
    publicKey,
    encryptedPrivateKey,
    label,
  });

  return { ok: true, publicKey, label };
}

export async function listWallets(
  userId: Types.ObjectId
): Promise<WalletListItem[]> {
  const wallets = await Wallet.find({ userId })
    .select('publicKey label createdAt')
    .sort({ createdAt: 1 })
    .lean();
  return wallets.map(
    (w: { publicKey: string; label?: string; createdAt: Date }) => ({
      publicKey: w.publicKey,
      label: w.label ?? 'Trading Wallet',
      createdAt: w.createdAt,
    })
  );
}

export async function ensureFirstWallet(userId: Types.ObjectId): Promise<void> {
  const count = await Wallet.countDocuments({ userId });
  if (count === 0) {
    const result = await createWallet({ userId, label: 'Trading Wallet' });
    if (!result.ok && result.code !== 'LIMIT_EXCEEDED') {
      // ENCRYPTION_UNAVAILABLE: log but do not throw; user can create wallet later
      return;
    }
  }
}
