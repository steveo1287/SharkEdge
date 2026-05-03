import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { buildGuardedSimProjection as buildSimProjection } from "@/services/simulation/guarded-sim-projection-engine";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type CachedSimGameProjection,
  type SimBoardSnapshot,
  type SimMarketSnapshot
} from "@/services/simulation/sim-snapshot-service";

import {
  assessTrendQuality,
  buildTrendQualityInputFromSignal,
  mapQualityTierToTrendGrade,
  mergeTrendRisk,
  type TrendOverfitRisk,
  type TrendQualityResult,
  type TrendQualityTier
} from "./trend-quality";
import { filterTrendSignalsForOutput, summarizeTrendSignalCounts } from "./trend-signal-output";

type TrendCategory = "Moneyline" | "Totals" | "Market" | "Risk" | "Schedule" | "Model";
type TrendGrade = "A" | "B" | "C" | "Watch" | "Pass";
type BaseTrendRisk = "low" | "medium" | "high";

type TrendSignalDraft = {
  id: string;
  league: LeagueKey | "ALL";
  gameId?: string;
  startTime?: string | null;
  status?: string | null;
  matchup?: { away: string; home: string };
  title: string;
  angle: string;
  category: TrendCategory;
  grade: TrendGrade;
  confidence: number;
  hitRate: number | null;
  sample: number | null;
  edge: number | null;
  market: string | null;
  risk: BaseTrendRisk;
  source: "sim-engine" | "market-edge" | "research-pattern";
  actionHref: string;
  notes: string[];
  currentOddsAmerican?: number | null;
  fairProbability?: number | null;
  marketBreadth?: number | null;
  line?: number | null;
  sportsbook?: string | null;
};

export type TrendSignal = TrendSignalDraft & {
  qualityScore: number;
  qualityTier: TrendQualityTier;
  quality: TrendQualityResult["quality"];
  marketQuality: TrendQualityResult["market"];
  lineSensitivity: TrendQualityResult["lineSensitivity"];
  overfitRisk: TrendOverfitRisk;
  warnings: string[];
};

const RESEARCH_PATTERNS: TrendSignalDraft[] = [
  { id: "mlb-bullpen-stress-total", league: "MLB", title: "Bullpen stress total pressure", angle: "Both bullpens carrying fatigue into a projected tight run environment.", category: "Totals", grade: "B", confidence: 0.61, hitRate: 57.9, sample: 219, edge: null, market: "total", risk: "medium", source: "research-pattern", actionHref: "/sim?league=MLB", notes: ["Use only when lineup locks and starting pitchers are confirmed.", "Pairs with weather/park factor and projected total."] },
  { id: "nba-rest-spot", league: "NBA", title: "Rest advantage pressure", angle: "Rested home team versus opponent in travel/fatigue spot.", category: "Schedule", grade: "Watch", confidence: 0.54, hitRate: null, sample: null, edge: null, market: "moneyline/spread", risk: "high", source: "research-pattern", actionHref: "/sim?league=NBA", notes: ["Research-only NBA trend. It cannot become action without guarded projection, no-vig market, injury freshness, and proven accuracy bucket."] }
];

function selected(value?: "ALL" | LeagueKey) { return value ?? "ALL"; }
function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function clampConfidence(value: number) { return Number(Math.min(0.99, Math.max(0.01, value)).toFixed(3)); }
function gradeFrom(confidence: number, edge: number | null, risk: BaseTrendRisk): TrendGrade {
  if (risk === "high" || confidence < 0.54) return "Pass";
  if ((edge ?? 0) >= 0.05 && confidence >= 0.66) return "A";
  if ((edge ?? 0) >= 0.025 || confidence >= 0.6) return "B";
  return "Watch";
}
function riskFrom(volatility: number | null | undefined, noBet: boolean | undefined): BaseTrendRisk {
  if (noBet) return "high";
  if ((volatility ?? 1) >= 1.45) return "high";
  if ((volatility ?? 1) >= 1.15) return "medium";
  return "low";
}
function actionHref(league: LeagueKey, id: string) { return `/sim/${league.toLowerCase()}/${encodeURIComponent(id)}`; }
function moneylineEdgeForTeam(edge: any, team: string, matchup: { home: string; away: string }) {
  if (!edge) return null;
  if (team === matchup.home) return num(edge.edges?.homeMoneyline);
  if (team === matchup.away) return num(edge.edges?.awayMoneyline);
  return num(edge.signal?.edge);
}
function moneylineOddsForTeam(edge: any, team: string, matchup: { home: string; away: string }) {
  if (!edge?.market) return null;
  if (team === matchup.home) return num(edge.market.homeMoneyline);
  if (team === matchup.away) return num(edge.market.awayMoneyline);
  return null;
}
function totalOddsForSide(edge: any, side: "over" | "under" | "total") {
  if (!edge?.market || side === "total") return null;
  return side === "over" ? num(edge.market.overPrice) : num(edge.market.underPrice);
}
function totalMarketBreadth(edge: any) { return num(edge?.marketQuality?.totalSourceCount) ?? num(edge?.market?.totalSourceCount); }
function moneylineMarketBreadth(edge: any) { return num(edge?.marketQuality?.moneylineSourceCount) ?? num(edge?.market?.moneylineSourceCount); }

function applyTrendQuality(signal: TrendSignalDraft): TrendSignal {
  const qualityInput = buildTrendQualityInputFromSignal(signal);
  qualityInput.currentOddsAmerican = signal.currentOddsAmerican ?? null;
  qualityInput.fairProbability = signal.fairProbability ?? null;
  qualityInput.marketBreadth = signal.marketBreadth ?? qualityInput.marketBreadth;
  qualityInput.line = signal.line ?? null;
  if (qualityInput.currentEdge != null && Math.abs(qualityInput.currentEdge) > 0.25) qualityInput.currentEdge = null;
  const qualityResult = assessTrendQuality(qualityInput);
  return {
    ...signal,
    grade: mapQualityTierToTrendGrade(qualityResult.quality.tier),
    confidence: Number(Math.min(signal.confidence, Math.max(qualityResult.quality.confidence, 0.01)).toFixed(3)),
    risk: mergeTrendRisk(signal.risk, qualityResult.quality.overfitRisk),
    qualityScore: qualityResult.quality.score,
    qualityTier: qualityResult.quality.tier,
    quality: qualityResult.quality,
    marketQuality: qualityResult.market,
    lineSensitivity: qualityResult.lineSensitivity,
    overfitRisk: qualityResult.quality.overfitRisk,
    warnings: qualityResult.warnings,
    notes: [
      ...signal.notes,
      signal.currentOddsAmerican ? `Price: ${signal.currentOddsAmerican > 0 ? "+" : ""}${signal.currentOddsAmerican}${signal.sportsbook ? ` at ${signal.sportsbook}` : ""}.` : "Price: unmatched.",
      signal.fairProbability ? `Fair probability: ${(signal.fairProbability * 100).toFixed(1)}%.` : null,
      ...qualityResult.explanation.map((note) => `Quality: ${note}`),
      ...qualityResult.warnings.map((warning) => `Warning: ${warning}`),
      ...qualityResult.gateReasons.map((reason) => `Gate: ${reason}`)
    ].filter(Boolean) as string[]
  };
}

function favorite(row: CachedSimGameProjection) {
  const home = row.projection.distribution.homeWinPct;
  const away = row.projection.distribution.awayWinPct;
  return home >= away ? { team: row.projection.matchup.home, pct: home } : { team: row.projection.matchup.away, pct: away };
}
function rowConfidence(row: CachedSimGameProjection) {
  return clampConfidence(row.projection.mlbIntel?.governor?.confidence ?? row.projection.nbaIntel?.confidence ?? row.projection.realityIntel?.confidence ?? Math.max(row.projection.distribution.homeWinPct, row.projection.distribution.awayWinPct));
}
function rowTotal(row: CachedSimGameProjection) {
  return row.projection.mlbIntel?.projectedTotal ?? row.projection.nbaIntel?.projectedTotal ?? row.projection.distribution.avgAway + row.projection.distribution.avgHome;
}
function marketByGame(market: SimMarketSnapshot | null | undefined) {
  return new Map<string, any>((market?.edges ?? []).map((edge: any) => [edge.gameId, edge]));
}

function signalsFromCachedRows(rows: CachedSimGameProjection[], market: SimMarketSnapshot | null | undefined): TrendSignalDraft[] {
  const edgeMap = marketByGame(market);
  return rows.flatMap((row) => {
    const game = row.game;
    const edge = edgeMap.get(game.id);
    const fav = favorite(row);
    const confidence = rowConfidence(row);
    const risk = riskFrom(row.projection.mlbIntel?.volatilityIndex ?? row.projection.nbaIntel?.volatilityIndex ?? null, row.projection.mlbIntel?.governor?.noBet ?? row.projection.nbaIntel?.noBet ?? false);
    const marketEdge = moneylineEdgeForTeam(edge, fav.team, row.projection.matchup);
    const currentOddsAmerican = moneylineOddsForTeam(edge, fav.team, row.projection.matchup);
    const totalEdge = num(edge?.edges?.totalRuns);
    const total = rowTotal(row);
    const totalSide = totalEdge == null ? "total" : totalEdge >= 0 ? "over" : "under";
    const nbaPolicyNotes = row.projection.nbaIntel?.noBet
      ? (row.projection.nbaIntel.reasons ?? []).slice(0, 4).map((reason) => `NBA guard: ${reason}`)
      : [];
    const baseNotes = [row.projection.read, "Loaded from warmed sim cache.", edge?.signal ? `Best market signal: ${edge.signal.market} ${edge.signal.strength}.` : "No matched sportsbook market yet.", ...nbaPolicyNotes];
    const lean: TrendSignalDraft = {
      id: `${game.leagueKey}-${game.id}-cached-lean`,
      league: game.leagueKey,
      gameId: game.id,
      startTime: game.startTime,
      status: game.status,
      matchup: row.projection.matchup,
      title: `${fav.team} cached model lean`,
      angle: `${row.projection.matchup.away} @ ${row.projection.matchup.home}: cached sim probability favors ${fav.team} at ${(fav.pct * 100).toFixed(1)}%.`,
      category: "Moneyline",
      grade: gradeFrom(confidence, marketEdge, risk),
      confidence,
      hitRate: null,
      sample: null,
      edge: marketEdge,
      market: fav.team === row.projection.matchup.home ? "home_ml" : "away_ml",
      risk,
      source: currentOddsAmerican != null ? "market-edge" : "sim-engine",
      actionHref: actionHref(game.leagueKey, game.id),
      notes: baseNotes,
      currentOddsAmerican,
      fairProbability: fav.pct,
      marketBreadth: moneylineMarketBreadth(edge),
      sportsbook: edge?.sportsbook ?? null
    };
    const totalSignal: TrendSignalDraft = {
      id: `${game.leagueKey}-${game.id}-cached-total`,
      league: game.leagueKey,
      gameId: game.id,
      startTime: game.startTime,
      status: game.status,
      matchup: row.projection.matchup,
      title: `${row.projection.matchup.away} / ${row.projection.matchup.home} cached total`,
      angle: `Cached projected total ${total.toFixed(1)} with model confidence ${(confidence * 100).toFixed(1)}%.`,
      category: "Totals",
      grade: gradeFrom(confidence, totalEdge == null ? null : Math.abs(totalEdge) / 10, risk),
      confidence,
      hitRate: null,
      sample: null,
      edge: totalEdge,
      market: totalSide,
      risk,
      source: totalOddsForSide(edge, totalSide) == null ? "sim-engine" : "market-edge",
      actionHref: actionHref(game.leagueKey, game.id),
      notes: [totalEdge == null ? "Needs sportsbook total to calculate edge." : `Model total edge ${totalEdge.toFixed(2)} runs/points.`, "Loaded from warmed sim cache.", ...nbaPolicyNotes],
      currentOddsAmerican: totalOddsForSide(edge, totalSide),
      fairProbability: null,
      marketBreadth: totalMarketBreadth(edge),
      line: num(edge?.market?.total),
      sportsbook: edge?.sportsbook ?? null
    };
    return [lean, totalSignal];
  });
}

async function loadCachedRows(league: LeagueKey | "ALL") {
  const [nbaBoard, mlbBoard, market] = await Promise.all([
    league === "ALL" || league === "NBA" ? readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.nbaBoard) : Promise.resolve(null),
    league === "ALL" || league === "MLB" ? readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard) : Promise.resolve(null),
    league === "ALL" || league === "MLB" ? readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market) : Promise.resolve(null)
  ]);
  const rows = [...(nbaBoard?.games ?? []), ...(mlbBoard?.games ?? [])].filter((row) => league === "ALL" || row.game.leagueKey === league);
  return { rows, market, stale: Boolean(nbaBoard?.stale || mlbBoard?.stale || market?.stale), cacheHits: { nba: Boolean(nbaBoard?.games?.length), mlb: Boolean(mlbBoard?.games?.length), market: Boolean(market?.edges?.length) } };
}

async function buildLiveBoardSignals(league: LeagueKey | "ALL") {
  const [sections, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: league, gamesByLeague: {}, maxScoreboardGames: null }),
    league === "ALL" || league === "MLB" ? buildMlbEdges().catch(() => ({ edges: [] as any[] })) : Promise.resolve({ edges: [] as any[] })
  ]);
  const edgeMap = new Map<string, any>((edgeData.edges ?? []).map((edge: any) => [edge.gameId, edge]));
  const games = sections.flatMap((section) => section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })));
  const rows: TrendSignalDraft[] = [];
  for (const game of games) {
    const projection = await buildSimProjection(game);
    const edge = edgeMap.get(game.id);
    const home = projection.distribution.homeWinPct;
    const away = projection.distribution.awayWinPct;
    const fav = home >= away ? { team: projection.matchup.home, pct: home } : { team: projection.matchup.away, pct: away };
    const mlbIntel = projection.mlbIntel;
    const nbaIntel = projection.nbaIntel;
    const confidence = clampConfidence(mlbIntel?.governor?.confidence ?? nbaIntel?.confidence ?? projection.realityIntel?.confidence ?? fav.pct);
    const risk = riskFrom(mlbIntel?.volatilityIndex ?? nbaIntel?.volatilityIndex ?? projection.realityIntel?.volatilityIndex, mlbIntel?.governor?.noBet ?? nbaIntel?.noBet ?? false);
    const marketEdge = moneylineEdgeForTeam(edge, fav.team, projection.matchup);
    const currentOddsAmerican = moneylineOddsForTeam(edge, fav.team, projection.matchup);
    const nbaPolicyNotes = nbaIntel?.noBet
      ? (nbaIntel.reasons ?? []).slice(0, 4).map((reason) => `NBA guard: ${reason}`)
      : [];
    rows.push({
      id: `${game.leagueKey}-${game.id}-model-lean`,
      league: game.leagueKey,
      gameId: game.id,
      startTime: game.startTime,
      status: game.status,
      matchup: projection.matchup,
      title: `${fav.team} model lean`,
      angle: `${projection.matchup.away} @ ${projection.matchup.home}: model probability favors ${fav.team} at ${(fav.pct * 100).toFixed(1)}%.`,
      category: "Moneyline",
      grade: gradeFrom(confidence, marketEdge, risk),
      confidence,
      hitRate: null,
      sample: null,
      edge: marketEdge,
      market: fav.team === projection.matchup.home ? "home_ml" : "away_ml",
      risk,
      source: currentOddsAmerican != null ? "market-edge" : "sim-engine",
      actionHref: actionHref(game.leagueKey, game.id),
      notes: [projection.read, edge?.signal ? `Best market signal: ${edge.signal.market} ${edge.signal.strength}.` : "No matched sportsbook market yet.", ...nbaPolicyNotes],
      currentOddsAmerican,
      fairProbability: fav.pct,
      marketBreadth: moneylineMarketBreadth(edge),
      sportsbook: edge?.sportsbook ?? null
    });
  }
  return rows;
}

export async function buildTrendSignals(args: { league?: "ALL" | LeagueKey; includeResearch?: boolean; includeHidden?: boolean } = {}) {
  const league = selected(args.league);
  const cached = await loadCachedRows(league).catch(() => ({ rows: [], market: null, stale: false, cacheHits: { nba: false, mlb: false, market: false } }));
  const liveSignals = cached.rows.length ? signalsFromCachedRows(cached.rows, cached.market) : await buildLiveBoardSignals(league);
  const research = args.includeResearch === false ? [] : RESEARCH_PATTERNS.filter((trend) => league === "ALL" || trend.league === league);
  const allSignals = [...liveSignals, ...research].map(applyTrendQuality).sort((a, b) => {
    const gradeRank = { A: 5, B: 4, Watch: 3, C: 2, Pass: 1 } as Record<TrendGrade, number>;
    return gradeRank[b.grade] - gradeRank[a.grade] || b.qualityScore - a.qualityScore || b.confidence - a.confidence;
  });
  const signals = filterTrendSignalsForOutput(allSignals, args.includeHidden);
  const counts = summarizeTrendSignalCounts(allSignals, signals);
  return {
    ok: true,
    league,
    generatedAt: new Date().toISOString(),
    counts: { ...counts, live: liveSignals.length, research: research.length, source: cached.rows.length ? "sim-cache" : "live-board", cacheStale: cached.stale, cacheHits: cached.cacheHits },
    signals
  };
}
