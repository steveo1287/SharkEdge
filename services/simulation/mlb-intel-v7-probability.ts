export type MlbIntelV7Tier = "attack" | "watch" | "pass";

export type MlbIntelV7ProbabilityInput = {
  rawHomeWinPct: number;
  marketHomeNoVigProbability?: number | null;
  existingConfidence?: number | null;
  existingTier?: string | null;
  shrinkFactor?: number;
  marketWeight?: number;
  minEdgePct?: number;
};

export type MlbIntelV7ProbabilityResult = {
  modelVersion: "mlb-intel-v7";
  rawHomeWinPct: number;
  shrinkHomeWinPct: number;
  finalHomeWinPct: number;
  finalAwayWinPct: number;
  marketHomeNoVigProbability: number | null;
  edgeHomePct: number | null;
  pickSide: "HOME" | "AWAY" | null;
  tier: MlbIntelV7Tier;
  noBet: boolean;
  confidence: number;
  shrinkFactor: number;
  marketWeight: number;
  minEdgePct: number;
  reasons: string[];
};

const DEFAULT_SHRINK_FACTOR = 0.65;
const DEFAULT_MARKET_WEIGHT = 0.6;
const DEFAULT_MIN_EDGE_PCT = 0.025;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeProbability(value: number | null | undefined, fallback = 0.5) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, 0.02, 0.98);
}

function logit(probability: number) {
  const p = safeProbability(probability);
  return Math.log(p / (1 - p));
}

function invLogit(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function americanOddsToImpliedProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

export function twoWayNoVigProbability(args: { sideOddsAmerican?: number | null; otherSideOddsAmerican?: number | null }) {
  const side = americanOddsToImpliedProbability(args.sideOddsAmerican);
  const other = americanOddsToImpliedProbability(args.otherSideOddsAmerican);
  if (side == null || other == null) return null;
  const hold = side + other;
  if (!Number.isFinite(hold) || hold <= 0) return null;
  return side / hold;
}

export function calculateProbabilityClvPct(args: {
  side: "HOME" | "AWAY";
  openHomeNoVigProbability?: number | null;
  closeHomeNoVigProbability?: number | null;
}) {
  const openHome = safeProbability(args.openHomeNoVigProbability, NaN);
  const closeHome = safeProbability(args.closeHomeNoVigProbability, NaN);
  if (!Number.isFinite(openHome) || !Number.isFinite(closeHome)) return null;
  const openSide = args.side === "HOME" ? openHome : 1 - openHome;
  const closeSide = args.side === "HOME" ? closeHome : 1 - closeHome;
  return round((closeSide - openSide) * 100, 3);
}

function marketAnchor(raw: number, shrink: number, market: number | null, marketWeight: number) {
  if (market == null || !Number.isFinite(market)) return shrink;
  const blendedLogit = logit(market) * marketWeight + logit(shrink) * (1 - marketWeight);
  return clamp(invLogit(blendedLogit), 0.08, 0.92);
}

function tierFor(edgeHomePct: number | null, confidence: number, minEdgePct: number): MlbIntelV7Tier {
  if (edgeHomePct == null || Math.abs(edgeHomePct) < minEdgePct || confidence < 0.5) return "pass";
  if (Math.abs(edgeHomePct) >= 0.055 && confidence >= 0.62) return "attack";
  return "watch";
}

export function buildMlbIntelV7Probability(input: MlbIntelV7ProbabilityInput): MlbIntelV7ProbabilityResult {
  const rawHomeWinPct = safeProbability(input.rawHomeWinPct);
  const shrinkFactor = clamp(input.shrinkFactor ?? DEFAULT_SHRINK_FACTOR, 0.45, 0.8);
  const marketWeight = clamp(input.marketWeight ?? DEFAULT_MARKET_WEIGHT, 0.35, 0.8);
  const minEdgePct = clamp(input.minEdgePct ?? DEFAULT_MIN_EDGE_PCT, 0.01, 0.08);
  const marketHomeNoVigProbability = typeof input.marketHomeNoVigProbability === "number" && Number.isFinite(input.marketHomeNoVigProbability)
    ? safeProbability(input.marketHomeNoVigProbability)
    : null;

  const shrinkHomeWinPct = clamp(0.5 + shrinkFactor * (rawHomeWinPct - 0.5), 0.12, 0.88);
  const finalHomeWinPct = round(marketAnchor(rawHomeWinPct, shrinkHomeWinPct, marketHomeNoVigProbability, marketWeight));
  const finalAwayWinPct = round(1 - finalHomeWinPct);
  const edgeHomePct = marketHomeNoVigProbability == null ? null : round(finalHomeWinPct - marketHomeNoVigProbability, 4);
  const existingConfidence = safeProbability(input.existingConfidence ?? 0.56, 0.56);
  const overconfidencePenalty = Math.min(0.1, Math.abs(rawHomeWinPct - shrinkHomeWinPct) * 0.7);
  const marketMissingPenalty = marketHomeNoVigProbability == null ? 0.08 : 0;
  const confidence = round(clamp(existingConfidence - overconfidencePenalty - marketMissingPenalty, 0.42, 0.72), 3);
  const tier = tierFor(edgeHomePct, confidence, minEdgePct);
  const pickSide = edgeHomePct == null || tier === "pass" ? null : edgeHomePct >= 0 ? "HOME" : "AWAY";
  const noBet = tier === "pass";

  const reasons = [
    `MLB v7 raw home ${(rawHomeWinPct * 100).toFixed(1)}% shrunk to ${(shrinkHomeWinPct * 100).toFixed(1)}% before market anchoring.`,
    marketHomeNoVigProbability == null
      ? "MLB v7 market anchor missing; output capped to calibration shrink only and forced no-pick unless later market data is present."
      : `MLB v7 market anchor ${(marketHomeNoVigProbability * 100).toFixed(1)}%, final home ${(finalHomeWinPct * 100).toFixed(1)}%, edge ${((edgeHomePct ?? 0) * 100).toFixed(1)}%.`,
    `MLB v7 pick gate requires at least ${(minEdgePct * 100).toFixed(1)}% calibrated edge.`,
    noBet ? "MLB v7 official-pick gate: no pick." : `MLB v7 official-pick gate: ${pickSide} qualifies as ${tier}.`
  ];

  return {
    modelVersion: "mlb-intel-v7",
    rawHomeWinPct: round(rawHomeWinPct),
    shrinkHomeWinPct: round(shrinkHomeWinPct),
    finalHomeWinPct,
    finalAwayWinPct,
    marketHomeNoVigProbability: marketHomeNoVigProbability == null ? null : round(marketHomeNoVigProbability),
    edgeHomePct,
    pickSide,
    tier,
    noBet,
    confidence,
    shrinkFactor,
    marketWeight,
    minEdgePct,
    reasons
  };
}
