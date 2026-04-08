import type { OpportunityTrapFlag } from "@/lib/types/opportunity";
import type {
  FairPriceView,
  MarketPathView,
  MarketIntelligenceView,
  MarketTruthView,
  ProviderHealthView
} from "@/lib/types/domain";

type BuildOpportunityTrapsArgs = {
  fairPrice?: FairPriceView | null;
  marketIntelligence?: MarketIntelligenceView | null;
  marketTruth?: MarketTruthView | null;
  marketPath?: MarketPathView | null;
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
  if (condition) flags.add(flag);
}

export function buildOpportunityTrapFlags(
  args: BuildOpportunityTrapsArgs
): OpportunityTrapFlag[] {
  const flags = new Set<OpportunityTrapFlag>();

  const disagreement = args.marketIntelligence?.marketDisagreementScore ?? 0;
  const confidence = args.fairPrice?.pricingConfidenceScore ?? 0;
  const providerState = args.providerHealth?.state ?? "HEALTHY";

  const bookCount = args.bookCount ?? args.marketTruth?.bookCount ?? 0;
  const movement = Math.abs(
    args.lineMovement ?? args.marketTruth?.movementStrength ?? 0
  );
  const stale =
    args.marketIntelligence?.staleFlag === true || args.marketTruth?.stale === true;
  const bestPrice = args.marketIntelligence?.bestPriceFlag === true;
  const freshness = args.providerHealth?.freshnessMinutes ?? null;
  const strongStaleCopy =
    args.marketPath !== null &&
    args.marketPath !== undefined &&
    args.marketPath.staleCopyConfidence >= 70 &&
    !args.marketPath.staleCopySuppressed &&
    args.marketPath.confirmationCount >= 2;

  // --- CORE TRAPS ---
  addIf(flags, stale && !strongStaleCopy, "STALE_EDGE");

  addIf(flags, bookCount <= 1 || (bookCount <= 2 && !strongStaleCopy), "ONE_BOOK_OUTLIER");
  addIf(flags, bookCount > 1 && bookCount < 4 && !strongStaleCopy, "THIN_MARKET");

  addIf(flags, disagreement >= 0.18, "HIGH_MARKET_DISAGREEMENT");

  addIf(flags, confidence > 0 && confidence < 58, "LOW_CONFIDENCE_FAIR_PRICE");

  addIf(
    flags,
    providerState === "DEGRADED" ||
      providerState === "FALLBACK" ||
      providerState === "OFFLINE",
    "LOW_PROVIDER_HEALTH"
  );

  // --- 🔥 STEAM vs FAKE MOVE DETECTION ---

  // STEAM: strong move + many books + still best price
  const isSteam =
    movement >= 10 &&
    bookCount >= 5 &&
    bestPrice &&
    !stale;

  // FAKE MOVE: strong move but thin / no confirmation
  const isFakeMove =
    movement >= 10 &&
    ((args.marketPath?.regime === "FRAGMENTED" ||
      args.marketPath?.moveCoherenceScore && args.marketPath.moveCoherenceScore < 45 ||
      (args.marketPath?.confirmationCount ?? 0) < 2) ||
      (!bestPrice || bookCount < 4 || stale)) &&
    !strongStaleCopy;

  if (isFakeMove) {
    flags.add("FAKE_MOVE_RISK");
  }

  // --- EDGE DECAY ---
  if (
    freshness !== null &&
    freshness > 30 &&
    !bestPrice &&
    !strongStaleCopy
  ) {
    flags.add("STALE_EDGE");
  }

  // --- MODEL VS MARKET ---
  if (args.conflictSignal === true) {
    flags.add("MODEL_MARKET_CONFLICT");
  }

  return Array.from(flags);
}
