import {
  americanToImpliedProbability,
  calculateBreakEvenProbability,
  calculateExpectedValuePct,
  calculateKellyFraction,
  fairOddsAmericanFromProbability,
  fairOddsDecimalFromProbability
} from "@/lib/math";
import type { FairPriceMethod, FairPriceView, MarketIntelligenceView, EvResultView } from "@/lib/types/domain";

export function buildEvResult(args: {
  offeredOddsAmerican: number | null | undefined;
  fairPrice: FairPriceView | null;
  marketIntelligence?: MarketIntelligenceView | null;
}) {
  if (!args.fairPrice || typeof args.offeredOddsAmerican !== "number") {
    return null;
  }

  const fairProbability = args.fairPrice.fairProb;
  if (typeof fairProbability !== "number") {
    return null;
  }

  const edgePctRaw = fairProbability - (americanToImpliedProbability(args.offeredOddsAmerican) ?? 0);
  const evPct = calculateExpectedValuePct({
    oddsAmerican: args.offeredOddsAmerican,
    fairProbability
  });
  const kellyFraction =
    args.fairPrice.pricingConfidenceScore >= 60
      ? calculateKellyFraction({
          oddsAmerican: args.offeredOddsAmerican,
          fairProbability,
          fraction: 0.25
        })
      : null;
  const fairOddsAmerican = fairOddsAmericanFromProbability(fairProbability);
  const fairLineGap =
    typeof fairOddsAmerican === "number" ? args.offeredOddsAmerican - fairOddsAmerican : null;
  const freshnessPenalty = args.marketIntelligence?.staleFlag ? 18 : 0;
  const disagreementPenalty = (args.marketIntelligence?.marketDisagreementScore ?? 0) * 18;
  const confidenceBoost = args.fairPrice.pricingConfidenceScore * 0.4;
  const rankScore =
    typeof evPct === "number"
      ? Math.round(
          Math.max(
            0,
            Math.min(100, evPct * 8 + confidenceBoost - freshnessPenalty - disagreementPenalty + 35)
          )
        )
      : 0;

  return {
    edgePct: Number((edgePctRaw * 100).toFixed(3)),
    evPerUnit: evPct === null ? null : Number((evPct / 100).toFixed(4)),
    minimumBeProb: calculateBreakEvenProbability(args.offeredOddsAmerican),
    fairLineGap,
    rankScore,
    kellyFraction
  } satisfies EvResultView;
}

function buildUnavailableFairPrice(method: FairPriceMethod, note: string): FairPriceView {
  return {
    fairProb: null,
    fairOddsAmerican: null,
    fairOddsDecimal: null,
    pricingMethod: method,
    pricingConfidenceScore: 0,
    sourceCount: 0,
    coverageNote: note,
    completenessScore: 0
  };
}

export function buildConsensusNoVigFairPrice(args: {
  sidePrices: number[];
  oppositePrices: number[];
  matchedPairCount: number;
  staleCount?: number;
}) {
  const pairs = args.sidePrices
    .map((price, index) => {
      const opposite = args.oppositePrices[index];
      if (typeof price !== "number" || typeof opposite !== "number") {
        return null;
      }

      const sideImplied = americanToImpliedProbability(price);
      const oppositeImplied = americanToImpliedProbability(opposite);
      if (typeof sideImplied !== "number" || typeof oppositeImplied !== "number") {
        return null;
      }

      const total = sideImplied + oppositeImplied;
      if (!Number.isFinite(total) || total <= 0) {
        return null;
      }

      return sideImplied / total;
    })
    .filter((value): value is number => typeof value === "number");

  if (!pairs.length) {
    return buildUnavailableFairPrice(
      "consensus_no_vig",
      "Two-way market pairs are missing, so consensus no-vig fair pricing is unavailable."
    );
  }

  const fairProb = pairs.reduce((sum, value) => sum + value, 0) / pairs.length;
  const stalePenalty = Math.min(25, (args.staleCount ?? 0) * 6);
  const confidence = Math.max(0, Math.min(100, 42 + pairs.length * 14 - stalePenalty));

  return {
    fairProb: Number(fairProb.toFixed(6)),
    fairOddsAmerican: fairOddsAmericanFromProbability(fairProb),
    fairOddsDecimal: fairOddsDecimalFromProbability(fairProb),
    pricingMethod: "consensus_no_vig",
    pricingConfidenceScore: confidence,
    sourceCount: args.matchedPairCount,
    coverageNote:
      args.matchedPairCount >= 2
        ? `Consensus no-vig fair price built from ${args.matchedPairCount} matched two-way book pairs.`
        : "Consensus no-vig fair price is based on a single matched two-way book pair.",
    completenessScore: Math.max(0, Math.min(100, 35 + args.matchedPairCount * 18 - stalePenalty))
  } satisfies FairPriceView;
}

export function buildFairPrice(args: {
  method: FairPriceMethod;
  sidePrices?: number[];
  oppositePrices?: number[];
  matchedPairCount?: number;
  staleCount?: number;
}) {
  if (args.method === "consensus_no_vig") {
    return buildConsensusNoVigFairPrice({
      sidePrices: args.sidePrices ?? [],
      oppositePrices: args.oppositePrices ?? [],
      matchedPairCount: args.matchedPairCount ?? 0,
      staleCount: args.staleCount ?? 0
    });
  }

  return buildUnavailableFairPrice(args.method, `${args.method} is not wired in this MVP pass yet.`);
}
