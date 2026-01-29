const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim();
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET?.trim();
const API_BASE_URL =
  process.env.API_BASE_URL?.trim() || 'http://localhost:3000';
const DISCORD_CALLBACK_URL =
  process.env.DISCORD_CALLBACK_URL?.trim() ||
  `${API_BASE_URL}/auth/discord/callback`;
const FRONTEND_URL =
  process.env.FRONTEND_URL?.trim() || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET?.trim();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN?.trim() || '7d';

export const authConfig = {
  discord: {
    clientID: DISCORD_CLIENT_ID ?? '',
    clientSecret: DISCORD_CLIENT_SECRET ?? '',
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify', 'email'] as const,
  },
  frontendUrl: FRONTEND_URL,
  jwt: {
    secret: JWT_SECRET ?? '',
    expiresIn: JWT_EXPIRES_IN,
  },
};

export function isAuthConfigured(): boolean {
  return Boolean(
    authConfig.discord.clientID &&
    authConfig.discord.clientSecret &&
    authConfig.jwt.secret
  );
}
