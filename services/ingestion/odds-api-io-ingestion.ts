import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { defaultOddsApiIoBookmakers, OddsApiIoClient } from "@/services/data-providers/odds-api-io/client";
import { filterOddsApiIoMainBoardRows, normalizeOddsApiIoEvents, normalizeOddsApiIoOdds, type OddsApiIoNormalizedEvent, type OddsApiIoNormalizedOddsRow } from "@/services/data-providers/odds-api-io/normalizer";

const LEAGUE_API_SLUG: Record<string, string> = {
  MLB: "usa-mlb",
  NPB: "japan-npb",
  KBO: "republic-of-korea-kbo-league",
};

const STATUS_API_MAP: Record<string, string> = {
  upcoming: "pending",
};

const INTERNAL_EVENT_MATCH_WINDOW_HOURS = 6;

function toApiLeagueSlug(league?: string): string | undefined {
  if (!league) return undefined;
  return LEAGUE_API_SLUG[league.toUpperCase()] ?? league.toLowerCase();
}

function toApiStatus(status?: string): string | undefined {
  if (!status) return undefined;
  return STATUS_API_MAP[status.toLowerCase()] ?? status;
}

export type OddsApiIoIngestionOptions = {
  sport: string;
  league?: string;
  status?: string;
  from?: string;
  to?: string;
  bookmaker?: string;
  bookmakers?: string;
  eventLimit?: number;
  dryRun?: boolean;
};

export type OddsApiIoIngestionResult = {
  generatedAt: string;
  dryRun: boolean;
  configured: boolean;
  sourceNote: string;
  providerMeta: Array<{ url: string; status: number; remaining: string | null }>;
  stats: {
    providerEvents: number;
    matchedInternalEvents: number;
    oddsRows: number;
    booksUpserted: number;
    snapshotsWritten: number;
    lineRowsWritten: number;
    skippedOddsRows: number;
  };
  samples: {
    events: OddsApiIoNormalizedEvent[];
    oddsRows: OddsApiIoNormalizedOddsRow[];
  };
};

function dateWindow(from?: string, to?: string) {
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date();
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date(start);
  if (!to) end.setUTCDate(start.getUTCDate() + 2);
  return {
    from: Number.isNaN(start.getTime()) ? undefined : start.toISOString(),
    to: Number.isNaN(end.getTime()) ? undefined : end.toISOString()
  };
}

function idSafe(value: string) {
  return value.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 180);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function canonicalLeague(league?: string, sport?: string) {
  const raw = String(league ?? "").toUpperCase();
  if (raw === "MLB" || raw.includes("MLB")) return "MLB";
  if (raw === "NBA" || raw.includes("NBA")) return "NBA";
  if (raw === "NFL" || raw.includes("NFL")) return "NFL";
  if (raw === "NHL" || raw.includes("NHL")) return "NHL";
  if (raw === "NCAAF" || raw.includes("NCAAF")) return "NCAAF";
  if (raw === "UFC" || raw.includes("UFC")) return "UFC";
  const sportText = String(sport ?? "").toLowerCase();
  if (sportText === "baseball") return "MLB";
  return raw || "ALL";
}

function eventTokens(eventLabel: string) {
  return normalizeText(eventLabel).split(" ").filter((token) => token.length >= 3 && !["the", "and", "at", "vs"].includes(token));
}

type InternalEventCandidate = { id: string; name: string; startTime: Date };

async function findEventCandidates(event: OddsApiIoNormalizedEvent, min: Date, max: Date, strictLeague: boolean) {
  if (strictLeague) {
    return prisma.$queryRaw<InternalEventCandidate[]>`
      SELECT e.id, e.name, e."startTime"
      FROM events e
      JOIN leagues l ON l.id = e."leagueId"
      WHERE l.key = ${event.league}
        AND e."startTime" >= ${min}
        AND e."startTime" <= ${max}
      LIMIT 50
    `;
  }
  return prisma.$queryRaw<InternalEventCandidate[]>`
    SELECT e.id, e.name, e."startTime"
    FROM events e
    JOIN leagues l ON l.id = e."leagueId"
    WHERE e."startTime" >= ${min}
      AND e."startTime" <= ${max}
    LIMIT 100
  `;
}

async function resolveInternalEventId(event: OddsApiIoNormalizedEvent) {
  if (!event.startTime) return null;
  try {
    const start = new Date(event.startTime);
    const min = new Date(start);
    min.setUTCHours(min.getUTCHours() - INTERNAL_EVENT_MATCH_WINDOW_HOURS);
    const max = new Date(start);
    max.setUTCHours(max.getUTCHours() + INTERNAL_EVENT_MATCH_WINDOW_HOURS);
    const tokens = eventTokens(event.eventLabel);

    for (const strictLeague of [true, false]) {
      const rows = await findEventCandidates(event, min, max, strictLeague);
      const scored = rows.map((row) => {
        const name = normalizeText(row.name);
        const score = tokens.reduce((total, token) => total + (name.includes(token) ? 1 : 0), 0);
        const timeDeltaMs = Math.abs(new Date(row.startTime).getTime() - start.getTime());
        return { ...row, score, timeDeltaMs };
      }).sort((left, right) => right.score - left.score || left.timeDeltaMs - right.timeDeltaMs);
      if (scored[0]?.score) return scored[0].id;
    }

    return null;
  } catch {
    return null;
  }
}

async function upsertBook(row: OddsApiIoNormalizedOddsRow) {
  if (!row.sportsbookName) return false;
  const id = idSafe(`oddsapiio:${row.sportsbookName}`);
  await prisma.$executeRaw`
    INSERT INTO market_books (id, name, display_name, source, source_book_id, updated_at)
    VALUES (${id}, ${row.sportsbookName}, ${row.sportsbookName}, 'odds-api-io', ${row.sportsbookName}, now())
    ON CONFLICT ON CONSTRAINT market_books_source_book_uniq DO UPDATE SET
      name = EXCLUDED.name,
      display_name = EXCLUDED.display_name,
      updated_at = now()
  `;
  return true;
}

async function writeSnapshot(row: OddsApiIoNormalizedOddsRow, eventId: string) {
  const bookId = row.sportsbookName ? idSafe(`oddsapiio:${row.sportsbookName}`) : null;
  await prisma.$executeRaw`
    INSERT INTO market_odds_snapshots (
      id,
      event_id,
      league,
      sport,
      market_type,
      side,
      selection,
      sportsbook_id,
      sportsbook_name,
      price,
      point,
      current_price,
      current_point,
      source,
      source_snapshot_id,
      captured_at,
      updated_at
    ) VALUES (
      ${row.id},
      ${eventId},
      ${row.league},
      ${row.sport},
      ${row.marketType},
      ${row.side},
      ${row.selection},
      ${bookId},
      ${row.sportsbookName},
      ${row.price},
      ${row.point},
      ${row.price},
      ${row.point},
      'odds-api-io',
      ${row.sourceSnapshotId},
      ${new Date(row.capturedAt)},
      now()
    )
    ON CONFLICT (source, source_snapshot_id) WHERE source_snapshot_id IS NOT NULL DO UPDATE SET
      event_id = EXCLUDED.event_id,
      league = EXCLUDED.league,
      price = EXCLUDED.price,
      point = EXCLUDED.point,
      current_price = EXCLUDED.current_price,
      current_point = EXCLUDED.current_point,
      captured_at = EXCLUDED.captured_at,
      updated_at = now()
  `;
}

async function writeLineHistory(row: OddsApiIoNormalizedOddsRow, eventId: string) {
  const id = idSafe(`oddsapiio-line:${row.sourceSnapshotId}:${row.capturedAt}`);
  const bookId = row.sportsbookName ? idSafe(`oddsapiio:${row.sportsbookName}`) : null;
  await prisma.$executeRaw`
    INSERT INTO market_line_history (
      id,
      event_id,
      league,
      sport,
      market_type,
      side,
      selection,
      sportsbook_id,
      sportsbook_name,
      price,
      point,
      source,
      source_line_id,
      captured_at
    ) VALUES (
      ${id},
      ${eventId},
      ${row.league},
      ${row.sport},
      ${row.marketType},
      ${row.side},
      ${row.selection},
      ${bookId},
      ${row.sportsbookName},
      ${row.price},
      ${row.point},
      'odds-api-io',
      ${id},
      ${new Date(row.capturedAt)}
    )
    ON CONFLICT (source, source_line_id) WHERE source_line_id IS NOT NULL DO NOTHING
  `;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function oddsPayloadsByEventId(data: unknown, events: OddsApiIoNormalizedEvent[]) {
  const byId = new Map<string, unknown>();
  const fallback = new Map(events.map((event) => [String(event.sourceEventId), event]));
  const rows = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).data) ? (data as Record<string, unknown>).data as unknown[] : [data];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    const id = String(obj.id ?? obj.eventId ?? obj.event_id ?? "").trim();
    if (id) byId.set(id, obj);
  }

  if (byId.size === 1 && events.length === 1 && !byId.has(events[0].sourceEventId)) {
    return new Map([[events[0].sourceEventId, rows[0]]]);
  }

  for (const event of fallback.values()) {
    if (!byId.has(event.sourceEventId) && rows.length === 1 && events.length === 1) byId.set(event.sourceEventId, rows[0]);
  }
  return byId;
}

export async function ingestOddsApiIo(options: OddsApiIoIngestionOptions): Promise<OddsApiIoIngestionResult> {
  const dryRun = options.dryRun ?? true;
  const client = new OddsApiIoClient();
  const configured = client.isConfigured();
  const providerMeta: OddsApiIoIngestionResult["providerMeta"] = [];

  if (!configured) {
    return {
      generatedAt: new Date().toISOString(),
      dryRun,
      configured: false,
      sourceNote: "ODDS_API_IO_KEY is not configured. Add it in Vercel environment variables before running ingestion.",
      providerMeta,
      stats: { providerEvents: 0, matchedInternalEvents: 0, oddsRows: 0, booksUpserted: 0, snapshotsWritten: 0, lineRowsWritten: 0, skippedOddsRows: 0 },
      samples: { events: [], oddsRows: [] }
    };
  }

  if (!hasUsableServerDatabaseUrl()) {
    return {
      generatedAt: new Date().toISOString(),
      dryRun,
      configured,
      sourceNote: "DATABASE_URL is not configured. Ingestion cannot write market rows.",
      providerMeta,
      stats: { providerEvents: 0, matchedInternalEvents: 0, oddsRows: 0, booksUpserted: 0, snapshotsWritten: 0, lineRowsWritten: 0, skippedOddsRows: 0 },
      samples: { events: [], oddsRows: [] }
    };
  }

  const window = dateWindow(options.from, options.to);
  const canonical = canonicalLeague(options.league, options.sport);
  const bookmakers = options.bookmakers ?? defaultOddsApiIoBookmakers();
  const primaryBookmaker = options.bookmaker ?? bookmakers.split(",").map((book) => book.trim()).find(Boolean);
  const eventsResponse = await client.getEvents({ sport: options.sport, league: toApiLeagueSlug(options.league), status: toApiStatus(options.status ?? "upcoming"), from: window.from, to: window.to, bookmaker: primaryBookmaker });
  providerMeta.push({ url: eventsResponse.meta.url, status: eventsResponse.meta.status, remaining: eventsResponse.meta.rateLimit.remaining });

  const events = normalizeOddsApiIoEvents(eventsResponse.data, { league: canonical, sport: options.sport })
    .map((event) => ({ ...event, league: canonicalLeague(canonical, options.sport) }))
    .slice(0, options.eventLimit ?? 20);
  const rawOddsRows: OddsApiIoNormalizedOddsRow[] = [];
  const eventIdMap = new Map<string, string>();

  await Promise.all(events.map(async (event) => {
    const internalEventId = await resolveInternalEventId(event);
    if (internalEventId) eventIdMap.set(event.sourceEventId, internalEventId);
  }));

  for (const group of chunk(events, 10)) {
    try {
      const oddsResponse = group.length > 1
        ? await client.getMultiOdds(group.map((event) => event.sourceEventId), bookmakers)
        : await client.getEventOdds(group[0].sourceEventId, bookmakers);
      providerMeta.push({ url: oddsResponse.meta.url, status: oddsResponse.meta.status, remaining: oddsResponse.meta.rateLimit.remaining });
      const payloads = oddsPayloadsByEventId(oddsResponse.data, group);
      for (const event of group) {
        const payload = payloads.get(event.sourceEventId);
        if (!payload) continue;
        rawOddsRows.push(...normalizeOddsApiIoOdds(payload, { sourceEventId: event.sourceEventId, league: event.league, sport: event.sport }));
      }
    } catch {
      for (const event of group) {
        const oddsResponse = await client.getEventOdds(event.sourceEventId, bookmakers);
        providerMeta.push({ url: oddsResponse.meta.url, status: oddsResponse.meta.status, remaining: oddsResponse.meta.rateLimit.remaining });
        rawOddsRows.push(...normalizeOddsApiIoOdds(oddsResponse.data, { sourceEventId: event.sourceEventId, league: event.league, sport: event.sport }));
      }
    }
  }

  const oddsRows = filterOddsApiIoMainBoardRows(rawOddsRows);
  const writableOddsRows = oddsRows.filter((row) => eventIdMap.has(row.eventId));

  let booksUpserted = 0;
  let snapshotsWritten = 0;
  let lineRowsWritten = 0;
  let skippedOddsRows = oddsRows.length - writableOddsRows.length;

  if (!dryRun) {
    for (const row of writableOddsRows) {
      const eventId = eventIdMap.get(row.eventId);
      if (!eventId) {
        skippedOddsRows += 1;
        continue;
      }
      if (row.sportsbookName && await upsertBook(row)) booksUpserted += 1;
      if (row.price == null || row.marketType === "unknown" || row.side === "unknown") {
        skippedOddsRows += 1;
        continue;
      }
      await writeSnapshot(row, eventId);
      snapshotsWritten += 1;
      await writeLineHistory(row, eventId);
      lineRowsWritten += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    configured,
    sourceNote: dryRun
      ? "Dry-run complete. Set dryRun=false with the ingestion secret to write market rows."
      : "Odds-API.io ingestion wrote normalized market odds snapshots and line-history rows.",
    providerMeta,
    stats: {
      providerEvents: events.length,
      matchedInternalEvents: eventIdMap.size,
      oddsRows: writableOddsRows.length,
      booksUpserted,
      snapshotsWritten,
      lineRowsWritten,
      skippedOddsRows
    },
    samples: { events: events.slice(0, 8), oddsRows: writableOddsRows.slice(0, 12) }
  };
}
