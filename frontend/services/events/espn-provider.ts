import type { SupportedLeagueKey } from "@/lib/types/ledger";

import type { EventProvider, ProviderEvent, ProviderParticipant } from "./provider-types";

const ESPN_LEAGUE_PATHS: Record<SupportedLeagueKey, string | null> = {
  NBA: "basketball/nba",
  NCAAB: "basketball/mens-college-basketball",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  NFL: "football/nfl",
  NCAAF: "football/college-football",
  UFC: null,
  BOXING: null
};

const SPORT_BY_LEAGUE: Record<SupportedLeagueKey, ProviderEvent["sportCode"]> = {
  NBA: "BASKETBALL",
  NCAAB: "BASKETBALL",
  MLB: "BASEBALL",
  NHL: "HOCKEY",
  NFL: "FOOTBALL",
  NCAAF: "FOOTBALL",
  UFC: "MMA",
  BOXING: "BOXING"
};

function mapStatus(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();

  if (normalized === "in") {
    return "LIVE" as const;
  }

  if (normalized === "post") {
    return "FINAL" as const;
  }

  if (normalized === "postponed") {
    return "POSTPONED" as const;
  }

  if (normalized === "cancelled" || normalized === "canceled") {
    return "CANCELED" as const;
  }

  if (normalized === "delayed") {
    return "DELAYED" as const;
  }

  return "SCHEDULED" as const;
}

function normalizeParticipant(
  competitor: Record<string, unknown>,
  index: number
): ProviderParticipant {
  const team = (competitor.team ?? {}) as Record<string, unknown>;
  const homeAway = String(competitor.homeAway ?? "").toLowerCase();
  const role =
    homeAway === "home"
      ? "HOME"
      : homeAway === "away"
        ? "AWAY"
        : index === 0
          ? "COMPETITOR_A"
          : index === 1
            ? "COMPETITOR_B"
            : "UNKNOWN";

  return {
    externalCompetitorId:
      typeof team.id === "string" || typeof team.id === "number" ? String(team.id) : null,
    role,
    sortOrder: index,
    name: typeof team.displayName === "string" ? team.displayName : "TBD",
    abbreviation: typeof team.abbreviation === "string" ? team.abbreviation : null,
    type: "TEAM",
    score:
      typeof competitor.score === "string" || typeof competitor.score === "number"
        ? String(competitor.score)
        : null,
    record:
      Array.isArray(competitor.records) && competitor.records[0] && typeof competitor.records[0] === "object"
        ? String((competitor.records[0] as Record<string, unknown>).summary ?? "")
        : null,
    isWinner: typeof competitor.winner === "boolean" ? competitor.winner : null,
    metadata: {
      homeAway,
      curatedRank: competitor.curatedRank ?? null
    }
  };
}

async function fetchEspnScoreboard(leagueKey: SupportedLeagueKey) {
  const path = ESPN_LEAGUE_PATHS[leagueKey];
  if (!path) {
    return {
      events: []
    } as {
      events?: Array<Record<string, unknown>>;
    };
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?limit=100`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
    },
    next: {
      revalidate: 120
    }
  });

  if (!response.ok) {
    throw new Error(`ESPN scoreboard failed for ${leagueKey}: ${response.status}`);
  }

  return (await response.json()) as {
    events?: Array<Record<string, unknown>>;
  };
}

function normalizeEvent(
  leagueKey: SupportedLeagueKey,
  event: Record<string, unknown>
): ProviderEvent | null {
  const competition = Array.isArray(event.competitions) ? event.competitions[0] : null;
  if (!competition || typeof competition !== "object") {
    return null;
  }

  const competitors = Array.isArray((competition as Record<string, unknown>).competitors)
    ? ((competition as Record<string, unknown>).competitors as Array<Record<string, unknown>>)
    : [];

  const participants = competitors.map(normalizeParticipant);
  if (participants.length < 2) {
    return null;
  }

  const statusType = ((event.status ?? {}) as Record<string, unknown>).type as Record<string, unknown>;
  const competitionStatus =
    competition && typeof competition === "object"
      ? (((competition as Record<string, unknown>).status ?? {}) as Record<string, unknown>)
      : {};
  const status = mapStatus(
    typeof statusType?.state === "string" ? statusType.state : undefined
  );

  const detail =
    typeof statusType?.detail === "string"
      ? statusType.detail
      : typeof statusType?.shortDetail === "string"
        ? statusType.shortDetail
        : null;

  return {
    externalEventId:
      typeof event.id === "string" || typeof event.id === "number" ? String(event.id) : "",
    providerKey: "espn",
    sportCode: SPORT_BY_LEAGUE[leagueKey],
    leagueKey,
    name:
      typeof event.name === "string"
        ? event.name
        : `${participants[0].name} vs ${participants[1].name}`,
    startTime: typeof event.date === "string" ? event.date : new Date().toISOString(),
    status,
    resultState: status === "FINAL" ? "OFFICIAL" : "PENDING",
    eventType: "TEAM_HEAD_TO_HEAD",
    venue:
      competition && typeof (competition as Record<string, unknown>).venue === "object"
        ? String(
            (((competition as Record<string, unknown>).venue as Record<string, unknown>).fullName ??
              "") as string
          ) || null
        : null,
    scoreJson: {
      participants: participants.map((participant) => ({
        name: participant.name,
        abbreviation: participant.abbreviation,
        score: participant.score
      }))
    },
    stateJson: {
      detail,
      shortDetail:
        typeof statusType?.shortDetail === "string" ? statusType.shortDetail : detail,
      displayClock:
        typeof competitionStatus.displayClock === "string"
          ? competitionStatus.displayClock
          : null,
      period:
        typeof competitionStatus.period === "number"
          ? competitionStatus.period
          : typeof competitionStatus.period === "string"
            ? competitionStatus.period
            : null,
      typeDescription:
        typeof statusType?.description === "string" ? statusType.description : null
    },
    resultJson: status === "FINAL" ? { completed: true } : null,
    metadataJson: {
      shortName: event.shortName ?? null,
      seasonType:
        typeof competition === "object" && (competition as Record<string, unknown>).type
          ? (competition as Record<string, unknown>).type
          : null
    },
    participants
  };
}

export const espnEventProvider: EventProvider = {
  key: "espn",
  label: "ESPN scoreboard",
  kind: "LIVE",
  supportsLeague(leagueKey) {
    return Boolean(ESPN_LEAGUE_PATHS[leagueKey]);
  },
  async fetchScoreboard(leagueKey) {
    const payload = await fetchEspnScoreboard(leagueKey);
    return (payload.events ?? [])
      .map((event) => normalizeEvent(leagueKey, event))
      .filter((event): event is ProviderEvent => Boolean(event?.externalEventId));
  }
};
