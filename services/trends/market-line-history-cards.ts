import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { GameStatus, LeagueKey, MarketType, SportCode, TrendCardView, TrendFilters, TrendMatchView, TrendTableRow } from "@/lib/types/domain";

export type MarketLineHistoryPayload = {
  cards: TrendCardView[];
  rows: TrendTableRow[];
  sourceNote: string;
};

type MarketLineHistoryMovementRow = {
  event_id: string;
  event_name: string;
  start_time: Date | string;
  status: string;
  league_key: string;
  sport: string;
  market_type: string;
  side: string;
  selection: string | null;
  sportsbook_name: string | null;
  sportsbook_id: string | null;
  old_price: number | null;
  new_price: number | null;
  old_point: number | null;
  new_point: number | null;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  sample_count: number | bigint;
  source: string | null;
};

function leagueToSport(league: LeagueKey | "ALL"): SportCode {
  if (league === "MLB") return "BASEBALL";
  if (league === "NBA") return "BASKETBALL";
  if (league === "NHL") return "HOCKEY";
  if (league === "NFL" || league === "NCAAF") return "FOOTBALL";
  if (league === "UFC") return "MMA";
  if (league === "BOXING") return "BOXING";
  return "OTHER";
}

function normalizeGameStatus(status: string): GameStatus {
  if (status === "LIVE" || status === "IN_PROGRESS") return "LIVE";
  if (status === "FINAL" || status === "COMPLETED") return "FINAL";
  if (status === "POSTPONED") return "POSTPONED";
  if (status === "CANCELED" || status === "CANCELLED") return "CANCELED";
  return "PREGAME";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(String(value));
}

function fmtOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function fmtLine(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function fmtDelta(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}${suffix}`;
}

function ageLabel(value: Date | string | null | undefined) {
  if (!value) return "time unknown";
  const movedAt = asDate(value);
  const ageMs = Date.now() - movedAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return movedAt.toISOString();
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function hrefFor(row: MarketLineHistoryMovementRow) {
  return `/sharktrends/matchup/${encodeURIComponent(row.league_key)}/${encodeURIComponent(row.event_id)}`;
}

function movementScore(row: MarketLineHistoryMovementRow) {
  const oldPrice = asNumber(row.old_price);
  const newPrice = asNumber(row.new_price);
  const oldPoint = asNumber(row.old_point);
  const newPoint = asNumber(row.new_point);
  const oddsDelta = oldPrice != null && newPrice != null ? Math.abs(newPrice - oldPrice) : 0;
  const lineDelta = oldPoint != null && newPoint != null ? Math.abs(newPoint - oldPoint) : 0;
  const samples = asNumber(row.sample_count) ?? 1;
  const recencyPenalty = Math.min(48, Math.max(0, (Date.now() - asDate(row.last_seen_at).getTime()) / 3600000));
  return oddsDelta * 2 + lineDelta * 20 + Math.min(samples, 8) - recencyPenalty;
}

function movementLabel(row: MarketLineHistoryMovementRow) {
  const oldPrice = asNumber(row.old_price);
  const newPrice = asNumber(row.new_price);
  const oldPoint = asNumber(row.old_point);
  const newPoint = asNumber(row.new_point);
  const oddsDelta = oldPrice != null && newPrice != null ? newPrice - oldPrice : null;
  const lineDelta = oldPoint != null && newPoint != null ? newPoint - oldPoint : null;
  const pieces = [
    oldPrice != null && newPrice != null ? `${fmtOdds(oldPrice)} → ${fmtOdds(newPrice)} (${fmtDelta(oddsDelta, "¢")})` : null,
    oldPoint != null || newPoint != null ? `line ${fmtLine(oldPoint)} → ${fmtLine(newPoint)} (${fmtDelta(lineDelta) ?? "0"})` : null
  ].filter(Boolean);
  return pieces.join(" · ") || "market line history captured";
}

function cardTone(row: MarketLineHistoryMovementRow): TrendCardView["tone"] {
  const score = movementScore(row);
  if (score >= 45) return "success";
  if (score >= 25) return "brand";
  if (score >= 12) return "premium";
  return "muted";
}

function matchView(row: MarketLineHistoryMovementRow): TrendMatchView {
  const league = row.league_key as LeagueKey;
  return {
    id: `market-history-match:${row.event_id}:${row.market_type}:${row.side}:${row.sportsbook_name ?? "book"}`,
    sport: leagueToSport(league),
    leagueKey: league,
    eventLabel: row.event_name,
    startTime: asDate(row.start_time).toISOString(),
    status: normalizeGameStatus(row.status),
    stateDetail: null,
    matchingLogic: `${league} | ${row.market_type} | ${row.side} | ${row.sportsbook_name ?? "book"}`,
    recommendedBetLabel: "MARKET UPDATE",
    oddsContext: movementLabel(row),
    matchupHref: hrefFor(row),
    boardHref: `/?league=${league}`,
    propsHref: null,
    supportNote: `Market line history from ${row.sportsbook_name ?? row.source ?? "provider"}; latest ${ageLabel(row.last_seen_at)}.`
  };
}

function rowToCard(row: MarketLineHistoryMovementRow): TrendCardView {
  const league = row.league_key as LeagueKey;
  const label = movementLabel(row);
  const oldPrice = asNumber(row.old_price);
  const newPrice = asNumber(row.new_price);
  const delta = oldPrice != null && newPrice != null ? newPrice - oldPrice : null;
  const sampleCount = asNumber(row.sample_count) ?? 1;
  return {
    id: `market-history:${row.event_id}:${row.market_type}:${row.side}:${row.sportsbook_name ?? "book"}:${row.selection ?? "selection"}`,
    title: `${row.event_name} · ${String(row.market_type).replace(/_/g, " ")} ${row.side}`,
    value: delta != null ? `${fmtDelta(delta, "¢")}` : label,
    hitRate: null,
    roi: null,
    sampleSize: sampleCount,
    dateRange: `Market history · ${league} · ${row.sportsbook_name ?? "book"} · ${ageLabel(row.last_seen_at)}`,
    note: `Proof: MARKET_LINE_HISTORY · ${row.sportsbook_name ?? "book"} · ${label}.`,
    explanation: `This card is generated from market_line_history rows written by provider ingestion. Event ${row.event_id}, market ${row.market_type}, side ${row.side}.`,
    whyItMatters: [
      `Price path: ${label}`,
      `Book: ${row.sportsbook_name ?? "unknown"}`,
      `Samples: ${sampleCount}`,
      `First seen: ${asDate(row.first_seen_at).toISOString()}`,
      `Last seen: ${asDate(row.last_seen_at).toISOString()}`
    ].join(" · "),
    caution: "Market history is source data only. Confirm current price, news context, and model agreement before action.",
    href: hrefFor(row),
    tone: cardTone(row),
    todayMatches: [matchView(row)]
  };
}

function rowToTable(row: MarketLineHistoryMovementRow): TrendTableRow {
  return {
    label: `${row.event_name} · ${String(row.market_type).replace(/_/g, " ")} ${row.side}`,
    movement: movementLabel(row),
    note: `${row.sportsbook_name ?? "book"} · ${ageLabel(row.last_seen_at)} · market_line_history · samples ${String(row.sample_count)}`,
    href: hrefFor(row)
  };
}

async function fetchMarketLineHistoryRows(filters: TrendFilters): Promise<MarketLineHistoryMovementRow[]> {
  const rows = await prisma.$queryRaw<MarketLineHistoryMovementRow[]>`
    WITH grouped AS (
      SELECT
        mlh.event_id,
        mlh.league,
        mlh.market_type,
        mlh.side,
        mlh.selection,
        mlh.sportsbook_id,
        mlh.sportsbook_name,
        COUNT(*) AS sample_count,
        MIN(mlh.captured_at) AS first_seen_at,
        MAX(mlh.captured_at) AS last_seen_at
      FROM market_line_history mlh
      JOIN events e ON e.id = mlh.event_id
      JOIN leagues l ON l.id = e.league_id
      WHERE mlh.captured_at >= now() - interval '7 days'
        AND (${filters.league} = 'ALL' OR l.key = ${filters.league})
        AND (${filters.market} = 'ALL' OR mlh.market_type = ${filters.market})
      GROUP BY mlh.event_id, mlh.league, mlh.market_type, mlh.side, mlh.selection, mlh.sportsbook_id, mlh.sportsbook_name
    )
    SELECT
      g.event_id,
      e.name AS event_name,
      e.start_time,
      e.status::text AS status,
      l.key AS league_key,
      l.sport::text AS sport,
      g.market_type,
      g.side,
      g.selection,
      g.sportsbook_name,
      g.sportsbook_id,
      first_row.price AS old_price,
      latest_row.price AS new_price,
      first_row.point AS old_point,
      latest_row.point AS new_point,
      g.first_seen_at,
      g.last_seen_at,
      g.sample_count,
      latest_row.source
    FROM grouped g
    JOIN events e ON e.id = g.event_id
    JOIN leagues l ON l.id = e.league_id
    JOIN LATERAL (
      SELECT price, point
      FROM market_line_history mlh
      WHERE mlh.event_id = g.event_id
        AND mlh.market_type = g.market_type
        AND mlh.side = g.side
        AND COALESCE(mlh.selection, '') = COALESCE(g.selection, '')
        AND COALESCE(mlh.sportsbook_name, '') = COALESCE(g.sportsbook_name, '')
      ORDER BY mlh.captured_at ASC
      LIMIT 1
    ) first_row ON TRUE
    JOIN LATERAL (
      SELECT price, point, source
      FROM market_line_history mlh
      WHERE mlh.event_id = g.event_id
        AND mlh.market_type = g.market_type
        AND mlh.side = g.side
        AND COALESCE(mlh.selection, '') = COALESCE(g.selection, '')
        AND COALESCE(mlh.sportsbook_name, '') = COALESCE(g.sportsbook_name, '')
      ORDER BY mlh.captured_at DESC
      LIMIT 1
    ) latest_row ON TRUE
    ORDER BY g.last_seen_at DESC
    LIMIT 200
  `;
  return rows;
}

export async function buildMarketLineHistoryMovementPayload(filters: TrendFilters): Promise<MarketLineHistoryPayload> {
  if (!hasUsableServerDatabaseUrl()) {
    return { cards: [], rows: [], sourceNote: "Market line-history fallback skipped because DATABASE_URL is unavailable." };
  }

  try {
    const rows = (await fetchMarketLineHistoryRows(filters)).sort((left, right) => movementScore(right) - movementScore(left));
    const cards = rows.slice(0, 12).map(rowToCard);
    return {
      cards,
      rows: rows.slice(0, 20).map(rowToTable),
      sourceNote: cards.length
        ? `${cards.length} market movement card${cards.length === 1 ? "" : "s"} built from market_line_history provider rows.`
        : "No market_line_history rows matched current games and filters."
    };
  } catch (error) {
    return {
      cards: [],
      rows: [],
      sourceNote: error instanceof Error ? `Market line-history fallback unavailable: ${error.message}` : "Market line-history fallback unavailable."
    };
  }
}
