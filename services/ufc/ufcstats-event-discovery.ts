export type UfcStatsDiscoveredEvent = {
  sourceEventId: string;
  eventName: string;
  eventUrl: string;
  eventDate: string | null;
};

export type UfcStatsEventDiscoveryResult = {
  ok: boolean;
  checkedUrl: string;
  eventCount: number;
  events: UfcStatsDiscoveredEvent[];
  warnings: string[];
};

const EVENTS_COMPLETED_URL = "http://ufcstats.com/statistics/events/completed?page=all";
const USER_AGENT = "SharkEdge-UFCStats-EventDiscovery/1.0";

const strip = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const idFromUrl = (url: string, fallback: string) => `ufcstats-${url.match(/event-details\/([a-z0-9]+)/i)?.[1] ?? slug(fallback)}`;

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function rowCells(rowHtml: string) {
  return [...rowHtml.matchAll(/<td[\s\S]*?<\/td>/gi)].map((match) => strip(match[0]));
}

function parseEventRows(html: string): UfcStatsDiscoveredEvent[] {
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const events: UfcStatsDiscoveredEvent[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const link = row.match(/href=["']([^"']*event-details[^"']+)["']/i)?.[1];
    if (!link || seen.has(link)) continue;
    const cells = rowCells(row);
    const rawTitle = strip(row.match(/event-details[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? cells[0] ?? "");
    const eventName = rawTitle || `UFCStats Event ${events.length + 1}`;
    const dateCell = cells.find((cell) => /\b\d{4}\b/.test(cell)) ?? null;
    seen.add(link);
    events.push({
      sourceEventId: idFromUrl(link, eventName),
      eventName,
      eventUrl: link,
      eventDate: parseDate(dateCell)
    });
  }

  return events;
}

export async function discoverCompletedUfcStatsEvents(options: { limit?: number; url?: string; fetchImpl?: typeof fetch } = {}): Promise<UfcStatsEventDiscoveryResult> {
  const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 3)));
  const url = options.url ?? EVENTS_COMPLETED_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const warnings: string[] = [];

  try {
    const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`UFCStats completed events fetch failed ${response.status}`);
    const html = await response.text();
    const events = parseEventRows(html).slice(0, limit);
    if (!events.length) warnings.push("No UFCStats completed event rows parsed.");
    return { ok: warnings.length === 0, checkedUrl: url, eventCount: events.length, events, warnings };
  } catch (error) {
    return {
      ok: false,
      checkedUrl: url,
      eventCount: 0,
      events: [],
      warnings: [error instanceof Error ? error.message : String(error)]
    };
  }
}
