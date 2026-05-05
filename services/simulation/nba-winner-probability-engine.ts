import type { NbaNoVigMarket } from "./nba-market-sanity";
import type { NbaLineupTruth } from "./nba-lineup-truth";
import { buildNbaEliteWinnerFormula } from "@/services/simulation/nba-elite-winner-formula";
import type { NbaTeamStrengthRosterImpact } from "@/services/simulation/nba-team-strength-roster-impact";

export type NbaWinnerProbabilityConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export type NbaWinnerProbabilityInput = {
  rawHomeWinPct: number | null | undefined;
  rawAwayWinPct: number | null | undefined;
  projectedHomeMargin: number | null | undefined;
  projectedTotal: number | null | undefined;
  market: NbaNoVigMarket | null | undefined;
  lineupTruth: NbaLineupTruth | null | undefined;
  teamStrengthRosterImpact?: NbaTeamStrengthRosterImpact | null;
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
  rosterImpactDelta: number;
  enhancedModelDelta: number | null;
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

function finiteNumber(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  const rosterGreen = input.teamStrengthRosterImpact?.confidence != null && input.teamStrengthRosterImpact.confidence >= 0.62 && input.teamStrengthRosterImpact.blockers.length === 0;
  if (lineupGreen && sourceGreen && hasLineupReason && rosterGreen) return 0.045;
  if (lineupGreen && sourceGreen && hasLineupReason) return 0.04;
  if (lineupGreen && sourceGreen && rosterGreen) return 0.035;
  if (lineupGreen && sourceGreen) return 0.03;
  return 0.018;
}

function confidenceFor(input: NbaWinnerProbabilityInput, blockers: string[], boundedDelta: number): NbaWinnerProbabilityConfidence {
  if (blockers.length) return "INSUFFICIENT";
  const source = input.sourceHealth;
  const lineupGreen = input.lineupTruth?.status === "GREEN" && input.lineupTruth.injuryReportFresh === true;
  const sourceGreen = source?.requiredModulesReady === true && source.realModules >= 4;
  const calibrationGreen = input.calibrationHealthy === true;
  const rosterConfidence = input.teamStrengthRosterImpact?.confidence ?? 0;
  if (lineupGreen && sourceGreen && calibrationGreen && rosterConfidence >= 0.62 && Math.abs(boundedDelta) >= 0.018) return "HIGH";
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
  if (input.rawHomeWinPct == null || input.rawAwayWinPct == null) warnings.push("NBA source projection probabilities missing; using neutral 50/50 fallback.");
  if (input.projectedHomeMargin == null) warnings.push("NBA source projected margin missing; using neutral margin fallback.");

  const rosterImpact = input.teamStrengthRosterImpact ?? null;
  if (rosterImpact?.blockers.length) blockers.push(...rosterImpact.blockers.map((blocker) => `roster-impact blocker: ${blocker}`));
  if (rosterImpact && rosterImpact.confidence < 0.45) blockers.push("NBA roster-impact confidence too low");
  if (rosterImpact?.warnings.length) warnings.push(...rosterImpact.warnings.map((warning) => `roster-impact warning: ${warning}`));

  const projectedHomeMargin = finiteNumber(input.projectedHomeMargin, 0);
  const rawHome = clamp(finiteNumber(input.rawHomeWinPct, 0.5), 0.01, 0.99);
  const rawAway = clamp(finiteNumber(input.rawAwayWinPct, 1 - rawHome), 0.01, 0.99);
  const rosterImpactDelta = clamp(rosterImpact?.boundedProbabilityDelta ?? 0, -0.035, 0.035);
  const rawModelDelta = market ? rawHome - market.home : null;

  const eliteFormula = buildNbaEliteWinnerFormula({
    rawHomeWinPct: rawHome,
    projectedHomeMargin,
    market: input.market,
    lineupTruth: input.lineupTruth,
    rosterImpact,
    sourceHealth: input.sourceHealth
  });

  const deltaCap = Math.min(deltaCapFor(input), eliteFormula.cap);
  const enhancedModelDelta = market ? eliteFormula.probabilityDelta : rawModelDelta == null ? null : rawModelDelta + rosterImpactDelta;
  const boundedModelDelta = market
    ? clamp(eliteFormula.boundedProbabilityDelta, -deltaCap, deltaCap)
    : enhancedModelDelta == null
      ? 0
      : clamp(enhancedModelDelta, -deltaCap, deltaCap);
  const finalHome = market
    ? clamp(market.home + boundedModelDelta, 0.01, 0.99)
    : rawHome;
  const finalHomeRounded = round(finalHome);
  const finalAwayRounded = round(1 - finalHomeRounded);
  const finalProjectedHomeMargin = clamp(eliteFormula.finalHomeMargin, -18, 18);
  const confidence = confidenceFor(input, blockers, boundedModelDelta);

  if (rawModelDelta != null && Math.abs(rawModelDelta) > 0.075) {
    warnings.push(`raw NBA model disagreed with no-vig market by ${(rawModelDelta * 100).toFixed(1)} percentage points; elite formula bounded delta to ${(boundedModelDelta * 100).toFixed(1)}.`);
  }
  if (rosterImpact && Math.abs(rosterImpactDelta) >= 0.02) {
    warnings.push(`NBA roster/team impact moved model delta by ${(rosterImpactDelta * 100).toFixed(1)} percentage points before elite shrinkage.`);
  }
  if (Math.abs(projectedHomeMargin - finalProjectedHomeMargin) > 5.5) {
    warnings.push("winner anchor materially changed projected margin; use market-anchored probability for picks.");
  }
  warnings.push(...eliteFormula.warnings);

  return {
    marketHomeNoVig: market ? round(market.home) : null,
    marketAwayNoVig: market ? round(market.away) : null,
    rawHomeWinPct: round(rawHome),
    rawAwayWinPct: round(rawAway),
    rawModelDelta: rawModelDelta == null ? null : round(rawModelDelta),
    rosterImpactDelta: round(rosterImpactDelta),
    enhancedModelDelta: enhancedModelDelta == null ? null : round(enhancedModelDelta),
    boundedModelDelta: round(boundedModelDelta),
    deltaCap: round(deltaCap),
    finalHomeWinPct: finalHomeRounded,
    finalAwayWinPct: finalAwayRounded,
    finalProjectedHomeMargin: round(finalProjectedHomeMargin, 2),
    confidence,
    noBet: blockers.length > 0 || confidence === "INSUFFICIENT",
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    drivers: [
      market ? `market no-vig home ${(market.home * 100).toFixed(1)}%` : "market no-vig missing",
      `raw sim home ${(rawHome * 100).toFixed(1)}%`,
      rawModelDelta == null ? "model delta unavailable" : `raw model delta ${(rawModelDelta * 100).toFixed(1)}%`,
      `roster/team delta ${(rosterImpactDelta * 100).toFixed(1)}%`,
      enhancedModelDelta == null ? "enhanced model delta unavailable" : `elite probability delta ${(enhancedModelDelta * 100).toFixed(1)}%`,
      `bounded model delta ${(boundedModelDelta * 100).toFixed(1)}% cap ${(deltaCap * 100).toFixed(1)}%`,
      `final home ${(finalHomeRounded * 100).toFixed(1)}%`,
      `final projected home margin ${finalProjectedHomeMargin.toFixed(1)}`,
      ...eliteFormula.drivers.map((driver) => `elite formula: ${driver}`),
      ...(rosterImpact?.drivers.map((driver) => `roster/team: ${driver}`) ?? [])
    ]
  };
}
