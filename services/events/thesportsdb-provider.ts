import type { SupportedLeagueKey } from "@/lib/types/ledger";

import type { EventProvider, ProviderEvent, ProviderParticipant } from "./provider-types";

const THESPORTSDB_LEAGUE_IDS: Partial<Record<SupportedLeagueKey, number>> = {
  NBA: 4387,
  MLB: 4424,
  NHL: 4380,
  NFL: 4391
};

const SPORT_BY_LEAGUE: Record<SupportedLeagueKey, ProviderEvent["sportCode"]> = {
  NBA: "BASKETBALL",
  MLB: "BASEBALL",
  NHL: "HOCKEY",
  NFL: "FOOTBALL",
  NCAAF: "FOOTBALL",
  UFC: "MMA",
  BOXING: "BOXING"
};

type TheSportsDbEvent = {
  idEvent?: string | number;
  strEvent?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  dateEvent?: string | null;
  strTime?: string | null;
  strTimestamp?: string | null;
  strVenue?: string | null;
  strStatus?: string | null;
};

type TheSportsDbResponse = {
  events?: TheSportsDbEvent[] | null;
};

function getApiKey() {
  return (
    process.env.THESPORTSDB_V1_API_KEY?.trim() ||
    process.env.THESPORTSDB_API_KEY?.trim() ||
    process.env.THE_SPORTS_DB_API_KEY?.trim() ||
    "123"
  );
}

function getBaseUrl() {
  return (
    process.env.THESPORTSDB_BASE_URL?.trim() ||
    "https://www.thesportsdb.com/api/v1/json"
  ).replace(/\/$/, "");
}

async function fetchLeagueSchedule(endpoint: "eventsnextleague" | "eventspastleague", leagueId: number) {
  const url = `${getBaseUrl()}/${getApiKey()}/${endpoint}.php?id=${leagueId}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
    },
    cache: "force-cache",
    next: {
      revalidate: 300
    }
  });

  if (!response.ok) {
    throw new Error(`TheSportsDB ${endpoint} failed: ${response.status}`);
  }

  return (await response.json()) as TheSportsDbResponse;
}

function parseIsoStartTime(event: TheSportsDbEvent) {
  if (typeof event.strTimestamp === "string" && event.strTimestamp.trim()) {
    return event.strTimestamp;
  }

  const datePart = typeof event.dateEvent === "string" ? event.dateEvent.trim() : "";
  const timePart = typeof event.strTime === "string" ? event.strTime.trim() : "";

  if (datePart && timePart) {
    return `${datePart}T${timePart.endsWith("Z") ? timePart : `${timePart}Z`}`;
  }

  if (datePart) {
    return `${datePart}T00:00:00Z`;
  }

  return new Date().toISOString();
}

function normalizeScore(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length) {
    return value.trim();
  }

  return null;
}

function buildParticipant(args: {
  name: string;
  role: ProviderParticipant["role"];
  sortOrder: number;
  score: string | null;
}) {
  return {
    externalCompetitorId: null,
    role: args.role,
    sortOrder: args.sortOrder,
    name: args.name,
    abbreviation: null,
    type: "TEAM",
    score: args.score,
    record: null,
    isWinner: null,
    metadata: {}
  } satisfies ProviderParticipant;
}

function mapStatus(event: TheSportsDbEvent, startTime: string) {
  const normalizedStatus = typeof event.strStatus === "string" ? event.strStatus.trim().toLowerCase() : "";
  const homeScore = normalizeScore(event.intHomeScore);
  const awayScore = normalizeScore(event.intAwayScore);

  if (normalizedStatus.includes("postpon")) {
    return "POSTPONED" as const;
  }

  if (normalizedStatus.includes("cancel")) {
    return "CANCELED" as const;
  }

  if (normalizedStatus.includes("delay")) {
    return "DELAYED" as const;
  }

  if (homeScore !== null || awayScore !== null) {
    return "FINAL" as const;
  }

  const parsed = Date.parse(startTime);
  if (!Number.isFinite(parsed)) {
    return "SCHEDULED" as const;
  }

  return parsed <= Date.now() ? "LIVE" as const : "SCHEDULED" as const;
}

function normalizeTheSportsDbEvent(
  leagueKey: SupportedLeagueKey,
  event: TheSportsDbEvent
): ProviderEvent | null {
  const homeTeam = typeof event.strHomeTeam === "string" ? event.strHomeTeam.trim() : "";
  const awayTeam = typeof event.strAwayTeam === "string" ? event.strAwayTeam.trim() : "";
  const externalEventId =
    typeof event.idEvent === "string" || typeof event.idEvent === "number"
      ? String(event.idEvent)
      : "";

  if (!externalEventId || !homeTeam || !awayTeam) {
    return null;
  }

  const startTime = parseIsoStartTime(event);
  const status = mapStatus(event, startTime);
  const homeScore = normalizeScore(event.intHomeScore);
  const awayScore = normalizeScore(event.intAwayScore);
  const participants = [
    buildParticipant({ name: homeTeam, role: "HOME", sortOrder: 0, score: homeScore }),
    buildParticipant({ name: awayTeam, role: "AWAY", sortOrder: 1, score: awayScore })
  ];

  return {
    externalEventId,
    providerKey: "thesportsdb",
    sportCode: SPORT_BY_LEAGUE[leagueKey],
    leagueKey,
    name:
      typeof event.strEvent === "string" && event.strEvent.trim().length
        ? event.strEvent.trim()
        : `${awayTeam} at ${homeTeam}`,
    startTime,
    status,
    resultState: status === "FINAL" ? "OFFICIAL" : "PENDING",
    eventType: "TEAM_HEAD_TO_HEAD",
    venue: typeof event.strVenue === "string" && event.strVenue.trim().length ? event.strVenue.trim() : null,
    scoreJson: {
      homeTeam,
      awayTeam,
      homeScore,
      awayScore
    },
    stateJson: {
      status: event.strStatus ?? null,
      source: "TheSportsDB v1"
    },
    resultJson: status === "FINAL" ? { completed: true } : null,
    metadataJson: {
      source: "TheSportsDB",
      hasScores: homeScore !== null || awayScore !== null
    },
    participants
  };
}

export const theSportsDbEventProvider: EventProvider = {
  key: "thesportsdb",
  label: "TheSportsDB schedule",
  kind: "FALLBACK",
  supportsLeague(leagueKey) {
    return Boolean(THESPORTSDB_LEAGUE_IDS[leagueKey]);
  },
  async fetchScoreboard(leagueKey) {
    const leagueId = THESPORTSDB_LEAGUE_IDS[leagueKey];
    if (!leagueId) {
      return [];
    }

    const [previousPayload, nextPayload] = await Promise.all([
      fetchLeagueSchedule("eventspastleague", leagueId),
      fetchLeagueSchedule("eventsnextleague", leagueId)
    ]);

    const byId = new Map<string, TheSportsDbEvent>();

    for (const rawEvent of [
      ...(previousPayload.events ?? []),
      ...(nextPayload.events ?? [])
    ]) {
      const eventId =
        typeof rawEvent.idEvent === "string" || typeof rawEvent.idEvent === "number"
          ? String(rawEvent.idEvent)
          : null;
      if (!eventId) {
        continue;
      }
      byId.set(eventId, rawEvent);
    }

    return Array.from(byId.values())
      .map((event) => normalizeTheSportsDbEvent(leagueKey, event))
      .filter((event): event is ProviderEvent => Boolean(event?.externalEventId))
      .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
  }
};
