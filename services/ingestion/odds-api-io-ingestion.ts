import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { defaultOddsApiIoBookmakers, OddsApiIoClient } from "@/services/data-providers/odds-api-io/client";
import { normalizeOddsApiIoEvents, normalizeOddsApiIoOdds, type OddsApiIoNormalizedEvent, type OddsApiIoNormalizedOddsRow } from "@/services/data-providers/odds-api-io/normalizer";

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

function eventTokens(eventLabel: string) {
  return normalizeText(eventLabel).split(" ").filter((token) => token.length >= 3 && !["the", "and", "at", "vs"].includes(token));
}

async function resolveInternalEventId(event: OddsApiIoNormalizedEvent) {
  if (!event.startTime || !event.league) return null;
  try {
    const start = new Date(event.startTime);
    const min = new Date(start);
    min.setUTCHours(min.getUTCHours() - 18);
    const max = new Date(start);
    max.setUTCHours(max.getUTCHours() + 18);
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT e.id, e.name
      FROM events e
      JOIN leagues l ON l.id = e.league_id
      WHERE l.key = ${event.league}
        AND e.start_time >= ${min}
        AND e.start_time <= ${max}
      LIMIT 50
    `;
    const tokens = eventTokens(event.eventLabel);
    const scored = rows.map((row) => {
      const name = normalizeText(row.name);
      const score = tokens.reduce((total, token) => total + (name.includes(token) ? 1 : 0), 0);
      return { ...row, score };
    }).sort((left, right) => right.score - left.score);
    return scored[0]?.score ? scored[0].id : null;
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
    ON CONFLICT (source, source_book_id) DO UPDATE SET
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
    ON CONFLICT (source, source_snapshot_id) DO UPDATE SET
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
    ON CONFLICT (source, source_line_id) DO NOTHING
  `;
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
  const eventsResponse = await client.getEvents({ sport: options.sport, league: options.league, status: options.status ?? "upcoming", from: window.from, to: window.to, bookmaker: options.bookmaker });
  providerMeta.push({ url: eventsResponse.meta.url, status: eventsResponse.meta.status, remaining: eventsResponse.meta.rateLimit.remaining });

  const events = normalizeOddsApiIoEvents(eventsResponse.data, { league: options.league ?? options.sport, sport: options.sport }).slice(0, options.eventLimit ?? 20);
  const bookmakers = options.bookmakers ?? defaultOddsApiIoBookmakers();
  const oddsRows: OddsApiIoNormalizedOddsRow[] = [];
  const eventIdMap = new Map<string, string>();

  for (const event of events) {
    const internalEventId = await resolveInternalEventId(event);
    if (internalEventId) eventIdMap.set(event.sourceEventId, internalEventId);
    const oddsResponse = await client.getEventOdds(event.sourceEventId, bookmakers);
    providerMeta.push({ url: oddsResponse.meta.url, status: oddsResponse.meta.status, remaining: oddsResponse.meta.rateLimit.remaining });
    oddsRows.push(...normalizeOddsApiIoOdds(oddsResponse.data, { sourceEventId: event.sourceEventId, league: event.league, sport: event.sport }));
  }

  let booksUpserted = 0;
  let snapshotsWritten = 0;
  let lineRowsWritten = 0;
  let skippedOddsRows = 0;

  if (!dryRun) {
    for (const row of oddsRows) {
      const eventId = eventIdMap.get(row.eventId) ?? row.eventId;
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
      oddsRows: oddsRows.length,
      booksUpserted,
      snapshotsWritten,
      lineRowsWritten,
      skippedOddsRows
    },
    samples: { events: events.slice(0, 8), oddsRows: oddsRows.slice(0, 12) }
  };
}
