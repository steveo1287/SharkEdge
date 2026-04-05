import type { GameCardView, LeagueKey } from "@/lib/types/domain";
import type { PerformanceDashboardView } from "@/lib/types/ledger";
import type { OpportunityView } from "@/lib/types/opportunity";
import { withTimeoutFallback } from "@/lib/utils/async";
import { buildHomeOpportunitySnapshot } from "@/services/opportunities/opportunity-service";

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

export type HomeLeagueScope = LeagueKey | "ALL";
export type HomeDeskDateKey = (typeof HOME_DESK_DATES)[number]["key"];
export type HomeSearchParams = Record<string, string | string[] | undefined>;

function readValue(searchParams: HomeSearchParams, key: string) {
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

function getMovementMagnitude(game: GameCardView) {
  return Math.max(
    Math.abs(game.spread.movement),
    Math.abs(game.total.movement),
    Math.abs(game.moneyline.movement)
  );
}

function dedupeOpportunities(opportunities: OpportunityView[]) {
  return Array.from(
    new Map(opportunities.map((opportunity) => [opportunity.id, opportunity])).values()
  );
}

export async function getHomeCommandData(
  searchParamsInput?: Promise<HomeSearchParams> | HomeSearchParams
) {
  const resolvedSearch = (await searchParamsInput) ?? {};
  const selectedLeague = getSelectedLeague(readValue(resolvedSearch, "league"));
  const selectedDate = getSelectedDate(readValue(resolvedSearch, "date"));

  const oddsService = await import("@/services/odds/board-service");

  const pregameFilters = oddsService.parseBoardFilters({
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

  const [pregameResult, liveResult, propsResult, performanceResult] =
    await Promise.allSettled([
      oddsService.getBoardPageData(pregameFilters),
      oddsService.getBoardPageData(liveFilters),
      withTimeoutFallback(
        import("@/services/odds/props-service").then((module) =>
          module.getTopPlayCards(6)
        ),
        {
          timeoutMs: 1_800,
          fallback: []
        }
      ),
      withTimeoutFallback(
        import("@/services/bets/bets-service").then((module) =>
          module.getPerformanceDashboard()
        ),
        {
          timeoutMs: 1_800,
          fallback: null
        }
      )
    ]);

  if (pregameResult.status !== "fulfilled") {
    throw pregameResult.reason;
  }

  const pregameBoardData = pregameResult.value;
  const liveBoardData =
    liveResult.status === "fulfilled"
      ? liveResult.value
      : {
          ...pregameBoardData,
          filters: liveFilters,
          games: [],
          liveMessage: "Live board unavailable on this render.",
          sourceNote:
            "Live desk did not render cleanly, so the command center is staying honest and using pregame-only data for this pass.",
          providerHealth: {
            ...pregameBoardData.providerHealth,
            state:
              pregameBoardData.providerHealth.state === "HEALTHY"
                ? "DEGRADED"
                : pregameBoardData.providerHealth.state,
            label: "Live desk unavailable",
            summary:
              "Live board could not render on this request. SharkEdge is falling back to pregame-only command center data instead of faking a live feed.",
            warnings: Array.from(
              new Set([
                ...pregameBoardData.providerHealth.warnings,
                "Live board unavailable on this render."
              ])
            )
          }
        };

  const topProps = propsResult.status === "fulfilled" ? propsResult.value : [];
  const performanceData =
    performanceResult.status === "fulfilled"
      ? (performanceResult.value as PerformanceDashboardView | null)
      : null;

  const opportunitySnapshot = buildHomeOpportunitySnapshot({
    games: pregameBoardData.games,
    props: topProps,
    providerHealth: pregameBoardData.providerHealth,
    performance: performanceData
  });

  const focusedLeague = chooseFocusedLeague(selectedLeague, pregameBoardData.games);

  const bestEdges = dedupeOpportunities([
    ...opportunitySnapshot.timingWindows,
    ...opportunitySnapshot.boardTop,
    ...opportunitySnapshot.propsTop
  ]).slice(0, 4);

  const propDesk = opportunitySnapshot.propsTop.slice(0, 2);

  const rankedGames = Array.from(
    new Map(
      opportunitySnapshot.boardTop
        .map((opportunity) =>
          pregameBoardData.games.find((game) =>
            opportunity.id.startsWith(`${game.id}:`)
          )
        )
        .filter((game): game is GameCardView => Boolean(game))
        .map((game) => [game.id, game] as const)
    ).values()
  );

  const verifiedGames = (
    rankedGames.length ? rankedGames : pregameBoardData.games.filter(isVerifiedGame)
  ).slice(0, 4);

  const movementGames = pregameBoardData.games
    .filter(isVerifiedGame)
    .filter(
      (game) =>
        Math.abs(game.spread.movement) >= 0.5 ||
        Math.abs(game.total.movement) >= 0.5 ||
        Math.abs(game.moneyline.movement) >= 10
    )
    .sort((left, right) => getMovementMagnitude(right) - getMovementMagnitude(left))
    .slice(0, 4);

  const liveWatchGames = liveBoardData.games
    .filter(isVerifiedGame)
    .sort((left, right) => getMovementMagnitude(right) - getMovementMagnitude(left))
    .slice(0, 4);

  const combinedWarnings = Array.from(
    new Set([
      ...pregameBoardData.providerHealth.warnings,
      ...liveBoardData.providerHealth.warnings
    ])
  );

  const deskActionableCount = bestEdges.filter(
    (opportunity) => opportunity.actionState === "BET_NOW"
  ).length;

  const workflowBlocked = Boolean(performanceData?.setup);
  const workflowSummary = performanceData?.summary ?? null;

  return {
    selectedLeague,
    selectedDate,
    focusedLeague,
    pregameBoardData,
    liveBoardData,
    performanceData,
    opportunitySnapshot,
    bestEdges,
    propDesk,
    verifiedGames,
    movementGames,
    liveWatchGames,
    combinedWarnings,
    deskActionableCount,
    workflowBlocked,
    workflowSummary
  };
}