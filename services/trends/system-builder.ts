import { buildTrendFactoryPreview } from "./trend-factory";
import type { TrendCandidateSystem, TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket, TrendFactorySide } from "./trend-candidate-types";

export type SystemBuilderInput = {
  league: TrendFactoryLeague | "ALL";
  market: TrendFactoryMarket | "ALL";
  side: TrendFactorySide | "ALL";
  venue: string | "ALL";
  price: string | "ALL";
  form: string | "ALL";
  rest: string | "ALL";
  marketContext: string | "ALL";
  sportSpecific?: string | "ALL";
  depth: TrendFactoryDepth;
  limit: number;
};

export type SystemBuilderResult = {
  input: SystemBuilderInput;
  candidates: TrendCandidateSystem[];
  totalFactoryCandidates: number;
  returnedCandidates: number;
  readiness: {
    promoteCandidates: number;
    watchCandidates: number;
    researchCandidates: number;
    blockedCandidates: number;
    needsBacktest: number;
    needsSourceData: number;
  };
  notes: string[];
};

function matchesValue(candidate: TrendCandidateSystem, family: string, selected: string) {
  if (selected === "ALL") return true;
  return candidate.conditions.some((condition) => condition.family === family && (condition.key === selected || condition.value === selected));
}

function rankCandidate(candidate: TrendCandidateSystem) {
  let score = 0;
  if (candidate.qualityGate === "promote_candidate") score += 100;
  if (candidate.qualityGate === "watch_candidate") score += 70;
  if (candidate.qualityGate === "research_candidate") score += 35;
  score += candidate.gateReasons.length * 8;
  score += candidate.previewTags.includes("model") ? 14 : 0;
  score += candidate.previewTags.includes("clv") ? 12 : 0;
  score += candidate.previewTags.includes("movement") ? 10 : 0;
  score += candidate.previewTags.includes("sport-specific") ? 10 : 0;
  score -= candidate.blockers.length * 18;
  score -= candidate.conditions.length > 4 ? 10 : 0;
  return score;
}

export function buildSystemBuilderResult(input: SystemBuilderInput): SystemBuilderResult {
  const factory = buildTrendFactoryPreview({
    league: input.league,
    market: input.market,
    depth: input.depth,
    limit: Math.max(input.limit * 4, input.limit)
  });

  const candidates = factory.candidates
    .filter((candidate) => input.side === "ALL" || candidate.side === input.side)
    .filter((candidate) => matchesValue(candidate, "venue", input.venue))
    .filter((candidate) => matchesValue(candidate, "price", input.price))
    .filter((candidate) => matchesValue(candidate, "form", input.form))
    .filter((candidate) => matchesValue(candidate, "rest", input.rest))
    .filter((candidate) => matchesValue(candidate, "market_context", input.marketContext))
    .filter((candidate) => matchesValue(candidate, "sport_specific", input.sportSpecific ?? "ALL"))
    .sort((left, right) => rankCandidate(right) - rankCandidate(left) || left.conditions.length - right.conditions.length)
    .slice(0, input.limit);

  const promoteCandidates = candidates.filter((candidate) => candidate.qualityGate === "promote_candidate").length;
  const watchCandidates = candidates.filter((candidate) => candidate.qualityGate === "watch_candidate").length;
  const researchCandidates = candidates.filter((candidate) => candidate.qualityGate === "research_candidate").length;
  const blockedCandidates = candidates.filter((candidate) => candidate.qualityGate === "blocked_candidate").length;

  return {
    input,
    candidates,
    totalFactoryCandidates: factory.totalCandidates,
    returnedCandidates: candidates.length,
    readiness: {
      promoteCandidates,
      watchCandidates,
      researchCandidates,
      blockedCandidates,
      needsBacktest: candidates.length,
      needsSourceData: candidates.length
    },
    notes: [
      "System Builder creates generated-system candidates from selected filters; it does not persist anything by itself.",
      "Sport-specific candidate families are source-dependent and must be validated with historical rows before verification.",
      "Every candidate still needs historical backtest rows before it can become a verified generated system.",
      "Strong candidates should be sent through the backtest and generated-system persistence flow before they appear on the main board."
    ]
  };
}
