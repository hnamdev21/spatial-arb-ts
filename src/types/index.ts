import type { PublicKey } from '@solana/web3.js';

export type TokenInfo = {
  symbol: string;
  mint: PublicKey;
  decimals: number;
};

export type Quote<TDex extends string = string> = {
  dex: TDex;
  price: string;
  output: string;
};
