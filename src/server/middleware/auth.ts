import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../models/User';
import { authConfig } from '../config/auth';
import type { UserDocument } from '../types/express';

type JwtPayload = { sub: string };

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const queryToken =
    typeof req.query.token === 'string' ? req.query.token : null;
  if (queryToken) return queryToken;
  return null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Missing or invalid authorization' });
    return;
  }
  if (!authConfig.jwt.secret) {
    res.status(503).json({ error: 'Auth not configured' });
    return;
  }
  try {
    const decoded = jwt.verify(token, authConfig.jwt.secret) as JwtPayload;
    const user = await User.findById(decoded.sub);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = user as UserDocument;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
