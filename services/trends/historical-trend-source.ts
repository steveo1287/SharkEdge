import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import type { HistoricalTrendEvent, TrendBacktestOutcome } from "./trend-backtester";

export type HistoricalTrendSourceOptions = {
  league?: string | "ALL";
  startDate?: string;
  endDate?: string;
  limit?: number;
};

export type HistoricalTrendSourceResult = {
  rows: HistoricalTrendEvent[];
  sourceConnected: boolean;
  sourceNote: string;
  stats: {
    rowsLoaded: number;
    rowsSkipped: number;
    league: string;
    startDate: string;
    endDate: string;
  };
};

type RawHistoricalRow = Record<string, unknown>;

function dateRange(options: HistoricalTrendSourceOptions) {
  const end = options.endDate ? new Date(`${options.endDate}T23:59:59.999Z`) : new Date();
  const start = options.startDate ? new Date(`${options.startDate}T00:00:00.000Z`) : new Date(end);
  if (!options.startDate) start.setUTCFullYear(end.getUTCFullYear() - 3);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return dateRange({});
  return { start, end };
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asDate(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function asOutcome(value: unknown): TrendBacktestOutcome {
  const text = normalize(value).toUpperCase();
  if (["WIN", "W", "WON", "CASH", "FINAL_WON"].includes(text)) return "WIN";
  if (["LOSS", "L", "LOST", "LOSE", "FINAL_LOST"].includes(text)) return "LOSS";
  if (["PUSH", "TIE"].includes(text)) return "PUSH";
  if (["VOID", "CANCELLED", "CANCELED", "NO_ACTION"].includes(text)) return "VOID";
  if (["PENDING", "OPEN", "ACTIVE", "SCHEDULED", "LIVE"].includes(text)) return "PENDING";
  return "UNKNOWN";
}

function sideFromRow(row: RawHistoricalRow) {
  const explicit = normalize(row.side ?? row.selection_side ?? row.bet_side ?? row.pick_side);
  if (explicit) return explicit;
  const market = normalize(row.market ?? row.market_type);
  const selection = normalize(row.selection ?? row.pick ?? row.team);
  if (market === "total" && selection.includes("over")) return "over";
  if (market === "total" && selection.includes("under")) return "under";
  if (selection.includes("favorite")) return "favorite";
  if (selection.includes("underdog") || selection.includes("dog")) return "underdog";
  if (selection.includes("home")) return "home";
  if (selection.includes("away") || selection.includes("road")) return "away";
  return selection || "unknown";
}

function marketFromRow(row: RawHistoricalRow) {
  const explicit = normalize(row.market ?? row.market_type ?? row.bet_type);
  if (explicit === "ml") return "moneyline";
  if (explicit.includes("money")) return "moneyline";
  if (explicit.includes("spread")) return "spread";
  if (explicit.includes("total")) return "total";
  if (explicit.includes("prop")) return "player_prop";
  if (explicit.includes("fight")) return "fight_winner";
  return explicit || "unknown";
}

function venueFromRow(row: RawHistoricalRow): "home" | "road" | "neutral" | null {
  const venue = normalize(row.venue ?? row.venue_type ?? row.location_type);
  if (venue.includes("neutral")) return "neutral";
  if (venue.includes("home")) return "home";
  if (venue.includes("road") || venue.includes("away")) return "road";
  return null;
}

function booleanFilter(row: RawHistoricalRow, key: string) {
  const value = row[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return ["true", "1", "yes", "y", "on"].includes(value.toLowerCase());
  return false;
}

function buildFilters(row: RawHistoricalRow) {
  const venue = venueFromRow(row);
  const price = asNumber(row.price ?? row.odds ?? row.odds_american);
  const closingPrice = asNumber(row.closing_price ?? row.close_price ?? row.closing_odds);
  const clvPct = asNumber(row.clv_pct);
  const side = sideFromRow(row);
  const filters: Record<string, string | number | boolean | null> = {
    home: venue === "home",
    road: venue === "road",
    neutral: venue === "neutral",
    favorite: side === "favorite" || (typeof price === "number" && price < 0),
    underdog: side === "underdog" || (typeof price === "number" && price > 0),
    after_win: booleanFilter(row, "after_win"),
    after_loss: booleanFilter(row, "after_loss"),
    won_2_plus: booleanFilter(row, "won_2_plus"),
    lost_2_plus: booleanFilter(row, "lost_2_plus"),
    rest_0: booleanFilter(row, "rest_0"),
    rest_1: booleanFilter(row, "rest_1"),
    rest_2_plus: booleanFilter(row, "rest_2_plus"),
    b2b: booleanFilter(row, "b2b"),
    line_moved_for: booleanFilter(row, "line_moved_for"),
    line_moved_against: booleanFilter(row, "line_moved_against"),
    positive_clv: typeof clvPct === "number" ? clvPct >= 0 : typeof price === "number" && typeof closingPrice === "number" ? closingPrice < price : false,
    model_agrees: booleanFilter(row, "model_agrees")
  };

  if (price != null) {
    filters.dog_100_180 = price >= 100 && price <= 180;
    filters.fav_100_150 = price <= -100 && price >= -150;
    filters.fav_150_220 = price <= -150 && price >= -220;
    filters.any_plus_money = price > 0;
  }

  return filters;
}

function rowToHistoricalEvent(row: RawHistoricalRow): HistoricalTrendEvent | null {
  const id = String(row.id ?? row.event_id ?? row.pick_id ?? "").trim();
  const date = asDate(row.date ?? row.game_date ?? row.start_time ?? row.settled_at);
  const league = String(row.league ?? row.league_key ?? row.leaguekey ?? "").trim().toUpperCase();
  const market = marketFromRow(row);
  const side = sideFromRow(row);
  const matchup = String(row.matchup ?? row.event_name ?? row.name ?? row.game ?? "").trim();

  if (!id || !date || !league || !market || !side || !matchup || market === "unknown" || side === "unknown") return null;

  return {
    id,
    date,
    league,
    market,
    side,
    matchup,
    team: row.team == null ? null : String(row.team),
    opponent: row.opponent == null ? null : String(row.opponent),
    venue: venueFromRow(row),
    price: asNumber(row.price ?? row.odds ?? row.odds_american),
    closingPrice: asNumber(row.closing_price ?? row.close_price ?? row.closing_odds),
    result: asOutcome(row.result ?? row.outcome ?? row.status),
    units: asNumber(row.units ?? row.profit_units ?? row.pnl_units),
    filters: buildFilters(row),
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : [],
    metadata: row.metadata_json as Record<string, unknown> | undefined
  };
}

async function fetchFromTrendSystemResults(options: Required<HistoricalTrendSourceOptions> & { start: Date; end: Date }) {
  const rows = await prisma.$queryRaw<RawHistoricalRow[]>`
    SELECT
      r.id,
      r.source_event_id AS event_id,
      r.game_date,
      s.league,
      s.market,
      r.side,
      r.matchup,
      r.price,
      r.closing_price,
      r.result,
      r.units,
      r.clv_pct,
      r.matched_filters_json AS tags,
      r.filter_match_json AS metadata_json
    FROM generated_trend_system_results r
    JOIN generated_trend_systems s ON s.id = r.system_id
    WHERE r.game_date >= ${options.start}
      AND r.game_date <= ${options.end}
      AND (${options.league} = 'ALL' OR s.league = ${options.league})
    ORDER BY r.game_date DESC
    LIMIT ${options.limit}
  `;
  return rows;
}

async function fetchFromEventsAndOdds(options: Required<HistoricalTrendSourceOptions> & { start: Date; end: Date }) {
  const rows = await prisma.$queryRaw<RawHistoricalRow[]>`
    SELECT
      o.id,
      e.id AS event_id,
      e.start_time AS game_date,
      l.key AS league,
      o.market_type AS market,
      o.side,
      e.name AS matchup,
      o.price,
      o.close_price AS closing_price,
      o.result,
      o.units,
      e.venue,
      e.metadata_json
    FROM odds o
    JOIN events e ON e.id = o.event_id
    JOIN leagues l ON l.id = e.league_id
    WHERE e.start_time >= ${options.start}
      AND e.start_time <= ${options.end}
      AND (${options.league} = 'ALL' OR l.key = ${options.league})
      AND o.result IS NOT NULL
    ORDER BY e.start_time DESC
    LIMIT ${options.limit}
  `;
  return rows;
}

export async function loadHistoricalTrendRows(options: HistoricalTrendSourceOptions = {}): Promise<HistoricalTrendSourceResult> {
  const { start, end } = dateRange(options);
  const resolved = {
    league: (options.league ?? "ALL").toUpperCase(),
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    limit: options.limit ?? 5000,
    start,
    end
  };

  if (!hasUsableServerDatabaseUrl()) {
    return {
      rows: [],
      sourceConnected: false,
      sourceNote: "Historical trend source unavailable because DATABASE_URL is not configured.",
      stats: { rowsLoaded: 0, rowsSkipped: 0, league: resolved.league, startDate: resolved.startDate, endDate: resolved.endDate }
    };
  }

  const sourceAttempts: Array<() => Promise<RawHistoricalRow[]>> = [
    () => fetchFromTrendSystemResults(resolved),
    () => fetchFromEventsAndOdds(resolved)
  ];

  for (const attempt of sourceAttempts) {
    try {
      const rawRows = await attempt();
      const rows = rawRows.map(rowToHistoricalEvent).filter((row): row is HistoricalTrendEvent => Boolean(row));
      if (rows.length || rawRows.length) {
        return {
          rows,
          sourceConnected: true,
          sourceNote: rows.length
            ? `Loaded ${rows.length} normalized historical trend rows from ${rawRows.length} raw rows.`
            : "Historical source returned raw rows, but none normalized into backtest-compatible rows.",
          stats: { rowsLoaded: rows.length, rowsSkipped: rawRows.length - rows.length, league: resolved.league, startDate: resolved.startDate, endDate: resolved.endDate }
        };
      }
    } catch {
      // Try the next compatible historical source shape.
    }
  }

  return {
    rows: [],
    sourceConnected: false,
    sourceNote: "No compatible historical trend source returned rows. Backtest runner will not persist generated systems until source rows are available.",
    stats: { rowsLoaded: 0, rowsSkipped: 0, league: resolved.league, startDate: resolved.startDate, endDate: resolved.endDate }
  };
}
