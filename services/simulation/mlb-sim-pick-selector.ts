import { buildMlbCanonicalGameState } from "@/services/simulation/mlb-canonical-game-state";
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
function canonical(game: CachedSimGameProjection) {
  return buildMlbCanonicalGameState(game.projection);
}
function matchupLabel(game: CachedSimGameProjection) {
  const state = canonical(game);
  return `${state.awayTeam} @ ${state.homeTeam}`;
}
function projectedTotal(game: CachedSimGameProjection) {
  return canonical(game).fullGameTotal.projection;
}
function projectedScore(game: CachedSimGameProjection) {
  return canonical(game).projectedScore;
}
function dataQuality(game: CachedSimGameProjection, edge: Edge | null | undefined) {
  const mlbIntel = game.projection.mlbIntel as (NonNullable<typeof game.projection.mlbIntel> & { confidence?: unknown }) | null | undefined;
  const governor = mlbIntel?.governor;
  const confidence = safeNumber(governor?.confidence) ?? safeNumber(mlbIntel?.confidence) ?? 0.42;
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
  const state = canonical(game);
  const homeSide = state.moneyline.side === "HOME";
  const m = market(edge);
  const modelProbability = state.moneyline.probability;
  const marketProbability = homeSide ? safeNumber(m.homeNoVigProbability) : safeNumber(m.awayNoVigProbability);
  const odds = homeSide ? safeNumber(m.homeMoneyline) : safeNumber(m.awayMoneyline);
  const edgeValue = marketProbability == null ? null : modelProbability - marketProbability;
  const q = dataQuality(game, edge);
  const score = Math.round(clamp(44 + (modelProbability - 0.5) * 220 + (edgeValue ?? 0) * 140 + q * 0.22, 0, 100));
  return makePick({
    id: `${game.game.id}:moneyline:${state.moneyline.side}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "MONEYLINE",
    selection: `${state.moneyline.selection} ML`,
    side: state.moneyline.side,
    modelProbability: round(modelProbability),
    marketProbability: marketProbability == null ? null : round(marketProbability),
    americanOdds: odds,
    expectedValue: null,
    edge: edgeValue == null ? null : round(edgeValue),
    projectedRunEdge: state.moneyline.runDiff,
    projectedScore: state.projectedScore,
    projectedTotal: state.totalRuns,
    score,
    dataQuality: q,
    source: edge ? "market_context" : "simulation",
    reasons: [`canonical win lean ${round(modelProbability * 100, 1)}%`, `projected score ${state.projectedScore}`, `run diff ${round(state.moneyline.runDiff, 2)}`],
    warnings: state.warnings
  });
}

function fullGameTotalPick(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick {
  const state = canonical(game);
  const m = market(edge);
  const marketLine = safeNumber(m.total);
  const line = marketLine ?? DEFAULT_FULL_GAME_TOTAL;
  const projection = state.fullGameTotal.projection;
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
    projectedScore: state.projectedScore,
    projectedTotal: projection,
    score,
    dataQuality: q,
    source: edge ? "market_context" : "simulation",
    reasons: [`canonical total ${round(projection, 1)}`, `compare line ${line}`, `run edge ${round(Math.abs(runEdge), 2)}`],
    warnings: state.warnings
  });
}

function f5MoneylinePick(game: CachedSimGameProjection): MlbSimPick {
  const state = canonical(game);
  const f5 = state.firstFive;
  const side = f5.side === "TIE" ? (state.moneyline.side === "HOME" ? "HOME" : "AWAY") : f5.side;
  const modelProbability = side === "HOME" ? f5.homeWinProbability : f5.awayWinProbability;
  const q = dataQuality(game, null);
  const diff = Math.abs(f5.homeRuns - f5.awayRuns);
  const score = Math.round(clamp(38 + diff * 42 + modelProbability * 30 + q * 0.18, 0, 100));
  return makePick({
    id: `${game.game.id}:f5ml:${side.toLowerCase()}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "F5_MONEYLINE",
    selection: `${side === "HOME" ? state.homeTeam : state.awayTeam} F5 ML lean`,
    side: side === "HOME" ? "HOME_F5" : "AWAY_F5",
    modelProbability: round(modelProbability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(diff, 3),
    projectedScore: `${round(f5.awayRuns, 1)}-${round(f5.homeRuns, 1)}`,
    projectedTotal: f5.totalRuns,
    score,
    dataQuality: q,
    source: "simulation",
    reasons: [`canonical F5 score ${round(f5.awayRuns, 1)}-${round(f5.homeRuns, 1)}`, `F5 run diff ${round(diff, 2)}`, `F5 tie component ${round(f5.tieProbability * 100, 1)}%`],
    warnings: state.warnings
  });
}

function f5TotalPick(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick {
  const state = canonical(game);
  const fullLine = safeNumber(market(edge).total);
  const projection = state.firstFive.totalRuns;
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
    projectedScore: `${round(state.firstFive.awayRuns, 1)}-${round(state.firstFive.homeRuns, 1)}`,
    projectedTotal: projection,
    score,
    dataQuality: q,
    source: "simulation",
    reasons: [`canonical F5 total ${round(projection, 1)}`, `compare line ${line}`, `F5 edge ${round(Math.abs(runEdge), 2)}`],
    warnings: state.warnings
  });
}

function nrfiPick(game: CachedSimGameProjection): MlbSimPick {
  const state = canonical(game);
  const nrfi = state.nrfi;
  const q = dataQuality(game, null);
  const score = Math.round(clamp(32 + nrfi.probability * 72 + Math.abs(0.5 - nrfi.nrfiProbability) * 45 + q * 0.12, 0, 100));
  return makePick({
    id: `${game.game.id}:${nrfi.side.toLowerCase()}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "NRFI",
    selection: nrfi.side === "NRFI" ? "NRFI lean" : "YRFI lean",
    side: nrfi.side,
    modelProbability: round(nrfi.probability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(1 - nrfi.firstInningTotalRuns, 3),
    projectedScore: state.projectedScore,
    projectedTotal: state.totalRuns,
    score,
    dataQuality: q,
    source: "simulation",
    reasons: [`canonical 1st inning ${round(nrfi.firstInningAwayRuns, 2)}-${round(nrfi.firstInningHomeRuns, 2)}`, `${nrfi.side} sim ${round(nrfi.probability * 100, 1)}%`],
    warnings: state.warnings
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
    summary: { gameCount: args.games.length, officialCount: officialPlays.length, qualifiedLeanCount: qualifiedLeans.length, watchlistCount: watchlist.length, pick3Count: pick3Parlays.length }
  };
}
