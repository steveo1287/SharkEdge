import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function parseDate(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function defaultSince() {
  const value = new Date();
  value.setUTCHours(value.getUTCHours() - 1);
  return value;
}

export async function GET(request: Request) {
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const unauthorized = isVercelCron ? null : ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const since = parseDate(url.searchParams.get("since"), defaultSince());
  const before = parseDate(url.searchParams.get("before"), new Date());

  if (since >= before) {
    return NextResponse.json({ ok: false, error: "since must be before before" }, { status: 400 });
  }

  try {
    const historyDeleted = await prisma.$executeRaw`
      DELETE FROM market_line_history
      WHERE source = 'odds-api-io'
        AND captured_at >= ${since}
        AND captured_at < ${before}
    `;
    const snapshotsDeleted = await prisma.$executeRaw`
      DELETE FROM market_odds_snapshots
      WHERE source = 'odds-api-io'
        AND captured_at >= ${since}
        AND captured_at < ${before}
    `;

    return NextResponse.json({
      ok: true,
      source: "odds-api-io",
      since: since.toISOString(),
      before: before.toISOString(),
      deleted: {
        market_line_history: Number(historyDeleted),
        market_odds_snapshots: Number(snapshotsDeleted)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Odds-API.io cleanup failed." },
      { status: 500 }
    );
  }
}
