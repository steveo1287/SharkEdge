import type { SupportedLeagueKey } from "@/lib/types/ledger";

import type { EventProvider, ProviderEvent, ProviderParticipant } from "./provider-types";

const UFC_API_BASE_URL =
  process.env.UFC_STATS_API_BASE_URL?.trim() || "https://ufcapi.aristotle.me";

function extractEvents(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["events", "data", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    }
  }

  return [];
}

function participantFromName(name: string, role: ProviderParticipant["role"], sortOrder: number) {
  return {
    externalCompetitorId: null,
    role,
    sortOrder,
    name,
    abbreviation: null,
    type: "FIGHTER" as const,
    score: null,
    record: null,
    isWinner: null,
    metadata: {
      source: "ufc-stats-api"
    }
  };
}

function normalizeEvent(event: Record<string, unknown>): ProviderEvent | null {
  const fights =
    Array.isArray(event.fights) ? (event.fights as Array<Record<string, unknown>>) : [];
  const mainFight = fights[0];

  const fighterAName =
    typeof mainFight?.fighter1_name === "string"
      ? mainFight.fighter1_name
      : typeof mainFight?.fighter1 === "string"
        ? mainFight.fighter1
        : null;
  const fighterBName =
    typeof mainFight?.fighter2_name === "string"
      ? mainFight.fighter2_name
      : typeof mainFight?.fighter2 === "string"
        ? mainFight.fighter2
        : null;

  const participants: ProviderParticipant[] =
    fighterAName && fighterBName
      ? [
          participantFromName(fighterAName, "COMPETITOR_A", 0),
          participantFromName(fighterBName, "COMPETITOR_B", 1)
        ]
      : [];

  return {
    externalEventId:
      typeof event.id === "string" || typeof event.id === "number"
        ? String(event.id)
        : typeof event.slug === "string"
          ? event.slug
          : `ufc-${String(event.date ?? "unknown")}`,
    providerKey: "ufc-stats-api",
    sportCode: "MMA",
    leagueKey: "UFC",
    name:
      typeof event.name === "string"
        ? event.name
        : typeof event.event_name === "string"
          ? event.event_name
          : "UFC event",
    startTime:
      typeof event.date === "string"
        ? event.date
        : typeof event.event_date === "string"
          ? event.event_date
          : new Date().toISOString(),
    status: "SCHEDULED",
    resultState: "PENDING",
    eventType: "COMBAT_HEAD_TO_HEAD",
    venue:
      typeof event.location === "string"
        ? event.location
        : typeof event.venue === "string"
          ? event.venue
          : null,
    scoreJson: null,
    stateJson: {
      source: "ufc-stats-api",
      fightsAvailable: fights.length
    },
    resultJson: null,
    metadataJson: {
      eventStatus: event.status ?? null,
      fightsAvailable: fights.length
    },
    participants
  };
}

export const ufcEventProvider: EventProvider = {
  key: "ufc-stats-api",
  label: "UFC stats API scaffold",
  kind: "SCAFFOLD",
  supportsLeague(leagueKey: SupportedLeagueKey) {
    return leagueKey === "UFC";
  },
  async fetchScoreboard() {
    const response = await fetch(`${UFC_API_BASE_URL}/api/events?limit=5`, {
      headers: {
        "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
      },
      next: {
        revalidate: 300
      }
    });

    if (!response.ok) {
      throw new Error(`UFC stats API scaffold failed: ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return extractEvents(payload)
      .map((event) => normalizeEvent(event))
      .filter((event): event is ProviderEvent => Boolean(event?.externalEventId));
  }
};
