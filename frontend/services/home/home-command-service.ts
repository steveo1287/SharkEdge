import type { BoardFilters, BoardPageData, GameCardView, LeagueKey, PropCardView } from "@/lib/types/domain";
import {
  buildHomeOpportunitySnapshot,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";

export type HomeLeagueScope = LeagueKey | "ALL";
export type HomeDeskDateKey = "today" | "tomorrow" | "upcoming";

export const HOME_LEAGUE_ITEMS = [
  { key: "ALL", label: "All Sports" },
  { key: "NBA", label: "NBA" },
  { key: "NCAAB", label: "NCAAB" },
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
  verifiedGames: GameCardView[];
  movementGames: GameCardView[];
  topProps: PropCardView[];
  topActionables: ReturnType<typeof rankOpportunities>;
  decisionWindows: ReturnType<typeof rankOpportunities>;
  traps: ReturnType<typeof rankOpportunities>;
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

function resolveBoardDate(value: HomeDeskDateKey) {
  if (value === "today") {
    return "today";
  }

  if (value === "upcoming") {
    return "all";
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
  const day = `${tomorrow.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
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
    .slice(0, 3);
}

function getVerifiedGames(
  games: GameCardView[],
  boardTop: ReturnType<typeof buildHomeOpportunitySnapshot>["boardTop"]
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

  return (rankedGames.length ? rankedGames : games.filter(isVerifiedGame)).slice(0, 4);
}

function buildLiveDeskState(liveBoardData: BoardPageData | null) {
  if (!liveBoardData) {
    return {
      liveDeskAvailable: false,
      liveDeskMessage:
        "Live desk unavailable right now. SharkEdge is staying honest with verified pregame rows and scoreboard context only.",
      liveDeskFreshnessLabel: "Unavailable",
      liveDeskFreshnessMinutes: null
    };
  }

  const liveDeskAvailable =
    liveBoardData.source !== "mock" &&
    liveBoardData.providerHealth.state !== "OFFLINE";

  if (liveDeskAvailable) {
    return {
      liveDeskAvailable: true,
      liveDeskMessage: liveBoardData.liveMessage ?? liveBoardData.providerHealth.summary,
      liveDeskFreshnessLabel: liveBoardData.providerHealth.freshnessLabel,
      liveDeskFreshnessMinutes:
        typeof liveBoardData.providerHealth.freshnessMinutes === "number"
          ? liveBoardData.providerHealth.freshnessMinutes
          : null
    };
  }

  return {
    liveDeskAvailable: false,
    liveDeskMessage:
      liveBoardData.liveMessage ??
      liveBoardData.providerHealth.warnings[0] ??
      liveBoardData.providerHealth.summary ??
      "Live desk unavailable right now. SharkEdge is staying honest with verified pregame rows and scoreboard context only.",
    liveDeskFreshnessLabel: "Support-aware fallback",
    liveDeskFreshnessMinutes: null
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

  const boardFilters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });

  const liveFilters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "live"
  });

  const [boardData, liveBoardResult, topProps] = await Promise.all([
    oddsService.getBoardPageData(boardFilters),
    oddsService.getBoardPageData(liveFilters).catch(() => null),
    propsService.getTopPlayCards(4)
  ]);

  const opportunitySnapshot = buildHomeOpportunitySnapshot({
    games: boardData.games,
    props: topProps,
    providerHealth: boardData.providerHealth
  });

  const focusedLeague = chooseFocusedLeague(selectedLeague, boardData.games);
  const topActionables = rankOpportunities([
    ...opportunitySnapshot.boardTop,
    ...opportunitySnapshot.propsTop
  ]).slice(0, 4);

  const liveDeskState = buildLiveDeskState(liveBoardResult);

  return {
    selectedLeague,
    selectedDate,
    focusedLeague,
    boardFilters,
    boardData,
    liveBoardData: liveDeskState.liveDeskAvailable ? liveBoardResult : null,
    liveDeskAvailable: liveDeskState.liveDeskAvailable,
    liveDeskMessage: liveDeskState.liveDeskMessage,
    liveDeskFreshnessLabel: liveDeskState.liveDeskFreshnessLabel,
    liveDeskFreshnessMinutes: liveDeskState.liveDeskFreshnessMinutes,
    verifiedGames: getVerifiedGames(boardData.games, opportunitySnapshot.boardTop),
    movementGames: getMovementGames(
      liveDeskState.liveDeskAvailable && liveBoardResult ? liveBoardResult.games : []
    ),
    topProps,
    topActionables,
    decisionWindows: opportunitySnapshot.timingWindows.slice(0, 2),
    traps: opportunitySnapshot.traps.slice(0, 2)
  };
}