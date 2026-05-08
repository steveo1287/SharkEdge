import {
  buildMlbEdges as legacyBuildMlbEdges,
  buildMlbEdgesFromProjections as legacyBuildMlbEdgesFromProjections,
  fetchMlbSportsbookLines,
  noVigMoneylineProbabilities,
  rankMlbMarketSignal,
  type MlbEdgeGame,
  type MlbEdgeProjection,
  type SportsbookLine
} from "./mlb-edge-detector";

export { fetchMlbSportsbookLines, noVigMoneylineProbabilities, rankMlbMarketSignal };
export type { MlbEdgeGame, MlbEdgeProjection, SportsbookLine };

type EdgeResult = Awaited<ReturnType<typeof legacyBuildMlbEdges>>;
type Edge = EdgeResult["edges"][number];
type Signal = NonNullable<Edge["signal"]>;

type Tier = "ATTACK" | "PLAY" | "LEAN" | "WATCH" | "PASS";

function round(value: number | null | undefined, digits = 4) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function decimalOdds(american: number | null | undefined) {
  if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null;
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function ev(probability: number | null | undefined, american: number | null | undefined) {
  const decimal = decimalOdds(american);
  if (probability == null || decimal == null) return null;
  return probability * (decimal - 1) - (1 - probability);
}

function quarterKelly(probability: number | null | undefined, american: number | null | undefined) {
  const decimal = decimalOdds(american);
  if (probability == null || decimal == null) return 0;
  const b = decimal - 1;
  return clamp(((b * probability - (1 - probability)) / b) * 0.25, 0, 1);
}

function selected(edge: Edge, market: string | null | undefined) {
  if (market === "home_ml") return {
    modelProbability: edge.projection.distribution.homeWinPct,
    marketProbability: edge.market?.homeNoVigProbability ?? null,
    americanOdds: edge.market?.homeMoneyline ?? null
  };
  if (market === "away_ml") return {
    modelProbability: edge.projection.distribution.awayWinPct,
    marketProbability: edge.market?.awayNoVigProbability ?? null,
    americanOdds: edge.market?.awayMoneyline ?? null
  };
  return { modelProbability: null, marketProbability: null, americanOdds: null };
}

function quality(edge: Edge, signal: Signal) {
  const governor = edge.projection.mlbIntel?.governor;
  const confidence = typeof governor?.confidence === "number" ? governor.confidence : 0.5;
  const volatility = edge.projection.mlbIntel?.volatilityIndex ?? 1.5;
  const sources = signal.sourceCount ?? 0;
  const hold = signal.marketHold ?? 0.08;
  const calibrated = edge.projection.mlbIntel?.calibration?.ece != null;
  let score = 45;
  score += clamp((confidence - 0.45) * 95, -15, 28);
  score += clamp((sources - 1) * 8, -8, 20);
  score -= clamp((volatility - 1.35) * 18, 0, 18);
  score -= clamp((hold - 0.06) * 140, 0, 18);
  if (calibrated) score += 8;
  if (governor?.noBet) score -= 12;
  return clamp(Math.round(score), 0, 100);
}

function tier(score: number, expectedValue: number | null, edge: number | null, dataQuality: number, hardStops: string[]): Tier {
  if (hardStops.length || expectedValue == null || edge == null || expectedValue <= 0) return "PASS";
  if (score >= 82 && expectedValue >= 0.035 && Math.abs(edge) >= 0.025 && dataQuality >= 70) return "ATTACK";
  if (score >= 66 && expectedValue >= 0.02 && Math.abs(edge) >= 0.015 && dataQuality >= 58) return "PLAY";
  if (score >= 48 && expectedValue >= 0.0075 && Math.abs(edge) >= 0.0075 && dataQuality >= 42) return "LEAN";
  return "WATCH";
}

function strength(action: Tier) {
  if (action === "ATTACK") return "strong";
  if (action === "PLAY" || action === "LEAN" || action === "WATCH") return "watch";
  return "thin";
}

function enhance(edge: Edge): Edge {
  if (!edge.signal) return edge;
  const signal = edge.signal;
  const market = signal.market ?? null;
  const isMoneyline = market === "home_ml" || market === "away_ml";
  const pick = selected(edge, market);
  const expectedValue = ev(pick.modelProbability, pick.americanOdds);
  const modelEdge = isMoneyline && pick.modelProbability != null && pick.marketProbability != null ? pick.modelProbability - pick.marketProbability : null;
  const dataQuality = quality(edge, signal);
  const hardStopReasons: string[] = [];
  const downgradeReasons: string[] = [];
  const warnings = [...(signal.warnings ?? []), ...(edge.marketQuality?.warnings ?? [])].filter(Boolean);

  if (!isMoneyline) hardStopReasons.push(`non-moneyline market: ${market ?? "unknown"}`);
  if (pick.americanOdds == null) hardStopReasons.push("missing actual odds");
  if (pick.modelProbability == null) hardStopReasons.push("missing model probability");
  if (pick.marketProbability == null) hardStopReasons.push("missing no-vig market probability");
  if (edge.projection.mlbIntel?.governor?.noBet) downgradeReasons.push("governor no-bet downgraded, not deleted");
  if ((signal.sourceCount ?? 0) < 2) downgradeReasons.push("thin book consensus");
  if ((signal.marketHold ?? 0) > 0.1) downgradeReasons.push("elevated market hold");

  const score = Math.round(clamp(
    45 +
    (expectedValue == null ? 0 : clamp(expectedValue * 900, -35, 42)) +
    (modelEdge == null ? 0 : clamp(Math.abs(modelEdge) * 700, 0, 28)) +
    clamp((dataQuality - 45) * 0.55, -12, 22) -
    (pick.americanOdds != null && pick.americanOdds < -220 ? 10 : 0) -
    Math.min(20, downgradeReasons.length * 6),
    0,
    100
  ));
  const action = tier(score, expectedValue, modelEdge, dataQuality, hardStopReasons);
  const kelly = quarterKelly(pick.modelProbability, pick.americanOdds);
  const stakeUnits = action === "ATTACK" ? clamp(kelly, 0.75, 1) : action === "PLAY" ? clamp(kelly, 0.35, 0.75) : 0;

  return {
    ...edge,
    signal: {
      ...signal,
      strength: strength(action),
      action,
      actionScore: score,
      betEligible: action === "ATTACK" || action === "PLAY",
      roiEligible: action === "ATTACK" || action === "PLAY",
      expectedValue: round(expectedValue),
      stakeUnits: round(stakeUnits, 2) ?? 0,
      kellyFraction: round(kelly, 4) ?? 0,
      takeAction: {
        version: "take-action-v2",
        action,
        actionScore: score,
        betEligible: action === "ATTACK" || action === "PLAY",
        roiEligible: action === "ATTACK" || action === "PLAY",
        market,
        side: market,
        modelProbability: round(pick.modelProbability),
        marketProbability: round(pick.marketProbability),
        edge: round(modelEdge),
        expectedValue: round(expectedValue),
        americanOdds: pick.americanOdds,
        sportsbook: edge.sportsbook ?? edge.market?.sportsbook ?? null,
        stakeUnits: round(stakeUnits, 2) ?? 0,
        kellyFraction: round(kelly, 4) ?? 0,
        reasons: [
          expectedValue == null ? "EV unavailable" : `EV ${round(expectedValue * 100, 2)}%`,
          modelEdge == null ? "Edge unavailable" : `Edge ${round(modelEdge * 100, 2)}%`,
          `Data quality ${dataQuality}/100`
        ],
        warnings,
        downgradeReasons,
        hardStopReasons
      }
    } as Signal & { takeAction: unknown }
  };
}

function enhanceResult<T extends { edges: Edge[] }>(result: T): T {
  return { ...result, edges: result.edges.map(enhance) };
}

export async function buildMlbEdges(...args: Parameters<typeof legacyBuildMlbEdges>) {
  return enhanceResult(await legacyBuildMlbEdges(...args));
}

export async function buildMlbEdgesFromProjections(...args: Parameters<typeof legacyBuildMlbEdgesFromProjections>) {
  return enhanceResult(await legacyBuildMlbEdgesFromProjections(...args));
}
