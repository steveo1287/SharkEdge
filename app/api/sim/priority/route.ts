import { NextResponse } from "next/server";

import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
};

type PriorityPayload = {
  ok: boolean;
  generatedAt: string;
  rows: Array<{
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
  }>;
  summary: {
    gameCount: number;
    rowCount: number;
    nbaCount: number;
    mlbCount: number;
    matchedMlbLines: number;
  };
  reason?: string;
};

function logTiming(label: string, startedAt: number) {
  console.info(`[sim-timing] ${label} ${Date.now() - startedAt}ms`);
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

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        console.warn(`[sim-priority] ${label} timed out after ${ms}ms`);
        resolve(fallback);
      }, ms);
    })
  ]);
}

function decisionTier(row: { game: SimGame; projection: Awaited<ReturnType<typeof buildSimProjection>> }) {
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

function winLean(projection: Awaited<ReturnType<typeof buildSimProjection>>) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home, edge: home - away }
    : { team: projection.matchup.away, pct: away, edge: away - home };
}

function confidence(projection: Awaited<ReturnType<typeof buildSimProjection>>) {
  return projection.mlbIntel?.governor?.confidence ?? projection.nbaIntel?.confidence ?? projection.realityIntel?.confidence ?? null;
}

async function buildPayload(maxRows: number): Promise<PriorityPayload> {
  const startedAt = Date.now();
  const boardStartedAt = Date.now();
  const sections = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {}, maxScoreboardGames: null });
  logTiming("api/sim/priority buildBoardSportSections", boardStartedAt);

  const games = flatten(sections)
    .filter((game) => game.leagueKey === "NBA" || game.leagueKey === "MLB")
    .slice(0, maxRows);

  const projectionStartedAt = Date.now();
  const settledRows = await Promise.allSettled(
    games.map(async (game) => ({ game, projection: await buildSimProjection(game) }))
  );
  logTiming("api/sim/priority buildSimProjection batch", projectionStartedAt);

  const rows = settledRows
    .filter((row): row is PromiseFulfilledResult<{ game: SimGame; projection: Awaited<ReturnType<typeof buildSimProjection>> }> => row.status === "fulfilled")
    .map((row) => row.value);

  const projectionsByGameId = new Map(rows.map((row) => [row.game.id, row.projection]));
  const mlbGames = rows.filter((row) => row.game.leagueKey === "MLB").map((row) => row.game);
  const edgeStartedAt = Date.now();
  const edgeData = mlbGames.length
    ? await withTimeout(buildMlbEdges({ games: mlbGames, projectionsByGameId, allowLineRefresh: false }), 2500, { ok: false, lineCount: 0, gameCount: mlbGames.length, edges: [] }, "buildMlbEdges")
    : { ok: true, lineCount: 0, gameCount: 0, edges: [] };
  logTiming("api/sim/priority buildMlbEdges", edgeStartedAt);
  const edgeByGame = new Map((edgeData.edges ?? []).map((edge) => [edge.gameId, edge]));

  const ordered = rows
    .sort((left, right) => {
      const leftTier = tierRank(decisionTier(left));
      const rightTier = tierRank(decisionTier(right));
      if (leftTier !== rightTier) return rightTier - leftTier;
      return Math.abs(winLean(right.projection).edge) - Math.abs(winLean(left.projection).edge);
    })
    .slice(0, maxRows);

  const apiRows = ordered.map((row) => {
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

  logTiming("api/sim/priority total", startedAt);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    rows: apiRows,
    summary: {
      gameCount: games.length,
      rowCount: apiRows.length,
      nbaCount: rows.filter((row) => row.game.leagueKey === "NBA").length,
      mlbCount: rows.filter((row) => row.game.leagueKey === "MLB").length,
      matchedMlbLines: apiRows.filter((row) => row.leagueKey === "MLB" && row.edgeMatched).length
    }
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const maxRows = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") ?? 10) || 10));
  try {
    const payload = await withTimeout(
      buildPayload(maxRows),
      8500,
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        rows: [],
        summary: { gameCount: 0, rowCount: 0, nbaCount: 0, mlbCount: 0, matchedMlbLines: 0 },
        reason: "priority_timeout"
      },
      "priority payload"
    );
    return NextResponse.json(payload, { status: payload.ok ? 200 : 206 });
  } catch (error) {
    console.error("[sim-priority] failed", error);
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        rows: [],
        summary: { gameCount: 0, rowCount: 0, nbaCount: 0, mlbCount: 0, matchedMlbLines: 0 },
        reason: error instanceof Error ? error.message : "unknown_error"
      },
      { status: 500 }
    );
  }
}
