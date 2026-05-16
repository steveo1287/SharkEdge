import { parseUfcStatsEventPage } from "@/services/ufc/ufcstats-parser";
import { normalizeName, scheduledRounds, slug, type UfcUpcomingProviderResult, type UfcUpcomingSourceEvent, type UfcUpcomingSourceFight } from "@/services/ufc/upcoming-card-types";

const DEFAULT_USER_AGENT = "SharkEdge-UFC-UpcomingCards/1.0";

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
  return match?.[0] ?? new Date().toISOString();
}

function dateTimeFromText(text: string) {
  const match = text.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  return match ? `${match[1]} ${match[2]}` : dateFromText(text);
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

function parseMvpFightSegment(segment: string, sourceUrl: string, index: number, fallbackSport: "MMA" | "BOXING" | "COMBAT" = "COMBAT"): UfcUpcomingSourceFight | null {
  const compact = strip(segment);
  if (!/\bVS\b/.test(compact) || !/View Stats/i.test(compact)) return null;
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
    eventDate: dateTimeFromText(text),
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

export async function fetchMvpUpcomingProvider(options: { listUrl?: string; eventUrls?: string[]; fetchImpl?: typeof fetch; maxEvents?: number } = {}): Promise<UfcUpcomingProviderResult> {
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
        events.push(parseMvpEventPage(await getHtml(url, fetchImpl), url));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { provider: "mvp", fetchedAt, events, warnings, errors };
}

function parseJsonLdEvents(html: string, sourceName: UfcUpcomingSourceEvent["sourceName"], sourceUrl: string): UfcUpcomingSourceEvent[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const events: UfcUpcomingSourceEvent[] = [];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const type = Array.isArray(item["@type"]) ? item["@type"].join(" ") : item["@type"];
        if (!String(type ?? "").toLowerCase().includes("event")) continue;
        const name = String(item.name ?? "UFC Event");
        events.push({
          sourceName,
          sourceUrl,
          sourceEventId: idFromUrl(sourceName, String(item.url ?? sourceUrl ?? name)),
          eventName: name,
          eventDate: String(item.startDate ?? dateFromText(strip(html))),
          location: typeof item.location === "object" ? String(item.location?.name ?? item.location?.address?.addressLocality ?? "") : null,
          venue: typeof item.location === "object" ? String(item.location?.name ?? "") : null,
          city: typeof item.location === "object" ? String(item.location?.address?.addressLocality ?? "") : null,
          region: typeof item.location === "object" ? String(item.location?.address?.addressRegion ?? "") : null,
          country: typeof item.location === "object" ? String(item.location?.address?.addressCountry ?? "") : null,
          sourceStatus: sourceName === "ufc.com" ? "OFFICIAL_PARTIAL" : "CROSS_CHECKED",
          sourceUrls: { [sourceName]: sourceUrl },
          payload: { jsonLd: item },
          fights: []
        });
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

export function parseGenericUpcomingEventPage(html: string, sourceName: UfcUpcomingSourceEvent["sourceName"], sourceUrl: string): UfcUpcomingSourceEvent {
  const jsonEvents = parseJsonLdEvents(html, sourceName, sourceUrl);
  const event = jsonEvents[0] ?? {
    sourceName,
    sourceUrl,
    sourceEventId: idFromUrl(sourceName, sourceUrl),
    eventName: strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "UFC Event"),
    eventDate: dateFromText(strip(html)),
    sourceStatus: sourceName === "ufc.com" ? "OFFICIAL_PARTIAL" : sourceName === "espn" ? "CROSS_CHECKED" : "EARLY_REPORTED",
    sourceUrls: { [sourceName]: sourceUrl },
    fights: []
  };
  return { ...event, fights: parseNamePairFights(html, sourceName, sourceUrl) };
}

export async function fetchGenericUpcomingProvider(sourceName: "ufc.com" | "espn" | "tapology", urls: string[], fetchImpl: typeof fetch = fetch): Promise<UfcUpcomingProviderResult> {
  const fetchedAt = new Date().toISOString();
  const events: UfcUpcomingSourceEvent[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      events.push(parseGenericUpcomingEventPage(await getHtml(url, fetchImpl), sourceName, url));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { provider: sourceName, fetchedAt, events, warnings, errors };
}

