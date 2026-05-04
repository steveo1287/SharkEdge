import type { NbaNoVigMarket } from "./nba-market-sanity";
import type { NbaLineupTruth } from "./nba-lineup-truth";

export type NbaWinnerProbabilityConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type NbaWinnerProbabilityInput = {
  rawHomeWinPct: number;
  rawAwayWinPct: number;
  projectedHomeMargin: number;
  projectedTotal: number | null;
  market: NbaNoVigMarket | null | undefined;
  lineupTruth: NbaLineupTruth | null | undefined;
  sourceHealth?: {
    team: boolean;
    player: boolean;
    history: boolean;
    rating: boolean;
    realModules: number;
    requiredModulesReady: boolean;
  } | null;
  calibrationHealthy?: boolean;
};

export type NbaWinnerProbabilityResult = {
  marketHomeNoVig: number | null;
  marketAwayNoVig: number | null;
  rawHomeWinPct: number;
  rawAwayWinPct: number;
  rawModelDelta: number | null;
  boundedModelDelta: number;
  deltaCap: number;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  finalProjectedHomeMargin: number;
  confidence: NbaWinnerProbabilityConfidence;
  noBet: boolean;
  blockers: string[];
  warnings: string[];
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function logit(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  return Math.log(p / (1 - p));
}

function probabilityToMargin(probability: number) {
  // Conservative NBA moneyline-to-margin bridge. Roughly keeps 50/50 near 0 and
  // avoids converting small probability corrections into large spread moves.
  return clamp(logit(probability) * 7.5, -18, 18);
}

function marketBaseline(market: NbaNoVigMarket | null | undefined) {
  const home = market?.homeNoVigProbability;
  const away = market?.awayNoVigProbability;
  if (typeof home !== "number" || typeof away !== "number") return null;
  const total = home + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    home: clamp(home / total, 0.01, 0.99),
    away: clamp(away / total, 0.01, 0.99)
  };
}

function documentedLineupReason(lineupTruth: NbaLineupTruth | null | undefined) {
  return Boolean(lineupTruth && (lineupTruth.playerFlags.length || lineupTruth.blockers.length || lineupTruth.warnings.length || lineupTruth.highUsageOut || lineupTruth.starQuestionable));
}

function deltaCapFor(input: NbaWinnerProbabilityInput) {
  const lineupGreen = input.lineupTruth?.status === "GREEN" && input.lineupTruth.injuryReportFresh === true;
  const sourceGreen = input.sourceHealth?.requiredModulesReady === true && input.sourceHealth.realModules >= 4;
  const hasLineupReason = documentedLineupReason(input.lineupTruth);
  if (lineupGreen && sourceGreen && hasLineupReason) return 0.04;
  if (lineupGreen && sourceGreen) return 0.03;
  return 0.018;
}

function confidenceFor(input: NbaWinnerProbabilityInput, blockers: string[], boundedDelta: number): NbaWinnerProbabilityConfidence {
  if (blockers.length) return "INSUFFICIENT";
  const source = input.sourceHealth;
  const lineupGreen = input.lineupTruth?.status === "GREEN" && input.lineupTruth.injuryReportFresh === true;
  const sourceGreen = source?.requiredModulesReady === true && source.realModules >= 4;
  const calibrationGreen = input.calibrationHealthy === true;
  if (lineupGreen && sourceGreen && calibrationGreen && Math.abs(boundedDelta) >= 0.018) return "HIGH";
  if (lineupGreen && sourceGreen && calibrationGreen) return "MEDIUM";
  if (lineupGreen && sourceGreen) return "LOW";
  return "INSUFFICIENT";
}

export function buildNbaWinnerProbability(input: NbaWinnerProbabilityInput): NbaWinnerProbabilityResult {
  const market = marketBaseline(input.market);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!market) blockers.push("missing NBA no-vig moneyline baseline");
  if (!input.sourceHealth?.requiredModulesReady) blockers.push("NBA required real-data modules not ready");
  if (!input.lineupTruth) blockers.push("NBA lineup truth missing");
  if (input.lineupTruth && input.lineupTruth.status !== "GREEN") blockers.push(`NBA lineup truth ${input.lineupTruth.status}`);
  if (input.lineupTruth && input.lineupTruth.injuryReportFresh !== true) blockers.push("stale NBA injury report");
  if (input.lineupTruth?.starQuestionable) blockers.push("star/high-usage player questionable");
  if (input.lineupTruth?.lateScratchRisk) blockers.push("late scratch risk");
  if (input.calibrationHealthy === false) blockers.push("NBA winner calibration unhealthy");

  const rawHome = clamp(input.rawHomeWinPct, 0.01, 0.99);
  const rawAway = clamp(input.rawAwayWinPct, 0.01, 0.99);
  const deltaCap = deltaCapFor(input);
  const rawModelDelta = market ? rawHome - market.home : null;
  const boundedModelDelta = rawModelDelta == null ? 0 : clamp(rawModelDelta, -deltaCap, deltaCap);
  const finalHome = market ? clamp(market.home + boundedModelDelta, 0.01, 0.99) : rawHome;
  const finalAway = 1 - finalHome;
  const marketMargin = market ? probabilityToMargin(market.home) : input.projectedHomeMargin;
  const finalProjectedHomeMargin = clamp(marketMargin + boundedModelDelta * 80, -18, 18);
  const confidence = confidenceFor(input, blockers, boundedModelDelta);

  if (rawModelDelta != null && Math.abs(rawModelDelta) > 0.075) {
    warnings.push(`raw NBA model disagreed with no-vig market by ${(rawModelDelta * 100).toFixed(1)} percentage points; bounded to ${(boundedModelDelta * 100).toFixed(1)}.`);
  }
  if (Math.abs(input.projectedHomeMargin - finalProjectedHomeMargin) > 5.5) {
    warnings.push("winner anchor materially changed projected margin; use market-anchored probability for picks.");
  }

  return {
    marketHomeNoVig: market ? round(market.home) : null,
    marketAwayNoVig: market ? round(market.away) : null,
    rawHomeWinPct: round(rawHome),
    rawAwayWinPct: round(rawAway),
    rawModelDelta: rawModelDelta == null ? null : round(rawModelDelta),
    boundedModelDelta: round(boundedModelDelta),
    deltaCap: round(deltaCap),
    finalHomeWinPct: round(finalHome),
    finalAwayWinPct: round(finalAway),
    finalProjectedHomeMargin: round(finalProjectedHomeMargin, 2),
    confidence,
    noBet: blockers.length > 0 || confidence === "INSUFFICIENT",
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    drivers: [
      market ? `market no-vig home ${(market.home * 100).toFixed(1)}%` : "market no-vig missing",
      `raw sim home ${(rawHome * 100).toFixed(1)}%`,
      rawModelDelta == null ? "model delta unavailable" : `raw model delta ${(rawModelDelta * 100).toFixed(1)}%`,
      `bounded model delta ${(boundedModelDelta * 100).toFixed(1)}% cap ${(deltaCap * 100).toFixed(1)}%`,
      `final home ${(finalHome * 100).toFixed(1)}%`,
      `final projected home margin ${finalProjectedHomeMargin.toFixed(1)}`
    ]
  };
}
