import type { NbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import type { NbaNoVigMarket } from "@/services/simulation/nba-market-sanity";
import type { NbaTeamStrengthRosterImpact } from "@/services/simulation/nba-team-strength-roster-impact";

export type NbaEliteWinnerFormulaInput = {
  rawHomeWinPct: number;
  projectedHomeMargin: number;
  market: NbaNoVigMarket | null | undefined;
  lineupTruth: NbaLineupTruth | null | undefined;
  rosterImpact?: NbaTeamStrengthRosterImpact | null;
  sourceHealth?: {
    team: boolean;
    player: boolean;
    history: boolean;
    rating: boolean;
    realModules: number;
    requiredModulesReady: boolean;
  } | null;
};

export type NbaEliteWinnerFormulaResult = {
  marketHomeNoVig: number | null;
  marketMargin: number | null;
  rawModelMargin: number;
  rosterMargin: number | null;
  blendedModelMargin: number;
  fourFactorStyleDelta: number;
  rosterRatingDelta: number;
  rankingDelta: number;
  lineupPenaltyDelta: number;
  sourceConfidence: number;
  shrinkageToMarket: number;
  modelMarginDelta: number;
  probabilityDelta: number;
  boundedProbabilityDelta: number;
  finalHomeProbability: number | null;
  finalHomeMargin: number;
  cap: number;
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

export function probabilityToNbaMargin(probability: number) {
  return clamp(logit(probability) * 7.5, -18, 18);
}

export function nbaMarginToProbability(margin: number) {
  return clamp(1 / (1 + Math.exp(-margin / 7.5)), 0.01, 0.99);
}

function marketHome(market: NbaNoVigMarket | null | undefined) {
  const home = market?.homeNoVigProbability;
  const away = market?.awayNoVigProbability;
  if (typeof home !== "number" || typeof away !== "number") return null;
  const total = home + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return clamp(home / total, 0.01, 0.99);
}

function sourceConfidence(input: NbaEliteWinnerFormulaInput) {
  const source = input.sourceHealth;
  const realModuleScore = source ? clamp(source.realModules / 4, 0, 1) : 0;
  const sourceScore = source?.requiredModulesReady ? 0.55 + realModuleScore * 0.25 : 0.25 + realModuleScore * 0.2;
  const lineupScore = input.lineupTruth?.status === "GREEN" && input.lineupTruth.injuryReportFresh ? 0.14 : input.lineupTruth?.status === "YELLOW" ? 0.06 : 0;
  const rosterScore = input.rosterImpact ? clamp(input.rosterImpact.confidence, 0, 1) * 0.16 : 0;
  return clamp(sourceScore + lineupScore + rosterScore, 0.12, 0.96);
}

function shrinkageToMarket(confidence: number, modelDisagreement: number) {
  const disagreementPenalty = clamp(Math.abs(modelDisagreement) / 9, 0, 0.42);
  return clamp(0.18 + confidence * 0.52 - disagreementPenalty, 0.08, 0.72);
}

function fourFactorStyleDelta(roster: NbaTeamStrengthRosterImpact | null | undefined) {
  if (!roster) return 0;
  const style = roster.matchupStyle;
  // Dean Oliver's four-factor weights: shooting 40%, turnovers 25%, rebounding 20%, free throws 15%.
  // We do not have a clean FT edge in this layer yet, so rest/style/creation gets the small remainder.
  const shooting = style.shootingEdge * 0.4;
  const turnoverCreation = style.creationEdge * 0.25;
  const rebounding = style.reboundingEdge * 0.2;
  const spacingRestDepth = (style.spacingEdge * 0.05) + (style.restTravelEdge * 0.04) + (style.benchEdge * 0.06);
  return clamp((shooting + turnoverCreation + rebounding + spacingRestDepth) * 0.18, -2.25, 2.25);
}

function rosterRatingDelta(roster: NbaTeamStrengthRosterImpact | null | undefined) {
  if (!roster) return 0;
  const star = ((roster.homeTeam.starPowerGrade ?? 0) - (roster.awayTeam.starPowerGrade ?? 0)) * 0.22;
  const role = ((roster.homeTeam.roleDepthGrade ?? 0) - (roster.awayTeam.roleDepthGrade ?? 0)) * 0.13;
  const close = ((roster.homeTeam.closingLineupGrade ?? 0) - (roster.awayTeam.closingLineupGrade ?? 0)) * 0.18;
  const rosterImpact = (roster.rosterImpactAdjustment ?? 0) * 0.42;
  const usage = (roster.usageRedistributionAdjustment ?? 0) * 0.32;
  return clamp(star + role + close + rosterImpact + usage, -3.2, 3.2);
}

function rankingDelta(roster: NbaTeamStrengthRosterImpact | null | undefined) {
  const ranked = roster as NbaTeamStrengthRosterImpact & { rankingSnapshot?: { homeCompositeEdge: number; boundedProbabilityDelta: number; confidence: number } };
  if (!ranked?.rankingSnapshot) return 0;
  return clamp(ranked.rankingSnapshot.homeCompositeEdge * ranked.rankingSnapshot.confidence * 1.15, -1.4, 1.4);
}

function lineupPenaltyDelta(lineupTruth: NbaLineupTruth | null | undefined) {
  if (!lineupTruth) return -1.2;
  if (lineupTruth.status === "RED") return -1.8;
  if (lineupTruth.status === "YELLOW") return -0.7;
  if (lineupTruth.starQuestionable || lineupTruth.lateScratchRisk) return -0.9;
  return 0;
}

function capFor(input: NbaEliteWinnerFormulaInput, confidence: number) {
  const lineupGreen = input.lineupTruth?.status === "GREEN" && input.lineupTruth.injuryReportFresh === true;
  const sourceGreen = input.sourceHealth?.requiredModulesReady === true && input.sourceHealth.realModules >= 4;
  const rosterGreen = input.rosterImpact?.blockers.length === 0 && (input.rosterImpact?.confidence ?? 0) >= 0.62;
  if (lineupGreen && sourceGreen && rosterGreen && confidence >= 0.78) return 0.045;
  if (lineupGreen && sourceGreen && rosterGreen) return 0.038;
  if (lineupGreen && sourceGreen) return 0.032;
  return 0.018;
}

export function buildNbaEliteWinnerFormula(input: NbaEliteWinnerFormulaInput): NbaEliteWinnerFormulaResult {
  const warnings: string[] = [];
  const marketProbability = marketHome(input.market);
  const marketMargin = marketProbability == null ? null : probabilityToNbaMargin(marketProbability);
  const rawModelMargin = probabilityToNbaMargin(input.rawHomeWinPct);
  const rosterMargin = input.rosterImpact?.finalProjectedHomeMargin ?? null;
  const fourFactor = fourFactorStyleDelta(input.rosterImpact);
  const rosterDelta = rosterRatingDelta(input.rosterImpact);
  const rankDelta = rankingDelta(input.rosterImpact);
  const lineupDelta = lineupPenaltyDelta(input.lineupTruth);
  const blendedModelMargin = clamp(
    input.projectedHomeMargin * 0.34 + rawModelMargin * 0.16 + (rosterMargin ?? input.projectedHomeMargin) * 0.24 + fourFactor + rosterDelta + rankDelta + lineupDelta,
    -18,
    18
  );
  const modelMarginDelta = marketMargin == null ? 0 : blendedModelMargin - marketMargin;
  const confidence = sourceConfidence(input);
  const shrinkage = shrinkageToMarket(confidence, modelMarginDelta);
  const shrunkMarginDelta = modelMarginDelta * shrinkage;
  const probabilityDelta = marketMargin == null ? 0 : nbaMarginToProbability(marketMargin + shrunkMarginDelta) - marketProbability!;
  const cap = capFor(input, confidence);
  const boundedProbabilityDelta = clamp(probabilityDelta, -cap, cap);
  const finalHomeProbability = marketProbability == null ? null : clamp(marketProbability + boundedProbabilityDelta, 0.01, 0.99);
  const finalHomeMargin = marketMargin == null
    ? blendedModelMargin
    : probabilityToNbaMargin(finalHomeProbability!);

  if (marketMargin != null && Math.abs(modelMarginDelta) > 7) warnings.push("elite formula saw major model-market margin disagreement; shrinkage heavily applied");
  if (input.rosterImpact && input.rosterImpact.confidence < 0.52) warnings.push("roster/ranking confidence is weak; formula delta should stay small");
  if (input.lineupTruth?.status !== "GREEN") warnings.push("lineup truth is not green; formula cannot be trusted for strong action");

  return {
    marketHomeNoVig: marketProbability == null ? null : round(marketProbability),
    marketMargin: marketMargin == null ? null : round(marketMargin, 3),
    rawModelMargin: round(rawModelMargin, 3),
    rosterMargin: rosterMargin == null ? null : round(rosterMargin, 3),
    blendedModelMargin: round(blendedModelMargin, 3),
    fourFactorStyleDelta: round(fourFactor, 3),
    rosterRatingDelta: round(rosterDelta, 3),
    rankingDelta: round(rankDelta, 3),
    lineupPenaltyDelta: round(lineupDelta, 3),
    sourceConfidence: round(confidence, 3),
    shrinkageToMarket: round(shrinkage, 3),
    modelMarginDelta: round(modelMarginDelta, 3),
    probabilityDelta: round(probabilityDelta, 4),
    boundedProbabilityDelta: round(boundedProbabilityDelta, 4),
    finalHomeProbability: finalHomeProbability == null ? null : round(finalHomeProbability),
    finalHomeMargin: round(finalHomeMargin, 3),
    cap: round(cap, 4),
    warnings,
    drivers: [
      marketMargin == null ? "market margin unavailable" : `market margin ${marketMargin.toFixed(2)}`,
      `raw model margin ${rawModelMargin.toFixed(2)}`,
      rosterMargin == null ? "roster margin unavailable" : `roster margin ${rosterMargin.toFixed(2)}`,
      `four-factor style delta ${fourFactor.toFixed(2)}`,
      `roster rating delta ${rosterDelta.toFixed(2)}`,
      `ranking delta ${rankDelta.toFixed(2)}`,
      `lineup penalty ${lineupDelta.toFixed(2)}`,
      `source confidence ${(confidence * 100).toFixed(1)}%`,
      `shrinkage to market ${(shrinkage * 100).toFixed(1)}%`,
      `bounded probability delta ${(boundedProbabilityDelta * 100).toFixed(1)}%`
    ]
  };
}
