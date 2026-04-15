import Link from "next/link";

import { BoardCommandDeck } from "@/components/board/board-command-deck";
import { BoardInspector } from "@/components/board/board-inspector";
import { BoardTable } from "@/components/board/board-table";
import { TeamBadge } from "@/components/identity/team-badge";
import { LeaguePulseGrid } from "@/components/intelligence/league-pulse-grid";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import { MiniHistoryChart } from "@/components/charts/mini-history-chart";
import type { GameCardView, LeagueSnapshotView } from "@/lib/types/domain";
import type { ProviderReadinessView } from "@/services/current-odds/provider-readiness-service";
import { getTeamLogoUrl } from "@/lib/utils/team-branding";

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

type BoardCommandCenterProps = {
  readiness: ProviderReadinessView | null;
  boardStatusCopy: string;
  queryState: {
    league: "ALL" | "NBA" | "MLB";
  };
  leagueTabs: Array<{ label: string; href: string; active: boolean; count?: number | null }>;
  marketItems: Array<{ label: string; href: string; active: boolean }>;
  sortItems: Array<{ label: string; href: string; active: boolean }>;
  sortHrefMap: Record<"edge" | "movement" | "start", string>;
  selectedMarket: "all" | "moneyline" | "spread" | "total";
  selectedSort: "edge" | "movement" | "start";
  selectedGameLabel: string | null;
  verifiedCount: number;
  moverCount: number;
  uniqueBooks: string[];
  movers: GameCardView[];
  movementSeries: number[];
  tableRows: Array<{
    game: GameCardView;
    selected: boolean;
    inspectHref: string;
    gameHref: string;
    workflowLabel: string;
  }>;
  focusedGame: GameCardView | null;
  focusedMarkets: Array<{
    key: "moneyline" | "spread" | "total";
    label: string;
    lineLabel: string;
    movementLabel: string;
    opportunity: any;
  }>;
  focusedGameHref: string | null;
  focusedWorkflowLabel: string | null;
  snapshots: LeagueSnapshotView[];
};

export function BoardCommandCenter({
  readiness,
  boardStatusCopy,
  queryState,
  leagueTabs,
  marketItems,
  sortItems,
  sortHrefMap,
  selectedMarket,
  selectedSort,
  selectedGameLabel,
  verifiedCount,
  moverCount,
  uniqueBooks,
  movers,
  movementSeries,
  tableRows,
  focusedGame,
  focusedMarkets,
  focusedGameHref,
  focusedWorkflowLabel,
  snapshots
}: BoardCommandCenterProps) {
  const activeBoardSource = readiness?.liveBoardProvider ?? "live";

  return (
    <div className="grid gap-5">
      <section className="hero-shell overflow-hidden px-5 py-5 lg:px-6 lg:py-6">
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

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr,.9fr] xl:items-end">
          <div>
            <div className="section-kicker">Live market command</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white lg:text-4xl">
              One board. One truth path. Scores, odds, movement, and league context in one surface.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              This pass turns SharkEdge into a command center instead of a feed dump. Verified market rows stay separate from score-only fallback states, and the same page now shows standings, recent results, movers, and game entry points.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                {queryState.league === "ALL" ? "All leagues" : queryState.league}
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                {verifiedCount} verified rows
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                {uniqueBooks.length} books on desk
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                {formatUpdatedLabel(readiness?.generatedAt)}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="glass-tile">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Board status</div>
              <div className="mt-2 text-lg font-semibold text-white">Verified market desk</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">{boardStatusCopy}</div>
            </div>
            <div className="glass-tile">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Movement graph</div>
              <div className="mt-2 text-lg font-semibold text-white">Slate motion</div>
              <div className="mt-2 h-16 w-full">
                <MiniHistoryChart values={movementSeries} height={68} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel-strong px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionTabs items={leagueTabs} />
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <div className="rounded-full border border-white/8 px-3 py-1.5">{boardStatusCopy}</div>
            {readiness?.safePathSummary ? (
              <div className="rounded-full border border-sky-400/20 bg-sky-500/[0.08] px-3 py-1.5 text-sky-200">
                {readiness.safePathSummary}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <BoardCommandDeck
        marketItems={marketItems}
        sortItems={sortItems}
        selectedGameLabel={selectedGameLabel}
        verifiedCount={verifiedCount}
        moverCount={moverCount}
      />

      <section className="grid gap-4 xl:grid-cols-[1.15fr,.85fr]">
        <div className="surface-panel-strong px-5 py-5 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Market movers</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-white">What is actually moving</div>
            </div>
            <div className="rounded-full border border-white/8 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-400">
              {movers.length} movers
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {movers.map((game) => {
              const href = tableRows.find((row) => row.game.id === game.id)?.gameHref ?? game.detailHref ?? `/game/${game.id}`;
              const leadMovement = Math.max(
                Math.abs(game.moneyline.movement),
                Math.abs(game.spread.movement),
                Math.abs(game.total.movement)
              );

              return (
                <Link
                  key={game.id}
                  href={href}
                  className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamBadge name={game.awayTeam.name} abbreviation={game.awayTeam.abbreviation} logoUrl={getTeamLogoUrl(game.awayTeam, game.leagueKey)} />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                        </div>
                        <div className="text-xs text-slate-500">{game.leagueKey} · {formatTimeLabel(game.startTime)}</div>
                      </div>
                    </div>
                    <div className="rounded-full border border-white/8 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-300">
                      {focusedGame?.id === game.id ? "Focused" : "Open"}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Moneyline</div>
                      <div className="mt-1 text-sm font-semibold text-white">{game.moneyline.lineLabel}</div>
                      <div className="mt-1 text-xs text-sky-300">{formatMovementValue(game.moneyline.movement)}</div>
                    </div>
                    <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Spread</div>
                      <div className="mt-1 text-sm font-semibold text-white">{game.spread.lineLabel}</div>
                      <div className="mt-1 text-xs text-sky-300">{formatMovementValue(game.spread.movement)}</div>
                    </div>
                    <div className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Total</div>
                      <div className="mt-1 text-sm font-semibold text-white">{game.total.lineLabel}</div>
                      <div className="mt-1 text-xs text-sky-300">{formatMovementValue(game.total.movement)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    <div className="rounded-full border border-white/8 px-3 py-1.5">Edge {game.edgeScore.score}</div>
                    <div className="rounded-full border border-white/8 px-3 py-1.5">{leadMovement.toFixed(1)} lead move</div>
                    <div className="rounded-full border border-white/8 px-3 py-1.5">{game.bestBookCount} books</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <BoardInspector
          game={focusedGame}
          markets={focusedMarkets}
          sourceLabel={activeBoardSource}
          updatedLabel={formatUpdatedLabel(readiness?.generatedAt)}
          gameHref={focusedGameHref}
          workflowLabel={focusedWorkflowLabel}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px] xl:items-start">
        <BoardTable rows={tableRows} selectedMarket={selectedMarket} selectedSort={selectedSort} sortHrefs={sortHrefMap} />

        <aside className="surface-panel-strong px-5 py-5 xl:sticky xl:top-[7rem]">
          <div className="section-kicker">Navigation</div>
          <div className="mt-2 text-xl font-semibold tracking-tight text-white">Fast paths</div>
          <div className="mt-4 grid gap-3">
            <Link href="/props" className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]">
              <div className="text-sm font-semibold text-white">Props desk</div>
              <div className="mt-1 text-xs text-slate-500">Move from sides and totals into player markets.</div>
            </Link>
            <Link href="/trends" className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]">
              <div className="text-sm font-semibold text-white">Trends with odds</div>
              <div className="mt-1 text-xs text-slate-500">Open trend cards that now belong next to price and slate context.</div>
            </Link>
            <Link href="/performance" className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]">
              <div className="text-sm font-semibold text-white">Performance lab</div>
              <div className="mt-1 text-xs text-slate-500">Track CLV, settle bets, and grade what actually worked.</div>
            </Link>
          </div>
        </aside>
      </section>

      <LeaguePulseGrid snapshots={snapshots} />
    </div>
  );
}
