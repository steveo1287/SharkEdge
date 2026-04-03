import type {
  PremiumEntitlementKey,
  SubscriptionSummary
} from "@/lib/types/product";

import { getCurrentUserProfile, getSubscriptionSummary } from "./user-service";

const premiumOnlyFeatures = new Set<PremiumEntitlementKey>([
  "advanced_alerts",
  "premium_alert_volume",
  "deep_edge_breakdown",
  "leak_detector_detail",
  "top_play_explanations",
  "import_runs_history"
]);

export async function getSubscriptionSummaryForCurrentUser(): Promise<SubscriptionSummary> {
  const profile = await getCurrentUserProfile();
  return getSubscriptionSummary({
    planTier: profile.planTier,
    subscriptionState: profile.subscriptionState
  });
}

export async function hasEntitlement(feature: PremiumEntitlementKey) {
  const plan = await getSubscriptionSummaryForCurrentUser();
  if (!premiumOnlyFeatures.has(feature)) {
    return true;
  }

  return plan.isPremium;
}
