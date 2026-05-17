import { NextResponse } from "next/server";

import { refreshUfcMoneylineOddsSources } from "@/services/ufc/moneyline-odds-refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const url = new URL(request.url);
  const envSecret = process.env.UFC_ADMIN_RUN_TOKEN;
  if (envSecret) return url.searchParams.get("token") === envSecret || request.headers.get("x-ufc-admin-token") === envSecret;
  return url.searchParams.get("confirm") === "moneyline-odds";
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const value = url.searchParams.get(name);
  const parsed = value ? Number(value) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=moneyline-odds" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const url = new URL(request.url);
  const dryRun = boolParam(url, "dryRun", false);
  const skipBackend = boolParam(url, "skipBackend", false);
  const skipOddsApiIo = boolParam(url, "skipOddsApiIo", false);
  const skipDirect = boolParam(url, "skipDirect", false);
  const horizonDays = numberParam(url, "horizonDays", 120, 1, 365);
  const regions = url.searchParams.get("regions") || undefined;
  const bookmakers = url.searchParams.get("bookmakers") || undefined;
  const sportKey = url.searchParams.get("sportKey") || undefined;
  const oddsApiIoBookmakers = url.searchParams.get("oddsApiIoBookmakers") || undefined;
  const oddsApiIoSport = url.searchParams.get("oddsApiIoSport") || undefined;
  const oddsApiIoLeague = url.searchParams.get("oddsApiIoLeague") || undefined;
  const oddsApiIoEventLimit = numberParam(url, "oddsApiIoEventLimit", 20, 1, 50);
  const minMatchScoreRaw = url.searchParams.get("minMatchScore");
  const minMatchScore = minMatchScoreRaw ? Number(minMatchScoreRaw) : undefined;

  try {
    const result = await refreshUfcMoneylineOddsSources({
      dryRun,
      horizonDays,
      minMatchScore,
      skipBackend,
      skipOddsApiIo,
      skipDirect,
      regions,
      bookmakers,
      sportKey,
      oddsApiIoBookmakers,
      oddsApiIoSport,
      oddsApiIoLeague,
      oddsApiIoEventLimit
    });
    return NextResponse.json({
      ok: result.ok,
      mode: dryRun ? "dry-run" : "write",
      startedAt,
      finishedAt: new Date().toISOString(),
      config: { horizonDays, regions, bookmakers, sportKey, minMatchScore, skipBackend, skipOddsApiIo, skipDirect, oddsApiIoBookmakers, oddsApiIoSport, oddsApiIoLeague, oddsApiIoEventLimit, primary: result.primary, backup: result.backup, tertiary: result.tertiary },
      result
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), startedAt, finishedAt: new Date().toISOString() }, { status: 500 });
  }
}
