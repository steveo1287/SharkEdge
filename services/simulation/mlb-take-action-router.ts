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
import { getCachedMlbTotalsBacktest, getDefaultMlbTotalsCandidate, type MlbTotalsBacktestCandidate } from "./mlb-totals-backtest-engine";
import { scoreMlbTotalMarket } from "./mlb-total-probability-engine";

export { fetchMlbSportsbookLines, noVigMoneylineProbabilities, rankMlbMarketSignal };
export type { MlbEdgeGame, MlbEdgeProjection, SportsbookLine };

type EdgeResult = Awaited<ReturnType<typeof legacyBuildMlbEdges>>;
type Edge = EdgeResult["edges"][number];
type Signal = NonNullable<Edge["signal"]>;

type Tier = "ATTACK" | "PLAY" | "LEAN" | "WATCH" | "PASS";

type TotalsGateContext = {
  gates: MlbTotalsBacktestCandidate;
  source: "backtest" | "default";
  usableRows: number;
};

type BaseMarketSignal = {
  market: string;
  team: string | null;
  edge: number;
  sourceCount: number;
  marketHold: number | null;
  warnings: string[];
};

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
      totalProbability: {
        ok: totalScore.ok,
        projectedTotal: totalScore.projectedTotal,
        marketTotal: totalScore.marketTotal,
        projectedRunEdge: totalScore.projectedRunEdge,
        over: totalScore.over,
        under: totalScore.under,
        warnings: totalScore.warnings
      }
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

function quality(edge: Edge, signal: BaseMarketSignal) {
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

function attackEvRequirement(american: number | null | undefined, market: string | null | undefined, totalsGates: MlbTotalsBacktestCandidate) {
  const base = isTotal(market) ? totalsGates.attackEv : 0.04;
  if (typeof american !== "number" || !Number.isFinite(american)) return base;
  if (american < -220) return Math.max(base, 0.055);
  if (american < -160) return Math.max(base, 0.0475);
  if (american >= 250) return Math.max(base, 0.055);
  if (american >= 160) return Math.max(base, 0.045);
  return base;
}

function totalRunEdgeClears(action: Tier, market: string | null | undefined, runEdge: number | null, totalsGates: MlbTotalsBacktestCandidate) {
  if (!isTotal(market)) return true;
  if (runEdge == null || runEdge <= 0) return false;
  if (action === "ATTACK") return runEdge >= totalsGates.attackRunEdge;
  if (action === "PLAY") return runEdge >= totalsGates.playRunEdge;
  if (action === "LEAN") return runEdge >= totalsGates.leanRunEdge;
  return true;
}

function probabilityEdgeClears(action: Tier, market: string | null | undefined, edge: number | null, totalsGates: MlbTotalsBacktestCandidate) {
  if (edge == null) return false;
  if (!isTotal(market)) return Math.abs(edge) >= (action === "ATTACK" ? 0.025 : action === "PLAY" ? 0.015 : 0.0075);
  if (action === "ATTACK" || action === "PLAY") return edge >= totalsGates.minProbabilityEdge;
  return edge >= Math.min(0.0075, totalsGates.minProbabilityEdge);
}

function tier(score: number, expectedValue: number | null, edge: number | null, dataQuality: number, hardStops: string[], american: number | null | undefined, market: string | null | undefined, runEdge: number | null, totalsGates: MlbTotalsBacktestCandidate): Tier {
  if (hardStops.length || expectedValue == null || edge == null || expectedValue <= 0) return "PASS";
  if (score >= 82 && expectedValue >= attackEvRequirement(american, market, totalsGates) && probabilityEdgeClears("ATTACK", market, edge, totalsGates) && dataQuality >= 70 && totalRunEdgeClears("ATTACK", market, runEdge, totalsGates)) return "ATTACK";
  if (score >= 66 && expectedValue >= (isTotal(market) ? totalsGates.playEv : 0.02) && probabilityEdgeClears("PLAY", market, edge, totalsGates) && dataQuality >= 60 && totalRunEdgeClears("PLAY", market, runEdge, totalsGates)) return "PLAY";
  if (score >= 48 && expectedValue >= (isTotal(market) ? totalsGates.leanEv : 0.0075) && probabilityEdgeClears("LEAN", market, edge, totalsGates) && dataQuality >= 42 && totalRunEdgeClears("LEAN", market, runEdge, totalsGates)) return "LEAN";
  return "WATCH";
}

function strength(action: Tier) {
  if (action === "ATTACK") return "strong";
  if (action === "PLAY" || action === "LEAN" || action === "WATCH") return "watch";
  return "thin";
}

function evaluateMarket(edge: Edge, baseSignal: BaseMarketSignal, gateContext: TotalsGateContext) {
  const market = baseSignal.market ?? null;
  const supported = isMoneyline(market) || isTotal(market);
  const totalMarket = isTotal(market);
  const pick = selected(edge, market);
  const expectedValue = pick.expectedValue ?? ev(pick.modelProbability, pick.americanOdds);
  const modelEdge = supported && pick.modelProbability != null && pick.marketProbability != null ? pick.modelProbability - pick.marketProbability : null;
  const dataQuality = quality(edge, baseSignal);
  const hardStopReasons: string[] = [];
  const downgradeReasons: string[] = [];
  const warnings = [...(baseSignal.warnings ?? []), ...(edge.marketQuality?.warnings ?? [])].filter(Boolean);

  if (!supported) hardStopReasons.push(`unsupported market: ${market ?? "unknown"}`);
  if (pick.americanOdds == null) hardStopReasons.push("missing actual odds");
  if (pick.modelProbability == null) hardStopReasons.push("missing model probability");
  if (pick.marketProbability == null) hardStopReasons.push("missing no-vig market probability");
  if (totalMarket && pick.projectedRunEdge == null) hardStopReasons.push("missing projected total run edge");
  if (edge.projection.mlbIntel?.governor?.noBet) downgradeReasons.push("governor no-bet downgraded, not deleted");
  if ((baseSignal.sourceCount ?? 0) < 2) downgradeReasons.push("thin book consensus");
  if ((baseSignal.marketHold ?? 0) > 0.1) downgradeReasons.push("elevated market hold");
  if (totalMarket && pick.projectedRunEdge != null && pick.projectedRunEdge < gateContext.gates.leanRunEdge) downgradeReasons.push("total run edge below lean threshold");

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
  const action = tier(score, expectedValue, modelEdge, dataQuality, hardStopReasons, pick.americanOdds, market, pick.projectedRunEdge, gateContext.gates);
  const kelly = quarterKelly(pick.modelProbability, pick.americanOdds);
  const stakeUnits = action === "ATTACK" ? clamp(kelly, 0.75, 1) : action === "PLAY" ? clamp(kelly, 0.35, 0.75) : 0;
  const attackRequirement = attackEvRequirement(pick.americanOdds, market, gateContext.gates);

  return {
    version: "take-action-v2.6-market-edge-totals-fallback",
    action,
    actionScore: score,
    betEligible: action === "ATTACK" || action === "PLAY",
    roiEligible: action === "ATTACK" || action === "PLAY",
    market,
    side: market,
    team: baseSignal.team ?? null,
    modelProbability: round(pick.modelProbability),
    marketProbability: round(pick.marketProbability),
    edge: round(modelEdge),
    expectedValue: round(expectedValue),
    attackEvRequirement: round(attackRequirement),
    projectedRunEdge: round(pick.projectedRunEdge, 3),
    totalProbability: pick.totalProbability,
    totalsGateSource: gateContext.source,
    totalsGateUsableRows: gateContext.usableRows,
    totalsGates: gateContext.gates,
    americanOdds: pick.americanOdds,
    sportsbook: edge.sportsbook ?? edge.market?.sportsbook ?? null,
    stakeUnits: round(stakeUnits, 2) ?? 0,
    kellyFraction: round(kelly, 4) ?? 0,
    reasons: [
      expectedValue == null ? "EV unavailable" : `EV ${round(expectedValue * 100, 2)}%`,
      `Attack EV gate ${round(attackRequirement * 100, 2)}%`,
      modelEdge == null ? "Edge unavailable" : `Probability edge ${round(modelEdge * 100, 2)}%`,
      totalMarket ? `Projected run edge ${round(pick.projectedRunEdge, 3) ?? "—"}` : `Data quality ${dataQuality}/100`,
      totalMarket ? `Total gates ${gateContext.source} (${gateContext.usableRows} rows)` : "",
      totalMarket ? `Data quality ${dataQuality}/100` : ""
    ].filter(Boolean),
    warnings,
    downgradeReasons,
    hardStopReasons
  };
}

function buildTotalSignal(edge: Edge): BaseMarketSignal | null {
  const runEdge = typeof edge.edges?.totalRuns === "number" ? edge.edges.totalRuns : null;
  if (runEdge == null || !edge.market?.total) return null;
  return {
    market: runEdge >= 0 ? "over" : "under",
    team: null,
    edge: Math.abs(runEdge),
    sourceCount: edge.marketQuality?.totalSourceCount ?? 0,
    marketHold: edge.marketQuality?.totalHold ?? null,
    warnings: edge.marketQuality?.warnings ?? []
  };
}

function signalToBase(signal: Signal): BaseMarketSignal {
  return {
    market: signal.market,
    team: signal.team,
    edge: signal.edge,
    sourceCount: signal.sourceCount,
    marketHold: signal.marketHold,
    warnings: signal.warnings
  };
}

function enhance(edge: Edge, gateContext: TotalsGateContext): Edge {
  const totalsSignal = buildTotalSignal(edge);
  const totalsAction = totalsSignal ? evaluateMarket(edge, totalsSignal, gateContext) : null;
  const primarySignal = edge.signal ? signalToBase(edge.signal) : totalsSignal;

  if (!primarySignal) {
    return { ...edge, totalsAction: null } as Edge & { totalsAction?: unknown };
  }

  const takeAction = evaluateMarket(edge, primarySignal, gateContext);
  const sourceSignal = edge.signal ?? {
    market: primarySignal.market,
    team: primarySignal.team,
    edge: primarySignal.edge,
    rankScore: rankMlbMarketSignal({ market: primarySignal.market, edge: primarySignal.edge }),
    sourceCount: primarySignal.sourceCount,
    marketHold: primarySignal.marketHold,
    warnings: primarySignal.warnings,
    strength: strength(takeAction.action)
  };

  return {
    ...edge,
    totalsAction,
    signal: {
      ...sourceSignal,
      strength: strength(takeAction.action),
      action: takeAction.action,
      actionScore: takeAction.actionScore,
      betEligible: takeAction.betEligible,
      roiEligible: takeAction.roiEligible,
      expectedValue: takeAction.expectedValue,
      stakeUnits: takeAction.stakeUnits,
      kellyFraction: takeAction.kellyFraction,
      takeAction
    } as Signal & { takeAction: unknown }
  } as Edge & { totalsAction?: unknown };
}

function enhanceResult<T extends { edges: Edge[] }>(result: T, gateContext: TotalsGateContext): T {
  return { ...result, edges: result.edges.map((edge) => enhance(edge, gateContext)) };
}

async function getTotalsGateContext(): Promise<TotalsGateContext> {
  const cached = await getCachedMlbTotalsBacktest().catch(() => null);
  if (cached?.ok && cached.usableRows >= 60) {
    return { gates: cached.best, source: "backtest", usableRows: cached.usableRows };
  }
  return { gates: getDefaultMlbTotalsCandidate(), source: "default", usableRows: cached?.usableRows ?? 0 };
}

export async function buildMlbEdges(...args: Parameters<typeof legacyBuildMlbEdges>) {
  const [result, gateContext] = await Promise.all([legacyBuildMlbEdges(...args), getTotalsGateContext()]);
  return enhanceResult(result, gateContext);
}

export async function buildMlbEdgesFromProjections(...args: Parameters<typeof legacyBuildMlbEdgesFromProjections>) {
  const [result, gateContext] = await Promise.all([legacyBuildMlbEdgesFromProjections(...args), getTotalsGateContext()]);
  return enhanceResult(result, gateContext);
}
