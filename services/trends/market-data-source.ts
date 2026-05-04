import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type MarketDataSourceSummary = {
  generatedAt: string;
  sourceNote: string;
  connected: boolean;
  tables: {
    books: number;
    oddsSnapshots: number;
    bettingSplits: number;
    lineHistory: number;
  };
  coverage: Array<{
    league: string;
    oddsRows: number;
    splitRows: number;
    lineRows: number;
    latestOddsAt: string | null;
    latestSplitsAt: string | null;
    latestLineAt: string | null;
  }>;
  readiness: {
    usableForMarketIntelligence: boolean;
    blockers: string[];
    recommendations: string[];
  };
};

type CountRow = { count: bigint | number | string | null };
type CoverageRow = Record<string, unknown>;

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function countTable(table: "market_books" | "market_odds_snapshots" | "market_betting_splits" | "market_line_history") {
  try {
    if (table === "market_books") {
      const rows = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM market_books`;
      return asNumber(rows[0]?.count);
    }
    if (table === "market_odds_snapshots") {
      const rows = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM market_odds_snapshots`;
      return asNumber(rows[0]?.count);
    }
    if (table === "market_betting_splits") {
      const rows = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM market_betting_splits`;
      return asNumber(rows[0]?.count);
    }
    const rows = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM market_line_history`;
    return asNumber(rows[0]?.count);
  } catch {
    return 0;
  }
}

async function loadCoverage() {
  try {
    const rows = await prisma.$queryRaw<CoverageRow[]>`
      WITH odds AS (
        SELECT league, COUNT(*)::int AS odds_rows, MAX(captured_at) AS latest_odds_at
        FROM market_odds_snapshots
        GROUP BY league
      ),
      splits AS (
        SELECT league, COUNT(*)::int AS split_rows, MAX(captured_at) AS latest_splits_at
        FROM market_betting_splits
        GROUP BY league
      ),
      lines AS (
        SELECT league, COUNT(*)::int AS line_rows, MAX(captured_at) AS latest_line_at
        FROM market_line_history
        GROUP BY league
      ),
      leagues AS (
        SELECT league FROM odds
        UNION SELECT league FROM splits
        UNION SELECT league FROM lines
      )
      SELECT
        l.league,
        COALESCE(o.odds_rows, 0) AS odds_rows,
        COALESCE(s.split_rows, 0) AS split_rows,
        COALESCE(h.line_rows, 0) AS line_rows,
        o.latest_odds_at,
        s.latest_splits_at,
        h.latest_line_at
      FROM leagues l
      LEFT JOIN odds o ON o.league = l.league
      LEFT JOIN splits s ON s.league = l.league
      LEFT JOIN lines h ON h.league = l.league
      ORDER BY COALESCE(o.odds_rows, 0) DESC, l.league ASC
    `;
    return rows.map((row) => ({
      league: String(row.league ?? "UNKNOWN"),
      oddsRows: asNumber(row.odds_rows),
      splitRows: asNumber(row.split_rows),
      lineRows: asNumber(row.line_rows),
      latestOddsAt: asDate(row.latest_odds_at),
      latestSplitsAt: asDate(row.latest_splits_at),
      latestLineAt: asDate(row.latest_line_at)
    }));
  } catch {
    return [];
  }
}

export async function buildMarketDataSourceSummary(): Promise<MarketDataSourceSummary> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Market data source unavailable because DATABASE_URL is not configured.",
      connected: false,
      tables: { books: 0, oddsSnapshots: 0, bettingSplits: 0, lineHistory: 0 },
      coverage: [],
      readiness: {
        usableForMarketIntelligence: false,
        blockers: ["DATABASE_URL is unavailable."],
        recommendations: ["Configure the database before running market data ingestion."]
      }
    };
  }

  const [books, oddsSnapshots, bettingSplits, lineHistory, coverage] = await Promise.all([
    countTable("market_books"),
    countTable("market_odds_snapshots"),
    countTable("market_betting_splits"),
    countTable("market_line_history"),
    loadCoverage()
  ]);
  const blockers: string[] = [];
  const recommendations: string[] = [];

  if (oddsSnapshots <= 0) blockers.push("No market_odds_snapshots rows are loaded.");
  if (bettingSplits <= 0) recommendations.push("No market_betting_splits rows are loaded; splits will remain not sourced.");
  if (lineHistory <= 0) recommendations.push("No market_line_history rows are loaded; line-history views will be limited.");
  if (books <= 0) recommendations.push("No market_books rows are loaded; book names may rely on raw snapshot fields.");
  if (!coverage.length) blockers.push("No league coverage exists in the market ingestion tables.");
  if (!recommendations.length) recommendations.push("Market ingestion tables have initial coverage. Continue monitoring freshness and league depth.");

  return {
    generatedAt: new Date().toISOString(),
    sourceNote: "Market data source summary reads source-agnostic ingestion tables for odds snapshots, betting splits, and line history.",
    connected: true,
    tables: { books, oddsSnapshots, bettingSplits, lineHistory },
    coverage,
    readiness: {
      usableForMarketIntelligence: blockers.length === 0,
      blockers,
      recommendations
    }
  };
}
