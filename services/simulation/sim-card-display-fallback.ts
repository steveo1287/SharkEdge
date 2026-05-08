import { scoreMlbTotalMarket } from "@/services/simulation/mlb-total-probability-engine";

type MarketEdgeLike = {
  signal?: Record<string, any> | null;
  totalsAction?: Record<string, any> | null;
  market?: Record<string, any> | null;
  sportsbook?: string | null;
  projection?: Record<string, any> | null;
  edges?: Record<string, any> | null;
  marketQuality?: Record<string, any> | null;
};

type ActionFilterLike = "bets" | "totals" | "all" | "attack" | "play" | "lean" | "watch" | "pass";

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number | null | undefined, digits = 4) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function americanImplied(american: number | null | undefined) {
  if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null;
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}

function americanPayout(american: number | null | undefined) {
  if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null;
  return american > 0 ? american / 100 : 100 / Math.abs(american);
}

function expectedValue(probability: number | null, american: number | null) {
  const payout = americanPayout(american);
  if (probability == null || payout == null) return null;
  return probability * payout - (1 - probability);
}

function noVig(homeOdds: number | null, awayOdds: number | null) {
  const home = americanImplied(homeOdds);
  const away = americanImplied(awayOdds);
  if (home == null || away == null) return null;
  const hold = home + away;
  if (!Number.isFinite(hold) || hold <= 0) return null;
  return { home: home / hold, away: away / hold, hold: hold - 1 };
}

function actionFrom(ev: number | null, edge: number | null, runEdge?: number | null) {
  if (ev == null || edge == null || ev <= 0) return "PASS";
  if (runEdge != null) {
    const absRunEdge = Math.abs(runEdge);
    if (ev >= 0.045 && edge >= 0.015 && absRunEdge >= 1.2) return "ATTACK";
    if (ev >= 0.02 && edge >= 0.015 && absRunEdge >= 0.85) return "PLAY";
    if (ev >= 0.0075 && edge >= 0.0075 && absRunEdge >= 0.45) return "LEAN";
    return "WATCH";
  }
  if (ev >= 0.04 && Math.abs(edge) >= 0.025) return "ATTACK";
  if (ev >= 0.02 && Math.abs(edge) >= 0.015) return "PLAY";
  if (ev >= 0.0075 && Math.abs(edge) >= 0.0075) return "LEAN";
  return "WATCH";
}

function scoreFrom(ev: number | null, edge: number | null, runEdge?: number | null) {
  return Math.round(clamp(
    45 +
    (ev == null ? 0 : clamp(ev * 900, -35, 42)) +
    (edge == null ? 0 : clamp(Math.abs(edge) * 700, 0, 28)) +
    (runEdge == null ? 0 : clamp(Math.abs(runEdge) * 5.5, -12, 16)),
    0,
    100
  ));
}

function useful(action: unknown) {
  const value = action && typeof action === "object" ? action as Record<string, any> : null;
  if (!value) return false;
  return value.expectedValue != null || value.americanOdds != null || value.actionScore != null || value.projectedRunEdge != null || value.totalProbability != null;
}

export function edgeHasTotalMarket(edge: MarketEdgeLike | null | undefined) {
  if (!edge) return false;
  if (edge.totalsAction) return true;
  return edge.market?.total != null && (edge.market?.overPrice != null || edge.market?.underPrice != null || edge.edges?.totalRuns != null);
}

function totalsFallback(edge: MarketEdgeLike) {
  const distribution = edge.projection?.distribution ?? {};
  const projectedTotal = numberValue(edge.projection?.mlbIntel?.projectedTotal) ??
    (numberValue(distribution.avgAway) != null && numberValue(distribution.avgHome) != null
      ? Number(distribution.avgAway) + Number(distribution.avgHome)
      : null);
  const marketTotal = numberValue(edge.market?.total);
  const overOdds = numberValue(edge.market?.overPrice);
  const underOdds = numberValue(edge.market?.underPrice);
  const awayExpectedRuns = numberValue(edge.projection?.mlbIntel?.runModel?.awayExpectedRuns) ?? numberValue(distribution.avgAway);
  const homeExpectedRuns = numberValue(edge.projection?.mlbIntel?.runModel?.homeExpectedRuns) ?? numberValue(distribution.avgHome);
  const rawRunEdge = projectedTotal != null && marketTotal != null ? projectedTotal - marketTotal : numberValue(edge.edges?.totalRuns);

  if (projectedTotal == null && rawRunEdge == null && marketTotal == null) return null;

  const side = (rawRunEdge ?? 0) >= 0 ? "over" : "under";
  const scored = scoreMlbTotalMarket({
    projectedTotal,
    marketTotal,
    overOdds,
    underOdds,
    awayExpectedRuns,
    homeExpectedRuns,
    awayFallbackRuns: numberValue(distribution.avgAway),
    homeFallbackRuns: numberValue(distribution.avgHome)
  });
  const sideScore = side === "over" ? scored.over : scored.under;
  const runEdge = side === "over" ? scored.projectedRunEdge ?? rawRunEdge : scored.projectedRunEdge == null ? (rawRunEdge == null ? null : Math.abs(rawRunEdge)) : -scored.projectedRunEdge;
  const probabilityEdge = sideScore.probabilityEdge;
  const ev = sideScore.expectedValue;
  const action = actionFrom(ev, probabilityEdge, runEdge);

  return {
    version: "display-fallback-totals",
    action,
    actionScore: scoreFrom(ev, probabilityEdge, runEdge),
    betEligible: action === "ATTACK" || action === "PLAY",
    roiEligible: action === "ATTACK" || action === "PLAY",
    market: side,
    side,
    modelProbability: round(sideScore.conditionalWinProbability),
    marketProbability: round(sideScore.marketProbability),
    edge: round(probabilityEdge),
    expectedValue: round(ev),
    projectedRunEdge: round(runEdge, 3),
    totalProbability: {
      ok: scored.ok,
      projectedTotal: scored.projectedTotal,
      marketTotal: scored.marketTotal,
      projectedRunEdge: scored.projectedRunEdge,
      over: scored.over,
      under: scored.under,
      warnings: scored.warnings
    },
    americanOdds: sideScore.americanOdds,
    sportsbook: edge.sportsbook ?? edge.market?.sportsbook ?? "market",
    stakeUnits: 0,
    kellyFraction: 0,
    reasons: [
      ev == null ? "EV unavailable" : `EV ${round(ev * 100, 2)}%`,
      probabilityEdge == null ? "Probability edge unavailable" : `Probability edge ${round(probabilityEdge * 100, 2)}%`,
      runEdge == null ? "Run edge unavailable" : `Projected run edge ${round(runEdge, 3)}`,
      "Display fallback from cached market/projection"
    ],
    warnings: scored.warnings,
    downgradeReasons: [],
    hardStopReasons: [
      marketTotal == null ? "missing market total" : null,
      overOdds == null && underOdds == null ? "missing over/under odds" : null
    ].filter(Boolean)
  };
}

function moneylineFallback(edge: MarketEdgeLike) {
  const signal = edge.signal ?? {};
  const market = String(signal.market ?? "").toLowerCase();
  const homeOdds = numberValue(edge.market?.homeMoneyline);
  const awayOdds = numberValue(edge.market?.awayMoneyline);
  const prices = noVig(homeOdds, awayOdds);
  const homeProb = numberValue(edge.projection?.distribution?.homeWinPct);
  const awayProb = numberValue(edge.projection?.distribution?.awayWinPct);
  if (!prices || homeProb == null || awayProb == null) return null;

  const homeEdge = homeProb - prices.home;
  const awayEdge = awayProb - prices.away;
  const side = market === "home_ml" || market === "away_ml" ? market : homeEdge >= awayEdge ? "home_ml" : "away_ml";
  const modelProbability = side === "home_ml" ? homeProb : awayProb;
  const marketProbability = side === "home_ml" ? prices.home : prices.away;
  const americanOdds = side === "home_ml" ? homeOdds : awayOdds;
  const edgeValue = modelProbability - marketProbability;
  const ev = expectedValue(modelProbability, americanOdds);
  const action = actionFrom(ev, edgeValue);

  return {
    version: "display-fallback-moneyline",
    action,
    actionScore: scoreFrom(ev, edgeValue),
    betEligible: action === "ATTACK" || action === "PLAY",
    roiEligible: action === "ATTACK" || action === "PLAY",
    market: side,
    side,
    modelProbability: round(modelProbability),
    marketProbability: round(marketProbability),
    edge: round(edgeValue),
    expectedValue: round(ev),
    americanOdds,
    sportsbook: edge.sportsbook ?? edge.market?.sportsbook ?? "market",
    stakeUnits: 0,
    kellyFraction: 0,
    reasons: [
      ev == null ? "EV unavailable" : `EV ${round(ev * 100, 2)}%`,
      `Probability edge ${round(edgeValue * 100, 2)}%`,
      "Display fallback from cached market/projection"
    ],
    warnings: [],
    downgradeReasons: [],
    hardStopReasons: []
  };
}

export function buildDisplayAction(edge: MarketEdgeLike | null | undefined, filter: ActionFilterLike) {
  if (!edge) return {};
  const signal = edge.signal ?? null;
  const raw = filter === "totals" ? edge.totalsAction : signal?.takeAction ?? signal;
  if (useful(raw)) return raw as Record<string, any>;
  if (filter === "totals") return totalsFallback(edge) ?? {};
  return moneylineFallback(edge) ?? totalsFallback(edge) ?? {};
}
