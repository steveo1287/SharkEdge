import { NextResponse } from "next/server";

import { runGeneratedTrendDiscovery } from "@/services/trends/generated-trend-runner";
import type { TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket } from "@/services/trends/trend-candidate-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUES = new Set(["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"]);
const MARKETS = new Set(["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"]);
const DEPTHS = new Set(["core", "expanded", "debug"]);

function parseNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function parseBool(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseLeague(value: unknown) {
  const parsed = String(value ?? "ALL").toUpperCase();
  return (LEAGUES.has(parsed) ? parsed : "ALL") as TrendFactoryLeague | "ALL";
}

function parseMarket(value: unknown) {
  const parsed = String(value ?? "ALL").toLowerCase();
  return (MARKETS.has(parsed) ? parsed : "ALL") as TrendFactoryMarket | "ALL";
}

function parseDepth(value: unknown) {
  const parsed = String(value ?? "core").toLowerCase();
  return (DEPTHS.has(parsed) ? parsed : "core") as TrendFactoryDepth;
}

function parseOptions(input: URLSearchParams | Record<string, unknown>) {
  const get = (key: string) => input instanceof URLSearchParams ? input.get(key) : input[key];
  return {
    league: parseLeague(get("league")),
    market: parseMarket(get("market")),
    depth: parseDepth(get("depth")),
    limit: parseNumber(get("limit"), 250, 1, 1000),
    minSample: parseNumber(get("minSample"), 50, 1, 5000),
    minRoiPct: Number.isFinite(Number(get("minRoiPct"))) ? Number(get("minRoiPct")) : 0,
    historyLimit: parseNumber(get("historyLimit"), 100, 1, 500),
    startDate: get("startDate") ? String(get("startDate")) : undefined,
    endDate: get("endDate") ? String(get("endDate")) : undefined,
    dryRun: parseBool(get("dryRun"), true)
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const summary = await runGeneratedTrendDiscovery(parseOptions(url.searchParams));
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const summary = await runGeneratedTrendDiscovery(parseOptions(body));
  return NextResponse.json({ ok: true, ...summary });
}
