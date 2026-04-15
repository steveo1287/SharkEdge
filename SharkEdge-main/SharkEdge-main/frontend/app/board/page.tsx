import Link from "next/link";

import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { GameCardView } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import { buildGameWorkflowHref, type WorkflowBoardLeague } from "@/lib/utils/workflow-hrefs";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getProviderReadinessView } from "@/services/current-odds/provider-readiness-service";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";
import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";

export const dynamic = "force-dynamic";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MarketKey = "moneyline" | "spread" | "total";
type QueryState = {
  league: string;
  market: "all" | MarketKey;
  sort: "edge" | "movement" | "start";
  focus?: string | null;
  pick?: MarketKey | null;
};

type BoardRow = {
  id: string;
  game: GameCardView;
  market: MarketKey;
  opportunity: OpportunityView;
  inspectHref: string;
  gameHref: string;
};

type SafeSimulationData = Awaited<ReturnType<typeof buildEventSimulationView>>;

async function getSafeProviderReadiness() {
  try {
    return await getProviderReadinessView({ leagues: ["NBA", "MLB"] });
  } catch {
    return null;
  }
}

async function getSafeSimulationData(routeId: string): Promise<SafeSimulationData> {
  try {
    return await buildEventSimulationView(routeId);
  } catch {
    return null;
  }
}

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function toWorkflowLeague(value: string): WorkflowBoardLeague {
  return value === "NBA" || value === "MLB" ? value : "ALL";
}

function buildBoardHref(state: QueryState) {
  const params = new URLSearchParams();
  if (state.league && state.league !== "ALL") params.set("league", state.league);
  if (state.market !== "all") params.set("market", state.market);
  if (state.sort !== "edge") params.set("sort", state.sort);
  if (state.focus) params.set("focus", state.focus);
  if (state.pick) params.set("pick", state.pick);
  const query = params.toString();
  return query ? `/board?${query}` : "/board";
}

function formatStart(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatSigned(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatMovement(value: number | null | undefined, market: MarketKey) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Flat";
  const amount = market === "moneyline" ? Math.abs(value).toFixed(0) : Math.abs(value).toFixed(1);
  if (Math.abs(value) < 0.01) return "Flat";
  return `${value > 0 ? "↑" : "↓"} ${amount}`;
}

function formatFreshness(value: number | null | undefined) {
  if (typeof value !== "number") return "Freshness pending";
  if (value <= 2) return `${value}m old`;
  if (value <= 10) return `${value}m old`;
  return `${value}m old`;
}

function getMarketLabel(market: MarketKey) {
  return market === "moneyline" ? "Moneyline" : market === "spread" ? "Spread" : "Total";
}

function getActionCopy(opportunity: OpportunityView) {
  if (opportunity.actionState === "BET_NOW") return "Bet now";
  if (opportunity.actionState === "WAIT") return "Wait for pullback";
  if (opportunity.actionState === "WATCH") return "Track only";
  return "Pass for now";
}

function hasBoardMarket(game: GameCardView, market: MarketKey) {
  const target = game[market];
  return target.bestOdds !== 0 || Boolean(target.lineLabel && target.lineLabel !== "No market");
}

function buildRows(games: GameCardView[], state: QueryState): BoardRow[] {
  const markets: MarketKey[] = state.market === "all" ? ["moneyline", "spread", "total"] : [state.market];
  const workflowLeague = toWorkflowLeague(state.league);

  const rows = games.flatMap((game) =>
    markets
      .filter((market) => hasBoardMarket(game, market))
      .map((market) => {
        const opportunity = buildGameMarketOpportunity(game, market);
        const inspectHref = buildBoardHref({
          ...state,
          focus: game.id,
          pick: market
        });
        const gameHref = buildGameWorkflowHref(
          game.detailHref ?? `/game/${game.id}`,
          {
            league: workflowLeague,
            market: state.market,
            sort: state.sort,
            focus: game.id
          },
          {
            market,
            book: game[market].bestBook || game.selectedBook?.name || null,
            label: getMarketLabel(market)
          }
        );

        return {
          id: `${game.id}:${market}`,
          game,
          market,
          opportunity,
          inspectHref,
          gameHref
        } satisfies BoardRow;
      })
  );

  return rows.sort((left, right) => {
    if (state.sort === "start") {
      const startDelta = new Date(left.game.startTime).getTime() - new Date(right.game.startTime).getTime();
      return startDelta !== 0 ? startDelta : right.opportunity.opportunityScore - left.opportunity.opportunityScore;
    }

    if (state.sort === "movement") {
      const movementDelta = Math.abs(right.opportunity.lineMovement ?? 0) - Math.abs(left.opportunity.lineMovement ?? 0);
      return movementDelta !== 0 ? movementDelta : right.opportunity.opportunityScore - left.opportunity.opportunityScore;
    }

    return right.opportunity.opportunityScore - left.opportunity.opportunityScore;
  });
}

function MetricCard({
  label,
  value,
  note,
  tone = "default"
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "cyan" | "green" | "violet";
}) {
  const toneClasses =
    tone === "cyan"
      ? "text-cyan-200"
      : tone === "green"
        ? "text-emerald-200"
        : tone === "violet"
          ? "text-violet-200"
          : "text-white";

  return (
    <div className="edge-panel metric-glow rounded-[1.3rem] p-4">
      <div className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className={`mt-3 text-[1.8rem] font-semibold tracking-tight ${toneClasses}`}>{value}</div>
      <div className="mt-1 text-sm text-slate-400">{note}</div>
    </div>
  );
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={active
        ? "rounded-full border border-cyan-400/30 bg-cyan-400/[0.10] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100"
        : "rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/[0.16] hover:text-white"
      }
    >
      {label}
    </Link>
  );
}

function TonePill({ label, tone = "default" }: { label: string; tone?: "default" | "green" | "amber" | "cyan" | "violet" }) {
  const classes =
    tone === "green"
      ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-100"
      : tone === "amber"
        ? "border-amber-400/25 bg-amber-400/[0.08] text-amber-100"
        : tone === "cyan"
          ? "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-100"
          : tone === "violet"
            ? "border-violet-400/25 bg-violet-400/[0.08] text-violet-100"
            : "border-white/[0.08] bg-white/[0.03] text-slate-200";

  return <div className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${classes}`}>{label}</div>;
}

function getConfidenceTone(tier: OpportunityView["confidenceTier"]) {
  if (tier === "A") return "green" as const;
  if (tier === "B") return "cyan" as const;
  if (tier === "C") return "amber" as const;
  return "default" as const;
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
    focus: readValue(resolvedSearch, "focus") ?? null,
    pick: (() => {
      const value = readValue(resolvedSearch, "pick");
      return value === "moneyline" || value === "spread" || value === "total" ? value : null;
    })()
  };

  const rows = buildRows(board.verifiedGames, queryState);
  const selectedRow =
    rows.find((row) => row.game.id === queryState.focus && row.market === queryState.pick) ??
    rows.find((row) => row.game.id === queryState.focus) ??
    rows[0] ??
    null;
  const simulation = selectedRow ? await getSafeSimulationData(selectedRow.game.id) : null;
  const providerLabel = readiness?.liveBoardProvider ?? board.boardData.source ?? "Board feed";
  const averageEdge =
    rows.length > 0
      ? rows.reduce((sum, row) => sum + (row.opportunity.expectedValuePct ?? 0), 0) / rows.length
      : 0;
  const betNowCount = rows.filter((row) => row.opportunity.actionState === "BET_NOW").length;
  const confidenceAorB = rows.filter((row) => row.opportunity.confidenceTier === "A" || row.opportunity.confidenceTier === "B").length;
  const fastestAging = rows
    .map((row) => row.opportunity.providerFreshnessMinutes)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b)[0] ?? null;

  const leagueItems = ["ALL", "NBA", "MLB", "NHL", "NFL", "NCAAB", "NCAAF", "UFC", "BOXING"].map((league) => ({
    label: league,
    href: buildBoardHref({ ...queryState, league, focus: null, pick: null }),
    active: board.selectedLeague === league
  }));

  const marketItems = [
    { label: "All", market: "all" as const },
    { label: "Moneyline", market: "moneyline" as const },
    { label: "Spread", market: "spread" as const },
    { label: "Total", market: "total" as const }
  ].map((item) => ({
    label: item.label,
    href: buildBoardHref({ ...queryState, market: item.market, focus: queryState.focus, pick: item.market === "all" ? null : queryState.pick }),
    active: board.selectedMarket === item.market
  }));

  const sortItems = [
    { label: "Edge", sort: "edge" as const },
    { label: "Movement", sort: "movement" as const },
    { label: "Start", sort: "start" as const }
  ].map((item) => ({
    label: item.label,
    href: buildBoardHref({ ...queryState, sort: item.sort }),
    active: board.selectedSort === item.sort
  }));

  const movers = rows
    .slice()
    .sort((a, b) => Math.abs(b.opportunity.lineMovement ?? 0) - Math.abs(a.opportunity.lineMovement ?? 0))
    .slice(0, 4);

  return (
    <div className="grid gap-6">
      <section className="edge-panel overflow-hidden rounded-[1.8rem] p-5 xl:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-300">SharkEdge flagship surface</div>
            <h1 className="mt-3 max-w-4xl font-display text-[2.4rem] font-semibold tracking-tight text-white xl:text-[4.25rem] xl:leading-[0.96]">
              Live opportunities ranked like a market, not dumped like a dashboard.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 xl:text-base">
              Fair price, simulation, trends, movement, and execution quality are merged into one decision surface. The board is the product.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {marketItems.map((item) => (
                <FilterChip key={item.label} href={item.href} label={item.label} active={item.active} />
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Live rows" value={String(rows.length)} note={`${board.verifiedGames.length} games with usable pricing`} tone="cyan" />
            <MetricCard label="Bet now" value={String(betNowCount)} note="Actionable entries after quality and trap checks" tone="green" />
            <MetricCard label="Avg edge" value={formatPercent(averageEdge)} note="Mean expected value across visible rows" tone="violet" />
            <MetricCard label="Freshest feed" value={fastestAging === null ? "--" : `${fastestAging}m`} note={providerLabel} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {leagueItems.map((item) => (
            <FilterChip key={item.label} href={item.href} label={item.label} active={item.active} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:items-start">
        <aside className="grid gap-4">
          <div className="edge-panel rounded-[1.45rem] p-4">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Board control</div>
            <div className="mt-4 text-sm font-medium text-white">Sort priority</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sortItems.map((item) => (
                <FilterChip key={item.label} href={item.href} label={item.label} active={item.active} />
              ))}
            </div>
            <div className="edge-divider my-4" />
            <div className="grid gap-3 text-sm">
              <div className="edge-panel-soft rounded-[1rem] p-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">Source</div>
                <div className="mt-2 font-medium text-white">{providerLabel}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{board.boardData.sourceNote ?? readiness?.summary ?? "Live board source and verified pricing summary."}</div>
              </div>
              <div className="edge-panel-soft rounded-[1rem] p-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-500">High-confidence share</div>
                <div className="mt-2 font-medium text-white">{rows.length ? `${Math.round((confidenceAorB / rows.length) * 100)}%` : "0%"}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">Rows currently graded A or B confidence after trap handling.</div>
              </div>
            </div>
          </div>

          <div className="edge-panel rounded-[1.45rem] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Fast tape</div>
                <div className="mt-1 text-lg font-semibold text-white">Largest movement</div>
              </div>
              <TonePill label={`${movers.length} tracked`} tone="amber" />
            </div>
            <div className="mt-4 grid gap-3">
              {movers.map((row) => (
                <Link key={row.id} href={row.inspectHref} className="edge-panel-soft rounded-[1rem] p-3 transition hover:border-white/[0.14]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">{row.game.awayTeam.abbreviation} @ {row.game.homeTeam.abbreviation}</div>
                    <div className="text-xs text-slate-400">{getMarketLabel(row.market)}</div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <div className="text-slate-400">{row.game[row.market].lineLabel}</div>
                    <div className="font-medium text-amber-200">{formatMovement(row.opportunity.lineMovement, row.market)}</div>
                  </div>
                </Link>
              ))}
              {!movers.length ? <div className="text-sm text-slate-500">No movement rows available.</div> : null}
            </div>
          </div>
        </aside>

        <section className="grid gap-4">
          <div className="edge-panel rounded-[1.45rem] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Ranked opportunity feed</div>
                <div className="mt-1 text-xl font-semibold text-white">Board</div>
              </div>
              <TonePill label={`${rows.length} rows`} tone="cyan" />
            </div>
          </div>

          <div className="grid gap-3">
            {rows.map((row, index) => {
              const selected = selectedRow?.id === row.id;
              const marketView = row.game[row.market];
              const fairPrice = row.opportunity.fairOddsAmerican ?? row.opportunity.fairPriceAmerican;
              const supportChips = [
                row.opportunity.trendIntelligence?.summary ? `Trend ${row.opportunity.trendIntelligence.summary}` : null,
                row.opportunity.marketDisagreementScore !== null ? `Disagreement ${(row.opportunity.marketDisagreementScore * 100).toFixed(0)}` : null,
                row.opportunity.marketPath?.summary ?? null,
                row.opportunity.executionCapacity?.label?.replace(/_/g, " ") ?? null
              ].filter((value): value is string => Boolean(value)).slice(0, 3);

              return (
                <Link
                  key={row.id}
                  href={row.inspectHref}
                  className={selected
                    ? "edge-panel rounded-[1.45rem] border-cyan-400/30 p-4 ring-1 ring-cyan-400/20"
                    : "edge-panel rounded-[1.45rem] p-4 transition hover:border-white/[0.14]"
                  }
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TonePill label={`#${index + 1}`} tone="default" />
                        <TonePill label={row.game.leagueKey} tone="violet" />
                        <TonePill label={`${row.opportunity.confidenceTier} confidence`} tone={getConfidenceTone(row.opportunity.confidenceTier)} />
                        <div className="text-xs text-slate-500">{formatDate(row.game.startTime)} · {formatStart(row.game.startTime)}</div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
                        <div>
                          <div className="text-[1.2rem] font-semibold text-white xl:text-[1.35rem]">
                            {row.game.awayTeam.name} <span className="text-slate-500">@</span> {row.game.homeTeam.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-400">{getMarketLabel(row.market)} · {row.opportunity.selectionLabel}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Current</div>
                          <div className="mt-2 text-lg font-semibold text-white">{marketView.lineLabel}</div>
                          <div className="mt-1 text-xs text-slate-500">{marketView.bestBook || row.game.selectedBook?.name || "Best book pending"}</div>
                        </div>
                        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Fair price</div>
                          <div className="mt-2 text-lg font-semibold text-cyan-100">{typeof fairPrice === "number" ? formatAmericanOdds(fairPrice) : "--"}</div>
                          <div className="mt-1 text-xs text-slate-500">Model and market calibration</div>
                        </div>
                        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Edge</div>
                          <div className="mt-2 text-lg font-semibold text-emerald-200">{formatPercent(row.opportunity.expectedValuePct)}</div>
                          <div className="mt-1 text-xs text-slate-500">Score {Math.round(row.opportunity.opportunityScore)}</div>
                        </div>
                        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Movement</div>
                          <div className="mt-2 text-lg font-semibold text-white">{formatMovement(row.opportunity.lineMovement, row.market)}</div>
                          <div className="mt-1 text-xs text-slate-500">{formatFreshness(row.opportunity.providerFreshnessMinutes)}</div>
                        </div>
                        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Action</div>
                          <div className="mt-2 text-lg font-semibold text-white">{getActionCopy(row.opportunity)}</div>
                          <div className="mt-1 text-xs text-slate-500">{row.opportunity.timingState.replace(/_/g, " ")}</div>
                        </div>
                      </div>

                      {supportChips.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {supportChips.map((chip) => (
                            <TonePill key={`${row.id}:${chip}`} label={chip} />
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2 xl:w-[160px]">
                      <div className="rounded-[1rem] border border-white/[0.06] bg-black/20 px-3 py-3 text-center">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Confidence</div>
                        <div className="mt-2 text-[1.9rem] font-semibold text-white">{row.opportunity.confidenceTier}</div>
                        <div className="mt-1 text-xs text-slate-500">Trap flags {row.opportunity.trapFlags.length}</div>
                      </div>
                      <div className="rounded-[1rem] border border-white/[0.06] bg-black/20 px-3 py-3 text-center">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Offered odds</div>
                        <div className="mt-2 text-lg font-semibold text-white">
                          {typeof row.opportunity.displayOddsAmerican === "number" ? formatAmericanOdds(row.opportunity.displayOddsAmerican) : "--"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{row.opportunity.sportsbookName ?? "Market"}</div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}

            {!rows.length ? (
              <div className="edge-panel rounded-[1.45rem] p-6 text-sm leading-7 text-slate-400">
                No verified opportunities are available for this scope. The new board stays empty rather than filling the screen with junk.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="grid gap-4">
          {selectedRow ? (
            <div className="edge-panel rounded-[1.45rem] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Inspector</div>
                  <div className="mt-1 text-xl font-semibold text-white">{selectedRow.game.awayTeam.abbreviation} @ {selectedRow.game.homeTeam.abbreviation}</div>
                  <div className="mt-1 text-sm text-slate-400">{getMarketLabel(selectedRow.market)} · {selectedRow.opportunity.selectionLabel}</div>
                </div>
                <TonePill label={selectedRow.opportunity.actionState.replace(/_/g, " ")} tone="cyan" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Reason summary</div>
                  <div className="mt-2 text-sm leading-6 text-white">{selectedRow.opportunity.reasonSummary}</div>
                </div>
                <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Trigger summary</div>
                  <div className="mt-2 text-sm leading-6 text-white">{selectedRow.opportunity.triggerSummary}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Why it shows</div>
                  <div className="mt-2 grid gap-2 text-sm text-slate-300">
                    {selectedRow.opportunity.whyItShows.slice(0, 4).map((item) => (
                      <div key={item} className="rounded-[0.9rem] bg-white/[0.03] px-3 py-2">{item}</div>
                    ))}
                    {!selectedRow.opportunity.whyItShows.length ? <div className="text-slate-500">No support notes available.</div> : null}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">What could kill it</div>
                  <div className="mt-2 grid gap-2 text-sm text-slate-300">
                    {selectedRow.opportunity.whatCouldKillIt.slice(0, 4).map((item) => (
                      <div key={item} className="rounded-[0.9rem] bg-white/[0.03] px-3 py-2">{item}</div>
                    ))}
                    {!selectedRow.opportunity.whatCouldKillIt.length ? <div className="text-slate-500">No explicit kill notes available.</div> : null}
                  </div>
                </div>
              </div>

              {simulation?.projectionSummary ? (
                <div className="mt-4 rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.05] p-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/80">Simulation snapshot</div>
                  <div className="mt-2 text-base font-semibold text-white">{simulation.projectionSummary.headline}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">{simulation.projectionSummary.leanSummary}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-[0.9rem] bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Home win</div>
                      <div className="mt-1 font-semibold text-white">{simulation.projectionSummary.winProbHome == null ? "--" : `${(simulation.projectionSummary.winProbHome * 100).toFixed(1)}%`}</div>
                    </div>
                    <div className="rounded-[0.9rem] bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Spread</div>
                      <div className="mt-1 font-semibold text-white">{formatSigned(simulation.projectionSummary.projectedSpreadHome)}</div>
                    </div>
                    <div className="rounded-[0.9rem] bg-black/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Total</div>
                      <div className="mt-1 font-semibold text-white">{formatSigned(simulation.projectionSummary.projectedTotal)}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={selectedRow.gameHref} className="rounded-full border border-cyan-400/30 bg-cyan-400/[0.10] px-4 py-2 text-sm font-medium text-cyan-100">
                  Open event detail
                </Link>
                <Link href="/bets" className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white">
                  Track in portfolio
                </Link>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
