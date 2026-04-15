import type { SupportedLeagueKey } from "@/lib/types/ledger";

import type { EventProvider, ProviderEvent, ProviderParticipant } from "./provider-types";

const NCAA_API_BASE_URL =
  process.env.NCAA_API_BASE_URL?.trim() || "https://ncaa-api.henrygd.me";

const NCAA_SCOREBOARD_PATHS: Partial<Record<SupportedLeagueKey, string>> = {
  NCAAB: "scoreboard/basketball-men/d1",
  NCAAF: "scoreboard/football/fbs"
};

function mapStatus(value: string | null | undefined) {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("live") || normalized.includes("in progress")) {
    return "LIVE" as const;
  }
  if (normalized.includes("final")) {
    return "FINAL" as const;
  }
  if (normalized.includes("postpon")) {
    return "POSTPONED" as const;
  }
  if (normalized.includes("cancel")) {
    return "CANCELED" as const;
  }
  if (normalized.includes("delay")) {
    return "DELAYED" as const;
  }

  return "SCHEDULED" as const;
}

function extractGames(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["games", "events", "scoreboard"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    }
  }

  return [];
}

function getTeamName(team: unknown) {
  if (!team || typeof team !== "object") {
    return null;
  }

  const record = team as Record<string, unknown>;
  for (const key of ["name", "display_name", "short_name", "school"]) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key] as string;
    }
  }

  return null;
}

function getTeamAbbreviation(team: unknown) {
  if (!team || typeof team !== "object") {
    return null;
  }

  const record = team as Record<string, unknown>;
  for (const key of ["abbreviation", "short_name"]) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key] as string;
    }
  }

  return null;
}

function normalizeParticipants(game: Record<string, unknown>) {
  const rawTeams =
    (Array.isArray(game.teams) ? game.teams : null) ??
    (Array.isArray(game.competitors) ? game.competitors : null) ??
    [];

  const participants: ProviderParticipant[] = [];

  rawTeams.slice(0, 2).forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const team = entry as Record<string, unknown>;
    const name = getTeamName(team);
    if (!name) {
      return;
    }

    const homeAway = String(team.homeAway ?? team.home_away ?? "").toLowerCase();
    const role =
      homeAway === "home"
        ? "HOME"
        : homeAway === "away"
          ? "AWAY"
          : index === 0
            ? "AWAY"
            : "HOME";

    participants.push({
      externalCompetitorId:
        typeof team.id === "string" || typeof team.id === "number" ? String(team.id) : null,
      role,
      sortOrder: index,
      name,
      abbreviation: getTeamAbbreviation(team),
      type: "TEAM",
      score:
        typeof team.score === "string" || typeof team.score === "number"
          ? String(team.score)
          : null,
      record: null,
      isWinner: typeof team.winner === "boolean" ? team.winner : null,
      metadata: {
        source: "ncaa-api"
      }
    });
  });

  return participants;
}

function normalizeGame(
  leagueKey: SupportedLeagueKey,
  game: Record<string, unknown>
): ProviderEvent | null {
  const participants = normalizeParticipants(game);
  if (participants.length < 2) {
    return null;
  }

  const statusText =
    (typeof game.gameState === "string" && game.gameState) ||
    (typeof game.status === "string" && game.status) ||
    (typeof game.state === "string" && game.state) ||
    null;
  const status = mapStatus(statusText);

  return {
    externalEventId:
      typeof game.id === "string" || typeof game.id === "number"
        ? String(game.id)
        : `${leagueKey.toLowerCase()}-${participants[0]?.name}-${participants[1]?.name}-${String(game.date ?? game.startTime ?? "na")}`,
    providerKey: "ncaa-api",
    sportCode: leagueKey === "NCAAB" ? "BASKETBALL" : "FOOTBALL",
    leagueKey,
    name: `${participants[0]?.name ?? "TBD"} vs ${participants[1]?.name ?? "TBD"}`,
    startTime:
      typeof game.date === "string"
        ? game.date
        : typeof game.startTime === "string"
          ? game.startTime
          : new Date().toISOString(),
    status,
    resultState: status === "FINAL" ? "OFFICIAL" : "PENDING",
    eventType: "TEAM_HEAD_TO_HEAD",
    venue: typeof game.location === "string" ? game.location : null,
    scoreJson: {
      participants: participants.map((participant) => ({
        name: participant.name,
        score: participant.score
      }))
    },
    stateJson: {
      detail: statusText,
      period: game.period ?? null,
      clock: game.clock ?? null
    },
    resultJson: status === "FINAL" ? { completed: true } : null,
    metadataJson: {
      source: "ncaa-api-fallback"
    },
    participants
  };
}

export const ncaaFallbackEventProvider: EventProvider = {
  key: "ncaa-api",
  label: "NCAA API fallback",
  kind: "FALLBACK",
  supportsLeague(leagueKey) {
    return Boolean(NCAA_SCOREBOARD_PATHS[leagueKey]);
  },
  async fetchScoreboard(leagueKey) {
    const path = NCAA_SCOREBOARD_PATHS[leagueKey];
    if (!path) {
      return [];
    }

    const response = await fetch(`${NCAA_API_BASE_URL}/${path}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
      },
      next: {
        revalidate: 180
      }
    });

    if (!response.ok) {
      throw new Error(`NCAA API scoreboard failed for ${leagueKey}: ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return extractGames(payload)
      .map((game) => normalizeGame(leagueKey, game))
      .filter((event): event is ProviderEvent => Boolean(event?.externalEventId));
  }
};
