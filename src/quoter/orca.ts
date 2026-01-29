import Decimal from 'decimal.js';
import { PublicKey } from '@solana/web3.js';
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  swapQuoteByInputToken,
} from '@orca-so/whirlpools-sdk';
import { Percentage, DecimalUtil } from '@orca-so/common-sdk';
import type { Connection, Keypair } from '@solana/web3.js';
import type { Quote } from '../types';
import type { TokenInfo } from '../types';

export type OrcaQuote = Quote<'Orca'>;

export type OrcaQuoterParams = {
  connection: Connection;
  wallet: Keypair;
  poolAddress: string;
  skrToken: TokenInfo;
  usdcToken: TokenInfo;
};

export type GetOrcaQuote = (
  inputAmount: string,
  isBuy: boolean
) => Promise<OrcaQuote>;

export function createOrcaQuoter(params: OrcaQuoterParams): GetOrcaQuote {
  const { connection, wallet, poolAddress, skrToken, usdcToken } = params;

  let whirlpoolContext: WhirlpoolContext | null = null;

  function getWhirlpoolContext(): WhirlpoolContext {
    if (whirlpoolContext) return whirlpoolContext;
    const walletAdapter = { publicKey: wallet.publicKey } as Parameters<
      typeof WhirlpoolContext.from
    >[1];
    whirlpoolContext = WhirlpoolContext.from(connection, walletAdapter);
    return whirlpoolContext;
  }

  return async function getOrcaQuote(
    inputAmount: string,
    isBuy: boolean
  ): Promise<OrcaQuote> {
    try {
      const ctx = getWhirlpoolContext();
      const client = buildWhirlpoolClient(ctx);
      const poolPubkey = new PublicKey(poolAddress);

      const whirlpool = await client.getPool(poolPubkey);

      const inputToken = isBuy ? usdcToken : skrToken;
      const outputToken = isBuy ? skrToken : usdcToken;

      const amountAtomic = DecimalUtil.toBN(
        new Decimal(inputAmount),
        inputToken.decimals
      );
      const slippage = Percentage.fromFraction(100, 10000);

      const quote = await swapQuoteByInputToken(
        whirlpool,
        new PublicKey(inputToken.mint),
        amountAtomic,
        slippage,
        ctx.program.programId,
        ctx.fetcher,
        undefined
      );

      const estimatedOutDecimal = DecimalUtil.fromBN(
        quote.estimatedAmountOut,
        outputToken.decimals
      );

      const price = estimatedOutDecimal
        .div(new Decimal(inputAmount))
        .toSignificantDigits(18)
        .toString();

      return {
        dex: 'Orca',
        price,
        output: estimatedOutDecimal.toString(),
      };
    } catch (error) {
      throw new Error(
        `Orca quote failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}
