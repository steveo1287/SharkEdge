import type { OpportunityTrapFlag } from "@/lib/types/opportunity";
import type {
  FairPriceView,
  MarketIntelligenceView,
  MarketTruthView,
  ProviderHealthView
} from "@/lib/types/domain";

type BuildOpportunityTrapsArgs = {
  fairPrice?: FairPriceView | null;
  marketIntelligence?: MarketIntelligenceView | null;
  marketTruth?: MarketTruthView | null;
  providerHealth?: ProviderHealthView | null;
  bookCount?: number | null;
  lineMovement?: number | null;
  conflictSignal?: boolean;
};

export function buildOpportunityTrapFlags(
  args: BuildOpportunityTrapsArgs
): OpportunityTrapFlag[] {
  const flags = new Set<OpportunityTrapFlag>();
  const disagreement = args.marketIntelligence?.marketDisagreementScore ?? 0;
  const confidence = args.fairPrice?.pricingConfidenceScore ?? 0;
  const providerState = args.providerHealth?.state ?? "HEALTHY";
  const bookCount = args.bookCount ?? args.marketTruth?.bookCount ?? 0;
  const movement = Math.abs(args.lineMovement ?? args.marketTruth?.movementStrength ?? 0);

  if (args.marketIntelligence?.staleFlag || args.marketTruth?.stale) {
    flags.add("STALE_EDGE");
  }

  if (bookCount <= 1) {
    flags.add("ONE_BOOK_OUTLIER");
  }

  if (bookCount > 0 && bookCount < 3) {
    flags.add("THIN_MARKET");
  }

  if (disagreement >= 0.18 || (args.marketTruth?.disagreementPct ?? 0) >= 6) {
    flags.add("HIGH_MARKET_DISAGREEMENT");
  }

  if (confidence > 0 && confidence < 55) {
    flags.add("LOW_CONFIDENCE_FAIR_PRICE");
  }

  if (providerState === "DEGRADED" || providerState === "FALLBACK" || providerState === "OFFLINE") {
    flags.add("LOW_PROVIDER_HEALTH");
  }

  if (movement >= 10 && !args.marketIntelligence?.bestPriceFlag && bookCount < 4) {
    flags.add("FAKE_MOVE_RISK");
  }

  if (args.conflictSignal) {
    flags.add("MODEL_MARKET_CONFLICT");
  }

  return Array.from(flags);
}
