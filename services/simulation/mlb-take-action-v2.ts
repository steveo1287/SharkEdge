import {
  buildMlbEdges as buildLegacyMlbEdges,
  buildMlbEdgesFromProjections as buildLegacyMlbEdgesFromProjections,
  fetchMlbSportsbookLines,
  noVigMoneylineProbabilities,
  rankMlbMarketSignal,
  type MlbEdgeGame,
  type MlbEdgeProjection,
  type SportsbookLine
} from "@/services/simulation/mlb-edge-detector";

export { fetchMlbSportsbookLines, noVigMoneylineProbabilities, rankMlbMarketSignal };
export type { MlbEdgeGame, MlbEdgeProjection, SportsbookLine };

export type TakeActionTier = "ATTACK" | "PLAY" | "LEAN" | "WATCH" | "PASS";

type LegacyEdgeResult = Awaited<ReturnType<typeof buildLegacyMlbEdges>>;
type LegacyEdge = LegacyEdgeResult["edges"][number];
type LegacySignal = NonNullable<LegacyEdge["signal"]>;

type TakeActionVerdict = {
  version: "take-action-v2";
  action: TakeActionTier;
  actionScore: number;
  betEligible: boolean;
  roiEligible: boolean;
  market: string | null;
  side: string | null;
  modelProbability: number | null;
  marketProbability: number | null;
  edge: number | null;
  expectedValue: number | null;
  americanOdds: number | null;
  sportsbook: string | null;
  stakeUnits: number;
  kellyFraction: number;
  reasons: string[];
  warnings: string[];
  downgradeReasons: string[];
  hardStopReasons: string[];
};

const HARD_STALE_WARNING = /stale|missing odds|cannot identify|team mismatch|game already started|bad feed/i;
const THIN_MARKET_WARNING = /thin|source|books|high-hold|rejected/i;

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function americanToDecimal(americanOdds: number | null | undefined) {
  if (typeof americanOdds !== "number" || !Number.isFinite(americanOdds) || americanOdds === 0) return null;
  return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
}

function noVigProbability(edge: LegacyEdge, market: string | null | undefined) {
  if (market === "home_ml") return edge.market?.homeNoVigProbability ?? null;
  if (market === "away_ml") return edge.market?.awayNoVigProbability ?? null;
  return null;
}

function selectedOdds(edge: LegacyEdge, market: string | null | undefined) {
  if (market === "home_ml") return edge.market?.homeMoneyline ?? null;
  if (market === "away_ml") return edge.market?.awayMoneyline ?? null;
  if (market === "over") return edge.market?.overPrice ?? null;
  if (market === "under") return edge.market?.underPrice ?? null;
  return null;
}

function modelProbability(edge: LegacyEdge, market: string | null | undefined) {
  if (market === "home_ml") return edge.projection.distribution.homeWinPct;
  if (market === "away_ml") return edge.projection.distribution.awayWinPct;
  return null;
}

function expectedValue(probability: number | null, americanOdds: number | null) {
  const decimal = americanToDecimal(americanOdds);
  if (probability == null || decimal == null) return null;
  return probability * (decimal - 1) - (1 - probability);
}

function quarterKelly(probability: number | null, americanOdds: number | null) {
  const decimal = americanToDecimal(americanOdds);
  if (probability == null || decimal == null) return 0;
  const b = decimal - 1;
  const q = 1 - probability;
  const full = (b * probability - q) / b;
  return clamp(full * 0.25, 0, 1);
}

function dataQuality(edge: LegacyEdge, signal: LegacySignal) {
  const governor = edge.projection.mlbIntel?.governor;
  const confidence = typeof governor?.confidence === "number" ? governor.confidence : 0.5;
  const volatility = edge.projection.mlbIntel?.volatilityIndex ?? 1.5;
  const sourceCount = signal.sourceCount ?? 0;
  const hold = signal.marketHold ?? 0.08;
  const calibrated = edge.projection.mlbIntel?.calibration?.ece != null;

  let score = 45;
  score += clamp((confidence - 0.45) * 95, -15, 28);
  score += clamp((sourceCount - 1) * 8, -8, 20);
  score -= clamp((volatility - 1.35) * 18, 0, 18);
  score -= clamp((hold - 0.06) * 140, 0, 18);
  if (calibrated) score += 8;
  if (governor?.noBet) score -= 12;
  return clamp(Math.round(score), 0, 100);
}

function normalizeStrength(action: TakeActionTier) {
  if (action === "ATTACK") return "strong";
  if (action === "PLAY" || action === "LEAN" || action === "WATCH") return "watch";
  return "thin";
}

function actionFor(score: number, ev: number | null, edge: number | null, quality: number, hardStops: string[]) {
  if (hardStops.length || ev == null || edge == null || ev <= 0) return "PASS" as const;
  if (score >= 82 && ev >= 0.035 && Math.abs(edge) >= 0.025 && quality >= 70) return "ATTACK" as const;
  if (score >= 66 && ev >= 0.02 && Math.abs(edge) >= 0.015 && quality >= 58) return "PLAY" as const;
  if (score >= 48 && ev >= 0.0075 && Math.abs(edge) >= 0.0075 && quality >= 42) return "LEAN" as const;
  return "WATCH" as const;
}

function buildTakeAction(edge: LegacyEdge): TakeActionVerdict | null {
  const signal = edge.signal;
  if (!signal) return null;

  const market = signal.market ?? null;
  const isMoneyline = market === "home_ml" || market === "away_ml";
  const probability = modelProbability(edge, market);
  const marketProb = noVigProbability(edge, market);
  const americanOdds = selectedOdds(edge, market);
  const ev = expectedValue(probability, americanOdds);
  const edgeValue = isMoneyline && probability != null && marketProb != null ? probability - marketProb : signal.edge ?? null;
  const quality = dataQuality(edge, signal);
  const governor = edge.projection.mlbIntel?.governor;
  const warnings = [...(signal.warnings ?? []), ...(edge.marketQuality?.warnings ?? [])].filter(Boolean);
  const hardStopReasons: string[] = [];
  const downgradeReasons: string[] = [];
  const reasons: string[] = [];

  if (!isMoneyline) hardStopReasons.push(`non-moneyline market: ${market ?? "unknown"}`);
  if (americanOdds == null) hardStopReasons.push("missing actual odds");
  if (probability == null) hardStopReasons.push("missing model probability");
  if (marketProb == null) hardStopReasons.push("missing no-vig market probability");
  for (const warning of warnings) {
    if (HARD_STALE_WARNING.test(warning)) hardStopReasons.push(warning);
    else if (THIN_MARKET_WARNING.test(warning)) downgradeReasons.push(warning);
  }
  if (governor?.noBet) downgradeReasons.push("governor no-bet flag downgraded, not deleted");
  if ((signal.sourceCount ?? 0) < 2) downgradeReasons.push("thin book consensus");
  if ((signal.marketHold ?? 0) > 0.1) downgradeReasons.push("elevated market hold");

  const evScore = ev == null ? 0 : clamp(ev * 900, -35, 42);
  const edgeScore = edgeValue == null ? 0 : clamp(Math.abs(edgeValue) * 700, 0, 28);
  const qualityScore = clamp((quality - 45) * 0.55, -12, 22);
  const pricePenalty = americanOdds != null && americanOdds < -220 ? 10 : 0;
  const downgradePenalty = Math.min(20, downgradeReasons.length * 6);
  const actionScore = Math.round(clamp(45 + evScore + edgeScore + qualityScore - pricePenalty - downgradePenalty, 0, 100));
  const action = actionFor(actionScore, ev, edgeValue, quality, hardStopReasons);
  const kelly = quarterKelly(probability, americanOdds);
  const stakeUnits = action === "ATTACK" ? clamp(kelly, 0.75, 1) : action === "PLAY" ? clamp(kelly, 0.35, 0.75) : 0;

  if (ev != null) reasons.push(`EV ${round(ev * 100, 2)}%`);
  if (edgeValue != null) reasons.push(`Edge ${round(edgeValue * 100, 2)}%`);
  reasons.push(`Data quality ${quality}/100`);

  return {
    version: "take-action-v2",
    action,
    actionScore,
    betEligible: action === "ATTACK" || action === "PLAY",
    roiEligible: action === "ATTACK" || action === "PLAY",
    market,
    side: market,
    modelProbability: round(probability),
    marketProbability: round(marketProb),
    edge: round(edgeValue),
    expectedValue: round(ev),
    americanOdds,
    sportsbook: edge.sportsbook ?? edge.market?.sportsbook ?? null,
    stakeUnits: round(stakeUnits, 2) ?? 0,
    kellyFraction: round(kelly, 4) ?? 0,
    reasons,
    warnings,
    downgradeReasons,
    hardStopReasons
  };
}

function withTakeAction(edge: LegacyEdge): LegacyEdge {
  const verdict = buildTakeAction(edge);
  if (!verdict || !edge.signal) return edge;
  return {
    ...edge,
    signal: {
      ...edge.signal,
      strength: normalizeStrength(verdict.action),
      takeAction: verdict,
      action: verdict.action,
      actionScore: verdict.actionScore,
      betEligible: verdict.betEligible,
      roiEligible: verdict.roiEligible,
      expectedValue: verdict.expectedValue,
      stakeUnits: verdict.stakeUnits,
      kellyFraction: verdict.kellyFraction,
      reasons: verdict.reasons,
      downgradeReasons: verdict.downgradeReasons,
      hardStopReasons: verdict.hardStopReasons
    } as LegacySignal & { takeAction: TakeActionVerdict }
  };
}

function applyTakeAction<T extends { edges: LegacyEdge[] }>(result: T): T {
  return { ...result, edges: result.edges.map(withTakeAction) };
}

export async function buildMlbEdges(...args: Parameters<typeof buildLegacyMlbEdges>) {
  const result = await buildLegacyMlbEdges(...args);
  return applyTakeAction(result);
}

export async function buildMlbEdgesFromProjections(...args: Parameters<typeof buildLegacyMlbEdgesFromProjections>) {
  const result = await buildLegacyMlbEdgesFromProjections(...args);
  return applyTakeAction(result);
}
