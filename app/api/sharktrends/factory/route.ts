import { NextResponse } from "next/server";

import { buildTrendFactoryPreview } from "@/services/trends/trend-factory";
import type { TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket } from "@/services/trends/trend-candidate-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUES = new Set(["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"]);
const MARKETS = new Set(["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"]);
const DEPTHS = new Set(["core", "expanded", "debug"]);

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(2000, Math.floor(parsed))) : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const leagueParam = (url.searchParams.get("league") ?? "ALL").toUpperCase();
  const marketParam = (url.searchParams.get("market") ?? "ALL").toLowerCase();
  const depthParam = (url.searchParams.get("depth") ?? "core").toLowerCase();
  const limit = parseIntParam(url.searchParams.get("limit"), 300);

  const league = (LEAGUES.has(leagueParam) ? leagueParam : "ALL") as TrendFactoryLeague | "ALL";
  const market = (MARKETS.has(marketParam) ? marketParam : "ALL") as TrendFactoryMarket | "ALL";
  const depth = (DEPTHS.has(depthParam) ? depthParam : "core") as TrendFactoryDepth;

  const preview = buildTrendFactoryPreview({ league, market, depth, limit });
  return NextResponse.json({ ok: true, ...preview });
}
