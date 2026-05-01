import type { SupportedLeagueKey } from "@/lib/types/ledger";

import type { EventProvider, ProviderEvent, ProviderParticipant } from "./provider-types";

type MlbTeam = {
  id?: number | string;
  name?: string;
  clubName?: string;
  teamName?: string;
  abbreviation?: string;
};

type MlbGameTeam = {
  score?: number;
  team?: MlbTeam;
  leagueRecord?: {
    wins?: number;
    losses?: number;
    pct?: string;
  };
  isWinner?: boolean;
};

type MlbScheduleGame = {
  gamePk?: number | string;
  gameDate?: string;
  officialDate?: string;
  status?: {
    abstractGameState?: string;
    detailedState?: string;
    codedGameState?: string;
  };
  teams?: {
    away?: MlbGameTeam;
    home?: MlbGameTeam;
  };
  venue?: {
    name?: string;
  };
  linescore?: {
    currentInning?: number;
    currentInningOrdinal?: string;
    inningState?: string;
  };
};

type MlbSchedulePayload = {
  dates?: Array<{
    games?: MlbScheduleGame[];
  }>;
};

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return ymd(date);
}

function mapMlbStatus(game: MlbScheduleGame): ProviderEvent["status"] {
  const abstract = (game.status?.abstractGameState ?? "").toLowerCase();
  const detailed = (game.status?.detailedState ?? "").toLowerCase();
  const code = (game.status?.codedGameState ?? "").toLowerCase();

  if (abstract === "live" || code === "i") return "LIVE";
  if (abstract === "final" || detailed.includes("final") || detailed === "game over") return "FINAL";
  if (detailed.includes("postponed")) return "POSTPONED";
  if (detailed.includes("cancel") || detailed.includes("canceled")) return "CANCELED";
  if (detailed.includes("delay")) return "DELAYED";
  return "SCHEDULED";
}

function record(team: MlbGameTeam | undefined) {
  const wins = team?.leagueRecord?.wins;
  const losses = team?.leagueRecord?.losses;
  if (typeof wins === "number" && typeof losses === "number") return `${wins}-${losses}`;
  return team?.leagueRecord?.pct ?? null;
}

function participant(team: MlbGameTeam | undefined, role: "AWAY" | "HOME", sortOrder: number): ProviderParticipant {
  const info = team?.team ?? {};
  const name = info.name ?? info.clubName ?? info.teamName ?? "TBD";
  return {
    externalCompetitorId: typeof info.id === "string" || typeof info.id === "number" ? String(info.id) : null,
    role,
    sortOrder,
    name,
    abbreviation: info.abbreviation ?? null,
    type: "TEAM",
    score: typeof team?.score === "number" ? String(team.score) : null,
    record: record(team),
    isWinner: typeof team?.isWinner === "boolean" ? team.isWinner : null,
    metadata: {
      source: "mlb-stats-api"
    }
  };
}

function detail(game: MlbScheduleGame) {
  const pieces = [
    game.status?.detailedState ?? null,
    game.linescore?.inningState && game.linescore?.currentInningOrdinal
      ? `${game.linescore.inningState} ${game.linescore.currentInningOrdinal}`
      : null
  ];
  return pieces.filter(Boolean).join(" | ") || null;
}

function normalizeMlbGame(game: MlbScheduleGame): ProviderEvent | null {
  const gamePk = game.gamePk == null ? null : String(game.gamePk);
  const away = game.teams?.away;
  const home = game.teams?.home;
  const startTime = game.gameDate;
  if (!gamePk || !away?.team || !home?.team || !startTime) return null;

  const participants = [participant(away, "AWAY", 0), participant(home, "HOME", 1)];
  const status = mapMlbStatus(game);

  return {
    externalEventId: gamePk,
    providerKey: "mlb-stats-api",
    sportCode: "BASEBALL",
    leagueKey: "MLB",
    name: `${participants[0].name} @ ${participants[1].name}`,
    startTime,
    status,
    resultState: status === "FINAL" ? "OFFICIAL" : "PENDING",
    eventType: "TEAM_HEAD_TO_HEAD",
    venue: game.venue?.name ?? null,
    scoreJson: {
      participants: participants.map((item) => ({
        name: item.name,
        abbreviation: item.abbreviation,
        score: item.score
      }))
    },
    stateJson: {
      detail: detail(game),
      shortDetail: detail(game),
      period: game.linescore?.currentInning ?? null,
      displayClock: null,
      typeDescription: game.status?.detailedState ?? null
    },
    resultJson: status === "FINAL" ? { completed: true, officialDate: game.officialDate ?? null } : null,
    metadataJson: {
      officialDate: game.officialDate ?? null,
      source: "statsapi.mlb.com"
    },
    participants
  };
}

async function fetchMlbScheduleDate(date: string) {
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("date", date);
  url.searchParams.set("hydrate", "team,linescore,venue");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Official MLB schedule failed: ${response.status}`);
  }

  return (await response.json()) as MlbSchedulePayload;
}

function currentSlateWindow(event: ProviderEvent) {
  const start = Date.parse(event.startTime);
  if (!Number.isFinite(start)) return true;
  const diff = start - Date.now();
  return diff >= -18 * 60 * 60 * 1000 && diff <= 36 * 60 * 60 * 1000;
}

export const mlbOfficialEventProvider: EventProvider = {
  key: "mlb-stats-api",
  label: "Official MLB schedule",
  kind: "FALLBACK",
  supportsLeague(leagueKey: SupportedLeagueKey) {
    return leagueKey === "MLB";
  },
  async fetchScoreboard(leagueKey) {
    if (leagueKey !== "MLB") return [];

    const payloads = await Promise.all([dateOffset(-1), dateOffset(0), dateOffset(1)].map((date) => fetchMlbScheduleDate(date)));
    const events = payloads
      .flatMap((payload) => payload.dates ?? [])
      .flatMap((date) => date.games ?? [])
      .map(normalizeMlbGame)
      .filter((event): event is ProviderEvent => Boolean(event))
      .filter(currentSlateWindow);

    const byId = new Map<string, ProviderEvent>();
    for (const event of events) byId.set(event.externalEventId, event);
    return [...byId.values()].sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
  }
};
