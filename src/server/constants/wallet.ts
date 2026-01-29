export type SubscriptionPlan = 'FREE' | 'PRO' | 'WHALE';

export const WALLET_LIMITS: Record<SubscriptionPlan, number> = {
  FREE: 1,
  PRO: 10,
  WHALE: Number.POSITIVE_INFINITY,
};

export function getWalletLimit(plan: string): number {
  const key = plan in WALLET_LIMITS ? (plan as SubscriptionPlan) : 'FREE';
  return WALLET_LIMITS[key];
}
