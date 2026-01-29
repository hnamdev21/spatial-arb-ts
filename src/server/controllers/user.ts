import type { Request, Response } from 'express';
import type { UserDocument } from '../types/express';

export function getMe(req: Request, res: Response): void {
  const u = req.user as UserDocument | undefined;
  if (!u) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({
    id: u._id,
    discordId: u.discordId,
    username: u.username,
    avatar: u.avatar,
    email: u.email,
    roles: u.roles,
    subscription: u.subscription,
    isOnboarded: u.isOnboarded,
    createdAt: u.createdAt,
  });
}
