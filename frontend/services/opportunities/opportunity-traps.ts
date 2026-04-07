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

function addIf(
  flags: Set<OpportunityTrapFlag>,
  condition: boolean,
  flag: OpportunityTrapFlag
) {
  if (condition) {
    flags.add(flag);
  }
}

export function buildOpportunityTrapFlags(
  args: BuildOpportunityTrapsArgs
): OpportunityTrapFlag[] {
  const flags = new Set<OpportunityTrapFlag>();

  const disagreementScore = args.marketIntelligence?.marketDisagreementScore ?? 0;
  const disagreementPct = args.marketTruth?.disagreementPct ?? 0;
  const confidenceScore = args.fairPrice?.pricingConfidenceScore ?? 0;
  const providerState = args.providerHealth?.state ?? "HEALTHY";

  const bookCount = args.bookCount ?? args.marketTruth?.bookCount ?? 0;
  const movementStrength = Math.abs(
    args.lineMovement ?? args.marketTruth?.movementStrength ?? 0
  );
  const stale =
    args.marketIntelligence?.staleFlag === true || args.marketTruth?.stale === true;
  const bestPriceFlag = args.marketIntelligence?.bestPriceFlag === true;
  const freshnessMinutes = args.providerHealth?.freshnessMinutes ?? null;

  addIf(flags, stale, "STALE_EDGE");

  addIf(flags, bookCount <= 1, "ONE_BOOK_OUTLIER");
  addIf(flags, bookCount > 1 && bookCount < 4, "THIN_MARKET");

  addIf(
    flags,
    disagreementScore >= 0.16 || disagreementPct >= 5,
    "HIGH_MARKET_DISAGREEMENT"
  );

  addIf(
    flags,
    confidenceScore > 0 && confidenceScore < 58,
    "LOW_CONFIDENCE_FAIR_PRICE"
  );

  addIf(
    flags,
    providerState === "DEGRADED" ||
      providerState === "FALLBACK" ||
      providerState === "OFFLINE",
    "LOW_PROVIDER_HEALTH"
  );

  addIf(
    flags,
    movementStrength >= 12 && !bestPriceFlag && bookCount < 5,
    "FAKE_MOVE_RISK"
  );

  addIf(
    flags,
    movementStrength >= 8 &&
      stale &&
      !bestPriceFlag,
    "FAKE_MOVE_RISK"
  );

  addIf(flags, args.conflictSignal === true, "MODEL_MARKET_CONFLICT");

  addIf(
    flags,
    freshnessMinutes !== null &&
      freshnessMinutes > 45 &&
      !bestPriceFlag,
    "STALE_EDGE"
  );

  return Array.from(flags);
}