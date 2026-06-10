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
      const pitchers = players.filter((player) => String(player.position).toUpperCase() === "P");
      const pitchersWithContext = pitchers.filter((player) => player.playerGameStats.some((row) => row.gameId === game.id && hasContext(row.statsJson))).length;
      return { active, withContext, coveragePct: active ? Number((withContext / active).toFixed(3)) : 0, pitchers: pitchers.length, pitchersWithContext };
    };
    const away = side(game.awayTeam.players);
    const home = side(game.homeTeam.players);
    return {
      gameId: game.id,
      externalEventId: game.externalEventId,
      startTime: game.startTime.toISOString(),
      matchup: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
      awayTeam: game.awayTeam.name,
      homeTeam: game.homeTeam.name,
      away,
      home,
      gameCoveragePct: Number(((away.withContext + home.withContext) / Math.max(1, away.active + home.active)).toFixed(3)),
      readyForPlayerFusedSim: away.withContext >= 9 && home.withContext >= 9 && away.pitchersWithContext >= 1 && home.pitchersWithContext >= 1
    };
  });

  return NextResponse.json({
    ok: true,
    lookaheadDays,
    gameCount: rows.length,
    readyGameCount: rows.filter((row) => row.readyForPlayerFusedSim).length,
    rows
  });
}
