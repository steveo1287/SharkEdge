import type { UfcWarehousePayload } from "@/services/ufc/warehouse-ingestion";
import { normalizeName, parseIsoOrOriginal, scheduledRounds, slug, type UfcUpcomingProviderResult, type UfcUpcomingSourceEvent, type UfcUpcomingSourceFight } from "@/services/ufc/upcoming-card-types";

function fighterKey(name: string) {
  return `ufc-name-${slug(name)}`;
}

function eventKey(event: UfcUpcomingSourceEvent) {
  return `${event.sourceName}-${event.sourceEventId}`;
}

function fightKey(event: UfcUpcomingSourceEvent, fight: UfcUpcomingSourceFight, index: number) {
  return fight.sourceFightId ?? `${eventKey(event)}-${slug(fight.fighterAName)}-vs-${slug(fight.fighterBName)}-${index + 1}`;
}

function eventSourceUrls(event: UfcUpcomingSourceEvent) {
  return { ...(event.sourceUrls ?? {}), [event.sourceName]: event.sourceUrl ?? "" };
}

function eventPayload(event: UfcUpcomingSourceEvent) {
  return { sourceName: event.sourceName, sourceUrl: event.sourceUrl ?? null, raw: event.payload ?? {} };
}

function fightPayload(event: UfcUpcomingSourceEvent, fight: UfcUpcomingSourceFight) {
  return { sourceName: fight.sourceName, sourceUrl: fight.sourceUrl ?? event.sourceUrl ?? null, raw: fight.payload ?? {} };
}

export function normalizeUpcomingUfcProviderResults(results: UfcUpcomingProviderResult[], fetchedAt = new Date().toISOString()): UfcWarehousePayload {
  const eventMap = new Map<string, UfcUpcomingSourceEvent>();
  const fightMap = new Map<string, { event: UfcUpcomingSourceEvent; fight: UfcUpcomingSourceFight; index: number }>();
  const fighterNames = new Set<string>();

  for (const result of results) {
    for (const event of result.events) {
      const eKey = eventKey(event);
      const existing = eventMap.get(eKey);
      eventMap.set(eKey, existing ? { ...existing, ...event, sourceUrls: { ...(existing.sourceUrls ?? {}), ...(event.sourceUrls ?? {}), [event.sourceName]: event.sourceUrl ?? "" }, fights: [...existing.fights, ...event.fights] } : event);
      event.fights.forEach((fight, index) => {
        const normalizedA = normalizeName(fight.fighterAName);
        const normalizedB = normalizeName(fight.fighterBName);
        fighterNames.add(normalizedA);
        fighterNames.add(normalizedB);
        const key = `${eKey}:${slug(normalizedA)}:${slug(normalizedB)}:${fight.sourceName}:${fight.sourceFightId ?? index}`;
        fightMap.set(key, { event, fight: { ...fight, fighterAName: normalizedA, fighterBName: normalizedB }, index });
      });
    }
  }

  const events = [...eventMap.values()].map((event) => ({
    externalEventId: eventKey(event),
    sourceKey: event.sourceName,
    eventName: event.eventName,
    eventDate: parseIsoOrOriginal(event.eventDate),
    location: event.location ?? null,
    venue: event.venue ?? null,
    city: event.city ?? null,
    region: event.region ?? null,
    country: event.country ?? null,
    broadcastInfo: event.broadcastInfo ?? null,
    earlyPrelimsTime: event.earlyPrelimsTime ?? null,
    prelimsTime: event.prelimsTime ?? null,
    mainCardTime: event.mainCardTime ?? null,
    sourceStatus: event.sourceStatus ?? "OFFICIAL_PARTIAL",
    sourceUrls: eventSourceUrls(event),
    lastSeenAt: fetchedAt,
    status: "SCHEDULED",
    payload: eventPayload(event)
  }));

  const fighters = [...fighterNames].map((name) => ({
    externalKey: fighterKey(name),
    fullName: name,
    payload: { source: "upcoming-card-ingestion" }
  }));

  const fights = [...fightMap.values()].map(({ event, fight, index }) => ({
    externalFightId: fightKey(event, fight, index),
    eventKey: eventKey(event),
    eventLabel: `${fight.fighterAName} vs ${fight.fighterBName}`,
    fightDate: parseIsoOrOriginal(event.eventDate),
    weightClass: fight.weightClass ?? null,
    scheduledRounds: scheduledRounds(fight.scheduledRounds ?? (fight.isMainEvent ? 5 : 3)),
    boutOrder: fight.boutOrder ?? null,
    cardSection: fight.cardSection ?? null,
    sourceStatus: fight.sourceStatus ?? event.sourceStatus ?? "OFFICIAL_PARTIAL",
    isMainEvent: Boolean(fight.isMainEvent),
    isTitleFight: Boolean(fight.isTitleFight),
    isCatchweight: Boolean(fight.isCatchweight),
    lastSeenAt: fetchedAt,
    fighterAKey: fighterKey(fight.fighterAName),
    fighterBKey: fighterKey(fight.fighterBName),
    status: "SCHEDULED",
    preFightSnapshotAt: fetchedAt,
    payload: fightPayload(event, fight)
  }));

  const fightSources = [...fightMap.values()].map(({ event, fight, index }) => ({
    fightKey: fightKey(event, fight, index),
    eventKey: eventKey(event),
    sourceName: fight.sourceName,
    sourceUrl: fight.sourceUrl ?? event.sourceUrl ?? null,
    sourceEventId: event.sourceEventId,
    sourceFightId: fight.sourceFightId ?? null,
    sourceFighterA: fight.fighterAName,
    sourceFighterB: fight.fighterBName,
    sourceWeightClass: fight.weightClass ?? null,
    sourceBoutOrder: fight.boutOrder ?? null,
    sourceCardSection: fight.cardSection ?? null,
    sourceStatus: fight.sourceStatus ?? "EARLY_REPORTED",
    confidence: fight.confidence ?? fight.sourceStatus ?? "EARLY_REPORTED",
    seenAt: fetchedAt,
    payload: fightPayload(event, fight)
  }));

  return {
    events,
    fighters,
    fights,
    fightSources,
    fightStatsRounds: [],
    fighterRatings: [],
    opponentStrengthSnapshots: [],
    amateurResults: [],
    prospectNotes: [],
    modelFeatures: [],
    predictions: [],
    simRuns: [],
    backtestResults: []
  };
}
