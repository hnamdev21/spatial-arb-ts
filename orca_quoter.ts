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

    const whirlpool = await client.getPool(poolPubkey);

    const inputToken = isBuy ? USDC_TOKEN : SKR_TOKEN;
    const outputToken = isBuy ? SKR_TOKEN : USDC_TOKEN;

    // DEBUG LOGS
    console.log(`\n[Orca Debug] Pool: ${ORCA_POOL_ADDRESS}`);
    console.log(`[Orca Debug] Token A: ${whirlpool.getTokenAInfo().mint.toBase58()}`);
    console.log(`[Orca Debug] Token B: ${whirlpool.getTokenBInfo().mint.toBase58()}`);
    console.log(`[Orca Debug] Input: ${inputAmount} ${inputToken.symbol} (Decimals: ${inputToken.decimals})`);

    const amountAtomic = DecimalUtil.toBN(new Decimal(inputAmount), inputToken.decimals);

    // DEBUG ATOMIC
    console.log(`[Orca Debug] Input Atomic: ${amountAtomic.toString()}`);

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

    // DEBUG OUTPUT
    console.log(`[Orca Debug] Est Output Atomic: ${quote.estimatedAmountOut.toString()}`);
    console.log(`[Orca Debug] Est Output Decimal: ${estimatedOutDecimal.toString()} ${outputToken.symbol}`);

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
