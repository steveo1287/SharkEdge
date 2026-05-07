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
} from "@/services/simulation/sim-snapshot-service";

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
  const entries = await Promise.all(tableNames.map(async (name) => [name, await countTable(name)] as const));
  const tables = Object.fromEntries(entries.map(([name, value]) => [name, value.exists]));
  const counts: Record<string, number | string | null> = {};
  for (const [name, value] of entries) {
    counts[`${name}Rows`] = value.rows;
    counts[`${name}Latest`] = value.latest;
  }
  const warnings: string[] = [];
  if (!tables.market_line_history && !tables.event_market_snapshot && !tables.current_market_state) warnings.push("No durable market-line table is available for MLB market matching.");
  if (!tables.mlb_v8_player_impact_profiles) warnings.push("MLB v8 player-impact profile table is missing; player-impact weights fall back to defaults.");
  if (!tables.retrosheet_games) warnings.push("Retrosheet warehouse is missing; historical Elo/pitcher priors are not active.");
  if (!tables.mlb_team_elo_snapshots || !tables.mlb_pitcher_rolling_snapshots) warnings.push("MLB Elo/pitcher rolling snapshot tables are missing.");
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

  return {
    ok: playerSources.every((source) => source === "real") && teamProfileSources.every((source) => source === "real"),
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
        ? "Real ratings feed is active."
        : "Synthetic ratings are heavily downweighted and should not drive attack picks."
    },
    warnings
  };
}

export async function GET() {
  try {
    const [hub, priority, market, refreshStatus, db, sources, oddsSnapshot] = await Promise.all([
      readSimCache<SimHubSnapshot>(SIM_CACHE_KEYS.hub),
      readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
      readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
      readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus),
      dbCounts(),
      sourceHealth(),
      readLatestOddsApiSnapshot().catch(() => null)
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
