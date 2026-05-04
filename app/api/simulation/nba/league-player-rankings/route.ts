import { NextResponse } from "next/server";

import { buildNbaLeaguePlayerRankingUniverse } from "@/services/simulation/nba-league-player-rankings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? "75"), 500));
  const team = url.searchParams.get("team")?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? null;
  const q = url.searchParams.get("q")?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? null;
  const category = url.searchParams.get("category") ?? null;
  const universe = await buildNbaLeaguePlayerRankingUniverse();
  let players = universe.players;
  if (team) {
    players = players.filter((player) => player.teamName.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(team));
  }
  if (q) {
    players = players.filter((player) => player.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(q));
  }
  if (category) {
    players = [...players].sort((left, right) => {
      const leftRank = left.categories.find((row) => row.category === category)?.rawRank ?? 9999;
      const rightRank = right.categories.find((row) => row.category === category)?.rawRank ?? 9999;
      return leftRank - rightRank;
    });
  }
  return NextResponse.json({
    ...universe,
    players: players.slice(0, limit)
  });
}
