import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { fetchTheRundownLeaguesBoard } from "@/services/current-odds/therundown-provider";

const DEFAULT_LEAGUES: LeagueKey[] = ["MLB", "NBA"];

function isLeagueKey(value: string | null): value is LeagueKey {
  if (!value) return false;
  return [
    "NBA",
    "NCAAB",
    "MLB",
    "NHL",
    "NFL",
    "NCAAF",
    "UFC",
    "BOXING"
  ].includes(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = searchParams.get("league");
  const leagues = isLeagueKey(league) ? ([league] as LeagueKey[]) : DEFAULT_LEAGUES;
  const skipCache = searchParams.get("skipCache") === "1";

  try {
    const payload = await fetchTheRundownLeaguesBoard({
      leagues,
      timeoutMs: 12_000,
      cacheTtlMs: skipCache ? 0 : 60_000
    });

    return NextResponse.json({
      ok: Boolean(payload?.configured),
      leagues,
      generatedAt: payload?.generated_at ?? null,
      providerMode: payload?.provider_mode ?? null,
      sportCount: payload?.sports?.length ?? 0,
      gameCount:
        payload?.sports?.reduce((sum, sport) => sum + (sport.games?.length ?? 0), 0) ?? 0,
      sportKeys: payload?.sports?.map((sport) => ({ key: sport.key, games: sport.games.length })) ?? [],
      errors: payload?.errors ?? []
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        leagues,
        error: error instanceof Error ? error.message : "Failed to build TheRundown board snapshot."
      },
      { status: 500 }
    );
  }
}

