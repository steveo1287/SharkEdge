import { parseUfcStatsEventPage } from "@/services/ufc/ufcstats-parser";
import { normalizeName, scheduledRounds, slug, type UfcUpcomingProviderResult, type UfcUpcomingSourceEvent, type UfcUpcomingSourceFight } from "@/services/ufc/upcoming-card-types";

const DEFAULT_USER_AGENT = "SharkEdge-UFC-UpcomingCards/1.0";
const UNPARSED_EVENT_DATE = "UNPARSED_EVENT_DATE";
const MAX_GENERIC_EVENT_LINKS = 12;

async function getHtml(url: string, fetchImpl: typeof fetch) {
  const response = await fetchImpl(url, { headers: { "User-Agent": DEFAULT_USER_AGENT } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  return response.text();
}

function strip(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}

function absolute(url: string, base: string) {
  try { return new URL(url, base).toString(); } catch { return url; }
}

function idFromUrl(prefix: string, url: string) {
  const pathname = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  return `${prefix}-${slug(pathname)}`;
}

function dateFromText(text: string) {
  const match = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i);
  return match?.[0] ?? null;
}

function dateTimeFromText(text: string) {
  const match = text.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  return match ? `${match[1]} ${match[2]}` : dateFromText(text);
}

function dateFromUrlSlug(url: string) {
  const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();
  const dayMonthYear = path.match(/(?:^|[-_/])(\d{1,2})[-_](\d{1,2})[-_](\d{4})(?:$|[-_/])/);
  if (!dayMonthYear) return null;
  const day = Number(dayMonthYear[1]);
  const month = Number(dayMonthYear[2]);
  const year = Number(dayMonthYear[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`;
}

function eventDateFrom(text: string, sourceUrl?: string | null) {
  return dateTimeFromText(text) ?? (sourceUrl ? dateFromUrlSlug(sourceUrl) : null) ?? UNPARSED_EVENT_DATE;
}

function isParseableEventDate(value: string | null | undefined) {
  if (!value || value === UNPARSED_EVENT_DATE) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function titleCaseDayDate(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\s+-\s+/g, " ");
}

function fightFromNames(sourceName: UfcUpcomingSourceFight["sourceName"], names: string[], sourceUrl: string, index: number): UfcUpcomingSourceFight | null {
  if (names.length < 2) return null;
  return {
    sourceName,
    sourceUrl,
    sourceFightId: `${sourceName}-${slug(names[0])}-vs-${slug(names[1])}-${index + 1}`,
    fighterAName: normalizeName(names[0]),
    fighterBName: normalizeName(names[1]),
    scheduledRounds: index === 0 ? 5 : 3,
    boutOrder: index + 1,
    cardSection: index < 5 ? "MAIN_CARD" : "PRELIMS",
    sourceStatus: sourceName === "ufc.com" ? "OFFICIAL_PARTIAL" : sourceName === "espn" ? "CROSS_CHECKED" : "EARLY_REPORTED",
    confidence: sourceName === "ufc.com" ? "OFFICIAL_PARTIAL" : sourceName === "espn" ? "CROSS_CHECKED" : "EARLY_REPORTED",
    isMainEvent: index === 0,
    payload: { parsedFrom: "name-pair" }
  };
}

export function parseUfcStatsUpcomingEventsList(html: string, baseUrl = "http://ufcstats.com/statistics/events/upcoming") {
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  return rows.flatMap((row) => {
    const href = row.match(/href=["']([^"']*event-details[^"']+)/i)?.[1];
    if (!href) return [];
    const url = absolute(href, baseUrl);
    return [{ url, sourceEventId: idFromUrl("ufcstats", url), label: strip(row) }];
  });
}

export async function fetchUfcStatsUpcomingProvider(options: { listUrl?: string; fetchImpl?: typeof fetch } = {}): Promise<UfcUpcomingProviderResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const listUrl = options.listUrl ?? "http://ufcstats.com/statistics/events/upcoming";
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const errors: string[] = [];
  const events: UfcUpcomingSourceEvent[] = [];
  try {
    const listHtml = await getHtml(listUrl, fetchImpl);
    for (const listedEvent of parseUfcStatsUpcomingEventsList(listHtml, listUrl)) {
      try {
        const eventHtml = await getHtml(listedEvent.url, fetchImpl);
        const event = parseUfcStatsEventPage(eventHtml, listedEvent.url);
        events.push({
          sourceName: "ufcstats",
          sourceUrl: listedEvent.url,
          sourceEventId: event.sourceEventId,
          eventName: event.eventName,
          eventDate: event.eventDate,
          location: event.location ?? null,
          sourceStatus: event.fights.length ? "OFFICIAL_CONFIRMED" : "OFFICIAL_PARTIAL",
          sourceUrls: { ufcstats: listedEvent.url },
          payload: { listedEvent },
          fights: event.fights.flatMap((fight, index) => {
            if (!fight.fighterAName || !fight.fighterBName) return [];
            return [{
              sourceName: "ufcstats",
              sourceUrl: fight.url,
              sourceEventId: event.sourceEventId,
              sourceFightId: fight.sourceFightId,
              fighterAName: fight.fighterAName,
              fighterBName: fight.fighterBName,
              weightClass: fight.weightClass ?? null,
              scheduledRounds: scheduledRounds(index === 0 ? 5 : 3),
              boutOrder: index + 1,
              cardSection: index < 5 ? "MAIN_CARD" : "PRELIMS",
              sourceStatus: "OFFICIAL_CONFIRMED",
              confidence: "OFFICIAL_CONFIRMED",
              isMainEvent: index === 0,
              payload: { provider: "ufcstats" }
            } satisfies UfcUpcomingSourceFight];
          })
        });
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { provider: "ufcstats", fetchedAt, events, warnings, errors };
}

export function parseMvpUpcomingEventsList(html: string, baseUrl = "https://www.mostvaluablepromotions.com/events/?filter=upcoming") {
  const text = strip(html);
  const links = [...html.matchAll(/href=["']([^"']*\/event\/[^"']+)["']/gi)]
    .map((match) => absolute(match[1], baseUrl))
    .filter((url) => /mostvaluablepromotions\.com\/event\//i.test(url));
  const uniqueLinks = [...new Set(links)];
  const upcoming = uniqueLinks.flatMap((url) => {
    const eventSlug = (() => {
      try { return new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? url; } catch { return url; }
    })();
    const slugLabel = eventSlug.replace(/-\d{6,8}$/i, "").replace(/-/g, " ");
    return [{
      url,
      sourceEventId: idFromUrl("mvp", url),
      label: normalizeName(slugLabel)
    }];
  });

  if (upcoming.length) return upcoming;

  const fallbackRows = [...text.matchAll(/([A-Z][A-Za-z0-9&'.: -]+?)\s+(?:SATURDAY|SUNDAY|FRIDAY|THURSDAY|WEDNESDAY|TUESDAY|MONDAY)\s+-\s+([A-Z]+\s+-\s+[A-Z]+\s+\d{1,2},\s+\d{4})/g)];
  return fallbackRows.map((match, index) => ({
    url: baseUrl,
    sourceEventId: `mvp-fallback-${index + 1}-${slug(match[1])}`,
    label: normalizeName(match[1]),
    dateLabel: titleCaseDayDate(match[2])
  }));
}

function mvpLocation(text: string) {
  const match = text.match(/(?:\d{1,2}:\d{2}\s*[AP]M)\s+([^#]+?)(?:\s+Ticketmaster|\s+How to Watch|\s+Main Card|\s+Prelims)/i);
  return normalizeName(match?.[1] ?? "");
}

function mvpEventSport(text: string): "MMA" | "BOXING" | "COMBAT" {
  if (/Professional\s+MMA\s+Bout|MVP\s+MMA/i.test(text)) return "MMA";
  if (/World\s+Championship|Professional\s+Boxing\s+Bout|MVPW|boxing/i.test(text)) return "BOXING";
  return "COMBAT";
}

function isUpcomingEventDate(value: string, now = Date.now()) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return time >= now - 12 * 60 * 60 * 1000;
}

function parseMvpFightSegment(segment: string, sourceUrl: string, index: number, fallbackSport: "MMA" | "BOXING" | "COMBAT" = "COMBAT"): UfcUpcomingSourceFight | null {
  const compact = strip(segment);
  if (!/\bVS\b/.test(compact) || !/View Stats/i.test(compact)) return null;
  if (/\bWINNER\s*\|/i.test(compact)) return null;
  const sport: "MMA" | "BOXING" | "COMBAT" = /Professional\s+MMA\s+Bout/i.test(compact)
    ? "MMA"
    : /Professional\s+Boxing\s+Bout|World\s+Championship/i.test(compact)
      ? "BOXING"
      : fallbackSport;
  const roundMatch = compact.match(/(\d{1,2})\s*\D{0,3}\s*\d{1,2}\s+Professional/i);
  const actualRounds = roundMatch ? Number(roundMatch[1]) : null;
  const vsIndex = compact.indexOf(" VS ");
  const viewStatsIndex = compact.indexOf(" View Stats", vsIndex);
  if (vsIndex <= 0 || viewStatsIndex <= vsIndex) return null;
  const leftRaw = compact.slice(0, vsIndex);
  const rightRaw = compact.slice(vsIndex + 4, viewStatsIndex);
  const cleanFighterName = (value: string) => normalizeName(value.replace(/#+/g, " ").replace(/\bVS\b/gi, " "));
  const fighterA = cleanFighterName(leftRaw
    .replace(/^.*(?:Bout|Championship)\s+/i, "")
    .replace(/^\d{1,2}\s*\D{0,3}\s*\d{1,2}\s+Professional\s+(?:MMA|Boxing)\s+Bout\s+/i, ""));
  const fighterB = cleanFighterName(rightRaw);
  if (!fighterA || !fighterB || fighterA.length > 80 || fighterB.length > 80) return null;
  return {
    sourceName: "mvp",
    sourceUrl,
    sourceFightId: `mvp-${slug(fighterA)}-vs-${slug(fighterB)}-${index + 1}`,
    fighterAName: fighterA,
    fighterBName: fighterB,
    weightClass: normalizeName(compact.match(/([A-Za-z ]+(?:Bout|Championship))/)?.[1] ?? "") || null,
    scheduledRounds: sport === "MMA" && actualRounds === 5 ? 5 : 3,
    boutOrder: index + 1,
    cardSection: compact.includes("Prelims") ? "PRELIMS" : index < 5 ? "MAIN_CARD" : "PRELIMS",
    sourceStatus: "OFFICIAL_PARTIAL",
    confidence: "OFFICIAL_PARTIAL",
    isMainEvent: index === 0,
    isTitleFight: /Championship/i.test(compact),
    isCatchweight: /Catchweight/i.test(compact),
    payload: {
      provider: "mvp",
      promotionKey: "mvp",
      promotionName: "Most Valuable Promotions",
      combatSport: sport,
      actualScheduledRounds: actualRounds,
      modelRoundPolicy: sport === "MMA" ? "mma_3_or_5_rounds" : "boxing_card_inventory_only"
    }
  };
}

export function parseMvpEventPage(html: string, sourceUrl: string): UfcUpcomingSourceEvent {
  const text = strip(html);
  const eventName = normalizeName(strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "MVP Fight Card"));
  const sport = mvpEventSport(text);
  const segments = html.includes("<!-- Fight Card -->")
    ? html.split(/<!--\s*Fight Card\s*-->/i).slice(1)
    : text.split(/Image:\s+Fight Background/i).slice(1);
  const fights = segments
    .map((segment, index) => parseMvpFightSegment(segment, sourceUrl, index, sport))
    .filter((fight): fight is UfcUpcomingSourceFight => Boolean(fight));
  const location = mvpLocation(text) || null;
  const [venue, cityRegion] = location ? location.split(/\s+-\s+|\s*,\s*/).map((item) => normalizeName(item)).filter(Boolean) : [];

  return {
    sourceName: "mvp",
    sourceUrl,
    sourceEventId: idFromUrl("mvp", sourceUrl),
    eventName,
    eventDate: eventDateFrom(text, sourceUrl),
    promotionKey: "mvp",
    promotionName: "Most Valuable Promotions",
    combatSport: sport,
    location,
    venue: venue ?? null,
    city: cityRegion ?? null,
    sourceStatus: fights.length ? "OFFICIAL_PARTIAL" : "EARLY_REPORTED",
    sourceUrls: { mvp: sourceUrl },
    payload: {
      provider: "mvp",
      promotionKey: "mvp",
      promotionName: "Most Valuable Promotions",
      combatSport: sport,
      parsedFightCount: fights.length
    },
    fights
  };
}

export async function fetchMvpUpcomingProvider(options: { listUrl?: string; eventUrls?: string[]; fetchImpl?: typeof fetch; maxEvents?: number; includePast?: boolean } = {}): Promise<UfcUpcomingProviderResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const listUrl = options.listUrl ?? "https://www.mostvaluablepromotions.com/events/?filter=upcoming";
  const fetchedAt = new Date().toISOString();
  const events: UfcUpcomingSourceEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  try {
    const eventUrls = options.eventUrls ?? parseMvpUpcomingEventsList(await getHtml(listUrl, fetchImpl), listUrl).map((event) => event.url);
    for (const url of [...new Set(eventUrls)]) {
      if (options.maxEvents && events.length >= options.maxEvents) break;
      try {
        const event = parseMvpEventPage(await getHtml(url, fetchImpl), url);
        if (!isParseableEventDate(event.eventDate)) {
          warnings.push(`Skipped MVP event with unparsed date: ${event.eventName} (${url})`);
          continue;
        }
        if (!options.includePast && !isUpcomingEventDate(event.eventDate)) continue;
        events.push(event);
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { provider: "mvp", fetchedAt, events, warnings, errors };
}

type JsonObject = Record<string, unknown>;

function asRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function jsonLdTypeIncludes(item: JsonObject, typeName: string) {
  const type = item["@type"];
  const value = Array.isArray(type) ? type.join(" ") : String(type ?? "");
  return value.toLowerCase().includes(typeName.toLowerCase());
}

function collectJsonLdEvents(value: unknown, output: JsonObject[] = []): JsonObject[] {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdEvents(item, output);
    return output;
  }

  const item = asRecord(value);
  if (!Object.keys(item).length) return output;

  if (jsonLdTypeIncludes(item, "Event")) output.push(item);

  for (const key of ["@graph", "item", "itemListElement", "mainEntity", "event", "events", "subjectOf"]) {
    if (item[key] != null) collectJsonLdEvents(item[key], output);
  }

  return output;
}

function eventFromJsonLd(item: JsonObject, sourceName: UfcUpcomingSourceEvent["sourceName"], sourceUrl: string, pageText: string): UfcUpcomingSourceEvent | null {
  const name = normalizeName(String(item.name ?? ""));
  const itemUrl = typeof item.url === "string" ? absolute(item.url, sourceUrl) : sourceUrl;
  const eventDate = typeof item.startDate === "string" && item.startDate.trim()
    ? item.startDate.trim()
    : eventDateFrom(pageText, itemUrl);
  if (!name && !isParseableEventDate(eventDate)) return null;

  const location = asRecord(item.location);
  const address = asRecord(location.address);
  return {
    sourceName,
    sourceUrl: itemUrl,
    sourceEventId: idFromUrl(sourceName, itemUrl || name || sourceUrl),
    eventName: name || "UFC Event",
    eventDate,
    location: typeof location.name === "string" ? location.name : null,
    venue: typeof location.name === "string" ? location.name : null,
    city: typeof address.addressLocality === "string" ? address.addressLocality : null,
    region: typeof address.addressRegion === "string" ? address.addressRegion : null,
    country: typeof address.addressCountry === "string" ? address.addressCountry : null,
    sourceStatus: isParseableEventDate(eventDate) ? (sourceName === "ufc.com" ? "OFFICIAL_PARTIAL" : "CROSS_CHECKED") : "MANUAL_REVIEW",
    sourceUrls: { [sourceName]: itemUrl || sourceUrl },
    payload: { jsonLd: item, parsedFrom: "json-ld" },
    fights: []
  };
}

function parseJsonLdEvents(html: string, sourceName: UfcUpcomingSourceEvent["sourceName"], sourceUrl: string): UfcUpcomingSourceEvent[] {
  const pageText = strip(html);
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const events: UfcUpcomingSourceEvent[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.trim());
      for (const item of collectJsonLdEvents(parsed)) {
        const event = eventFromJsonLd(item, sourceName, sourceUrl, pageText);
        if (!event || seen.has(event.sourceEventId)) continue;
        seen.add(event.sourceEventId);
        events.push(event);
      }
    } catch { /* ignore malformed JSON-LD */ }
  }
  return events;
}

function parseNamePairFights(html: string, sourceName: UfcUpcomingSourceFight["sourceName"], sourceUrl: string) {
  const anchors = [...html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => strip(match[1])).filter((value) => /^[A-Z][A-Za-z'. -]{2,}$/.test(value));
  const fights: UfcUpcomingSourceFight[] = [];
  for (let i = 0; i < anchors.length - 1; i += 2) {
    const fight = fightFromNames(sourceName, [anchors[i], anchors[i + 1]], sourceUrl, fights.length);
    if (fight) fights.push(fight);
  }
  return fights.slice(0, 20);
}

export function parseGenericUpcomingEventLinks(html: string, sourceName: "ufc.com" | "espn" | "tapology", baseUrl: string) {
  const urls = [...html.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((match) => absolute(match[1], baseUrl))
    .filter((url) => url !== baseUrl)
    .filter((url) => {
      if (sourceName === "ufc.com") return /ufc\.com\/event\//i.test(url);
      if (sourceName === "espn") return /espn\.com\/mma\/fightcenter\/_\/id\//i.test(url);
      return /tapology\.com\/fightcenter\/events\//i.test(url);
    });
  return [...new Set(urls)].slice(0, MAX_GENERIC_EVENT_LINKS);
}

export function parseGenericUpcomingEventPage(html: string, sourceName: UfcUpcomingSourceEvent["sourceName"], sourceUrl: string): UfcUpcomingSourceEvent {
  const jsonEvents = parseJsonLdEvents(html, sourceName, sourceUrl);
  const text = strip(html);
  const fallbackDate = eventDateFrom(text, sourceUrl);
  const event = jsonEvents[0] ?? {
    sourceName,
    sourceUrl,
    sourceEventId: idFromUrl(sourceName, sourceUrl),
    eventName: strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "UFC Event"),
    eventDate: fallbackDate,
    sourceStatus: isParseableEventDate(fallbackDate) ? (sourceName === "ufc.com" ? "OFFICIAL_PARTIAL" : sourceName === "espn" ? "CROSS_CHECKED" : "EARLY_REPORTED") : "MANUAL_REVIEW",
    sourceUrls: { [sourceName]: sourceUrl },
    payload: { parsedFrom: "html-fallback" },
    fights: []
  } satisfies UfcUpcomingSourceEvent;
  return { ...event, fights: parseNamePairFights(html, sourceName, event.sourceUrl ?? sourceUrl) };
}

function pushDatedEvent(events: UfcUpcomingSourceEvent[], warnings: string[], event: UfcUpcomingSourceEvent) {
  if (!isParseableEventDate(event.eventDate)) {
    warnings.push(`Skipped ${event.sourceName} event with unparsed date: ${event.eventName} (${event.sourceUrl ?? event.sourceEventId})`);
    return;
  }
  events.push(event);
}

export async function fetchGenericUpcomingProvider(sourceName: "ufc.com" | "espn" | "tapology", urls: string[], fetchImpl: typeof fetch = fetch): Promise<UfcUpcomingProviderResult> {
  const fetchedAt = new Date().toISOString();
  const events: UfcUpcomingSourceEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const seenEventIds = new Set<string>();

  const addEvent = (event: UfcUpcomingSourceEvent) => {
    if (seenEventIds.has(event.sourceEventId)) return;
    seenEventIds.add(event.sourceEventId);
    pushDatedEvent(events, warnings, event);
  };

  for (const url of urls) {
    try {
      const html = await getHtml(url, fetchImpl);
      const linkedEventUrls = parseGenericUpcomingEventLinks(html, sourceName, url);
      const jsonEvents = parseJsonLdEvents(html, sourceName, url);

      if (linkedEventUrls.length > 0) {
        for (const event of jsonEvents) addEvent(event);
        for (const eventUrl of linkedEventUrls) {
          try {
            const event = parseGenericUpcomingEventPage(await getHtml(eventUrl, fetchImpl), sourceName, eventUrl);
            addEvent(event);
          } catch (error) {
            warnings.push(error instanceof Error ? error.message : String(error));
          }
        }
      } else if (jsonEvents.length > 1) {
        for (const event of jsonEvents) addEvent(event);
      } else {
        addEvent(parseGenericUpcomingEventPage(html, sourceName, url));
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { provider: sourceName, fetchedAt, events, warnings, errors };
}
