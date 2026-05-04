import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type MarketIntelligenceOptions = {
  league?: string | "ALL";
  date?: string;
  limitEvents?: number;
};

export type MarketIntelligenceSignal = {
  eventId: string;
  eventLabel: string;
  league: string;
  sport: string;
  startTime: string;
  status: string;
  sourceStatus: "sourced" | "partial" | "unavailable";
  lineMovement: {
    openPrice: number | null;
    currentPrice: number | null;
    closingPrice: number | null;
    moveDirection: "toward_side" | "against_side" | "flat" | "unknown";
    moveAmount: number | null;
    source: string;
  };
  clv: {
    clvPct: number | null;
    label: "positive" | "negative" | "neutral" | "unknown";
  };
  bookDisagreement: {
    bookCount: number;
    bestPrice: number | null;
    worstPrice: number | null;
    spread: number | null;
    label: "wide" | "normal" | "unknown";
  };
  splits: {
    betPct: number | null;
    moneyPct: number | null;
    diffPct: number | null;
    ticketCount: number | null;
    label: "sharp_lean" | "public_side" | "balanced" | "not_sourced";
  };
  reasons: string[];
  blockers: string[];
};

export type MarketIntelligencePayload = {
  generatedAt: string;
  sourceNote: string;
  signals: MarketIntelligenceSignal[];
  stats: {
    eventsScanned: number;
    sourcedSignals: number;
    partialSignals: number;
    unavailableSignals: number;
  };
};

type EventRow = {
  id: string;
  name: string;
  starttime: Date | string;
  status: string;
  sport: string;
  leaguekey: string;
  metadatajson: Record<string, unknown> | null;
};

type OddsRow = Record<string, unknown>;

function dayRange(date?: string) {
  const anchor = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(anchor.getTime())) return dayRange();
  const start = new Date(anchor);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 1);
  return { start, end };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function americanImplied(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price) || price === 0) return null;
  if (price > 0) return 100 / (price + 100);
  return Math.abs(price) / (Math.abs(price) + 100);
}

function clvPct(open: number | null, close: number | null) {
  const openProb = americanImplied(open);
  const closeProb = americanImplied(close);
  if (openProb == null || closeProb == null) return null;
  return Number(((closeProb - openProb) * 100).toFixed(2));
}

function movement(open: number | null, current: number | null, close: number | null) {
  const target = current ?? close;
  if (open == null || target == null) return { moveDirection: "unknown" as const, moveAmount: null };
  const amount = Number((target - open).toFixed(2));
  if (Math.abs(amount) < 0.01) return { moveDirection: "flat" as const, moveAmount: 0 };
  return { moveDirection: amount < 0 ? "toward_side" as const : "against_side" as const, moveAmount: amount };
}

function splitLabel(betPct: number | null, moneyPct: number | null) {
  if (betPct == null || moneyPct == null) return { diffPct: null, label: "not_sourced" as const };
  const diffPct = Number((moneyPct - betPct).toFixed(2));
  if (diffPct >= 10) return { diffPct, label: "sharp_lean" as const };
  if (diffPct <= -10) return { diffPct, label: "public_side" as const };
  return { diffPct, label: "balanced" as const };
}

function statusFromParts(hasOdds: boolean, hasSplits: boolean) {
  if (hasOdds && hasSplits) return "sourced" as const;
  if (hasOdds || hasSplits) return "partial" as const;
  return "unavailable" as const;
}

async function fetchTodaysEvents(options: Required<Pick<MarketIntelligenceOptions, "league" | "limitEvents">> & { start: Date; end: Date }) {
  const rows = await prisma.$queryRaw<EventRow[]>`
    SELECT
      e.id,
      e.name,
      e.start_time AS startTime,
      e.status::text AS status,
      e.metadata_json AS metadataJson,
      l.key AS leagueKey,
      l.sport::text AS sport
    FROM events e
    JOIN leagues l ON l.id = e.league_id
    WHERE e.start_time >= ${options.start}
      AND e.start_time < ${options.end}
      AND (${options.league} = 'ALL' OR l.key = ${options.league})
    ORDER BY e.start_time ASC
    LIMIT ${options.limitEvents}
  `;

  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name),
    starttime: row.starttime instanceof Date ? row.starttime : new Date(String(row.starttime)),
    status: String(row.status),
    sport: String(row.sport),
    leaguekey: String(row.leaguekey),
    metadatajson: (row.metadatajson ?? null) as Record<string, unknown> | null
  }));
}

async function fetchOddsRows(eventIds: string[]) {
  if (!eventIds.length) return [];
  try {
    const rows = await prisma.$queryRaw<OddsRow[]>`
      SELECT
        event_id,
        sportsbook_id,
        sportsbook_name,
        market_type,
        side,
        price,
        open_price,
        close_price,
        current_price,
        updated_at
      FROM odds
      WHERE event_id = ANY(${eventIds})
    `;
    return rows;
  } catch {
    return [];
  }
}

async function fetchSplitRows(eventIds: string[]) {
  if (!eventIds.length) return [];
  try {
    const rows = await prisma.$queryRaw<OddsRow[]>`
      SELECT
        event_id,
        market_type,
        side,
        bet_pct,
        money_pct,
        ticket_count,
        updated_at
      FROM betting_splits
      WHERE event_id = ANY(${eventIds})
    `;
    return rows;
  } catch {
    return [];
  }
}

function oddsForEvent(rows: OddsRow[], eventId: string) {
  return rows.filter((row) => String(row.event_id) === eventId);
}

function splitsForEvent(rows: OddsRow[], eventId: string) {
  return rows.filter((row) => String(row.event_id) === eventId);
}

function buildSignal(event: EventRow, oddsRows: OddsRow[], splitRows: OddsRow[]): MarketIntelligenceSignal {
  const prices = oddsRows.map((row) => asNumber(row.price ?? row.current_price)).filter((value): value is number => typeof value === "number");
  const openPrice = oddsRows.map((row) => asNumber(row.open_price)).find((value) => value != null) ?? null;
  const currentPrice = prices.length ? Math.round(prices.reduce((total, value) => total + value, 0) / prices.length) : null;
  const closingPrice = oddsRows.map((row) => asNumber(row.close_price)).find((value) => value != null) ?? null;
  const bestPrice = prices.length ? Math.max(...prices) : null;
  const worstPrice = prices.length ? Math.min(...prices) : null;
  const spread = bestPrice != null && worstPrice != null ? bestPrice - worstPrice : null;
  const movementData = movement(openPrice, currentPrice, closingPrice);
  const clv = clvPct(openPrice, closingPrice ?? currentPrice);
  const split = splitRows[0];
  const betPct = asNumber(split?.bet_pct);
  const moneyPct = asNumber(split?.money_pct);
  const ticketCount = asNumber(split?.ticket_count);
  const splitSummary = splitLabel(betPct, moneyPct);
  const hasOdds = oddsRows.length > 0;
  const hasSplits = splitRows.length > 0;
  const sourceStatus = statusFromParts(hasOdds, hasSplits);
  const reasons: string[] = [];
  const blockers: string[] = [];

  if (movementData.moveDirection === "toward_side") reasons.push("Line moved toward the tracked side.");
  if (movementData.moveDirection === "against_side") blockers.push("Line moved against the tracked side.");
  if (clv != null && clv >= 0) reasons.push("CLV is non-negative from available prices.");
  if (clv != null && clv < 0) blockers.push("CLV is negative from available prices.");
  if (spread != null && spread >= 20) reasons.push("Books disagree enough to require shopping price.");
  if (splitSummary.label === "sharp_lean") reasons.push("Money percentage is meaningfully higher than bet percentage.");
  if (splitSummary.label === "public_side") blockers.push("Bet percentage is meaningfully higher than money percentage.");
  if (!hasOdds) blockers.push("Odds source unavailable for this event.");
  if (!hasSplits) blockers.push("Betting splits are not sourced for this event.");

  return {
    eventId: event.id,
    eventLabel: event.name,
    league: event.leaguekey,
    sport: event.sport,
    startTime: new Date(event.starttime).toISOString(),
    status: event.status,
    sourceStatus,
    lineMovement: {
      openPrice,
      currentPrice,
      closingPrice,
      moveDirection: movementData.moveDirection,
      moveAmount: movementData.moveAmount,
      source: hasOdds ? "odds" : "not_sourced"
    },
    clv: {
      clvPct: clv,
      label: clv == null ? "unknown" : clv > 0 ? "positive" : clv < 0 ? "negative" : "neutral"
    },
    bookDisagreement: {
      bookCount: new Set(oddsRows.map((row) => String(row.sportsbook_id ?? row.sportsbook_name ?? "book"))).size,
      bestPrice,
      worstPrice,
      spread,
      label: spread == null ? "unknown" : spread >= 20 ? "wide" : "normal"
    },
    splits: {
      betPct,
      moneyPct,
      diffPct: splitSummary.diffPct,
      ticketCount,
      label: splitSummary.label
    },
    reasons,
    blockers
  };
}

export async function buildMarketIntelligencePayload(options: MarketIntelligenceOptions = {}): Promise<MarketIntelligencePayload> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Market intelligence unavailable because DATABASE_URL is not configured.",
      signals: [],
      stats: { eventsScanned: 0, sourcedSignals: 0, partialSignals: 0, unavailableSignals: 0 }
    };
  }

  const { start, end } = dayRange(options.date);
  const league = (options.league ?? "ALL").toUpperCase();
  const limitEvents = options.limitEvents ?? 100;

  try {
    const events = await fetchTodaysEvents({ league, limitEvents, start, end });
    const eventIds = events.map((event) => event.id);
    const [oddsRows, splitRows] = await Promise.all([fetchOddsRows(eventIds), fetchSplitRows(eventIds)]);
    const signals = events.map((event) => buildSignal(event, oddsForEvent(oddsRows, event.id), splitsForEvent(splitRows, event.id)));

    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Market intelligence uses sourced odds/splits tables when available. Missing splits are explicitly labeled not sourced.",
      signals,
      stats: {
        eventsScanned: events.length,
        sourcedSignals: signals.filter((signal) => signal.sourceStatus === "sourced").length,
        partialSignals: signals.filter((signal) => signal.sourceStatus === "partial").length,
        unavailableSignals: signals.filter((signal) => signal.sourceStatus === "unavailable").length
      }
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: error instanceof Error ? `Market intelligence unavailable: ${error.message}` : "Market intelligence unavailable.",
      signals: [],
      stats: { eventsScanned: 0, sourcedSignals: 0, partialSignals: 0, unavailableSignals: 0 }
    };
  }
}
