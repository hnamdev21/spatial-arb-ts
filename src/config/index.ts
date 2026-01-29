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

const DEFAULT_SKR_MINT =
  'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const DEFAULT_USDC_MINT =
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const SKR_MINT = process.env.SKR_MINT?.trim() || DEFAULT_SKR_MINT;
export const USDC_MINT = process.env.USDC_MINT?.trim() || DEFAULT_USDC_MINT;

function toPublicKey(value: string, name: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : String(err);
    throw new Error(
      `Invalid public key for ${name}: "${value}". ${msg}. ` +
        `Must be base58-encoded 32 bytes. Check .env or config.`
    );
  }
}

export const SKR_MINT_PUBKEY = toPublicKey(SKR_MINT, 'SKR_MINT');
export const USDC_MINT_PUBKEY = toPublicKey(USDC_MINT, 'USDC_MINT');

export const SKR_TOKEN: TokenInfo = {
  symbol: 'SKR',
  mint: SKR_MINT_PUBKEY,
  decimals: 6,
};

export const USDC_TOKEN: TokenInfo = {
  symbol: 'USDC',
  mint: USDC_MINT_PUBKEY,
  decimals: 6,
};

export const RAYDIUM_V4_PROGRAM_ID =
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

export const ORCA_POOL_ADDRESS = 'VY1ZQXjqBwvuWgVfTfhqanJe96GGoQrX7xZZDrWPGiT';

export const ORCA_POOL_PUBKEY = new PublicKey(ORCA_POOL_ADDRESS);

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
