import { prisma } from "@/lib/db/prisma";

export type MarketArchiveHint = {
  sport: "MLB" | "MMA";
  snapshotCount: number;
  latestCapturedAt: string | null;
  closingLineCount: number;
  closingCoveragePct: number | null;
  freshnessMinutes: number | null;
};

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function freshnessMinutes(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

function normalize(sport: "MLB" | "MMA", row: Record<string, unknown> | undefined): MarketArchiveHint {
  const snapshotCount = toNumber(row?.snapshot_count);
  const closingLineCount = toNumber(row?.closing_line_count);
  const latest = row?.latest_captured_at ? new Date(row.latest_captured_at as string | Date).toISOString() : null;
  return {
    sport,
    snapshotCount,
    latestCapturedAt: latest,
    closingLineCount,
    closingCoveragePct: snapshotCount ? closingLineCount / snapshotCount : null,
    freshnessMinutes: freshnessMinutes(latest)
  };
}

export async function getMarketArchiveHints(lookbackDays = 7): Promise<{ mlb: MarketArchiveHint; mma: MarketArchiveHint }> {
  const since = new Date(Date.now() - Math.max(1, Math.min(30, lookbackDays)) * 24 * 60 * 60 * 1000);
  const [mlbRows, mmaRows] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        COUNT(*)::int AS snapshot_count,
        MAX(ems.captured_at) AS latest_captured_at,
        COUNT(*) FILTER (WHERE em.closing_odds IS NOT NULL OR em.closing_line IS NOT NULL)::int AS closing_line_count
      FROM event_market_snapshots ems
      JOIN event_markets em ON em.id = ems.event_market_id
      JOIN events e ON e.id = em.event_id
      JOIN leagues l ON l.id = e.league_id
      WHERE l.key = 'MLB'
        AND ems.captured_at >= ${since}
    `,
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        COUNT(*)::int AS snapshot_count,
        MAX(ems.captured_at) AS latest_captured_at,
        COUNT(*) FILTER (WHERE em.closing_odds IS NOT NULL OR em.closing_line IS NOT NULL)::int AS closing_line_count
      FROM event_market_snapshots ems
      JOIN event_markets em ON em.id = ems.event_market_id
      JOIN events e ON e.id = em.event_id
      JOIN sports s ON s.id = e.sport_id
      WHERE s.code = 'MMA'
        AND ems.captured_at >= ${since}
    `
  ]);

  return {
    mlb: normalize("MLB", mlbRows[0]),
    mma: normalize("MMA", mmaRows[0])
  };
}
