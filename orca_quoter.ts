import Decimal from 'decimal.js';
import { PublicKey } from '@solana/web3.js';
import {
  WhirlpoolContext,
  buildWhirlpoolClient,
  swapQuoteByInputToken
} from '@orca-so/whirlpools-sdk';
import { Percentage, DecimalUtil } from '@orca-so/common-sdk';
import { connection, wallet, SKR_TOKEN, USDC_TOKEN, ORCA_POOL_ADDRESS } from './config';

export type OrcaQuote = {
  dex: 'Orca';
  price: string;
  output: string;
};

let whirlpoolContext: WhirlpoolContext | null = null;

const getWhirlpoolContext = (): WhirlpoolContext => {
  if (whirlpoolContext) return whirlpoolContext;
  const walletAdapter = { publicKey: wallet.publicKey } as any;
  whirlpoolContext = WhirlpoolContext.from(connection, walletAdapter);
  return whirlpoolContext;
};

export const getOrcaQuote = async (inputAmount: string, isBuy: boolean): Promise<OrcaQuote> => {
  try {
    const ctx = getWhirlpoolContext();
    const client = buildWhirlpoolClient(ctx);
    const poolPubkey = new PublicKey(ORCA_POOL_ADDRESS);

    // Note: For high-speed WS, we will optimize this fetch in Phase 2
    const whirlpool = await client.getPool(poolPubkey);

    const inputToken = isBuy ? USDC_TOKEN : SKR_TOKEN;
    const outputToken = isBuy ? SKR_TOKEN : USDC_TOKEN;

    const amountAtomic = DecimalUtil.toBN(new Decimal(inputAmount), inputToken.decimals);
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

    const estimatedOutDecimal = DecimalUtil.fromBN(quote.estimatedAmountOut, outputToken.decimals);

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
    throw new Error(`Orca quote failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};
