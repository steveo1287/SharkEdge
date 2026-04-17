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
      <section className="panel overflow-hidden px-5 py-5 lg:px-6 lg:py-6">
        <MobileTopBar
          title="Board"
          subtitle="SharkEdge Command"
          compact
          rightSlot={
            <div className="inline-flex items-center gap-1.5 rounded-sm border border-mint/25 bg-mint/[0.08] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-mint">
              <span className="live-dot" aria-hidden />
              {activeBoardSource}
            </div>
          }
        />

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr,.9fr] xl:items-end">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Live market command</div>
            <h1 className="mt-3 font-display text-[28px] font-semibold tracking-[-0.02em] text-text-primary lg:text-[34px]">
              One board. One truth path. Scores, odds, movement, and league context in one surface.
            </h1>
            <p className="mt-3 max-w-3xl text-[13.5px] leading-[1.65] text-bone/65">
              This pass turns SharkEdge into a command center instead of a feed dump. Verified market rows stay separate from score-only fallback states, and the same page now shows standings, recent results, movers, and game entry points.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/70">
              <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">
                {queryState.league === "ALL" ? "All leagues" : queryState.league}
              </div>
              <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">
                <span className="font-mono tabular-nums">{verifiedCount}</span> verified rows
              </div>
              <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">
                <span className="font-mono tabular-nums">{uniqueBooks.length}</span> books on desk
              </div>
              <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">
                {formatUpdatedLabel(readiness?.generatedAt)}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Board status</div>
              <div className="mt-2 font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">Verified market desk</div>
              <div className="mt-2 text-[12.5px] leading-[1.55] text-bone/60">{boardStatusCopy}</div>
            </div>
            <div className="rounded-md border border-bone/[0.08] bg-surface p-4">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Movement graph</div>
              <div className="mt-2 font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">Slate motion</div>
              <div className="mt-2 h-16 w-full">
                <MiniHistoryChart values={movementSeries} height={68} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <SectionTabs items={leagueTabs} />
          <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/60">
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1">{boardStatusCopy}</div>
            {readiness?.safePathSummary ? (
              <div className="rounded-sm border border-aqua/25 bg-aqua/[0.06] px-2.5 py-1 text-aqua">
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
        <div className="panel px-5 py-5 lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Market movers</div>
              <div className="mt-2 font-display text-[22px] font-semibold tracking-[-0.01em] text-text-primary">What is actually moving</div>
            </div>
            <div className="rounded-sm border border-bone/[0.10] bg-surface px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/70">
              <span className="font-mono tabular-nums">{movers.length}</span> movers
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
                  className="focusable rounded-md border border-bone/[0.08] bg-surface p-4 transition-colors hover:border-aqua/25 hover:bg-panel"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <TeamBadge name={game.awayTeam.name} abbreviation={game.awayTeam.abbreviation} logoUrl={getTeamLogoUrl(game.awayTeam, game.leagueKey)} />
                      <div className="min-w-0">
                        <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
                          {game.awayTeam.abbreviation} <span className="text-bone/35">@</span> {game.homeTeam.abbreviation}
                        </div>
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
                          {game.leagueKey} <span className="text-bone/25">·</span> <span className="font-mono tabular-nums">{formatTimeLabel(game.startTime)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-sm border border-bone/[0.10] bg-panel px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/80">
                      {focusedGame?.id === game.id ? "Focused" : "Open"}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Moneyline</div>
                      <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-text-primary">{game.moneyline.lineLabel}</div>
                      <div className="mt-1 font-mono text-[11.5px] tabular-nums text-aqua">{formatMovementValue(game.moneyline.movement)}</div>
                    </div>
                    <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Spread</div>
                      <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-text-primary">{game.spread.lineLabel}</div>
                      <div className="mt-1 font-mono text-[11.5px] tabular-nums text-aqua">{formatMovementValue(game.spread.movement)}</div>
                    </div>
                    <div className="rounded-md border border-bone/[0.08] bg-panel px-3 py-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Total</div>
                      <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-text-primary">{game.total.lineLabel}</div>
                      <div className="mt-1 font-mono text-[11.5px] tabular-nums text-aqua">{formatMovementValue(game.total.movement)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/65">
                    <div className="rounded-sm border border-bone/[0.10] px-2 py-1">Edge <span className="font-mono tabular-nums text-text-primary">{game.edgeScore.score}</span></div>
                    <div className="rounded-sm border border-bone/[0.10] px-2 py-1"><span className="font-mono tabular-nums text-text-primary">{leadMovement.toFixed(1)}</span> lead</div>
                    <div className="rounded-sm border border-bone/[0.10] px-2 py-1"><span className="font-mono tabular-nums text-text-primary">{game.bestBookCount}</span> books</div>
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

        <aside className="panel px-5 py-5 xl:sticky xl:top-[7rem]">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Navigation</div>
          <div className="mt-2 font-display text-[19px] font-semibold tracking-[-0.01em] text-text-primary">Fast paths</div>
          <div className="mt-4 grid gap-2">
            <Link href="/props" className="focusable rounded-md border border-bone/[0.08] bg-surface px-4 py-3 transition-colors hover:border-aqua/25 hover:bg-panel">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.10em] text-text-primary">Props desk</div>
              <div className="mt-1 text-[12.5px] leading-[1.5] text-bone/55">Move from sides and totals into player markets.</div>
            </Link>
            <Link href="/trends" className="focusable rounded-md border border-bone/[0.08] bg-surface px-4 py-3 transition-colors hover:border-aqua/25 hover:bg-panel">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.10em] text-text-primary">Trends with odds</div>
              <div className="mt-1 text-[12.5px] leading-[1.5] text-bone/55">Open trend cards that now belong next to price and slate context.</div>
            </Link>
            <Link href="/performance" className="focusable rounded-md border border-bone/[0.08] bg-surface px-4 py-3 transition-colors hover:border-aqua/25 hover:bg-panel">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.10em] text-text-primary">Performance lab</div>
              <div className="mt-1 text-[12.5px] leading-[1.5] text-bone/55">Track CLV, settle bets, and grade what actually worked.</div>
            </Link>
          </div>
        </aside>
      </section>

      <LeaguePulseGrid snapshots={snapshots} />
    </div>
  );
}
