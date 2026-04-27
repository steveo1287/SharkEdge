import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch("https://api.balldontlie.io/mlb/v1/lineups", {
      headers: {
        Authorization: process.env.BALLDONTLIE_KEY || ""
      }
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "Failed to fetch BallDontLie" }, { status: 500 });
    }

    const data = await res.json();

    const games = (data.data || []).map((game: any) => {
      const awayPlayers = game.players.filter((p: any) => p.team_id === game.away_team.id);
      const homePlayers = game.players.filter((p: any) => p.team_id === game.home_team.id);

      return {
        awayTeam: game.away_team.name,
        homeTeam: game.home_team.name,

        awayStarter: awayPlayers.find((p: any) => p.is_probable_pitcher),
        homeStarter: homePlayers.find((p: any) => p.is_probable_pitcher),

        awayLineup: awayPlayers.filter((p: any) => p.batting_order),
        homeLineup: homePlayers.filter((p: any) => p.batting_order),

        awayStarterLocked: !!awayPlayers.find((p: any) => p.is_probable_pitcher),
        homeStarterLocked: !!homePlayers.find((p: any) => p.is_probable_pitcher),

        awayLineupLocked: awayPlayers.filter((p: any) => p.batting_order).length >= 8,
        homeLineupLocked: homePlayers.filter((p: any) => p.batting_order).length >= 8
      };
    });

    return NextResponse.json({ ok: true, source: "balldontlie", games });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
