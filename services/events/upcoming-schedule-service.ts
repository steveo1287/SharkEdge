import { BOARD_SPORT_ORDER, BOARD_SPORTS } from "@/lib/config/board-sports";
import type {
  BoardFilters,
  BoardPageData,
  BoardSportSectionView,
  GameCardView,
  GameStatus,
  LeagueKey,
  ScoreboardPreviewView,
  SportsbookRecord
} from "@/lib/types/domain";
import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { formatEventLabelFromParticipants, formatScoreboardFromParticipants } from "@/lib/utils/ledger";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { fetchEspnScoreboard, normalizeEspnEvent } from "@/services/events/espn-provider";
import type { ProviderEvent, ProviderParticipant } from "@/services/events/provider-types";
import { ufcEventProvider } from "@/services/events/ufc-provider";
import { buildProviderHealth } from "@/services/providers/provider-health";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DEFAULT_DAYS: Record<LeagueKey, number> = {
  NBA: 7,
  MLB: 7,
  NHL: 7,
  NFL: 21,
  NCAAF: 21,
  UFC: 90,
  BOXING: 30
};

const ESPN_LOOKAHEAD_LEAGUES = new Set<LeagueKey>(["NBA", "MLB", "NHL", "NFL", "NCAAF"]);
const COMBAT_LEAGUES = new Set<LeagueKey>(["UFC", "BOXING"]);

type MlbSchedulePayload = {
  dates?: Array<{
    games?: Array<Record<string, any>>;
  }>;
};

type UpcomingScheduleResult = {
  leagueKey: LeagueKey;
  providerLabel: string;
  events: ProviderEvent[];
  note: string;
  failed: boolean;
};

function startOfUtcDate(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(start: Date, days: number) {
  return Array.from({ length: Math.max(1, days) }, (_, index) => addDays(start, index));
}

function mapProviderStatus(status: ProviderEvent["status"]): GameStatus {
  if (status === "LIVE") return "LIVE";
  if (status === "FINAL") return "FINAL";
  if (status === "POSTPONED" || status === "CANCELED" || status === "DELAYED") return "POSTPONED";
  return "PREGAME";
}

function participantName(participant: ProviderParticipant | undefined, fallback: string) {
  return participant?.abbreviation ?? participant?.name ?? fallback;
}

function participantFullName(participant: ProviderParticipant | undefined, fallback: string) {
  return participant?.name ?? participant?.abbreviation ?? fallback;
}

function teamId(role: string, eventId: string) {
  return `${role.toLowerCase()}:${eventId}`;
}

function scheduledMarket(label: string) {
  return {
    label,
    lineLabel: "Schedule",
    bestBook: "Schedule feed",
    bestOdds: 0,
    movement: 0
  };
}

function getEventParticipants(event: ProviderEvent) {
  const away = event.participants.find((participant) => participant.role === "AWAY") ?? event.participants.find((participant) => participant.role === "COMPETITOR_A");
  const home = event.participants.find((participant) => participant.role === "HOME") ?? event.participants.find((participant) => participant.role === "COMPETITOR_B");
  return { away, home };
}

function toGameCard(event: ProviderEvent): GameCardView | null {
  const { away, home } = getEventParticipants(event);
  if (!away || !home) return null;

  const awayName = participantFullName(away, COMBAT_LEAGUES.has(event.leagueKey) ? "Fighter A" : "Away");
  const homeName = participantFullName(home, COMBAT_LEAGUES.has(event.leagueKey) ? "Fighter B" : "Home");
  const awayAbbr = participantName(away, awayName.slice(0, 3).toUpperCase());
  const homeAbbr = participantName(home, homeName.slice(0, 3).toUpperCase());

  return {
    id: event.externalEventId,
    externalEventId: event.externalEventId,
    leagueKey: event.leagueKey,
    awayTeam: {
      id: teamId("away", event.externalEventId),
      leagueId: event.leagueKey,
      name: awayName,
      abbreviation: awayAbbr,
      externalIds: away.externalCompetitorId ? { provider: away.externalCompetitorId } : {}
    },
    homeTeam: {
      id: teamId("home", event.externalEventId),
      leagueId: event.leagueKey,
      name: homeName,
      abbreviation: homeAbbr,
      externalIds: home.externalCompetitorId ? { provider: home.externalCompetitorId } : {}
    },
    startTime: event.startTime,
    status: mapProviderStatus(event.status),
    venue: event.venue ?? "Schedule feed",
    selectedBook: null,
    bestBookCount: 0,
    moneyline: scheduledMarket("Moneyline"),
    spread: scheduledMarket("Spread"),
    total: scheduledMarket("Total"),
    edgeScore: {
      score: 0,
      label: "Schedule"
    },
    detailHref: buildMatchupHref(event.leagueKey, event.externalEventId)
  };
}

function toScoreboardPreview(event: ProviderEvent): ScoreboardPreviewView {
  return {
    id: event.externalEventId,
    label: formatEventLabelFromParticipants(
      event.participants.map((participant, index) => ({
        id: `${event.externalEventId}-${index}`,
        competitorId: participant.externalCompetitorId ?? `${event.externalEventId}-${index}`,
        role: participant.role,
        sortOrder: participant.sortOrder,
        name: participant.name,
        abbreviation: participant.abbreviation,
        type: participant.type,
        score: participant.score,
        record: participant.record,
        isWinner: participant.isWinner
      }))
    ),
    status: mapProviderStatus(event.status),
    stateDetail: null,
    scoreboard: formatScoreboardFromParticipants(
      event.participants.map((participant, index) => ({
        id: `${event.externalEventId}-${index}`,
        competitorId: participant.externalCompetitorId ?? `${event.externalEventId}-${index}`,
        role: participant.role,
        sortOrder: participant.sortOrder,
        name: participant.name,
        abbreviation: participant.abbreviation,
        type: participant.type,
        score: participant.score,
        record: participant.record,
        isWinner: participant.isWinner
      }))
    ),
    startTime: event.startTime,
    providerKey: event.providerKey,
    stale: false,
    detailHref: buildMatchupHref(event.leagueKey, event.externalEventId)
  };
}

function dedupeEvents(events: ProviderEvent[]) {
  const byId = new Map<string, ProviderEvent>();
  for (const event of events) {
    const key = `${event.leagueKey}:${event.externalEventId}`;
    byId.set(key, event);
  }
  return [...byId.values()].sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
}

function isFutureEvent(event: ProviderEvent, start: Date) {
  const time = Date.parse(event.startTime);
  return Number.isFinite(time) && time >= start.getTime() - 60 * 60 * 1000;
}

async function fetchEspnRange(leagueKey: LeagueKey, start: Date, days: number): Promise<ProviderEvent[]> {
  if (!ESPN_LOOKAHEAD_LEAGUES.has(leagueKey)) return [];

  const payloads = await Promise.all(
    dateRange(start, days).map((date) =>
      fetchEspnScoreboard(leagueKey as SupportedLeagueKey, {
        date,
        limit: 250
      }).catch(() => ({ events: [] }))
    )
  );

  return dedupeEvents(
    payloads
      .flatMap((payload) => payload.events ?? [])
      .map((event) => normalizeEspnEvent(leagueKey as SupportedLeagueKey, event))
      .filter((event): event is ProviderEvent => Boolean(event?.externalEventId))
      .filter((event) => isFutureEvent(event, start))
  );
}

function mapMlbStatus(game: Record<string, any>): ProviderEvent["status"] {
  const abstract = String(game.status?.abstractGameState ?? "").toLowerCase();
  const detailed = String(game.status?.detailedState ?? "").toLowerCase();
  const code = String(game.status?.codedGameState ?? "").toLowerCase();
  if (abstract === "live" || code === "i") return "LIVE";
  if (abstract === "final" || detailed.includes("final") || detailed === "game over") return "FINAL";
  if (detailed.includes("postponed")) return "POSTPONED";
  if (detailed.includes("cancel") || detailed.includes("canceled")) return "CANCELED";
  if (detailed.includes("delay")) return "DELAYED";
  return "SCHEDULED";
}

function mlbParticipant(team: Record<string, any> | undefined, role: "AWAY" | "HOME", sortOrder: number): ProviderParticipant {
  const info = team?.team ?? {};
  const name = info.name ?? info.clubName ?? info.teamName ?? "TBD";
  return {
    externalCompetitorId: info.id == null ? null : String(info.id),
    role,
    sortOrder,
    name,
    abbreviation: info.abbreviation ?? null,
    type: "TEAM",
    score: typeof team?.score === "number" ? String(team.score) : null,
    record: null,
    isWinner: typeof team?.isWinner === "boolean" ? team.isWinner : null,
    metadata: { source: "mlb-stats-api" }
  };
}

function normalizeMlbGame(game: Record<string, any>): ProviderEvent | null {
  const gamePk = game.gamePk == null ? null : String(game.gamePk);
  const startTime = typeof game.gameDate === "string" ? game.gameDate : null;
  const away = game.teams?.away;
  const home = game.teams?.home;
  if (!gamePk || !startTime || !away?.team || !home?.team) return null;
  const participants = [mlbParticipant(away, "AWAY", 0), mlbParticipant(home, "HOME", 1)];
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
    scoreJson: null,
    stateJson: { source: "mlb-stats-api", detailedState: game.status?.detailedState ?? null },
    resultJson: status === "FINAL" ? { completed: true } : null,
    metadataJson: { officialDate: game.officialDate ?? null, source: "statsapi.mlb.com" },
    participants
  };
}

async function fetchMlbOfficialRange(start: Date, days: number): Promise<ProviderEvent[]> {
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("startDate", ymd(start));
  url.searchParams.set("endDate", ymd(addDays(start, days - 1)));
  url.searchParams.set("hydrate", "team,venue");

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SharkEdge/1.5" },
    next: { revalidate: 300 }
  });
  if (!response.ok) throw new Error(`Official MLB schedule failed: ${response.status}`);
  const payload = (await response.json()) as MlbSchedulePayload;
  return dedupeEvents(
    (payload.dates ?? [])
      .flatMap((date) => date.games ?? [])
      .map(normalizeMlbGame)
      .filter((event): event is ProviderEvent => Boolean(event))
      .filter((event) => isFutureEvent(event, start))
  );
}

async function fetchUfcEvents(start: Date): Promise<ProviderEvent[]> {
  return (await ufcEventProvider.fetchScoreboard("UFC" as SupportedLeagueKey))
    .filter((event) => isFutureEvent(event, start))
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
}

async function fetchLeagueSchedule(leagueKey: LeagueKey, start: Date, days: number): Promise<UpcomingScheduleResult> {
  try {
    if (leagueKey === "MLB") {
      const official = await fetchMlbOfficialRange(start, days).catch(() => []);
      if (official.length) {
        return { leagueKey, providerLabel: "Official MLB schedule", events: official, note: `Official MLB schedule returned ${official.length} future event(s).`, failed: false };
      }
    }

    if (leagueKey === "UFC") {
      const events = await fetchUfcEvents(start);
      return { leagueKey, providerLabel: "UFC event source", events, note: `UFC event source returned ${events.length} future event(s).`, failed: false };
    }

    const espn = await fetchEspnRange(leagueKey, start, days);
    return { leagueKey, providerLabel: "ESPN dated scoreboard", events: espn, note: `ESPN dated scoreboard returned ${espn.length} future event(s).`, failed: false };
  } catch (error) {
    return { leagueKey, providerLabel: "Schedule lookahead", events: [], note: error instanceof Error ? error.message : String(error), failed: true };
  }
}

function sectionState(sportStatus: BoardSportSectionView["status"], games: GameCardView[], failed: boolean): BoardSportSectionView["adapterState"] {
  if (games.length > 0) return "SCORES_ONLY";
  if (failed) return "ADAPTER_PENDING";
  return sportStatus === "COMING_SOON" ? "COMING_SOON" : "NO_EVENTS";
}

export async function buildUpcomingScheduleBoardData(filters: BoardFilters, options: { daysAhead?: number; startDate?: Date } = {}): Promise<BoardPageData> {
  const visibleSports = filters.league === "ALL" ? BOARD_SPORTS : BOARD_SPORTS.filter((sport) => sport.leagueKey === filters.league);
  const start = startOfUtcDate(options.startDate ?? new Date());
  const scheduleResults = await Promise.all(
    visibleSports.map((sport) =>
      fetchLeagueSchedule(
        sport.leagueKey,
        start,
        options.daysAhead ?? LOOKAHEAD_DEFAULT_DAYS[sport.leagueKey]
      )
    )
  );
  const resultByLeague = new Map(scheduleResults.map((result) => [result.leagueKey, result]));

  const sportSections = visibleSports
    .sort((left, right) => BOARD_SPORT_ORDER.indexOf(left.leagueKey) - BOARD_SPORT_ORDER.indexOf(right.leagueKey))
    .map((sport) => {
      const result = resultByLeague.get(sport.leagueKey);
      const games = (result?.events ?? []).map(toGameCard).filter((game): game is GameCardView => Boolean(game));
      const scoreboard = (result?.events ?? []).map(toScoreboardPreview);
      return {
        leagueKey: sport.leagueKey,
        leagueLabel: sport.leagueLabel,
        sport: sport.sport,
        status: sport.status,
        liveScoreProvider: sport.liveScoreProvider,
        currentOddsProvider: sport.currentOddsProvider,
        historicalOddsProvider: sport.historicalOddsProvider,
        propsStatus: sport.propsStatus,
        propsProviders: sport.propsProviders,
        propsNote: sport.propsNote,
        note: sport.note,
        detail: sport.detail,
        scoreboardDetail: result?.note ?? "No upcoming schedule provider result.",
        adapterState: sectionState(sport.status, games, Boolean(result?.failed)),
        stale: false,
        games,
        scoreboard
      } satisfies BoardSportSectionView;
    });

  const games = sportSections.flatMap((section) => section.games);
  const availableDates = Array.from(new Set(games.map((game) => game.startTime.slice(0, 10)))).sort();
  const providerHealth = buildProviderHealth({
    source: games.length ? "live" : "mock",
    healthySummary: `Schedule lookahead loaded ${games.length} upcoming event(s).`,
    degradedSummary: "Schedule lookahead returned partial data.",
    fallbackSummary: "Schedule lookahead is using fallback provider coverage.",
    offlineSummary: "Schedule lookahead did not return upcoming events."
  });

  return {
    filters,
    availableDates,
    leagues: visibleSports.map((sport) => ({
      id: `lookahead_${sport.leagueKey.toLowerCase()}`,
      key: sport.leagueKey,
      name: sport.leagueLabel,
      sport: sport.sport
    })),
    sportsbooks: [{ id: "schedule", key: "schedule", name: "Schedule feed", region: "US" } satisfies SportsbookRecord],
    games,
    sportSections,
    snapshots: [],
    summary: {
      totalGames: games.length,
      totalProps: 0,
      totalSportsbooks: 0
    },
    liveMessage: `Lookahead schedule loaded through ${availableDates.at(-1) ?? "the selected window"}.`,
    source: games.length ? "live" : "mock",
    sourceNote: "Schedule lookahead uses dated ESPN scoreboards, official MLB schedule fallback, and UFC event source coverage.",
    providerHealth
  };
}
