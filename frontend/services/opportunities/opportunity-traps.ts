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

  // --- CORE TRAPS ---
  addIf(flags, stale, "STALE_EDGE");

  addIf(flags, bookCount <= 1, "ONE_BOOK_OUTLIER");
  addIf(flags, bookCount > 1 && bookCount < 4, "THIN_MARKET");

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
    (!bestPrice || bookCount < 4 || stale);

  if (isFakeMove) {
    flags.add("FAKE_MOVE_RISK");
  }

  // --- EDGE DECAY ---
  if (
    freshness !== null &&
    freshness > 30 &&
    !bestPrice
  ) {
    flags.add("STALE_EDGE");
  }

  // --- MODEL VS MARKET ---
  if (args.conflictSignal === true) {
    flags.add("MODEL_MARKET_CONFLICT");
  }

  return Array.from(flags);
}