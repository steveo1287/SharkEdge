import Link from "next/link";

import { BoardCommandDeck } from "@/components/board/board-command-deck";
import { BoardInspector } from "@/components/board/board-inspector";
import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import type { GameCardView } from "@/lib/types/domain";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getProviderReadinessView } from "@/services/current-odds/provider-readiness-service";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

export const dynamic = "force-dynamic";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SafeProviderReadiness = Awaited<ReturnType<typeof getProviderReadinessView>> | null;

type QueryState = {
  league: "ALL" | "NBA" | "MLB";
  market: "all" | "moneyline" | "spread" | "total";
  sort: "edge" | "movement" | "start";
  focus?: string | null;
};

async function getSafeProviderReadiness(): Promise<SafeProviderReadiness> {
  try {
    return await getProviderReadinessView({ leagues: ["NBA", "MLB"] });
  } catch {
    return null;
  }
}

function buildLeagueHref(league: "ALL" | "NBA" | "MLB", state: QueryState) {
  return buildBoardHref({ ...state, league, focus: null });
}

function buildBoardHref(state: QueryState) {
  const params = new URLSearchParams();

  if (state.league !== "ALL") {
    params.set("league", state.league);
  }

  if (state.market !== "all") {
    params.set("market", state.market);
  }

  if (state.sort !== "edge") {
    params.set("sort", state.sort);
  }

  if (state.focus) {
    params.set("focus", state.focus);
  }

  const query = params.toString();
  return query ? `/board?${query}` : "/board";
}

function formatTimeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatUpdatedLabel(value: string | null | undefined) {
  if (!value) {
    return "Update pending";
  }

  return `Updated ${new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function formatMovementValue(movement: number) {
  const absolute = Math.abs(movement);

  if (!absolute) {
    return "Flat";
  }

  return `${movement > 0 ? "↑" : "↓"} ${absolute >= 10 ? absolute.toFixed(0) : absolute.toFixed(1)}`;
}

function getLeadMover(game: GameCardView, marketScope: QueryState["market"]) {
  if (marketScope !== "all") {
    return { label: marketScope === "moneyline" ? "ML" : marketScope === "spread" ? "SPR" : "TOT", movement: game[marketScope].movement };
  }

  const candidates = [
    { label: "ML", movement: game.moneyline.movement },
    { label: "SPR", movement: game.spread.movement },
    { label: "TOT", movement: game.total.movement }
  ];

  return [...candidates].sort((left, right) => Math.abs(right.movement) - Math.abs(left.movement))[0];
}

function getLeagueVerifiedCount(games: GameCardView[], league: "NBA" | "MLB") {
  return games.filter((game) => game.leagueKey === league).length;
}

function getSelectedGameLabel(game: GameCardView | null) {
  if (!game) {
    return null;
  }

  return `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`;
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};

  const [board, readiness] = await Promise.all([
    getBoardCommandData(resolvedSearch),
    getSafeProviderReadiness()
  ]);

  const queryState: QueryState = {
    league: board.selectedLeague === "ALL" || board.selectedLeague === "NBA" || board.selectedLeague === "MLB" ? board.selectedLeague : "ALL",
    market: board.selectedMarket,
    sort: board.selectedSort,
    focus: board.focusedGame?.id ?? null
  };

  const activeBoardSource = readiness?.liveBoardProvider ?? board.boardData.source;
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
  const movers = board.movers.slice(0, 3);
  const boardStatusCopy = board.verifiedGames.length
    ? `${board.verifiedGames.length} verified pregame rows are live across moneyline, spread, and total.`
    : board.boardData.liveMessage ??
      board.boardData.sourceNote ??
      "No verified pregame rows are available right now.";

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

  return (
    <div className="grid gap-4">
      <section className="mobile-hero">
        <MobileTopBar
          title="Board"
          subtitle="SharkEdge Command"
          compact
          rightSlot={
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {activeBoardSource}
            </div>
          }
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr,1fr] xl:items-end">
          <div>
            <div className="text-[1.45rem] font-display font-semibold tracking-tight text-white">
              Trade the board. Do not hunt through the app.
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Verified NBA and MLB pregame pricing ranked by edge, movement, or start time. Select a game and SharkEdge turns the board into an execution surface instead of a feed dump.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              {[
                `${board.selectedLeague === "ALL" ? "All leagues" : board.selectedLeague} scope`,
                "Pregame only",
                `Focus ${board.selectedMarket === "all" ? "all markets" : board.selectedMarket}`,
                readiness?.safePathSummary ?? "Verified board path"
              ].map((item) => (
                <div key={item} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-[18px] border border-white/8 bg-[#0b1320] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Verified</div>
              <div className="mt-2 text-[1.35rem] font-semibold text-white">{board.verifiedGames.length}</div>
              <div className="mt-1 text-xs text-slate-400">ranked rows</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#0b1320] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Books</div>
              <div className="mt-2 text-[1.35rem] font-semibold text-white">{uniqueBooks.length}</div>
              <div className="mt-1 text-xs text-slate-400">books on board</div>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-[#0b1320] px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Fallback</div>
              <div className="mt-2 text-[1.35rem] font-semibold text-white">{board.scoreboardItems.length}</div>
              <div className="mt-1 text-xs text-slate-400">score-only rows</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mobile-surface !py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionTabs
            items={[
              {
                label: "ALL",
                href: buildLeagueHref("ALL", queryState),
                active: board.selectedLeague === "ALL",
                count: board.verifiedGames.length || null
              },
              {
                label: "NBA",
                href: buildLeagueHref("NBA", queryState),
                active: board.selectedLeague === "NBA",
                count: getLeagueVerifiedCount(board.verifiedGames, "NBA") || null
              },
              {
                label: "MLB",
                href: buildLeagueHref("MLB", queryState),
                active: board.selectedLeague === "MLB",
                count: getLeagueVerifiedCount(board.verifiedGames, "MLB") || null
              }
            ]}
          />

          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <div className="rounded-full border border-white/8 px-3 py-1.5">{formatUpdatedLabel(readiness?.generatedAt)}</div>
            <div className="rounded-full border border-white/8 px-3 py-1.5">{boardStatusCopy}</div>
          </div>
        </div>
      </section>

      <BoardCommandDeck
        marketItems={marketItems}
        sortItems={sortItems}
        selectedGameLabel={getSelectedGameLabel(board.focusedGame)}
        verifiedCount={board.verifiedGames.length}
        moverCount={board.movers.length}
      />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr),380px] xl:items-start">
        <div className="grid gap-3">
          <section className="grid gap-3 xl:grid-cols-[1.35fr,1fr]">
            <div className="mobile-surface !py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Feed health</div>
                  <div className="mt-1 text-sm text-slate-200">{readiness?.summary ?? "Provider status is temporarily unavailable."}</div>
                </div>
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-300">
                  {activeBoardSource}
                </div>
              </div>
            </div>

            {movers.length ? (
              <div className="mobile-surface !py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Top movers</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {movers.map((game) => {
                    const mover = getLeadMover(game, board.selectedMarket);
                    return (
                      <Link
                        key={game.id}
                        href={buildBoardHref({ ...queryState, focus: game.id })}
                        className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-200 transition hover:border-sky-400/25 hover:bg-sky-500/10"
                      >
                        <span className="font-semibold text-white">
                          {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                        </span>
                        <span className="ml-2 text-slate-400">{mover.label}</span>
                        <span className="ml-2 font-semibold text-sky-300">{formatMovementValue(mover.movement)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Verified board</div>
                <div className="mt-1 text-[1rem] font-semibold text-white">Live market rows</div>
              </div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                {board.verifiedGames.length ? `${board.verifiedGames.length} games` : "Awaiting verified rows"}
              </div>
            </div>

            {board.verifiedGames.slice(0, 12).map((game) => (
              <LiveEdgeBoardCard
                key={game.id}
                game={game}
                selected={game.id === board.focusedGame?.id}
                inspectHref={buildBoardHref({ ...queryState, focus: game.id })}
              />
            ))}

            {!board.verifiedGames.length ? (
              <div className="mobile-surface">
                <div className="text-[1rem] font-semibold text-white">Verified board is empty</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">{boardStatusCopy}</div>
              </div>
            ) : null}
          </section>
        </div>

        <BoardInspector
          game={board.focusedGame}
          markets={focusedMarkets}
          sourceLabel={activeBoardSource ?? "Board source"}
          updatedLabel={formatUpdatedLabel(readiness?.generatedAt)}
        />
      </section>

      {board.scoreboardItems.length ? (
        <section className="mobile-surface">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Scores only</div>
              <div className="mt-1 text-[1rem] font-semibold text-white">Fallback scoreboard</div>
            </div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">No verified odds</div>
          </div>

          <div className="mt-4 grid gap-3">
            {board.scoreboardItems.slice(0, 6).map(({ section, item }) => (
              <Link
                key={`${section.leagueKey}-${item.id}`}
                href={item.detailHref ?? "/games"}
                className="rounded-[18px] border border-white/[0.08] bg-[#0b1320] px-4 py-3 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {section.leagueKey} · {item.status}
                    </div>
                    <div className="mt-1 text-[0.98rem] font-semibold text-white">{item.label}</div>
                    <div className="mt-2 text-sm text-slate-400">
                      {item.scoreboard ?? item.stateDetail ?? "Score feed connected. Odds are temporarily unavailable."}
                    </div>
                  </div>
                  <div className="text-right text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    {formatTimeLabel(item.startTime)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
