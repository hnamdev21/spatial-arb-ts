import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import type { UserDocument } from '../types/express';
import { getWalletLimit } from '../constants/wallet';
import * as walletService from '../services/wallet';

export async function create(req: Request, res: Response): Promise<void> {
  const user = req.user as UserDocument | undefined;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const label =
    typeof req.body?.label === 'string' && req.body.label.trim()
      ? req.body.label.trim()
      : undefined;

  const result = await walletService.createWallet({
    userId: user._id,
    label,
  });

  if (result.ok) {
    res.status(201).json({ publicKey: result.publicKey, label: result.label });
    return;
  }
  if (result.code === 'LIMIT_EXCEEDED') {
    res.status(403).json({
      error: 'Wallet limit exceeded for your plan',
      limit: result.limit,
      current: result.current,
    });
    return;
  }
  res.status(503).json({ error: 'Wallet encryption is not configured' });
}

export async function list(req: Request, res: Response): Promise<void> {
  const user = req.user as UserDocument | undefined;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  let wallets = await walletService.listWallets(user._id);
  if (wallets.length === 0) {
    await walletService.ensureFirstWallet(user._id);
    wallets = await walletService.listWallets(user._id);
  }
  const plan = user.subscription?.plan ?? 'FREE';
  const limit = getWalletLimit(plan);
  res.json({
    wallets,
    limit: limit === Number.POSITIVE_INFINITY ? null : limit,
  });
}

export const createWithAuth = [requireAuth, create];
export const listWithAuth = [requireAuth, list];
