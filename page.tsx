import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { SimulationIntelligencePanel } from "@/components/event/simulation-intelligence-panel";
import { GameDetailCommandHero } from "@/components/game/game-detail-command-hero";
import { GameExecutionSidebar } from "@/components/game/game-execution-sidebar";
import { FocusedMarketTrendPanel } from "@/components/game/focused-market-trend-panel";
import { MatchupDecisionModule } from "@/components/game/matchup-decision-module";
import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { HorizontalEventRail } from "@/components/mobile/horizontal-event-rail";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { appendBoardStateToHref, buildBoardReturnHref, buildGameWorkflowHref, type WorkflowBoardLeague, type WorkflowBoardSort } from "@/lib/utils/workflow-hrefs";
import { buildGameHubMetrics } from "@/services/matchups/game-ui-adapter";
import { buildGameHubPresentation } from "@/services/matchups/game-hub-presenter";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SafeBoardData = Awaited<ReturnType<typeof getBoardCommandData>> | null;
type SafeSimulationData = Awaited<ReturnType<typeof buildEventSimulationView>>;

async function getSafeSimulationData(routeId: string): Promise<SafeSimulationData> {
  try {
    return await buildEventSimulationView(routeId);
  } catch {
    return null;
  }
}

async function getSafeBoardData(league: string): Promise<SafeBoardData> {
  try {
    return await getBoardCommandData({ league, date: "today" });
  } catch {
    return null;
  }
}

function readParam(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function readMarketFocus(value: string | undefined): "all" | "spread" | "moneyline" | "total" {
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

export default async function GameDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const marketFocus = readMarketFocus(readParam(resolvedSearch, "market"));
  const bookFocus = readParam(resolvedSearch, "book") ?? null;
  const detail = await getMatchupDetail(id);

  if (!detail) notFound();

  const boardState = {
    league: readBoardLeague(readParam(resolvedSearch, "boardLeague"), detail.league.key),
    market: readMarketFocus(readParam(resolvedSearch, "boardMarket")),
    sort: readBoardSort(readParam(resolvedSearch, "boardSort")),
    focus: readParam(resolvedSearch, "boardFocus") ?? detail.routeId
  } satisfies { league: WorkflowBoardLeague; market: "all" | "spread" | "moneyline" | "total"; sort: WorkflowBoardSort; focus?: string | null };

  const returnBoardHref = buildBoardReturnHref(boardState);
  const currentGamePath = buildGameWorkflowHref(`/game/${detail.routeId}`, boardState, {
    market: marketFocus === "all" ? "moneyline" : marketFocus,
    book: bookFocus,
    label: marketFocus === "all" ? "Moneyline" : marketFocus === "spread" ? "Spread" : "Total"
  });

  const presentation = buildGameHubPresentation(detail);
  const decisionView = presentation.decisionModule.focusTarget?.kind === "market"
    ? {
        ...presentation.decisionModule,
        focusTarget: {
          ...presentation.decisionModule.focusTarget,
          href: appendBoardStateToHref(presentation.decisionModule.focusTarget.href, boardState)
        }
      }
    : presentation.decisionModule;

  const [board, simulation] = await Promise.all([
    getSafeBoardData(detail.league.key),
    getSafeSimulationData(detail.routeId)
  ]);

  const railItems = board?.verifiedGames.slice(0, 8).map((game) => ({
    id: game.id,
    label: `${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation}`,
    note: new Date(game.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    href: buildGameWorkflowHref(game.detailHref ?? `/game/${game.id}`, boardState, {
      market: marketFocus === "all" ? "moneyline" : marketFocus,
      book: bookFocus,
      label: marketFocus === "all" ? "Moneyline" : marketFocus === "spread" ? "Spread" : "Total"
    }),
    active: game.id === detail.routeId
  })) ?? [];

  const tabs = [
    { label: "Read", href: "#for-you", active: true },
    { label: "Markets", href: "#markets", active: detail.hasVerifiedOdds },
    simulation ? { label: "Sim", href: "#simulation", active: true } : null,
    { label: "Matchup", href: "#matchup", active: true },
    { label: "Props", href: "#props", active: true, count: detail.props.length || null }
  ].filter((value): value is NonNullable<typeof value> => value !== null);
  const metrics = buildGameHubMetrics(detail, presentation.postureLabel);

  return (
    <BetSlipBoundary>
      <div className="grid gap-4 xl:gap-5">
        <MobileTopBar
          title={detail.eventLabel}
          leftHref={returnBoardHref}
          subtitle={`${detail.league.key} command`}
          rightSlot={<div className="hard-chip hard-chip--brand">{detail.currentOddsProvider ?? detail.providerHealth.label}</div>}
        />

        {railItems.length ? <HorizontalEventRail items={railItems} /> : null}

        <section className="hard-hero-panel p-4 xl:p-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_320px] xl:items-center">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="hard-chip hard-chip--brand">{detail.league.key}</span>
                <span className="hard-chip">{presentation.postureLabel}</span>
                <span className="hard-chip hard-chip--success">{detail.providerHealth.label}</span>
              </div>
              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">Game desk</div>
                <div className="mt-2 text-[2.2rem] font-semibold leading-[0.95] tracking-[-0.06em] text-white xl:text-[3.6rem]">
                  {detail.eventLabel}
                </div>
                <div className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                  The game page should sell conviction fast: best market, why now, what moved,
                  where the risk sits, and what props deserve attachment.
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {metrics.map((metric) => (
                  <div key={metric.label} className="hard-stat-tile">
                    <div className="hard-kicker">{metric.label}</div>
                    <div className="mt-2 hard-value text-[1.9rem]">{metric.value}</div>
                    {metric.supporting ? <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{metric.supporting}</div> : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3">
              <div className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] p-4">
                <div className="hard-kicker">Immediate action</div>
                <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{presentation.postureLabel}</div>
                <div className="mt-3 text-sm leading-7 text-slate-300">{detail.providerHealth.summary}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <a href="#markets" className="hard-card-action hard-card-action--primary">Market tape</a>
                <a href="#props" className="hard-card-action hard-card-action--secondary">Props</a>
              </div>
            </div>
          </div>
        </section>

        <GameDetailCommandHero detail={detail} presentation={presentation} tabs={tabs} metrics={metrics} returnHref={returnBoardHref} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.32fr)_380px] xl:items-start">
          <main className="grid gap-4">
            <MatchupDecisionModule decision={decisionView} />

            <section id="for-you" className="grid gap-3">
              <div>
                <div className="hard-kicker">Signal stack</div>
                <div className="mt-1 text-[1.55rem] font-semibold tracking-[-0.05em] text-white">Why this matchup is on the desk</div>
              </div>
              <OverviewPanel detail={detail} sourcePath={currentGamePath} />
            </section>

            <FocusedMarketTrendPanel detail={detail} presentation={presentation} marketFocus={marketFocus} />

            <section id="markets" className="grid gap-3">
              <div>
                <div className="hard-kicker">Market tape</div>
                <div className="mt-1 text-[1.55rem] font-semibold tracking-[-0.05em] text-white">Books, prices, and movement</div>
              </div>
              <div id="market-target">
                <OddsTable detail={detail} marketFocus={marketFocus} bookFocus={bookFocus} boardContext={boardState} />
              </div>
            </section>

            <section id="matchup" className="grid gap-3">
              <div>
                <div className="hard-kicker">Team read</div>
                <div className="mt-1 text-[1.55rem] font-semibold tracking-[-0.05em] text-white">Context, injuries, and pressure points</div>
              </div>
              <MatchupPanel detail={detail} />
            </section>

            {simulation ? (
              <section id="simulation" className="grid gap-3">
                <div>
                  <div className="hard-kicker">Model workbench</div>
                  <div className="mt-1 text-[1.55rem] font-semibold tracking-[-0.05em] text-white">Simulation deck</div>
                </div>
                <SimulationIntelligencePanel simulation={simulation} />
              </section>
            ) : null}

            <section id="props" className="grid gap-3">
              <div>
                <div className="hard-kicker">Attached props</div>
                <div className="mt-1 text-[1.55rem] font-semibold tracking-[-0.05em] text-white">Prop opportunities worth staying on the screen</div>
              </div>
              <PropList props={detail.props.slice(0, 8)} support={detail.propsSupport} />
            </section>
          </main>

          <GameExecutionSidebar detail={detail} presentation={presentation} returnHref={returnBoardHref} />
        </div>
      </div>
    </BetSlipBoundary>
  );
}
