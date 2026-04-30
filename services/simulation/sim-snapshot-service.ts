import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import {
  buildMlbEdgesFromProjections,
  fetchMlbSportsbookLines,
  type MlbEdgeGame,
  type MlbEdgeProjection
} from "@/services/simulation/mlb-edge-detector";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

export const SIM_CACHE_KEYS = {
  hub: "sim:hub:v1",
  priority: "sim:priority:v1",
  nbaBoard: "sim:nba:board:v1",
  mlbBoard: "sim:mlb:board:v1",
  lastRefresh: "sim:last-refresh:v1",
  refreshStatus: "sim:refresh-status:v1",
  market: "sim:market:v1"
} as const;

const FULL_SIM_TTL_SECONDS = 75 * 60;
const MARKET_TTL_SECONDS = 15 * 60;

// Keep snapshots readable after their logical expiry so /sim can show a stale-but-useful slate.
const FULL_SIM_RETENTION_SECONDS = 6 * 60 * 60;
const MARKET_RETENTION_SECONDS = 90 * 60;
const MAX_PRIORITY_ROWS = 10;

export type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
};

type FullProjection = Awaited<ReturnType<typeof buildSimProjection>>;

export type CachedSimProjection = {
  matchup: FullProjection["matchup"];
  distribution: FullProjection["distribution"];
  read: string;
  statSheet: FullProjection["statSheet"];
  nbaIntel: null | {
    modelVersion: string;
    dataSource: string;
    confidence: number;
    noBet: boolean;
    tier: "attack" | "watch" | "pass";
    reasons: string[];
    projectedTotal: number;
    volatilityIndex: number;
    playerStatProjectionCount: number;
  };
  realityIntel?: FullProjection["realityIntel"];
  mlbIntel?: FullProjection["mlbIntel"];
};

export type CachedSimGameProjection = {
  game: SimGame;
  projection: CachedSimProjection;
};

export type SimPriorityRow = {
  id: string;
  leagueKey: LeagueKey;
  status: string;
  startTime: string;
  matchup: { away: string; home: string };
  lean: { team: string; pct: number; edge: number };
  tier: string;
  confidence: number | null;
  homeEdge: number | null;
  edgeMatched: boolean;
  href: string;
};

export type SimSnapshotEnvelope<T> = {
  generatedAt: string;
  expiresAt: string;
  stale: boolean;
  warnings: string[];
  sourceStatus: Record<string, unknown>;
} & T;

export type SimHubSnapshot = SimSnapshotEnvelope<{
  summary: {
    nbaCount: number;
    mlbCount: number;
    priorityCount: number;
    matchedMlbLines: number;
  };
}>;

export type SimBoardSnapshot = SimSnapshotEnvelope<{
  games: CachedSimGameProjection[];
}>;

export type SimPrioritySnapshot = SimSnapshotEnvelope<{
  rows: SimPriorityRow[];
  summary: {
    gameCount: number;
    rowCount: number;
    nbaCount: number;
    mlbCount: number;
    matchedMlbLines: number;
  };
}>;

export type SimMarketSnapshot = SimSnapshotEnvelope<{
  edges: Awaited<ReturnType<typeof buildMlbEdgesFromProjections>>["edges"];
  lineCount: number;
  gameCount: number;
}>;

export type SimRefreshStatusSnapshot = SimSnapshotEnvelope<{
  ok: boolean;
  running: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  reason?: string;
}>;

function logTiming(prefix: string, label: string, startedAt: number) {
  console.info(`[${prefix}] ${label} ${Date.now() - startedAt}ms`);
}

function expiresAt(secondsFromNow: number) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

export function isSnapshotStale(snapshot: { expiresAt?: string | null } | null | undefined) {
  if (!snapshot?.expiresAt) return true;
  return new Date(snapshot.expiresAt).getTime() <= Date.now();
}

export function markSnapshotState<T extends { expiresAt?: string; stale?: boolean }>(snapshot: T | null): (T & { stale: boolean }) | null {
  if (!snapshot) return null;
  return { ...snapshot, stale: isSnapshotStale(snapshot) };
}

export async function readSimCache<T extends { expiresAt?: string; stale?: boolean }>(key: string) {
  const startedAt = Date.now();
  const value = markSnapshotState(await readHotCache<T>(key));
  console.info(`[sim-cache] read ${key} ${value ? "hit" : "miss"}${value?.stale ? " stale" : ""}`);
  logTiming("sim-cache", `read ${key}`, startedAt);
  return value;
}

async function writeSimCache<T>(key: string, value: T, ttlSeconds: number) {
  const startedAt = Date.now();
  await writeHotCache(key, value, ttlSeconds);
  console.info(`[sim-cache] write ${key} ttl=${ttlSeconds}s`);
  logTiming("sim-cache", `write ${key}`, startedAt);
}

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) =>
    section.scoreboard.map((game) => ({
      ...game,
      leagueKey: section.leagueKey,
      leagueLabel: section.leagueLabel
    }))
  );
}

function compactProjection(projection: FullProjection): CachedSimProjection {
  return {
    matchup: projection.matchup,
    distribution: projection.distribution,
    read: projection.read,
    statSheet: projection.statSheet,
    nbaIntel: projection.nbaIntel
      ? {
        modelVersion: projection.nbaIntel.modelVersion,
        dataSource: projection.nbaIntel.dataSource,
        confidence: projection.nbaIntel.confidence,
        noBet: projection.nbaIntel.noBet,
        tier: projection.nbaIntel.tier,
        reasons: projection.nbaIntel.reasons,
        projectedTotal: projection.nbaIntel.projectedTotal,
        volatilityIndex: projection.nbaIntel.volatilityIndex,
        playerStatProjectionCount: projection.nbaIntel.playerStatProjections.length
      }
      : null,
    realityIntel: projection.realityIntel,
    mlbIntel: projection.mlbIntel
  };
}

function asMlbProjection(projection: CachedSimProjection): MlbEdgeProjection {
  return {
    matchup: projection.matchup,
    distribution: projection.distribution,
    mlbIntel: projection.mlbIntel
  };
}

function decisionTier(row: CachedSimGameProjection) {
  if (row.game.leagueKey === "MLB") {
    const governor = row.projection.mlbIntel?.governor;
    if (governor?.noBet || governor?.tier === "pass") return "pass";
    if (governor?.tier === "attack") return "attack";
    return "watch";
  }
  return row.projection.nbaIntel?.tier ?? "pass";
}

function tierRank(tier: string | undefined) {
  if (tier === "attack") return 3;
  if (tier === "watch") return 2;
  return 1;
}

function winLean(projection: CachedSimProjection) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home, edge: home - away }
    : { team: projection.matchup.away, pct: away, edge: away - home };
}

function confidence(projection: CachedSimProjection) {
  return projection.mlbIntel?.governor?.confidence ?? projection.nbaIntel?.confidence ?? projection.realityIntel?.confidence ?? null;
}

function buildPriorityRows(rows: CachedSimGameProjection[], edges: SimMarketSnapshot["edges"]) {
  const edgeByGame = new Map((edges ?? []).map((edge) => [edge.gameId, edge]));
  return rows
    .sort((left, right) => {
      const leftTier = tierRank(decisionTier(left));
      const rightTier = tierRank(decisionTier(right));
      if (leftTier !== rightTier) return rightTier - leftTier;
      return Math.abs(winLean(right.projection).edge) - Math.abs(winLean(left.projection).edge);
    })
    .slice(0, MAX_PRIORITY_ROWS)
    .map((row) => {
      const lean = winLean(row.projection);
      const edge = edgeByGame.get(row.game.id);
      return {
        id: row.game.id,
        leagueKey: row.game.leagueKey,
        status: row.game.status,
        startTime: row.game.startTime,
        matchup: row.projection.matchup,
        lean,
        tier: decisionTier(row),
        confidence: confidence(row.projection),
        homeEdge: row.projection.mlbIntel?.homeEdge ?? null,
        edgeMatched: Boolean(edge?.market),
        href: row.game.leagueKey === "NBA" ? `/sim/nba/${encodeURIComponent(row.game.id)}` : `/sim/mlb/${encodeURIComponent(row.game.id)}`
      };
    });
}

async function writeRefreshStatus(status: Omit<SimRefreshStatusSnapshot, "generatedAt" | "expiresAt" | "stale">) {
  const generatedAt = new Date().toISOString();
  const previous = await readHotCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus);
  await writeSimCache<SimRefreshStatusSnapshot>(
    SIM_CACHE_KEYS.refreshStatus,
    {
      generatedAt,
      expiresAt: expiresAt(FULL_SIM_TTL_SECONDS),
      stale: false,
      ...status,
      lastSuccessAt: status.lastSuccessAt ?? previous?.lastSuccessAt ?? null,
      lastFailureAt: status.lastFailureAt ?? previous?.lastFailureAt ?? null,
    },
    FULL_SIM_RETENTION_SECONDS
  );
}

export async function refreshFullSimSnapshots() {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();
  const expires = expiresAt(FULL_SIM_TTL_SECONDS);
  const warnings: string[] = [];
  const sourceStatus: Record<string, unknown> = {};

  await writeRefreshStatus({
    ok: true,
    running: true,
    lastSuccessAt: null,
    lastFailureAt: null,
    warnings: [],
    sourceStatus: { phase: "running" }
  });

  let games: SimGame[] = [];
  try {
    const boardStartedAt = Date.now();
    const sections = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {}, maxScoreboardGames: null });
    logTiming("sim-refresh", "buildBoardSportSections", boardStartedAt);
    games = flatten(sections).filter((game) => game.leagueKey === "NBA" || game.leagueKey === "MLB");
    sourceStatus.board = { ok: true, gameCount: games.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown board error";
    warnings.push(`Board sections failed: ${reason}`);
    sourceStatus.board = { ok: false, reason };
  }

  const settledStartedAt = Date.now();
  const settled = await Promise.allSettled(
    games.map(async (game) => ({ game, projection: compactProjection(await buildSimProjection(game)) }))
  );
  logTiming("sim-refresh", "buildSimProjection batch", settledStartedAt);

  const rows: CachedSimGameProjection[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      rows.push(result.value);
    } else {
      warnings.push(`Projection failed: ${result.reason instanceof Error ? result.reason.message : "unknown projection error"}`);
    }
  }

  const nbaRows = rows.filter((row) => row.game.leagueKey === "NBA");
  const mlbRows = rows.filter((row) => row.game.leagueKey === "MLB");
  const projectionsByGameId = new Map<string, MlbEdgeProjection>(
    mlbRows.map((row) => [row.game.id, asMlbProjection(row.projection)])
  );

  const marketStartedAt = Date.now();
  let marketEdges: SimMarketSnapshot["edges"] = [];
  let lineCount = 0;
  try {
    const edgeData = mlbRows.length
      ? await buildMlbEdgesFromProjections({
        games: mlbRows.map((row) => row.game as MlbEdgeGame),
        projectionsByGameId,
        allowLineRefresh: false
      })
      : { ok: true, lineCount: 0, gameCount: 0, edges: [] };
    marketEdges = edgeData.edges;
    lineCount = edgeData.lineCount;
    sourceStatus.market = { ok: true, lineCount, edgeCount: marketEdges.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown market overlay error";
    warnings.push(`MLB market overlay failed: ${reason}`);
    sourceStatus.market = { ok: false, reason };
  }
  logTiming("sim-refresh", "MLB edge/market overlay", marketStartedAt);

  const priorityRows = buildPriorityRows(rows, marketEdges);
  const matchedMlbLines = priorityRows.filter((row) => row.leagueKey === "MLB" && row.edgeMatched).length;

  const nbaBoard: SimBoardSnapshot = { generatedAt, expiresAt: expires, stale: false, games: nbaRows, warnings, sourceStatus };
  const mlbBoard: SimBoardSnapshot = { generatedAt, expiresAt: expires, stale: false, games: mlbRows, warnings, sourceStatus };
  const priority: SimPrioritySnapshot = {
    generatedAt,
    expiresAt: expires,
    stale: false,
    rows: priorityRows,
    warnings,
    sourceStatus,
    summary: {
      gameCount: rows.length,
      rowCount: priorityRows.length,
      nbaCount: nbaRows.length,
      mlbCount: mlbRows.length,
      matchedMlbLines
    }
  };
  const hub: SimHubSnapshot = {
    generatedAt,
    expiresAt: expires,
    stale: false,
    warnings,
    sourceStatus,
    summary: {
      nbaCount: nbaRows.length,
      mlbCount: mlbRows.length,
      priorityCount: priorityRows.length,
      matchedMlbLines
    }
  };
  const market: SimMarketSnapshot = {
    generatedAt,
    expiresAt: expiresAt(MARKET_TTL_SECONDS),
    stale: false,
    warnings,
    sourceStatus,
    edges: marketEdges,
    lineCount,
    gameCount: mlbRows.length
  };

  await Promise.all([
    writeSimCache(SIM_CACHE_KEYS.nbaBoard, nbaBoard, FULL_SIM_RETENTION_SECONDS),
    writeSimCache(SIM_CACHE_KEYS.mlbBoard, mlbBoard, FULL_SIM_RETENTION_SECONDS),
    writeSimCache(SIM_CACHE_KEYS.priority, priority, FULL_SIM_RETENTION_SECONDS),
    writeSimCache(SIM_CACHE_KEYS.hub, hub, FULL_SIM_RETENTION_SECONDS),
    writeSimCache(SIM_CACHE_KEYS.market, market, MARKET_RETENTION_SECONDS),
    writeSimCache(SIM_CACHE_KEYS.lastRefresh, { generatedAt, expiresAt: expires, stale: false, warnings, sourceStatus }, FULL_SIM_RETENTION_SECONDS)
  ]);

  await writeRefreshStatus({
    ok: warnings.length === 0,
    running: false,
    lastSuccessAt: generatedAt,
    lastFailureAt: warnings.length ? generatedAt : null,
    reason: warnings[0],
    warnings,
    sourceStatus
  });

  logTiming("sim-refresh", "total", startedAt);
  return { ok: true, warnings, summary: hub.summary };
}

export async function refreshSimMarketSnapshot() {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();
  const expires = expiresAt(MARKET_TTL_SECONDS);
  const warnings: string[] = [];
  const sourceStatus: Record<string, unknown> = {};

  try {
    const cacheStartedAt = Date.now();
    const mlbBoard = await readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard);
    logTiming("sim-market-refresh", "cache read board snapshots", cacheStartedAt);
    if (!mlbBoard?.games?.length) {
      throw new Error("missing MLB base projection snapshot");
    }

    const lineStartedAt = Date.now();
    const lines = await fetchMlbSportsbookLines({ allowRefresh: false });
    logTiming("sim-market-refresh", "fetchLines", lineStartedAt);

    const projectionsByGameId = new Map<string, MlbEdgeProjection>(
      mlbBoard.games.map((row) => [row.game.id, asMlbProjection(row.projection)])
    );
    const edgeStartedAt = Date.now();
    const edgeData = await buildMlbEdgesFromProjections({
      games: mlbBoard.games.map((row) => row.game as MlbEdgeGame),
      projectionsByGameId,
      lines,
      allowLineRefresh: false
    });
    logTiming("sim-market-refresh", "MLB edge/market overlay", edgeStartedAt);

    const payload: SimMarketSnapshot = {
      generatedAt,
      expiresAt: expires,
      stale: false,
      warnings,
      sourceStatus: { ...sourceStatus, mlbBoard: { ok: true, gameCount: mlbBoard.games.length } },
      edges: edgeData.edges,
      lineCount: edgeData.lineCount,
      gameCount: edgeData.gameCount
    };
    await writeSimCache(SIM_CACHE_KEYS.market, payload, MARKET_RETENTION_SECONDS);
    await writeRefreshStatus({
      ok: true,
      running: false,
      lastSuccessAt: generatedAt,
      lastFailureAt: null,
      warnings,
      sourceStatus: payload.sourceStatus
    });
    logTiming("sim-market-refresh", "total", startedAt);
    return { ok: true, warnings, lineCount: payload.lineCount, gameCount: payload.gameCount };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown market refresh error";
    console.error("[sim-market-refresh] failed", error);
    await writeRefreshStatus({
      ok: false,
      running: false,
      lastSuccessAt: null,
      lastFailureAt: generatedAt,
      reason,
      warnings: [reason],
      sourceStatus
    });
    logTiming("sim-market-refresh", "total", startedAt);
    return { ok: false, warnings: [reason], lineCount: 0, gameCount: 0 };
  }
}
