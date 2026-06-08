import type { CachedSimGameProjection, SimMarketSnapshot } from "@/services/simulation/sim-snapshot-service";

export type MlbSimPickMarket = "MONEYLINE" | "OVER_UNDER" | "F5_MONEYLINE" | "F5_TOTAL" | "NRFI";
export type MlbSimPickTier = "TOP_SIM" | "STRONG_SIM" | "LEAN" | "WATCH";
export type MlbParlayTier = "PICK_3";

export type MlbSimPick = {
  id: string;
  gameId: string;
  gameLabel: string;
  startTime: string;
  market: MlbSimPickMarket;
  tier: MlbSimPickTier;
  selection: string;
  side: string;
  modelProbability: number;
  marketProbability: number | null;
  americanOdds: number | null;
  expectedValue: number | null;
  edge: number | null;
  projectedRunEdge: number | null;
  projectedScore: string;
  projectedTotal: number;
  confidence: number;
  score: number;
  dataQuality: number;
  source: "simulation" | "market_context";
  reasons: string[];
  warnings: string[];
};

export type MlbPick3Parlay = {
  id: string;
  tier: MlbParlayTier;
  legs: MlbSimPick[];
  modelProbability: number;
  fairAmericanOdds: number;
  avgConfidence: number;
  score: number;
  warnings: string[];
};

export type MlbDailySimPickBoard = {
  modelVersion: "mlb-sim-pick-selector-v2-sim-first";
  generatedAt: string;
  markets: MlbSimPickMarket[];
  officialPlays: MlbSimPick[];
  qualifiedLeans: MlbSimPick[];
  watchlist: MlbSimPick[];
  pick3Parlays: MlbPick3Parlay[];
  allPicks: MlbSimPick[];
  summary: {
    gameCount: number;
    officialCount: number;
    qualifiedLeanCount: number;
    watchlistCount: number;
    pick3Count: number;
  };
};

type Edge = SimMarketSnapshot["edges"][number];
type MarketLike = {
  homeMoneyline?: number | null;
  awayMoneyline?: number | null;
  homeNoVigProbability?: number | null;
  awayNoVigProbability?: number | null;
  total?: number | null;
  overPrice?: number | null;
  underPrice?: number | null;
};

const DEFAULT_FULL_GAME_TOTAL = 8.5;
const DEFAULT_F5_TOTAL = 4.5;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}
function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function americanToProb(american: number | null | undefined) {
  if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null;
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}
function fairAmerican(probability: number) {
  const p = clamp(probability, 0.001, 0.999);
  return p >= 0.5 ? Math.round(-100 * p / (1 - p)) : Math.round(100 * (1 - p) / p);
}
function noVigTotal(overOdds: number | null | undefined, underOdds: number | null | undefined) {
  const over = americanToProb(overOdds);
  const under = americanToProb(underOdds);
  if (over == null || under == null) return null;
  const sum = over + under;
  if (sum <= 0) return null;
  return { over: over / sum, under: under / sum };
}
function edgeToMap(edges: Edge[]) {
  return new Map(edges.map((edge) => [edge.gameId, edge]));
}
function market(edge: Edge | null | undefined): MarketLike {
  return (edge?.market ?? {}) as MarketLike;
}
function matchupLabel(game: CachedSimGameProjection) {
  return `${game.projection.matchup.away} @ ${game.projection.matchup.home}`;
}
function projectedTotal(game: CachedSimGameProjection) {
  return safeNumber(game.projection.mlbIntel?.projectedTotal) ?? game.projection.distribution.avgAway + game.projection.distribution.avgHome;
}
function projectedScore(game: CachedSimGameProjection) {
  return `${round(game.projection.distribution.avgAway, 1)}-${round(game.projection.distribution.avgHome, 1)}`;
}
function dataQuality(game: CachedSimGameProjection, edge: Edge | null | undefined) {
  const governor = game.projection.mlbIntel?.governor;
  const confidence = safeNumber(governor?.confidence) ?? game.projection.mlbIntel?.confidence ?? 0.42;
  const calibration = game.projection.mlbIntel?.calibration?.ece != null ? 8 : 0;
  const marketContext = edge ? 6 : 0;
  return Math.round(clamp(46 + confidence * 42 + calibration + marketContext, 0, 100));
}
function confidenceFrom(score: number, quality: number) {
  return round(clamp(0.3 + score / 190 + quality / 450, 0.25, 0.78), 3);
}
function tier(score: number, dataQualityValue: number, confidence: number): MlbSimPickTier {
  if (score >= 78 && dataQualityValue >= 58 && confidence >= 0.54) return "TOP_SIM";
  if (score >= 64 && dataQualityValue >= 50 && confidence >= 0.45) return "STRONG_SIM";
  if (score >= 50) return "LEAN";
  return "WATCH";
}
function makePick(args: Omit<MlbSimPick, "tier" | "confidence"> & { confidence?: number }) {
  const confidence = args.confidence ?? confidenceFrom(args.score, args.dataQuality);
  return { ...args, confidence, tier: tier(args.score, args.dataQuality, confidence) } satisfies MlbSimPick;
}

function moneylinePick(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick {
  const homeProb = game.projection.distribution.homeWinPct;
  const awayProb = game.projection.distribution.awayWinPct;
  const homeSide = homeProb >= awayProb;
  const m = market(edge);
  const modelProbability = homeSide ? homeProb : awayProb;
  const marketProbability = homeSide ? safeNumber(m.homeNoVigProbability) : safeNumber(m.awayNoVigProbability);
  const odds = homeSide ? safeNumber(m.homeMoneyline) : safeNumber(m.awayMoneyline);
  const edgeValue = marketProbability == null ? null : modelProbability - marketProbability;
  const q = dataQuality(game, edge);
  const score = Math.round(clamp(44 + (modelProbability - 0.5) * 220 + (edgeValue ?? 0) * 140 + q * 0.22, 0, 100));
  const side = homeSide ? "HOME" : "AWAY";
  const selection = homeSide ? game.projection.matchup.home : game.projection.matchup.away;
  return makePick({
    id: `${game.game.id}:moneyline:${side}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "MONEYLINE",
    selection: `${selection} ML`,
    side,
    modelProbability: round(modelProbability),
    marketProbability: marketProbability == null ? null : round(marketProbability),
    americanOdds: odds,
    expectedValue: null,
    edge: edgeValue == null ? null : round(edgeValue),
    projectedRunEdge: round(Math.abs(game.projection.distribution.avgHome - game.projection.distribution.avgAway), 3),
    projectedScore: projectedScore(game),
    projectedTotal: round(projectedTotal(game), 2),
    score,
    dataQuality: q,
    source: edge ? "market_context" : "simulation",
    reasons: [`sim win lean ${round(modelProbability * 100, 1)}%`, `projected score ${projectedScore(game)}`],
    warnings: []
  });
}

function fullGameTotalPick(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick {
  const m = market(edge);
  const marketLine = safeNumber(m.total);
  const line = marketLine ?? DEFAULT_FULL_GAME_TOTAL;
  const projection = projectedTotal(game);
  const runEdge = projection - line;
  const over = runEdge >= 0;
  const probs = noVigTotal(m.overPrice, m.underPrice);
  const modelProbability = clamp(0.5 + Math.abs(runEdge) * 0.095, 0.5, 0.89);
  const marketProbability = over ? probs?.over ?? null : probs?.under ?? null;
  const odds = over ? safeNumber(m.overPrice) : safeNumber(m.underPrice);
  const q = dataQuality(game, edge);
  const edgeValue = marketProbability == null ? null : modelProbability - marketProbability;
  const score = Math.round(clamp(40 + Math.abs(runEdge) * 14 + modelProbability * 30 + (edgeValue ?? 0) * 110 + q * 0.16, 0, 100));
  return makePick({
    id: `${game.game.id}:ou:${over ? "over" : "under"}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "OVER_UNDER",
    selection: `${over ? "Projected Over" : "Projected Under"} ${line}`,
    side: over ? "OVER" : "UNDER",
    modelProbability: round(modelProbability),
    marketProbability: marketProbability == null ? null : round(marketProbability),
    americanOdds: odds,
    expectedValue: null,
    edge: edgeValue == null ? null : round(edgeValue),
    projectedRunEdge: round(over ? runEdge : -runEdge, 3),
    projectedScore: projectedScore(game),
    projectedTotal: round(projection, 2),
    score,
    dataQuality: q,
    source: edge ? "market_context" : "simulation",
    reasons: [`sim total ${round(projection, 1)}`, `compare line ${line}`, `run edge ${round(Math.abs(runEdge), 2)}`],
    warnings: []
  });
}

function f5MoneylinePick(game: CachedSimGameProjection): MlbSimPick {
  const away = game.projection.distribution.avgAway * 0.55;
  const home = game.projection.distribution.avgHome * 0.55;
  const diff = home - away;
  const homeSide = diff >= 0;
  const modelProbability = clamp(0.5 + Math.abs(diff) * 0.13, 0.5, 0.76);
  const q = dataQuality(game, null);
  const score = Math.round(clamp(38 + Math.abs(diff) * 42 + modelProbability * 30 + q * 0.18, 0, 100));
  return makePick({
    id: `${game.game.id}:f5ml:${homeSide ? "home" : "away"}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "F5_MONEYLINE",
    selection: `${homeSide ? game.projection.matchup.home : game.projection.matchup.away} F5 ML lean`,
    side: homeSide ? "HOME_F5" : "AWAY_F5",
    modelProbability: round(modelProbability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(Math.abs(diff), 3),
    projectedScore: `${round(away, 1)}-${round(home, 1)}`,
    projectedTotal: round(away + home, 2),
    score,
    dataQuality: q,
    source: "simulation",
    reasons: [`sim F5 score ${round(away, 1)}-${round(home, 1)}`, `F5 run diff ${round(Math.abs(diff), 2)}`],
    warnings: []
  });
}

function f5TotalPick(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick {
  const fullLine = safeNumber(market(edge).total);
  const projection = projectedTotal(game) * 0.55;
  const line = round((fullLine ?? DEFAULT_FULL_GAME_TOTAL) * 0.55 || DEFAULT_F5_TOTAL, 1);
  const runEdge = projection - line;
  const over = runEdge >= 0;
  const modelProbability = clamp(0.5 + Math.abs(runEdge) * 0.12, 0.5, 0.78);
  const q = dataQuality(game, edge);
  const score = Math.round(clamp(37 + Math.abs(runEdge) * 20 + modelProbability * 30 + q * 0.16, 0, 100));
  return makePick({
    id: `${game.game.id}:f5total:${over ? "over" : "under"}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "F5_TOTAL",
    selection: `F5 Projected ${over ? "Over" : "Under"} ${line}`,
    side: over ? "F5_OVER" : "F5_UNDER",
    modelProbability: round(modelProbability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(Math.abs(runEdge), 3),
    projectedScore: `${round(game.projection.distribution.avgAway * 0.55, 1)}-${round(game.projection.distribution.avgHome * 0.55, 1)}`,
    projectedTotal: round(projection, 2),
    score,
    dataQuality: q,
    source: "simulation",
    reasons: [`sim F5 total ${round(projection, 1)}`, `compare line ${line}`, `F5 edge ${round(Math.abs(runEdge), 2)}`],
    warnings: []
  });
}

function nrfiPick(game: CachedSimGameProjection): MlbSimPick {
  const total = projectedTotal(game);
  const firstInningLambda = clamp(total * 0.118, 0.55, 1.85);
  const nrfiProbability = clamp(Math.exp(-firstInningLambda), 0.18, 0.64);
  const yrfiProbability = 1 - nrfiProbability;
  const nrfi = nrfiProbability >= yrfiProbability;
  const modelProbability = nrfi ? nrfiProbability : yrfiProbability;
  const q = dataQuality(game, null);
  const score = Math.round(clamp(32 + modelProbability * 72 + Math.abs(0.5 - nrfiProbability) * 45 + q * 0.12, 0, 100));
  return makePick({
    id: `${game.game.id}:${nrfi ? "nrfi" : "yrfi"}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "NRFI",
    selection: nrfi ? "NRFI lean" : "YRFI lean",
    side: nrfi ? "NRFI" : "YRFI",
    modelProbability: round(modelProbability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(1 - firstInningLambda, 3),
    projectedScore: projectedScore(game),
    projectedTotal: round(total, 2),
    score,
    dataQuality: q,
    source: "simulation",
    reasons: [`first-inning run lambda ${round(firstInningLambda, 2)}`, `${nrfi ? "NRFI" : "YRFI"} sim ${round(modelProbability * 100, 1)}%`],
    warnings: []
  });
}

function pickRank(pick: MlbSimPick) {
  const tierBoost = pick.tier === "TOP_SIM" ? 1000 : pick.tier === "STRONG_SIM" ? 720 : pick.tier === "LEAN" ? 440 : 120;
  return tierBoost + pick.score + pick.confidence * 70 + (pick.projectedRunEdge ?? 0) * 8;
}
function buildGamePicks(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick[] {
  return [moneylinePick(game, edge), fullGameTotalPick(game, edge), f5MoneylinePick(game), f5TotalPick(game, edge), nrfiPick(game)];
}
function uncorrelated(picks: MlbSimPick[]) {
  const games = new Set<string>();
  return picks.filter((pick) => {
    if (games.has(pick.gameId)) return false;
    games.add(pick.gameId);
    return true;
  });
}
function buildPick3Parlays(picks: MlbSimPick[]): MlbPick3Parlay[] {
  const pool = uncorrelated(picks.filter((pick) => pick.tier === "TOP_SIM" || pick.tier === "STRONG_SIM" || pick.tier === "LEAN").sort((a, b) => pickRank(b) - pickRank(a))).slice(0, 9);
  const parlays: MlbPick3Parlay[] = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) for (let k = j + 1; k < pool.length; k++) {
    const legs = [pool[i], pool[j], pool[k]];
    const modelProbability = legs.reduce((product, leg) => product * leg.modelProbability, 1);
    const avgConfidence = legs.reduce((sum, leg) => sum + leg.confidence, 0) / 3;
    const score = Math.round(clamp(legs.reduce((sum, leg) => sum + leg.score, 0) / 3 + avgConfidence * 20 + modelProbability * 80, 0, 100));
    parlays.push({
      id: legs.map((leg) => leg.id).join("|"),
      tier: "PICK_3",
      legs,
      modelProbability: round(modelProbability),
      fairAmericanOdds: fairAmerican(modelProbability),
      avgConfidence: round(avgConfidence, 3),
      score,
      warnings: []
    });
  }
  return parlays.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function buildMlbDailySimPickBoard(args: { games: CachedSimGameProjection[]; edges?: Edge[]; generatedAt?: string }): MlbDailySimPickBoard {
  const edgeMap = edgeToMap(args.edges ?? []);
  const allPicks = args.games.flatMap((game) => buildGamePicks(game, edgeMap.get(game.game.id) ?? null)).sort((a, b) => pickRank(b) - pickRank(a));
  const officialPlays = allPicks.filter((pick) => pick.tier === "TOP_SIM").slice(0, 3);
  const qualifiedLeans = allPicks.filter((pick) => pick.tier === "STRONG_SIM" || pick.tier === "LEAN").slice(0, Math.max(2, 6 - officialPlays.length));
  const watchlist = allPicks.filter((pick) => pick.tier === "WATCH").slice(0, 8);
  const pick3Parlays = buildPick3Parlays([...officialPlays, ...qualifiedLeans, ...watchlist]);
  return {
    modelVersion: "mlb-sim-pick-selector-v2-sim-first",
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    markets: ["MONEYLINE", "OVER_UNDER", "F5_MONEYLINE", "F5_TOTAL", "NRFI"],
    officialPlays,
    qualifiedLeans,
    watchlist,
    pick3Parlays,
    allPicks,
    summary: {
      gameCount: args.games.length,
      officialCount: officialPlays.length,
      qualifiedLeanCount: qualifiedLeans.length,
      watchlistCount: watchlist.length,
      pick3Count: pick3Parlays.length
    }
  };
}
