import type { Request, Response } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { authConfig, isAuthConfigured } from '../config/auth';
import type { UserDocument } from '../types/express';

export function getDiscord(req: Request, res: Response): void {
  if (!isAuthConfigured()) {
    res.status(503).json({ error: 'Discord auth not configured' });
    return;
  }
  passport.authenticate('discord', { scope: ['identify', 'email'] })(
    req,
    res,
    () => {}
  );
}

export function getDiscordCallback(
  req: Request,
  res: Response,
  next: (err?: Error) => void
): void {
  passport.authenticate(
    'discord',
    { session: false },
    (err: Error | null, user?: UserDocument) => {
      if (err) {
        const redirectUrl = `${authConfig.frontendUrl}/auth/error?message=${encodeURIComponent(err.message)}`;
        res.redirect(redirectUrl);
        return;
      }
      if (!user) {
        res.redirect(`${authConfig.frontendUrl}/auth/error?message=No+user`);
        return;
      }
      if (!authConfig.jwt.secret) {
        res.redirect(
          `${authConfig.frontendUrl}/auth/error?message=Server+config+error`
        );
        return;
      }
      const token = jwt.sign({ sub: String(user._id) }, authConfig.jwt.secret, {
        expiresIn: authConfig.jwt.expiresIn,
      } as jwt.SignOptions);
      const redirectUrl = `${authConfig.frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`;
      res.redirect(redirectUrl);
    }
  )(req, res, next);
}
