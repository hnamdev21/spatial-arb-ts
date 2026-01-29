import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import { User } from '../models/User';
import { authConfig } from './config/auth';
import { ensureFirstWallet } from './services/walletService';

if (authConfig.discord.clientID && authConfig.discord.clientSecret) {
  passport.use(
    new DiscordStrategy(
      {
        clientID: authConfig.discord.clientID,
        clientSecret: authConfig.discord.clientSecret,
        callbackURL: authConfig.discord.callbackURL,
        scope: ['identify', 'email'],
      } as any,
      (async (
        _accessToken: string,
        _refreshToken: string,
        profile: {
          id: string;
          username: string;
          avatar?: string | null;
          email?: string | null;
        },
        done: (err: Error | null, user?: Express.User) => void
      ) => {
        try {
          let user = await User.findOne({ discordId: profile.id });
          if (!user) {
            const createPayload: {
              discordId: string;
              username: string;
              avatar?: string;
              email?: string;
            } = {
              discordId: profile.id,
              username: profile.username,
            };
            if (profile.avatar != null) createPayload.avatar = profile.avatar;
            if (profile.email != null) createPayload.email = profile.email;
            user = await User.create(createPayload);
            await ensureFirstWallet(user._id).catch(() => {});
          } else {
            user.username = profile.username;
            if (profile.avatar != null) user.avatar = profile.avatar;
            if (profile.email != null) user.email = profile.email;
            await user.save();
          }
          done(null, user);
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)));
        }
      }) as any
    )
  );
}

export default passport;
