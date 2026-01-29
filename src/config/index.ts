import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import type { TokenInfo } from '../types';

const RPC_URL = process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

if (!WALLET_PRIVATE_KEY) {
  throw new Error(
    'WALLET_PRIVATE_KEY is required in .env (JSON array of secret key bytes or base58 string)'
  );
}

export const connection = new Connection(RPC_URL, 'confirmed');

const DEFAULT_BASE_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const DEFAULT_QUOTE_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const BASE_MINT =
  process.env.BASE_MINT?.trim() ||
  process.env.SKR_MINT?.trim() ||
  DEFAULT_BASE_MINT;
export const QUOTE_MINT =
  process.env.QUOTE_MINT?.trim() ||
  process.env.USDC_MINT?.trim() ||
  DEFAULT_QUOTE_MINT;

function toPublicKey(value: string, name: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Invalid public key for ${name}: "${value}". ${msg}. ` +
        `Must be base58-encoded 32 bytes. Check .env or config.`
    );
  }
}

export const BASE_MINT_PUBKEY = toPublicKey(BASE_MINT, 'BASE_MINT');
export const QUOTE_MINT_PUBKEY = toPublicKey(QUOTE_MINT, 'QUOTE_MINT');

export const BASE_TOKEN: TokenInfo = {
  symbol: process.env.BASE_SYMBOL?.trim() || 'BASE',
  mint: BASE_MINT_PUBKEY,
  decimals: Number(process.env.BASE_DECIMALS?.trim() || '6'),
};

export const QUOTE_TOKEN: TokenInfo = {
  symbol: process.env.QUOTE_SYMBOL?.trim() || 'USDC',
  mint: QUOTE_MINT_PUBKEY,
  decimals: Number(process.env.QUOTE_DECIMALS?.trim() || '6'),
};

export const RAYDIUM_V4_PROGRAM_ID =
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

export const ORCA_POOL_ADDRESS =
  process.env.ORCA_POOL_ADDRESS?.trim() ||
  'VY1ZQXjqBwvuWgVfTfhqanJe96GGoQrX7xZZDrWPGiT';

export const ORCA_POOL_PUBKEY = toPublicKey(
  ORCA_POOL_ADDRESS,
  'ORCA_POOL_ADDRESS'
);

function parseWalletPrivateKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed) as number[];
    return Uint8Array.from(arr);
  }
  return bs58.decode(trimmed);
}

export const wallet: Keypair = (() => {
  const secret = parseWalletPrivateKey(WALLET_PRIVATE_KEY);
  return Keypair.fromSecretKey(secret);
})();
