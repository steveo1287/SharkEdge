import Link from "next/link";
import { notFound } from "next/navigation";

import { LineMovementPanel } from "@/components/event/line-movement-panel";
import { SimulationIntelligencePanel } from "@/components/event/simulation-intelligence-panel";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import { buildBoardReturnHref, type WorkflowBoardLeague, type WorkflowBoardSort } from "@/lib/utils/workflow-hrefs";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MarketFocus = "all" | "spread" | "moneyline" | "total";
type SafeSimulationData = Awaited<ReturnType<typeof buildEventSimulationView>>;

async function getSafeSimulationData(routeId: string): Promise<SafeSimulationData> {
  try {
    return await buildEventSimulationView(routeId);
  } catch {
    return null;
  }
}

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function readMarketFocus(value: string | undefined): MarketFocus {
  if (value === "spread" || value === "moneyline" || value === "total") return value;
  return "all";
}

function readBoardLeague(value: string | undefined, fallback: string): WorkflowBoardLeague {
  if (value === "NBA" || value === "MLB" || value === "ALL") return value;
  return fallback === "NBA" || fallback === "MLB" ? fallback : "ALL";
}

function readBoardSort(value: string | undefined): WorkflowBoardSort {
  if (value === "movement" || value === "start") return value;
  return "edge";
}

function formatStart(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatLine(value: number | null | undefined) {
  if (typeof value !== "number") return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function focusMatches(focus: MarketFocus, marketType: string) {
  if (focus === "all") return ["moneyline", "spread", "total"].includes(marketType);
  return marketType === focus;
}

function sectionChip(label: string, href?: string) {
  const className = "rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/[0.14] hover:text-white";
  return href ? <Link href={href} className={className}>{label}</Link> : <div className={className}>{label}</div>;
}

export default async function GameDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const marketFocus = readMarketFocus(readParam(resolvedSearch, "market"));
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  const boardState = {
    league: readBoardLeague(readParam(resolvedSearch, "boardLeague"), detail.league.key),
    market: readMarketFocus(readParam(resolvedSearch, "boardMarket")),
    sort: readBoardSort(readParam(resolvedSearch, "boardSort")),
    focus: readParam(resolvedSearch, "boardFocus") ?? detail.routeId
  } satisfies { league: WorkflowBoardLeague; market: MarketFocus; sort: WorkflowBoardSort; focus?: string | null };

  const returnBoardHref = buildBoardReturnHref(boardState);
  const simulation = await getSafeSimulationData(detail.routeId);
  const primarySignals = detail.betSignals.filter((signal) => focusMatches(marketFocus, signal.marketType)).slice(0, 6);
  const participants = detail.participants.slice(0, 2);

  return (
    <div className="grid gap-6">
      <section className="edge-panel overflow-hidden rounded-[1.8rem] p-5 xl:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={returnBoardHref} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white">
            Back to board
          </Link>
          {sectionChip(detail.league.key)}
          {sectionChip(detail.currentOddsProvider ?? detail.providerHealth.label)}
          {sectionChip(detail.status)}
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[1.08fr_0.92fr] xl:items-end">
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-300">Event hub</div>
            <h1 className="mt-3 max-w-4xl font-display text-[2.15rem] font-semibold tracking-tight text-white xl:text-[4rem] xl:leading-[0.98]">
              {detail.eventLabel}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 xl:text-base">
              Scoreboard, market thesis, simulation, trend evidence, and execution notes stay on one screen so conviction does not get split across weak modules.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {sectionChip(formatStart(detail.startTime))}
              {detail.venue ? sectionChip(detail.venue) : null}
              {detail.scoreboard ? sectionChip(detail.scoreboard) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="edge-panel-soft rounded-[1.2rem] p-4">
              <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">Support</div>
              <div className="mt-3 text-[1.4rem] font-semibold text-white">{detail.supportStatus}</div>
              <div className="mt-1 text-sm text-slate-400">{detail.supportNote}</div>
            </div>
            <div className="edge-panel-soft rounded-[1.2rem] p-4">
              <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">Signals</div>
              <div className="mt-3 text-[1.4rem] font-semibold text-cyan-100">{primarySignals.length}</div>
              <div className="mt-1 text-sm text-slate-400">Current market theses</div>
            </div>
            <div className="edge-panel-soft rounded-[1.2rem] p-4">
              <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">Trends</div>
              <div className="mt-3 text-[1.4rem] font-semibold text-white">{detail.trendCards.length}</div>
              <div className="mt-1 text-sm text-slate-400">Evidence modules attached</div>
            </div>
          </div>
        </div>

        {participants.length === 2 ? (
          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {participants.map((participant) => (
              <div key={participant.id} className="edge-panel-soft rounded-[1.2rem] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">{participant.role}</div>
                    <div className="mt-1 text-[1.15rem] font-semibold text-white">{participant.name}</div>
                  </div>
                  <div className="text-[1.5rem] font-semibold text-white">{participant.score ?? "--"}</div>
                </div>
                <div className="mt-2 text-sm text-slate-400">{participant.record ?? participant.subtitle ?? "Context building"}</div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.18fr)_360px] xl:items-start">
        <main className="grid gap-6">
          <section id="overview" className="edge-panel rounded-[1.5rem] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Market thesis</div>
                <div className="mt-1 text-2xl font-semibold text-white">Primary opportunities</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {["all", "moneyline", "spread", "total"].map((scope) => {
                  const hrefParams = new URLSearchParams();
                  if (scope !== "all") hrefParams.set("market", scope);
                  hrefParams.set("boardLeague", boardState.league);
                  hrefParams.set("boardMarket", boardState.market);
                  hrefParams.set("boardSort", boardState.sort);
                  if (boardState.focus) hrefParams.set("boardFocus", boardState.focus);
                  return sectionChip(scope === "all" ? "All" : scope, `/game/${detail.routeId}?${hrefParams.toString()}`);
                })}
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {primarySignals.map((signal) => (
                <div key={signal.id} className="edge-panel-soft rounded-[1.15rem] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{signal.marketLabel}</div>
                      <div className="mt-1 text-sm text-slate-400">{signal.selection}</div>
                    </div>
                    <div className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.08] px-3 py-1.5 text-[11px] font-medium text-cyan-100">
                      {signal.confidenceTier}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Odds</div>
                      <div className="mt-1 font-semibold text-white">{signal.oddsAmerican ? formatAmericanOdds(signal.oddsAmerican) : "--"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">EV</div>
                      <div className="mt-1 font-semibold text-emerald-200">{formatPercent(signal.expectedValuePct)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Line</div>
                      <div className="mt-1 font-semibold text-white">{typeof signal.line === "number" ? formatLine(signal.line) : "--"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Book</div>
                      <div className="mt-1 font-semibold text-white">{signal.sportsbookName ?? "Market"}</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm leading-6 text-slate-300">{signal.supportNote}</div>
                </div>
              ))}
              {!primarySignals.length ? (
                <div className="text-sm text-slate-500">No primary market theses are available for this focus.</div>
              ) : null}
            </div>
          </section>

          {simulation ? <SimulationIntelligencePanel simulation={simulation} /> : null}

          <section id="trends" className="edge-panel rounded-[1.5rem] p-5">
            <div>
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Evidence</div>
              <div className="mt-1 text-2xl font-semibold text-white">Trend support</div>
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {detail.trendCards.map((card) => (
                <div key={card.id} className="edge-panel-soft rounded-[1.15rem] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{card.title}</div>
                      <div className="mt-1 text-sm text-slate-400">{card.note}</div>
                    </div>
                    <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-300">
                      {card.tone}
                    </div>
                  </div>
                  <div className="mt-4 text-lg font-semibold text-cyan-100">{card.value}</div>
                  {card.href ? (
                    <Link href={card.href} className="mt-4 inline-flex rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-white">
                      Open context
                    </Link>
                  ) : null}
                </div>
              ))}
              {!detail.trendCards.length ? <div className="text-sm text-slate-500">No trend evidence is attached to this event.</div> : null}
            </div>
          </section>

          <LineMovementPanel detail={detail} />

          {detail.props.length ? (
            <section id="props" className="edge-panel rounded-[1.5rem] p-5">
              <div>
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Extensions</div>
                <div className="mt-1 text-2xl font-semibold text-white">Attached props</div>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {detail.props.slice(0, 6).map((prop) => (
                  <div key={prop.id} className="edge-panel-soft rounded-[1.15rem] p-4">
                    <div className="text-sm font-semibold text-white">{prop.player.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{prop.marketType.replace(/_/g, " ")} · {prop.side} {prop.line}</div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Odds</div>
                        <div className="mt-1 font-semibold text-white">{prop.oddsAmerican ? formatAmericanOdds(prop.oddsAmerican) : "--"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">EV</div>
                        <div className="mt-1 font-semibold text-emerald-200">{formatPercent(prop.expectedValuePct)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Book</div>
                        <div className="mt-1 font-semibold text-white">{prop.bestAvailableSportsbookName ?? prop.sportsbook.name}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="grid gap-4">
          <div className="edge-panel rounded-[1.45rem] p-4">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Execution</div>
            <div className="mt-3 grid gap-3">
              <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Best prices</div>
                <div className="mt-2 grid gap-2 text-sm text-slate-300">
                  <div>Moneyline · {detail.oddsSummary?.bestMoneyline ?? "--"}</div>
                  <div>Spread · {detail.oddsSummary?.bestSpread ?? "--"}</div>
                  <div>Total · {detail.oddsSummary?.bestTotal ?? "--"}</div>
                </div>
              </div>
              <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Provider health</div>
                <div className="mt-1 text-lg font-semibold text-white">{detail.providerHealth.label}</div>
                <div className="mt-2 text-sm leading-6 text-slate-300">{detail.providerHealth.summary}</div>
              </div>
              <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Linked notes</div>
                <div className="mt-2 grid gap-2 text-sm text-slate-300">
                  {detail.notes.slice(0, 4).map((note) => (
                    <div key={note} className="rounded-[0.9rem] bg-white/[0.03] px-3 py-2">{note}</div>
                  ))}
                  {!detail.notes.length ? <div className="text-slate-500">No additional notes for this event.</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="edge-panel rounded-[1.45rem] p-4">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Jump points</div>
            <div className="mt-4 flex flex-col gap-2">
              <a href="#overview" className="rounded-[1rem] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-medium text-white">Overview</a>
              {simulation ? <a href="#simulation" className="rounded-[1rem] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-medium text-white">Simulation</a> : null}
              <a href="#trends" className="rounded-[1rem] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-medium text-white">Trends</a>
              <a href="#props" className="rounded-[1rem] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-medium text-white">Props</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
