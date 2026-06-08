import type { CachedSimGameProjection, SimMarketSnapshot } from "@/services/simulation/sim-snapshot-service";

export type MlbSimPickMarket = "MONEYLINE" | "OVER_UNDER" | "F5_MONEYLINE" | "F5_TOTAL" | "NRFI";
export type MlbSimPickTier = "OFFICIAL" | "QUALIFIED_LEAN" | "WATCHLIST" | "PASS";
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
  confidence: number;
  score: number;
  dataQuality: number;
  source: "market" | "derived";
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
  modelVersion: "mlb-sim-pick-selector-v1";
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

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function safeNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function decimalOdds(american: number | null | undefined) { if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null; return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american); }
function americanToProb(american: number | null | undefined) { if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null; return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100); }
function fairAmerican(probability: number) {
  const p = clamp(probability, 0.001, 0.999);
  return p >= 0.5 ? Math.round(-100 * p / (1 - p)) : Math.round(100 * (1 - p) / p);
}
function ev(probability: number, american: number | null | undefined) {
  const decimal = decimalOdds(american);
  if (!decimal) return null;
  return probability * (decimal - 1) - (1 - probability);
}
function noVigTotal(overOdds: number | null | undefined, underOdds: number | null | undefined) {
  const over = americanToProb(overOdds);
  const under = americanToProb(underOdds);
  if (over == null || under == null) return null;
  const sum = over + under;
  if (sum <= 0) return null;
  return { over: over / sum, under: under / sum };
}
function edgeToMap(edges: Edge[]) { return new Map(edges.map((edge) => [edge.gameId, edge])); }
function market(edge: Edge | null | undefined): MarketLike { return (edge?.market ?? {}) as MarketLike; }
function matchupLabel(game: CachedSimGameProjection) { return `${game.projection.matchup.away} @ ${game.projection.matchup.home}`; }
function projectedTotal(game: CachedSimGameProjection) { return safeNumber(game.projection.mlbIntel?.projectedTotal) ?? game.projection.distribution.avgAway + game.projection.distribution.avgHome; }
function dataQuality(game: CachedSimGameProjection, edge: Edge | null | undefined, source: "market" | "derived") {
  const governor = game.projection.mlbIntel?.governor;
  const confidence = safeNumber(governor?.confidence) ?? game.projection.mlbIntel?.confidence ?? 0.42;
  const calibration = game.projection.mlbIntel?.calibration?.ece != null ? 8 : 0;
  const marketLift = edge ? 12 : 0;
  const sourcePenalty = source === "derived" ? -10 : 0;
  return Math.round(clamp(44 + confidence * 40 + calibration + marketLift + sourcePenalty, 0, 100));
}
function tier(score: number, evValue: number | null, dataQualityValue: number, source: "market" | "derived", confidence: number): MlbSimPickTier {
  if (source === "market" && evValue != null && evValue > 0.035 && score >= 78 && dataQualityValue >= 62 && confidence >= 0.55) return "OFFICIAL";
  if (evValue != null && evValue > 0.012 && score >= 58 && dataQualityValue >= 48) return "QUALIFIED_LEAN";
  if (source === "derived" && score >= 60 && confidence >= 0.45) return "QUALIFIED_LEAN";
  if (score >= 43) return "WATCHLIST";
  return "PASS";
}
function confidenceFrom(score: number, quality: number, source: "market" | "derived") {
  const cap = source === "derived" ? 0.62 : 0.78;
  return round(clamp(0.28 + score / 180 + quality / 420, 0.22, cap), 3);
}
function makePick(args: Omit<MlbSimPick, "tier" | "confidence"> & { confidence?: number }) {
  const confidence = args.confidence ?? confidenceFrom(args.score, args.dataQuality, args.source);
  return { ...args, confidence, tier: tier(args.score, args.expectedValue, args.dataQuality, args.source, confidence) } satisfies MlbSimPick;
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
  const expectedValue = ev(modelProbability, odds);
  const source = odds == null ? "derived" : "market";
  const q = dataQuality(game, edge, source);
  const score = Math.round(clamp(42 + (edgeValue ?? 0.025) * 520 + (expectedValue ?? 0) * 650 + q * 0.2, 0, 100));
  const side = homeSide ? "HOME" : "AWAY";
  return makePick({
    id: `${game.game.id}:moneyline:${side}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "MONEYLINE",
    selection: homeSide ? game.projection.matchup.home : game.projection.matchup.away,
    side,
    modelProbability: round(modelProbability),
    marketProbability: marketProbability == null ? null : round(marketProbability),
    americanOdds: odds,
    expectedValue: expectedValue == null ? null : round(expectedValue),
    edge: edgeValue == null ? null : round(edgeValue),
    projectedRunEdge: null,
    score,
    dataQuality: q,
    source,
    reasons: [`model win ${round(modelProbability * 100, 1)}%`, edgeValue == null ? "no market edge" : `edge ${round(edgeValue * 100, 1)}%`],
    warnings: source === "derived" ? ["moneyline odds missing; derived only"] : []
  });
}

function fullGameTotalPick(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick | null {
  const m = market(edge);
  const total = safeNumber(m.total);
  if (total == null) return null;
  const projection = projectedTotal(game);
  const runEdge = projection - total;
  const over = runEdge >= 0;
  const probs = noVigTotal(m.overPrice, m.underPrice);
  const modelProbability = clamp(0.5 + Math.abs(runEdge) * 0.095, 0.5, 0.89);
  const marketProbability = over ? probs?.over ?? null : probs?.under ?? null;
  const odds = over ? safeNumber(m.overPrice) : safeNumber(m.underPrice);
  const expectedValue = ev(modelProbability, odds);
  const q = dataQuality(game, edge, "market");
  const edgeValue = marketProbability == null ? null : modelProbability - marketProbability;
  const score = Math.round(clamp(40 + Math.abs(runEdge) * 13 + (expectedValue ?? 0) * 500 + (edgeValue ?? 0) * 280 + q * 0.16, 0, 100));
  return makePick({
    id: `${game.game.id}:ou:${over ? "over" : "under"}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "OVER_UNDER",
    selection: `${over ? "Over" : "Under"} ${total}`,
    side: over ? "OVER" : "UNDER",
    modelProbability: round(modelProbability),
    marketProbability: marketProbability == null ? null : round(marketProbability),
    americanOdds: odds,
    expectedValue: expectedValue == null ? null : round(expectedValue),
    edge: edgeValue == null ? null : round(edgeValue),
    projectedRunEdge: round(over ? runEdge : -runEdge, 3),
    score,
    dataQuality: q,
    source: "market",
    reasons: [`projected ${round(projection, 1)} vs line ${total}`, `run edge ${round(Math.abs(runEdge), 2)}`],
    warnings: []
  });
}

function f5MoneylinePick(game: CachedSimGameProjection): MlbSimPick {
  const away = game.projection.distribution.avgAway * 0.55;
  const home = game.projection.distribution.avgHome * 0.55;
  const diff = home - away;
  const homeSide = diff >= 0;
  const modelProbability = clamp(0.5 + Math.abs(diff) * 0.13, 0.5, 0.76);
  const q = dataQuality(game, null, "derived");
  const score = Math.round(clamp(38 + Math.abs(diff) * 36 + modelProbability * 28 + q * 0.18, 0, 100));
  return makePick({
    id: `${game.game.id}:f5ml:${homeSide ? "home" : "away"}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "F5_MONEYLINE",
    selection: `${homeSide ? game.projection.matchup.home : game.projection.matchup.away} F5 ML`,
    side: homeSide ? "HOME_F5" : "AWAY_F5",
    modelProbability: round(modelProbability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(Math.abs(diff), 3),
    score,
    dataQuality: q,
    source: "derived",
    reasons: [`F5 projected ${round(away, 1)}-${round(home, 1)}`, `F5 run diff ${round(Math.abs(diff), 2)}`],
    warnings: ["F5 odds not wired yet; model-derived pick"]
  });
}

function f5TotalPick(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick | null {
  const fullLine = safeNumber(market(edge).total);
  if (fullLine == null) return null;
  const projection = projectedTotal(game) * 0.55;
  const line = round(fullLine * 0.55, 1);
  const runEdge = projection - line;
  const over = runEdge >= 0;
  const modelProbability = clamp(0.5 + Math.abs(runEdge) * 0.12, 0.5, 0.78);
  const q = dataQuality(game, edge, "derived");
  const score = Math.round(clamp(37 + Math.abs(runEdge) * 18 + modelProbability * 28 + q * 0.16, 0, 100));
  return makePick({
    id: `${game.game.id}:f5total:${over ? "over" : "under"}`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "F5_TOTAL",
    selection: `F5 ${over ? "Over" : "Under"} ${line}`,
    side: over ? "F5_OVER" : "F5_UNDER",
    modelProbability: round(modelProbability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(Math.abs(runEdge), 3),
    score,
    dataQuality: q,
    source: "derived",
    reasons: [`derived F5 total ${round(projection, 1)} vs ${line}`, `F5 edge ${round(Math.abs(runEdge), 2)}`],
    warnings: ["F5 total odds not wired yet; model-derived pick"]
  });
}

function nrfiPick(game: CachedSimGameProjection): MlbSimPick {
  const total = projectedTotal(game);
  const firstInningLambda = clamp(total * 0.118, 0.55, 1.85);
  const nrfiProbability = clamp(Math.exp(-firstInningLambda), 0.18, 0.64);
  const q = dataQuality(game, null, "derived");
  const score = Math.round(clamp(30 + nrfiProbability * 70 + (0.8 - firstInningLambda) * 12 + q * 0.12, 0, 100));
  return makePick({
    id: `${game.game.id}:nrfi`,
    gameId: game.game.id,
    gameLabel: matchupLabel(game),
    startTime: game.game.startTime,
    market: "NRFI",
    selection: "NRFI",
    side: "NRFI",
    modelProbability: round(nrfiProbability),
    marketProbability: null,
    americanOdds: null,
    expectedValue: null,
    edge: null,
    projectedRunEdge: round(1 - firstInningLambda, 3),
    score,
    dataQuality: q,
    source: "derived",
    reasons: [`first-inning run lambda ${round(firstInningLambda, 2)}`, `NRFI model ${round(nrfiProbability * 100, 1)}%`],
    warnings: ["NRFI odds not wired yet; model-derived pick"]
  });
}

function pickRank(pick: MlbSimPick) {
  const tierBoost = pick.tier === "OFFICIAL" ? 1000 : pick.tier === "QUALIFIED_LEAN" ? 650 : pick.tier === "WATCHLIST" ? 300 : 0;
  return tierBoost + pick.score + pick.confidence * 60 + (pick.expectedValue ?? 0) * 100;
}
function buildGamePicks(game: CachedSimGameProjection, edge: Edge | null): MlbSimPick[] {
  return [moneylinePick(game, edge), fullGameTotalPick(game, edge), f5MoneylinePick(game), f5TotalPick(game, edge), nrfiPick(game)].filter((pick): pick is MlbSimPick => Boolean(pick));
}
function uncorrelated(picks: MlbSimPick[]) { const games = new Set<string>(); return picks.filter((pick) => { if (games.has(pick.gameId)) return false; games.add(pick.gameId); return true; }); }
function buildPick3Parlays(picks: MlbSimPick[]): MlbPick3Parlay[] {
  const pool = uncorrelated(picks.filter((pick) => pick.tier === "OFFICIAL" || pick.tier === "QUALIFIED_LEAN").sort((a, b) => pickRank(b) - pickRank(a))).slice(0, 9);
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
      warnings: legs.some((leg) => leg.source === "derived") ? ["contains derived-market leg; verify available odds before betting"] : []
    });
  }
  return parlays.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function buildMlbDailySimPickBoard(args: { games: CachedSimGameProjection[]; edges?: Edge[]; generatedAt?: string }): MlbDailySimPickBoard {
  const edgeMap = edgeToMap(args.edges ?? []);
  const allPicks = args.games.flatMap((game) => buildGamePicks(game, edgeMap.get(game.game.id) ?? null)).sort((a, b) => pickRank(b) - pickRank(a));
  const officialPlays = allPicks.filter((pick) => pick.tier === "OFFICIAL").slice(0, 3);
  const qualifiedLeans = allPicks.filter((pick) => pick.tier === "QUALIFIED_LEAN").slice(0, Math.max(2, 5 - officialPlays.length));
  const watchlist = allPicks.filter((pick) => pick.tier === "WATCHLIST").slice(0, 8);
  const pick3Parlays = buildPick3Parlays([...officialPlays, ...qualifiedLeans, ...watchlist]);
  return {
    modelVersion: "mlb-sim-pick-selector-v1",
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
