import { NextResponse } from "next/server";

import { fitAndPersistMlbPlayerMarketCalibrationProfile } from "@/services/simulation/mlb-player-prop-inning-calibration";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_API_KEY2?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (secret && (token === secret || request.headers.get("x-cron-secret") === secret)) return true;
  return new URL(request.url).searchParams.get("confirm") === "mlb-player-market-calibration";
}

function numberParam(url: URL) {
  const parsed = Number(url.searchParams.get("limit") ?? 25000);
  return Math.max(100, Math.min(100000, Number.isFinite(parsed) ? Math.floor(parsed) : 25000));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const limit = numberParam(new URL(request.url));
  const result = await fitAndPersistMlbPlayerMarketCalibrationProfile(limit);
  return NextResponse.json({ ok: result.ok, mode: "fit-player-market-calibration", startedAt, finishedAt: new Date().toISOString(), config: { limit }, result }, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
