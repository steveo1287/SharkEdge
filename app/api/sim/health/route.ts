import { NextResponse } from "next/server";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { readLatestOddsApiSnapshot } from "@/services/odds/the-odds-api-budget-service";
import { getMlbTeamPlayerSummary } from "@/services/simulation/mlb-player-model";
import { compareMlbProfiles } from "@/services/simulation/mlb-team-analytics";
import { compareMlbRatings } from "@/services/simulation/mlb-ratings-blend";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimHubSnapshot,
  type SimMarketSnapshot,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIM_MAX_AGE_MINUTES = 20;
const MARKET_MAX_AGE_MINUTES = 10;
const SAMPLE_AWAY = "New York Yankees";
const SAMPLE_HOME = "Boston Red Sox";

type DbCounts = {
  ok: boolean;
  tables: Record<string, boolean>;
  counts: Record<string, number | string | null>;
  warnings: string[];
};

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageMinutes(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

function freshness(value: string | null | undefined, maxAgeMinutes: number) {
  const age = ageMinutes(value);
  return {
    generatedAt: value ?? null,
    ageMinutes: age,
    maxAgeMinutes,
    fresh: typeof age === "number" && age <= maxAgeMinutes
  };
}

function statusFromFreshness(item: { fresh: boolean; ageMinutes: number | null }) {
  if (item.ageMinutes === null) return "missing";
  return item.fresh ? "fresh" : "stale";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms))
  ]);
}

function cleanValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value as number | string | null;
}

async function tableExists(tableName: string) {
  if (!hasUsableServerDatabaseUrl()) return false;
  const rows = await prisma.$queryRaw<Array<{ exists: string | null }>>`SELECT to_regclass(${`public.${tableName}`})::text AS exists`;
  return Boolean(rows[0]?.exists);
}

async function latestColumnFor(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
  const columns = new Set(rows.map((row) => row.column_name));
  return ["updated_at", "updatedAt", "generated_at", "generatedAt", "created_at", "createdAt", "game_date", "gameDate"].find((column) => columns.has(column)) ?? null;
}

async function countTable(tableName: string) {
  if (!(await tableExists(tableName))) return { exists: false, rows: 0, latest: null };
  const latestColumn = await latestColumnFor(tableName);
  const latestSelect = latestColumn ? `, MAX("${latestColumn}") AS latest` : "";
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT COUNT(*) AS rows${latestSelect} FROM ${tableName}`);
  const row = rows[0] ?? {};
  return {
    exists: true,
    rows: Number(cleanValue(row.rows) ?? 0),
    latest: cleanValue(row.latest)
  };
}

async function dbCounts(): Promise<DbCounts> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, tables: {}, counts: {}, warnings: ["DATABASE_URL unavailable."] };
  }

  const tableNames = [
    "mlb_games",
    "mlb_probable_pitchers",
    "mlb_betting_games",
    "mlb_market_open_close",
    "mlb_trend_rows",
    "market_line_history",
    "current_market_state",
    "event_market",
    "event_market_snapshot",
    "mlb_v8_player_impact_profiles",
    "retrosheet_games",
    "mlb_team_elo_snapshots",
    "mlb_pitcher_rolling_snapshots"
  ];
  // Keep this serial. The health endpoint runs alongside refresh jobs on a small
  // Railway Postgres plan, so concurrent metadata/count probes can exhaust the
  // connection pool and make a healthy sim snapshot look broken.
  const entries: Array<readonly [string, Awaited<ReturnType<typeof countTable>>]> = [];
  const warnings: string[] = [];
  for (const name of tableNames) {
    try {
      entries.push([name, await countTable(name)] as const);
    } catch (error) {
      entries.push([name, { exists: false, rows: 0, latest: null }] as const);
      warnings.push(`Unable to inspect ${name}: ${message(error, "unknown database error")}`);
    }
  }
  const tables = Object.fromEntries(entries.map(([name, value]) => [name, value.exists]));
  const counts: Record<string, number | string | null> = {};
  for (const [name, value] of entries) {
    counts[`${name}Rows`] = value.rows;
    counts[`${name}Latest`] = value.latest;
  }
  if (!tables.market_line_history && !tables.event_market_snapshot && !tables.current_market_state) warnings.push("No durable market-line table is available for MLB market matching.");
  if (!tables.mlb_v8_player_impact_profiles) warnings.push("MLB v8 player-impact profile table is missing; player-impact weights fall back to defaults.");
  if (!tables.retrosheet_games) warnings.push("Retrosheet warehouse is missing; historical Elo/pitcher priors are not active.");
  if (!tables.mlb_team_elo_snapshots || !tables.mlb_pitcher_rolling_snapshots) warnings.push("MLB Elo/pitcher rolling snapshot tables are missing.");
  if (tables.mlb_team_elo_snapshots && Number(counts.mlb_team_elo_snapshotsRows ?? 0) <= 0) {
    warnings.push("MLB team Elo snapshot table has 0 rows; Elo priors are inactive.");
  }
  if (tables.mlb_pitcher_rolling_snapshots && Number(counts.mlb_pitcher_rolling_snapshotsRows ?? 0) <= 0) {
    warnings.push("MLB pitcher rolling snapshot table has 0 rows; starter rolling game-score priors are inactive.");
  }
  if (tables.mlb_trend_rows && Number(counts.mlb_trend_rowsRows ?? 0) <= 0) {
    warnings.push("MLB trend rows table has 0 rows; SharkTrends historical trend inventory is not populated.");
  }
  return { ok: true, tables, counts, warnings };
}

async function sourceHealth() {
  const [awayPlayers, homePlayers, profiles, ratings] = await Promise.all([
    getMlbTeamPlayerSummary(SAMPLE_AWAY),
    getMlbTeamPlayerSummary(SAMPLE_HOME),
    compareMlbProfiles(SAMPLE_AWAY, SAMPLE_HOME),
    compareMlbRatings(SAMPLE_AWAY, SAMPLE_HOME)
  ]);
  const playerSources = [awayPlayers.source, homePlayers.source];
  const teamProfileSources = [profiles.away.source, profiles.home.source];
  const ratingSources = [ratings.away.source, ratings.home.source];
  const warnings: string[] = [];
  if (!playerSources.every((source) => source === "real")) warnings.push(`Player model is ${playerSources.join("/")}; estimated/synthetic player stats are downweighted.`);
  if (!teamProfileSources.every((source) => source === "real")) warnings.push(`Team analytics are ${teamProfileSources.join("/")}; configure MLB_TEAM_ANALYTICS_URL or improve the MLB Stats API warehouse.`);
  if (!ratingSources.every((source) => source === "real")) warnings.push(`Ratings are ${ratingSources.join("/")}; synthetic ratings are display-only/low-weight.`);
  if (ratings.ratingConfidence < 0.2) warnings.push(`Ratings confidence is low (${(ratings.ratingConfidence * 100).toFixed(1)}%); Elo/rating priors should stay low-weight until coverage improves.`);
  const ratingsWarehouseReady = ratingSources.every((source) => source === "real");

  const analyticsEnvVars = {
    FANGRAPHS_PLAYER_FEED_URL: !!process.env.FANGRAPHS_PLAYER_FEED_URL?.trim(),
    MLB_TEAM_ANALYTICS_URL: !!process.env.MLB_TEAM_ANALYTICS_URL?.trim(),
    MLB_STATCAST_SPLITS_URL: !!process.env.MLB_STATCAST_SPLITS_URL?.trim(),
    MLB_TEAM_RATINGS_URL: !!process.env.MLB_TEAM_RATINGS_URL?.trim() || ratingsWarehouseReady
  };
  const missingFeeds = Object.entries(analyticsEnvVars)
    .filter(([, configured]) => !configured)
    .map(([key]) => key);
  if (missingFeeds.length > 0) {
    warnings.push(`Analytics feeds not configured: ${missingFeeds.join(", ")}. ATTACK picks will use synthetic fallback data and be blocked by the data quality gate.`);
  }

  const allSourcesReal = playerSources.every((s) => s === "real") && teamProfileSources.every((s) => s === "real");
  return {
    ok: allSourcesReal,
    sampleMatchup: `${SAMPLE_AWAY} @ ${SAMPLE_HOME}`,
    player: {
      source: playerSources.join("/"),
      awayPlayers: awayPlayers.players.length,
      homePlayers: homePlayers.players.length,
      notes: [...awayPlayers.notes.slice(0, 1), ...homePlayers.notes.slice(0, 1)]
    },
    teamAnalytics: {
      source: teamProfileSources.join("/"),
      away: profiles.away.teamName,
      home: profiles.home.teamName
    },
    ratings: {
      source: ratingSources.join("/"),
      confidence: ratings.ratingConfidence,
      note: ratingSources.every((source) => source === "real")
        ? "Real ratings source is active from feed or MLB spine Elo warehouse."
        : "Synthetic ratings are heavily downweighted and should not drive attack picks."
    },
    analyticsFeeds: {
      configured: analyticsEnvVars,
      missing: missingFeeds,
      productionReady: missingFeeds.length === 0
    },
    warnings
  };
}

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function degradedDbCounts(error: unknown): DbCounts {
  return {
    ok: false,
    tables: {},
    counts: {},
    warnings: [`Database health check failed: ${message(error, "unknown database error")}`]
  };
}

function degradedSourceHealth(error: unknown) {
  const warning = `Source health check failed: ${message(error, "unknown source error")}`;
  return {
    ok: false,
    sampleMatchup: `${SAMPLE_AWAY} @ ${SAMPLE_HOME}`,
    player: {
      source: "unknown/unknown",
      awayPlayers: 0,
      homePlayers: 0,
      notes: [warning]
    },
    teamAnalytics: {
      source: "unknown/unknown",
      away: SAMPLE_AWAY,
      home: SAMPLE_HOME
    },
    ratings: {
      source: "unknown/unknown",
      confidence: 0,
      note: "Ratings health unavailable."
    },
    warnings: [warning]
  };
}

export async function GET() {
  try {
    const [hub, priority, market, refreshStatus, db, sources, oddsSnapshot] = await Promise.all([
      readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
      readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
      readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
      readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus),
      withTimeout(dbCounts(), 12_000, "Database health check").catch(degradedDbCounts),
      withTimeout(sourceHealth(), 3_500, "Source health check").catch(degradedSourceHealth),
      withTimeout(readLatestOddsApiSnapshot(), 1_500, "Odds snapshot health check").catch(() => null)
    ]);

    const simFreshness = freshness(priority?.generatedAt ?? hub?.generatedAt ?? null, SIM_MAX_AGE_MINUTES);
    const marketFreshness = freshness(market?.generatedAt ?? null, MARKET_MAX_AGE_MINUTES);
    const refreshFailed = refreshStatus?.ok === false;
    const mlbPriorityRows = priority?.rows.filter((row) => row.leagueKey === "MLB").length ?? 0;
    const marketAvailable = (market?.lineCount ?? 0) > 0 || Number(db.counts.market_line_historyRows ?? 0) > 0 || Number(db.counts.current_market_stateRows ?? 0) > 0;
    const ok = simFreshness.fresh && sources.ok && !refreshFailed && mlbPriorityRows > 0;

    return NextResponse.json({
      ok,
      generatedAt: new Date().toISOString(),
      scope: "MLB_ONLY",
      status: ok ? "ready" : "degraded",
      sim: {
        status: statusFromFreshness(simFreshness),
        freshness: simFreshness,
        mlbPriorityRows,
        hub: hub ? { stale: hub.stale, warnings: hub.warnings, summary: hub.summary } : null,
        priority: priority ? { stale: priority.stale, warnings: priority.warnings, summary: priority.summary, rows: priority.rows.length } : null
      },
      market: {
        status: statusFromFreshness(marketFreshness),
        freshness: marketFreshness,
        available: marketAvailable,
        lineCount: market?.lineCount ?? 0,
        edgeCount: market?.edges.length ?? 0,
        gameCount: market?.gameCount ?? 0,
        oddsSnapshot: oddsSnapshot ? {
          generatedAt: oddsSnapshot.meta?.generatedAt ?? null,
          sports: oddsSnapshot.meta?.sports ?? [],
          events: oddsSnapshot.events?.length ?? 0,
          monthlyUsed: oddsSnapshot.meta?.monthlyUsed ?? null,
          monthlyLimit: oddsSnapshot.meta?.monthlyLimit ?? null
        } : null,
        warnings: market?.warnings ?? []
      },
      dataSources: sources,
      warehouse: db,
      refresh: refreshStatus ? {
        status: refreshStatus.running ? "running" : refreshStatus.ok ? "ok" : "failed",
        generatedAt: refreshStatus.generatedAt,
        lastSuccessAt: refreshStatus.lastSuccessAt,
        lastFailureAt: refreshStatus.lastFailureAt,
        reason: refreshStatus.reason ?? null,
        warnings: refreshStatus.warnings
      } : {
        status: "missing",
        generatedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        reason: "No sim refresh status snapshot found.",
        warnings: []
      },
      nextAction: ok
        ? "MLB sim stack is usable. Keep improving market-line persistence and real player analytics."
        : "Fix the degraded MLB-only inputs above before trusting attack picks."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      scope: "MLB_ONLY",
      status: "error",
      error: error instanceof Error ? error.message : "MLB sim health check failed."
    }, { status: 500 });
  }
}
