import type { PremiumGateKey } from "@/lib/types/bet-intelligence";

const enabledPremiumAnalytics =
  process.env.NEXT_PUBLIC_SHARKEDGE_PREMIUM_ANALYTICS === "1" ||
  process.env.SHARKEDGE_PREMIUM_ANALYTICS === "1";

export function isPremiumGateEnabled(_gate: PremiumGateKey) {
  return enabledPremiumAnalytics;
}
