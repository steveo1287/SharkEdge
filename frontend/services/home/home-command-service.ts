import type {
  BoardFilters,
  BoardPageData,
  GameCardView,
  LeagueKey,
  PropCardView
} from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
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
  boardTop: OpportunityView[]
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

  const boardFilters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });

  const [boardData, topProps] = await Promise.all([
    oddsService.getBoardPageData(boardFilters),
    propsService.getTopPlayCards(4)
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
  ]).slice(0, 2);

  await recordSurfacedOpportunities(topActionables, "home_command", {
    primaryCount: 1,
    metadata: {
      selectedLeague,
      selectedDate,
      source: "home_command_service"
    }
  }).catch(() => []);

  const liveDeskState = buildLiveDeskState(boardData);

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
    verifiedGames: getVerifiedGames(boardData.games, opportunitySnapshot.boardTop),
    movementGames: getMovementGames(
      liveDeskState.liveDeskAvailable ? boardData.games : []
    ),
    topProps,
    topActionables,
    decisionWindows: opportunitySnapshot.timingWindows.slice(0, 2),
    traps: opportunitySnapshot.traps.slice(0, 2)
  };
}
