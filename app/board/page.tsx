import type { LeagueSnapshotView } from "@/lib/types/domain";
import type { GameCardView, LeagueKey } from "@/lib/types/domain";
import { buildGameWorkflowHref, resolveGameWorkflowTarget } from "@/lib/utils/workflow-hrefs";
import {
  BOARD_LEAGUE_ITEMS,
  getBoardCommandData,
  type BoardLeagueScope
} from "@/services/board/board-command-service";
import {
  getProviderReadinessView,
  type ProviderReadinessView
} from "@/services/current-odds/provider-readiness-service";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";
import { getLeagueSnapshots } from "@/services/stats/stats-service";
import { BoardCommandCenter } from "@/components/board/board-command-center";

export const dynamic = "force-dynamic";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type QueryState = {
  league: BoardLeagueScope;
  market: "all" | "moneyline" | "spread" | "total";
  sort: "edge" | "movement" | "start";
  focus?: string | null;
};

async function getSafeProviderReadiness(): Promise<ProviderReadinessView | null> {
  try {
    return await getProviderReadinessView({
      leagues: ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]
    });
  } catch {
    return null;
  }
}

async function getSafeSnapshots(league: BoardLeagueScope): Promise<LeagueSnapshotView[]> {
  try {
    return await getLeagueSnapshots(league);
  } catch {
    return [];
  }
}

function buildBoardHref(state: QueryState) {
  const params = new URLSearchParams();

  if (state.league !== "ALL") params.set("league", state.league);
  if (state.market !== "all") params.set("market", state.market);
  if (state.sort !== "edge") params.set("sort", state.sort);
  if (state.focus) params.set("focus", state.focus);

  const query = params.toString();
  return query ? `/board?${query}` : "/board";
}

function buildLeagueHref(league: BoardLeagueScope, state: QueryState) {
  return buildBoardHref({ ...state, league, focus: null });
}

function formatMovementValue(movement: number) {
  const absolute = Math.abs(movement);
  if (!absolute) return "Flat";
  return `${movement > 0 ? "↑" : "↓"} ${absolute >= 10 ? absolute.toFixed(0) : absolute.toFixed(1)}`;
}

function getLeagueVerifiedCount(games: GameCardView[], league: LeagueKey) {
  return games.filter((game) => game.leagueKey === league).length;
}

function getSelectedGameLabel(game: GameCardView | null) {
  if (!game) return null;
  return `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`;
}

function getWorkflowLabel(game: GameCardView, market: "moneyline" | "spread" | "total") {
  const marketLabel = market === "moneyline" ? "Moneyline" : market === "spread" ? "Spread" : "Total";
  const bookLabel = game[market].bestBook && game[market].bestBook !== "No book" ? game[market].bestBook : game.selectedBook?.name ?? null;
  return bookLabel ? `${marketLabel} @ ${bookLabel}` : marketLabel;
}

function buildMovementSeries(games: GameCardView[]) {
  const values = games.slice(0, 10).map((game) => {
    return Math.max(
      Math.abs(game.moneyline.movement),
      Math.abs(game.spread.movement),
      Math.abs(game.total.movement)
    );
  });

  return values.length ? values : [0, 0, 0, 0];
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};

  const [board, readiness] = await Promise.all([
    getBoardCommandData(resolvedSearch),
    getSafeProviderReadiness()
  ]);

  const queryState: QueryState = {
    league: board.selectedLeague,
    market: board.selectedMarket,
    sort: board.selectedSort,
    focus: board.focusedGame?.id ?? null
  };

  const snapshots = await getSafeSnapshots(queryState.league);
  const uniqueBooks = Array.from(
    new Set(
      board.verifiedGames
        .flatMap((game) => [
          game.selectedBook?.name,
          game.moneyline.bestBook,
          game.spread.bestBook,
          game.total.bestBook
        ])
        .filter((value): value is string => Boolean(value && value !== "No book"))
    )
  );

  const movers = board.movers.slice(0, 4);
  const boardStatusCopy = board.verifiedGames.length
    ? `${board.verifiedGames.length} verified rows are live across moneyline, spread, and total.`
    : board.boardData.liveMessage ?? board.boardData.sourceNote ?? "No verified market rows are available right now.";

  const focusedMarkets = board.focusedGame
    ? [
        {
          key: "moneyline" as const,
          label: "Moneyline",
          lineLabel: board.focusedGame.moneyline.lineLabel,
          movementLabel: `Move ${formatMovementValue(board.focusedGame.moneyline.movement)}`,
          opportunity: buildGameMarketOpportunity(board.focusedGame, "moneyline")
        },
        {
          key: "spread" as const,
          label: "Spread",
          lineLabel: board.focusedGame.spread.lineLabel,
          movementLabel: `Move ${formatMovementValue(board.focusedGame.spread.movement)}`,
          opportunity: buildGameMarketOpportunity(board.focusedGame, "spread")
        },
        {
          key: "total" as const,
          label: "Total",
          lineLabel: board.focusedGame.total.lineLabel,
          movementLabel: `Move ${formatMovementValue(board.focusedGame.total.movement)}`,
          opportunity: buildGameMarketOpportunity(board.focusedGame, "total")
        }
      ]
    : [];

  const marketItems = [
    { label: "All", market: "all" as const },
    { label: "Moneyline", market: "moneyline" as const },
    { label: "Spread", market: "spread" as const },
    { label: "Total", market: "total" as const }
  ].map((item) => ({
    label: item.label,
    href: buildBoardHref({ ...queryState, market: item.market, focus: board.focusedGame?.id ?? null }),
    active: board.selectedMarket === item.market
  }));

  const sortItems = [
    { label: "Edge", sort: "edge" as const },
    { label: "Movement", sort: "movement" as const },
    { label: "Start", sort: "start" as const }
  ].map((item) => ({
    label: item.label,
    href: buildBoardHref({ ...queryState, sort: item.sort, focus: board.focusedGame?.id ?? null }),
    active: board.selectedSort === item.sort
  }));

  const sortHrefMap = {
    edge: sortItems.find((item) => item.label === "Edge")?.href ?? buildBoardHref({ ...queryState, sort: "edge" }),
    movement: sortItems.find((item) => item.label === "Movement")?.href ?? buildBoardHref({ ...queryState, sort: "movement" }),
    start: sortItems.find((item) => item.label === "Start")?.href ?? buildBoardHref({ ...queryState, sort: "start" })
  } satisfies Record<"edge" | "movement" | "start", string>;

  const tableRows = board.verifiedGames.slice(0, 24).map((game) => {
    const workflowTarget = resolveGameWorkflowTarget(game, board.selectedMarket);
    return {
      game,
      selected: game.id === board.focusedGame?.id,
      inspectHref: buildBoardHref({ ...queryState, focus: game.id }),
      gameHref: buildGameWorkflowHref(game.detailHref ?? `/game/${game.id}`, queryState, workflowTarget),
      workflowLabel: getWorkflowLabel(game, workflowTarget.market)
    };
  });

  const focusedWorkflowTarget = board.focusedGame
    ? resolveGameWorkflowTarget(board.focusedGame, board.selectedMarket)
    : null;
  const focusedGameHref = board.focusedGame && focusedWorkflowTarget
    ? buildGameWorkflowHref(board.focusedGame.detailHref ?? `/game/${board.focusedGame.id}`, queryState, focusedWorkflowTarget)
    : null;
  const focusedWorkflowLabel = board.focusedGame && focusedWorkflowTarget
    ? getWorkflowLabel(board.focusedGame, focusedWorkflowTarget.market)
    : null;

  const leagueTabs = BOARD_LEAGUE_ITEMS.map((league) => {
    const count =
      league === "ALL"
        ? board.verifiedGames.length || null
        : getLeagueVerifiedCount(board.verifiedGames, league) || null;

    return {
      label: league,
      href: buildLeagueHref(league, queryState),
      active: board.selectedLeague === league,
      count
    };
  });

  return (
    <BoardCommandCenter
      readiness={readiness}
      boardStatusCopy={boardStatusCopy}
      queryState={queryState}
      leagueTabs={leagueTabs}
      marketItems={marketItems}
      sortItems={sortItems}
      sortHrefMap={sortHrefMap}
      selectedMarket={board.selectedMarket}
      selectedSort={board.selectedSort}
      selectedGameLabel={getSelectedGameLabel(board.focusedGame)}
      verifiedCount={board.verifiedGames.length}
      moverCount={board.movers.length}
      uniqueBooks={uniqueBooks}
      movers={movers}
      movementSeries={buildMovementSeries(board.verifiedGames)}
      tableRows={tableRows}
      focusedGame={board.focusedGame}
      focusedMarkets={focusedMarkets}
      focusedGameHref={focusedGameHref}
      focusedWorkflowLabel={focusedWorkflowLabel}
      snapshots={snapshots}
    />
  );
}
