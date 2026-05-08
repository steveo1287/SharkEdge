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
import { scoreMlbTotalMarket } from "./mlb-total-probability-engine";

export { fetchMlbSportsbookLines, noVigMoneylineProbabilities, rankMlbMarketSignal };
export type { MlbEdgeGame, MlbEdgeProjection, SportsbookLine };

type EdgeResult = Awaited<ReturnType<typeof legacyBuildMlbEdges>>;
type Edge = EdgeResult["edges"][number];
type Signal = NonNullable<Edge["signal"]>;

type Tier = "ATTACK" | "PLAY" | "LEAN" | "WATCH" | "PASS";
type SupportedMarket = "home_ml" | "away_ml" | "over" | "under";

type SelectedPick = {
  supported: boolean;
  modelProbability: number | null;
  marketProbability: number | null;
  americanOdds: number | null;
  expectedValue: number | null;
  projectedRunEdge: number | null;
  totalProbability: unknown | null;
};

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

function isMoneyline(market: string | null | undefined) {
  return market === "home_ml" || market === "away_ml";
}

function isTotal(market: string | null | undefined) {
  return market === "over" || market === "under";
}

function selected(edge: Edge, market: string | null | undefined): SelectedPick {
  if (market === "home_ml") return {
    supported: true,
    modelProbability: edge.projection.distribution.homeWinPct,
    marketProbability: edge.market?.homeNoVigProbability ?? null,
    americanOdds: edge.market?.homeMoneyline ?? null,
    expectedValue: null,
    projectedRunEdge: null,
    totalProbability: null
  };

  if (market === "away_ml") return {
    supported: true,
    modelProbability: edge.projection.distribution.awayWinPct,
    marketProbability: edge.market?.awayNoVigProbability ?? null,
    americanOdds: edge.market?.awayMoneyline ?? null,
    expectedValue: null,
    projectedRunEdge: null,
    totalProbability: null
  };

  if (market === "over" || market === "under") {
    const totalScore = scoreMlbTotalMarket({
      projectedTotal: edge.projection.mlbIntel?.projectedTotal ?? edge.projection.distribution.avgAway + edge.projection.distribution.avgHome,
      marketTotal: edge.market?.total ?? null,
      overOdds: edge.market?.overPrice ?? null,
      underOdds: edge.market?.underPrice ?? null,
      awayExpectedRuns: edge.projection.mlbIntel?.runModel?.awayExpectedRuns ?? null,
      homeExpectedRuns: edge.projection.mlbIntel?.runModel?.homeExpectedRuns ?? null,
      awayFallbackRuns: edge.projection.distribution.avgAway,
      homeFallbackRuns: edge.projection.distribution.avgHome
    });
    const side = market === "over" ? totalScore.over : totalScore.under;
    const signedRunEdge = market === "over"
      ? totalScore.projectedRunEdge
      : totalScore.projectedRunEdge == null ? null : -totalScore.projectedRunEdge;

    return {
      supported: true,
      modelProbability: side.conditionalWinProbability,
      marketProbability: side.marketProbability,
      americanOdds: side.americanOdds,
      expectedValue: side.expectedValue,
      projectedRunEdge: signedRunEdge,
      totalProbability: totalScore
    };
  }

  return {
    supported: false,
    modelProbability: null,
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    projectedRunEdge: null,
    totalProbability: null
  };
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
  if (isTotal(signal.market) && Math.abs(signal.edge ?? 0) < 0.65) score -= 10;
  return clamp(Math.round(score), 0, 100);
}

function attackEvRequirement(american: number | null | undefined, market: string | null | undefined) {
  const base = isTotal(market) ? 0.045 : 0.04;
  if (typeof american !== "number" || !Number.isFinite(american)) return base;
  if (american < -220) return 0.055;
  if (american < -160) return Math.max(base, 0.0475);
  if (american >= 250) return 0.055;
  if (american >= 160) return Math.max(base, 0.045);
  return base;
}

function totalRunEdgeClears(action: Tier, market: string | null | undefined, runEdge: number | null) {
  if (!isTotal(market)) return true;
  if (runEdge == null || runEdge <= 0) return false;
  if (action === "ATTACK") return runEdge >= 1.2;
  if (action === "PLAY") return runEdge >= 0.85;
  if (action === "LEAN") return runEdge >= 0.45;
  return true;
}

function tier(score: number, expectedValue: number | null, edge: number | null, dataQuality: number, hardStops: string[], american: number | null | undefined, market: string | null | undefined, runEdge: number | null): Tier {
  if (hardStops.length || expectedValue == null || edge == null || expectedValue <= 0) return "PASS";
  if (score >= 82 && expectedValue >= attackEvRequirement(american, market) && Math.abs(edge) >= 0.025 && dataQuality >= 70 && totalRunEdgeClears("ATTACK", market, runEdge)) return "ATTACK";
  if (score >= 66 && expectedValue >= 0.02 && Math.abs(edge) >= 0.015 && dataQuality >= 60 && totalRunEdgeClears("PLAY", market, runEdge)) return "PLAY";
  if (score >= 48 && expectedValue >= 0.0075 && Math.abs(edge) >= 0.0075 && dataQuality >= 42 && totalRunEdgeClears("LEAN", market, runEdge)) return "LEAN";
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
  const supported = isMoneyline(market) || isTotal(market);
  const totalMarket = isTotal(market);
  const pick = selected(edge, market);
  const expectedValue = pick.expectedValue ?? ev(pick.modelProbability, pick.americanOdds);
  const modelEdge = supported && pick.modelProbability != null && pick.marketProbability != null ? pick.modelProbability - pick.marketProbability : null;
  const dataQuality = quality(edge, signal);
  const hardStopReasons: string[] = [];
  const downgradeReasons: string[] = [];
  const warnings = [...(signal.warnings ?? []), ...(edge.marketQuality?.warnings ?? [])].filter(Boolean);

  if (!supported) hardStopReasons.push(`unsupported market: ${market ?? "unknown"}`);
  if (pick.americanOdds == null) hardStopReasons.push("missing actual odds");
  if (pick.modelProbability == null) hardStopReasons.push("missing model probability");
  if (pick.marketProbability == null) hardStopReasons.push("missing no-vig market probability");
  if (totalMarket && pick.projectedRunEdge == null) hardStopReasons.push("missing projected total run edge");
  if (edge.projection.mlbIntel?.governor?.noBet) downgradeReasons.push("governor no-bet downgraded, not deleted");
  if ((signal.sourceCount ?? 0) < 2) downgradeReasons.push("thin book consensus");
  if ((signal.marketHold ?? 0) > 0.1) downgradeReasons.push("elevated market hold");
  if (totalMarket && pick.projectedRunEdge != null && pick.projectedRunEdge < 0.45) downgradeReasons.push("total run edge below lean threshold");

  const score = Math.round(clamp(
    45 +
    (expectedValue == null ? 0 : clamp(expectedValue * 900, -35, 42)) +
    (modelEdge == null ? 0 : clamp(Math.abs(modelEdge) * 700, 0, 28)) +
    (totalMarket && pick.projectedRunEdge != null ? clamp(pick.projectedRunEdge * 5.5, -12, 16) : 0) +
    clamp((dataQuality - 45) * 0.55, -12, 22) -
    (pick.americanOdds != null && pick.americanOdds < -220 ? 10 : 0) -
    (pick.americanOdds != null && pick.americanOdds >= 250 ? 8 : 0) -
    Math.min(20, downgradeReasons.length * 6),
    0,
    100
  ));
  const action = tier(score, expectedValue, modelEdge, dataQuality, hardStopReasons, pick.americanOdds, market, pick.projectedRunEdge);
  const kelly = quarterKelly(pick.modelProbability, pick.americanOdds);
  const stakeUnits = action === "ATTACK" ? clamp(kelly, 0.75, 1) : action === "PLAY" ? clamp(kelly, 0.35, 0.75) : 0;
  const attackRequirement = attackEvRequirement(pick.americanOdds, market);

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
        version: "take-action-v2.2-totals",
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
        attackEvRequirement: round(attackRequirement),
        projectedRunEdge: round(pick.projectedRunEdge, 3),
        totalProbability: pick.totalProbability,
        americanOdds: pick.americanOdds,
        sportsbook: edge.sportsbook ?? edge.market?.sportsbook ?? null,
        stakeUnits: round(stakeUnits, 2) ?? 0,
        kellyFraction: round(kelly, 4) ?? 0,
        reasons: [
          expectedValue == null ? "EV unavailable" : `EV ${round(expectedValue * 100, 2)}%`,
          `Attack EV gate ${round(attackRequirement * 100, 2)}%`,
          modelEdge == null ? "Edge unavailable" : `Probability edge ${round(modelEdge * 100, 2)}%`,
          totalMarket ? `Projected run edge ${round(pick.projectedRunEdge, 3) ?? "—"}` : `Data quality ${dataQuality}/100`,
          totalMarket ? `Data quality ${dataQuality}/100` : ""
        ].filter(Boolean),
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
