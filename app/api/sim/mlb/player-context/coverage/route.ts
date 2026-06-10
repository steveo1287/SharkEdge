import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasContext(statsJson: unknown) {
  const stats = asRecord(statsJson);
  return stats.source === "mlb_statsapi_player_context";
}

function hasUsableContext(statsJson: unknown) {
  const stats = asRecord(statsJson);
  if (!hasContext(statsJson)) return false;
  const quality = asRecord(stats.contextQuality);
  if (quality.hasUsableStats === true || quality.hasHitting === true || quality.hasPitching === true) return true;
  const statsApi = asRecord(stats.statsApi);
  return Boolean(Object.keys(asRecord(statsApi.hitting)).length || Object.keys(asRecord(statsApi.pitching)).length);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lookaheadDays = Math.max(0, Math.min(14, Number(url.searchParams.get("lookaheadDays") ?? 3)));
  const league = await prisma.league.findUnique({ where: { key: "MLB" } });
  if (!league) return NextResponse.json({ ok: false, error: "MLB league missing" }, { status: 404 });

  const now = new Date();
  const end = new Date(Date.now() + lookaheadDays * 86400000);
  const games = await prisma.game.findMany({
    where: { leagueId: league.id, status: { in: ["PREGAME", "LIVE"] }, startTime: { gte: new Date(now.getTime() - 3 * 3600000), lte: end } },
    include: {
      homeTeam: { include: { players: { include: { playerGameStats: true } } } },
      awayTeam: { include: { players: { include: { playerGameStats: true } } } }
    },
    orderBy: { startTime: "asc" },
    take: 50
  });

  const rows = games.map((game) => {
    const side = (players: typeof game.homeTeam.players) => {
      const active = players.length;
      const withContext = players.filter((player) => player.playerGameStats.some((row) => row.gameId === game.id && hasContext(row.statsJson))).length;
      const withUsableContext = players.filter((player) => player.playerGameStats.some((row) => row.gameId === game.id && hasUsableContext(row.statsJson))).length;
      const pitchers = players.filter((player) => String(player.position).toUpperCase() === "P");
      const pitchersWithContext = pitchers.filter((player) => player.playerGameStats.some((row) => row.gameId === game.id && hasContext(row.statsJson))).length;
      const pitchersWithUsableContext = pitchers.filter((player) => player.playerGameStats.some((row) => row.gameId === game.id && hasUsableContext(row.statsJson))).length;
      return {
        active,
        withContext,
        withUsableContext,
        coveragePct: active ? Number((withContext / active).toFixed(3)) : 0,
        usableCoveragePct: active ? Number((withUsableContext / active).toFixed(3)) : 0,
        pitchers: pitchers.length,
        pitchersWithContext,
        pitchersWithUsableContext
      };
    };
    const away = side(game.awayTeam.players);
    const home = side(game.homeTeam.players);
    const totalActive = away.active + home.active;
    const totalWithContext = away.withContext + home.withContext;
    const totalWithUsableContext = away.withUsableContext + home.withUsableContext;
    return {
      gameId: game.id,
      externalEventId: game.externalEventId,
      startTime: game.startTime.toISOString(),
      matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
      awayTeam: game.awayTeam.name,
      homeTeam: game.homeTeam.name,
      away,
      home,
      gameCoveragePct: Number((totalWithContext / Math.max(1, totalActive)).toFixed(3)),
      usableGameCoveragePct: Number((totalWithUsableContext / Math.max(1, totalActive)).toFixed(3)),
      readyForPlayerFusedSim: away.withUsableContext >= 9 && home.withUsableContext >= 9 && away.pitchersWithUsableContext >= 1 && home.pitchersWithUsableContext >= 1,
      fullRosterContext: totalActive > 0 && totalWithContext >= totalActive,
      fullRosterUsableContext: totalActive > 0 && totalWithUsableContext >= totalActive
    };
  });

  return NextResponse.json({
    ok: true,
    lookaheadDays,
    gameCount: rows.length,
    readyGameCount: rows.filter((row) => row.readyForPlayerFusedSim).length,
    fullRosterContextGameCount: rows.filter((row) => row.fullRosterContext).length,
    fullRosterUsableContextGameCount: rows.filter((row) => row.fullRosterUsableContext).length,
    rows
  });
}
