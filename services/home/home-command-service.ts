import type {
  BoardFilters,
  BoardPageData,
  GameCardView,
  LeagueKey,
  PropCardView
} from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import { buildUpcomingScheduleBoardData } from "@/services/events/upcoming-schedule-service";
import { recordSurfacedOpportunities } from "@/services/opportunities/opportunity-clv-service";
import { getOpportunityBookLeadershipResolver } from "@/services/opportunities/opportunity-book-leadership";
import { getOpportunityCloseDestinationResolver } from "@/services/opportunities/opportunity-close-destination";
import {
  buildHomeOpportunitySnapshot,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";
import { getOpportunityMarketPathResolver } from "@/services/opportunities/opportunity-market-path";
import { getOpportunityPortfolioAllocator } from "@/services/opportunities/opportunity-portfolio";
import { getOpportunityReasonCalibrationResolver } from "@/services/opportunities/opportunity-reason-calibration";
import { getOpportunityTimingReplayResolver } from "@/services/opportunities/opportunity-timing-review";
import { getOpportunityTruthCalibrationResolver } from "@/services/opportunities/opportunity-truth-calibration";

export type HomeLeagueScope = LeagueKey | "ALL";
export type HomeDeskDateKey = "today" | "tomorrow" | "upcoming";

export const HOME_LEAGUE_ITEMS = [
  { key: "ALL", label: "All Sports" },
  { key: "NBA", label: "NBA" },
  { key: "MLB", label: "MLB" },
  { key: "NHL", label: "NHL" },
  { key: "NFL", label: "NFL" },
  { key: "NCAAF", label: "NCAAF" },
  { key: "UFC", label: "UFC" },
  { key: "BOXING", label: "Boxing" }
] as const;

export const HOME_DESK_DATES = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "upcoming", label: "Upcoming" }
] as const;

const HOME_SLATE_TIME_ZONE = "America/Chicago";
const HOME_SLATE_ROLLOVER_HOUR = 5;
const RESOLVED_HOME_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type HomeCommandData = {
  selectedLeague: HomeLeagueScope;
  selectedDate: HomeDeskDateKey;
  focusedLeague: LeagueKey;
  boardFilters: BoardFilters;
  boardData: BoardPageData;
  liveBoardData: BoardPageData | null;
  liveDeskAvailable: boolean;
  liveDeskMessage: string | null;
  liveDeskFreshnessLabel: string;
  liveDeskFreshnessMinutes: number | null;
  deskStatusState: string;
  deskStatusLabel: string;
  deskSourceNote: string;
  verifiedGames: GameCardView[];
  movementGames: GameCardView[];
  topProps: PropCardView[];
  topActionables: OpportunityView[];
  decisionWindows: OpportunityView[];
  traps: OpportunityView[];
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getSelectedLeague(value: string | undefined): HomeLeagueScope {
  const candidate = value?.toUpperCase();
  return (
    HOME_LEAGUE_ITEMS.find((league) => league.key === candidate)?.key ?? "ALL"
  ) as HomeLeagueScope;
}

function getSelectedDate(value: string | undefined): HomeDeskDateKey {
  return HOME_DESK_DATES.find((item) => item.key === value)?.key ?? "today";
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatYmd(year: number, month: number, day: number) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function addDaysToYmd(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function getChicagoDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HOME_SLATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour")
  };
}

function getCurrentHomeSlateDate(now = new Date()) {
  const parts = getChicagoDateParts(now);
  const localDate = formatYmd(parts.year, parts.month, parts.day);
  return parts.hour < HOME_SLATE_ROLLOVER_HOUR
    ? addDaysToYmd(localDate, -1)
    : localDate;
}

function resolveBoardDate(value: HomeDeskDateKey) {
  if (value === "today") {
    return getCurrentHomeSlateDate();
  }

  if (value === "upcoming") {
    return "all";
  }

  return addDaysToYmd(getCurrentHomeSlateDate(), 1);
}

function isResolvedHomeDate(value: string) {
  return RESOLVED_HOME_DATE_PATTERN.test(value);
}

function getHomeLocalDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = getChicagoDateParts(date);
  return formatYmd(parts.year, parts.month, parts.day);
}

function isInResolvedHomeDate(startTime: string, resolvedDate: string) {
  if (!isResolvedHomeDate(resolvedDate)) {
    return true;
  }

  return getHomeLocalDateKey(startTime) === resolvedDate;
}

function filterHomeBoardDataByDate(boardData: BoardPageData, resolvedDate: string): BoardPageData {
  if (!isResolvedHomeDate(resolvedDate)) {
    return boardData;
  }

  const games = boardData.games.filter((game) =>
    isInResolvedHomeDate(game.startTime, resolvedDate)
  );
  const sportSections = boardData.sportSections.map((section) => ({
    ...section,
    games: section.games.filter((game) =>
      isInResolvedHomeDate(game.startTime, resolvedDate)
    ),
    scoreboard: section.scoreboard.filter((event) =>
      isInResolvedHomeDate(event.startTime, resolvedDate)
    )
  }));

  return {
    ...boardData,
    games,
    sportSections,
    summary: {
      ...boardData.summary,
      totalGames: sportSections.reduce(
        (total, section) => total + section.games.length + section.scoreboard.length,
        0
      )
    }
  };
}

function hasHomeRows(boardData: BoardPageData) {
  return boardData.games.length > 0 || boardData.sportSections.some((section) => section.scoreboard.length > 0);
}

function isScheduleLookaheadData(boardData: BoardPageData) {
  return boardData.sourceNote.toLowerCase().includes("schedule lookahead");
}

async function loadScheduleLookahead(args: {
  oddsService: typeof import("@/services/odds/board-service");
  selectedLeague: HomeLeagueScope;
  boardFilters: BoardFilters;
  resolvedDate?: string;
}) {
  const lookaheadData = await buildUpcomingScheduleBoardData(args.boardFilters, {
    daysAhead: args.selectedLeague === "NFL" || args.selectedLeague === "NCAAF" ? 21 : 7
  });
  const filtered = args.resolvedDate
    ? filterHomeBoardDataByDate(lookaheadData, args.resolvedDate)
    : lookaheadData;

  return {
    boardFilters: args.boardFilters,
    boardData: {
      ...filtered,
      filters: args.boardFilters
    }
  };
}

async function loadHomeBoardData(args: {
  oddsService: typeof import("@/services/odds/board-service");
  selectedLeague: HomeLeagueScope;
  selectedDate: HomeDeskDateKey;
}) {
  const resolvedDate = resolveBoardDate(args.selectedDate);
  const boardFilters = args.oddsService.parseBoardFilters({
    league: args.selectedLeague,
    date: resolvedDate,
    sportsbook: "best",
    market: "all",
    status: "all"
  });

  if (args.selectedDate === "upcoming") {
    return loadScheduleLookahead({
      oddsService: args.oddsService,
      selectedLeague: args.selectedLeague,
      boardFilters
    });
  }

  const rawBoardData = await args.oddsService.getBoardPageData(boardFilters);
  const filteredBoardData = filterHomeBoardDataByDate(rawBoardData, boardFilters.date);

  if (
    isResolvedHomeDate(boardFilters.date) &&
    !hasHomeRows(filteredBoardData)
  ) {
    const fallbackFilters = args.oddsService.parseBoardFilters({
      league: args.selectedLeague,
      date: "all",
      sportsbook: "best",
      market: "all",
      status: "all"
    });
    const fallbackRaw = await args.oddsService.getBoardPageData(fallbackFilters);
    const fallbackFiltered = filterHomeBoardDataByDate(fallbackRaw, boardFilters.date);

    if (hasHomeRows(fallbackFiltered)) {
      return {
        boardFilters,
        boardData: {
          ...fallbackFiltered,
          filters: boardFilters,
          liveMessage:
            fallbackFiltered.liveMessage ??
            `Loaded ${formatHomeDateLabel(args.selectedDate).toLowerCase()} slate from upcoming inventory after the dated feed returned empty.`
        }
      };
    }

    const scheduleLookahead = await loadScheduleLookahead({
      oddsService: args.oddsService,
      selectedLeague: args.selectedLeague,
      boardFilters,
      resolvedDate: boardFilters.date
    });

    if (hasHomeRows(scheduleLookahead.boardData)) {
      return {
        boardFilters,
        boardData: {
          ...scheduleLookahead.boardData,
          liveMessage:
            scheduleLookahead.boardData.liveMessage ??
            `Loaded ${formatHomeDateLabel(args.selectedDate).toLowerCase()} schedule from lookahead feed after the dated market feed returned empty.`
        }
      };
    }
  }

  return {
    boardFilters,
    boardData: filteredBoardData
  };
}

function isVerifiedGame(game: GameCardView) {
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 ||
      game.moneyline.bestOdds !== 0 ||
      game.total.bestOdds !== 0)
  );
}

function chooseFocusedLeague(
  selectedLeague: HomeLeagueScope,
  boardGames: GameCardView[]
): LeagueKey {
  if (selectedLeague !== "ALL") {
    return selectedLeague;
  }

  const boardLeague = boardGames.find((game) => isVerifiedGame(game))?.leagueKey;
  if (boardLeague) {
    return boardLeague;
  }

  return boardGames[0]?.leagueKey ?? "NBA";
}

function getMovementGames(games: GameCardView[]) {
  return games
    .filter(isVerifiedGame)
    .filter(
      (game) =>
        Math.abs(game.spread.movement) >= 0.5 ||
        Math.abs(game.total.movement) >= 0.5 ||
        Math.abs(game.moneyline.movement) >= 10
    )
    .sort((left, right) => {
      const leftMove = Math.max(
        Math.abs(left.spread.movement),
        Math.abs(left.total.movement),
        Math.abs(left.moneyline.movement)
      );
      const rightMove = Math.max(
        Math.abs(right.spread.movement),
        Math.abs(right.total.movement),
        Math.abs(right.moneyline.movement)
      );
      return rightMove - leftMove;
    })
    .slice(0, 6);
}

function getVerifiedGames(
  games: GameCardView[],
  boardTop: OpportunityView[],
  includeScheduleRows = false
) {
  const rankedGames = Array.from(
    new Map(
      boardTop
        .map((opportunity) =>
          games.find((game) => opportunity.id.startsWith(`${game.id}:`))
        )
        .filter((game): game is GameCardView => Boolean(game))
        .map((game) => [game.id, game] as const)
    ).values()
  );

  if (rankedGames.length) {
    return rankedGames.slice(0, 8);
  }

  const verified = games.filter(isVerifiedGame);
  if (verified.length) {
    return verified.slice(0, 8);
  }

  return includeScheduleRows ? games.slice(0, 8) : [];
}

function buildLiveDeskState(boardData: BoardPageData) {
  const liveDeskAvailable =
    boardData.source !== "mock" &&
    boardData.providerHealth.state !== "OFFLINE" &&
    boardData.providerHealth.state !== "FALLBACK";

  if (liveDeskAvailable) {
    return {
      liveDeskAvailable: true,
      liveDeskMessage: boardData.liveMessage ?? boardData.providerHealth.summary,
      liveDeskFreshnessLabel: boardData.providerHealth.freshnessLabel,
      liveDeskFreshnessMinutes:
        typeof boardData.providerHealth.freshnessMinutes === "number"
          ? boardData.providerHealth.freshnessMinutes
          : null,
      deskStatusState: boardData.providerHealth.state,
      deskStatusLabel: boardData.providerHealth.label,
      deskSourceNote: boardData.sourceNote
    };
  }

  return {
    liveDeskAvailable: false,
    liveDeskMessage:
      boardData.liveMessage ??
      boardData.providerHealth.warnings[0] ??
      boardData.providerHealth.summary ??
      "Live desk unavailable right now. SharkEdge is staying honest with verified pregame rows and scoreboard context only.",
    liveDeskFreshnessLabel: "Support-aware fallback",
    liveDeskFreshnessMinutes: null,
    deskStatusState: boardData.providerHealth.state,
    deskStatusLabel: "Live desk unavailable",
    deskSourceNote: boardData.sourceNote
  };
}

export function formatHomeDateLabel(value: HomeDeskDateKey) {
  return value === "today" ? "Today" : value === "tomorrow" ? "Tomorrow" : "Upcoming";
}

export async function getHomeCommandData(
  searchParams: Record<string, string | string[] | undefined>
): Promise<HomeCommandData> {
  const selectedLeague = getSelectedLeague(readValue(searchParams, "league"));
  const selectedDate = getSelectedDate(readValue(searchParams, "date"));

  const oddsService = await import("@/services/odds/board-service");
  const propsService = await import("@/services/odds/props-service");

  const [{ boardFilters, boardData }, topProps] = await Promise.all([
    loadHomeBoardData({ oddsService, selectedLeague, selectedDate }),
    propsService.getTopPlayCards(6)
  ]);

  const [
    truthCalibrationResolver,
    marketPathResolver,
    bookLeadershipResolver,
    closeDestinationResolver,
    reasonCalibrationResolver,
    timingReplayResolver,
    portfolioAllocator
  ] = await Promise.all([
    getOpportunityTruthCalibrationResolver({
      league: selectedLeague
    }),
    getOpportunityMarketPathResolver({
      league: selectedLeague
    }),
    getOpportunityBookLeadershipResolver({
      league: selectedLeague
    }),
    getOpportunityCloseDestinationResolver({
      league: selectedLeague
    }),
    getOpportunityReasonCalibrationResolver({
      league: selectedLeague
    }),
    getOpportunityTimingReplayResolver({
      league: selectedLeague
    }),
    getOpportunityPortfolioAllocator()
  ]);
  const opportunitySnapshot = await buildHomeOpportunitySnapshot({
    games: boardData.games,
    props: topProps,
    providerHealth: boardData.providerHealth,
    truthCalibrationResolver,
    marketPathResolver,
    bookLeadershipResolver,
    closeDestinationResolver,
    reasonCalibrationResolver,
    timingReplayResolver,
    portfolioAllocator
  });

  const focusedLeague = chooseFocusedLeague(selectedLeague, boardData.games);

  const topActionables = rankOpportunities([
    ...opportunitySnapshot.boardTop,
    ...opportunitySnapshot.propsTop
  ]).slice(0, 6);

  await recordSurfacedOpportunities(topActionables.slice(0, 3), "home_command", {
    primaryCount: 1,
    metadata: {
      selectedLeague,
      selectedDate,
      source: "home_command_service"
    }
  }).catch(() => []);

  const liveDeskState = buildLiveDeskState(boardData);
  const includeScheduleRows = selectedDate === "upcoming" || isScheduleLookaheadData(boardData);

  return {
    selectedLeague,
    selectedDate,
    focusedLeague,
    boardFilters,
    boardData,
    liveBoardData: liveDeskState.liveDeskAvailable ? boardData : null,
    liveDeskAvailable: liveDeskState.liveDeskAvailable,
    liveDeskMessage: liveDeskState.liveDeskMessage,
    liveDeskFreshnessLabel: liveDeskState.liveDeskFreshnessLabel,
    liveDeskFreshnessMinutes: liveDeskState.liveDeskFreshnessMinutes,
    deskStatusState: liveDeskState.deskStatusState,
    deskStatusLabel: liveDeskState.deskStatusLabel,
    deskSourceNote: liveDeskState.deskSourceNote,
    verifiedGames: getVerifiedGames(boardData.games, opportunitySnapshot.boardTop, includeScheduleRows),
    movementGames: getMovementGames(
      liveDeskState.liveDeskAvailable ? boardData.games : []
    ),
    topProps,
    topActionables,
    decisionWindows: opportunitySnapshot.timingWindows.slice(0, 4),
    traps: opportunitySnapshot.traps.slice(0, 4)
  };
}
