import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { SimulationIntelligencePanel } from "@/components/event/simulation-intelligence-panel";
import { GameConvergencePanel } from "@/components/game/game-convergence-panel";
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
import { buildGameHubPresentation } from "@/services/matchups/game-hub-presenter";
import { buildGameConvergenceView } from "@/services/matchups/game-convergence-service";
import { appendBoardStateToHref, buildBoardReturnHref, buildGameWorkflowHref, type WorkflowBoardLeague, type WorkflowBoardSort } from "@/lib/utils/workflow-hrefs";
import { buildGameHubMetrics } from "@/services/matchups/game-ui-adapter";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
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

function readParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function readMarketFocus(value: string | undefined): "all" | "spread" | "moneyline" | "total" {
  if (value === "spread" || value === "moneyline" || value === "total") {
    return value;
  }

  return "all";
}

function readBoardLeague(value: string | undefined, fallback: string): WorkflowBoardLeague {
  if (value === "NBA" || value === "MLB" || value === "ALL") {
    return value;
  }

  return fallback === "NBA" || fallback === "MLB" ? fallback : "ALL";
}

function readBoardSort(value: string | undefined): WorkflowBoardSort {
  if (value === "movement" || value === "start") {
    return value;
  }

  return "edge";
}


export default async function GameDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const marketFocus = readMarketFocus(readParam(resolvedSearch, "market"));
  const bookFocus = readParam(resolvedSearch, "book") ?? null;
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

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
    label: marketFocus === "all" ? "Moneyline" : marketFocus === "spread" ? "Spread" : marketFocus === "total" ? "Total" : "Moneyline"
  });

  const presentation = await buildGameHubPresentation(detail);
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

  const railItems =
    board?.verifiedGames.slice(0, 8).map((game) => ({
      id: game.id,
      label: `${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation}`,
      note: new Date(game.startTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }),
      href: buildGameWorkflowHref(game.detailHref ?? `/game/${game.id}`, boardState, {
        market: marketFocus === "all" ? "moneyline" : marketFocus,
        book: bookFocus,
        label: marketFocus === "all" ? "Moneyline" : marketFocus === "spread" ? "Spread" : marketFocus === "total" ? "Total" : "Moneyline"
      }),
      active: game.id === detail.routeId
    })) ?? [];

  const convergence = buildGameConvergenceView({
    detail,
    presentation,
    simulation
  });

  const tabs = [
    { label: "For You", href: "#for-you", active: true },
    { label: "Stack", href: "#stack", active: true },
    { label: "Markets", href: "#markets", active: detail.hasVerifiedOdds },
    simulation ? { label: "Sim", href: "#simulation", active: true } : null,
    { label: "Matchup", href: "#matchup", active: true },
    { label: "Props", href: "#props", active: true, count: detail.props.length || null }
  ].filter((value): value is NonNullable<typeof value> => value !== null);
  const metrics = buildGameHubMetrics(detail, presentation.postureLabel);

  return (
    <BetSlipBoundary>
      <div className="grid gap-4">
        <MobileTopBar
          title={detail.eventLabel}
          leftHref={returnBoardHref}
          subtitle={`${detail.league.key} Command`}
          rightSlot={
            <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {detail.currentOddsProvider ?? detail.providerHealth.label}
            </div>
          }
        />

        {railItems.length ? <HorizontalEventRail items={railItems} /> : null}

        <GameDetailCommandHero
          detail={detail}
          presentation={presentation}
          tabs={tabs}
          metrics={metrics}
          returnHref={returnBoardHref}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_380px] xl:items-start">
          <main className="grid gap-4">
            <MatchupDecisionModule decision={decisionView} />

            <section id="for-you" className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                    Signals and context
                  </div>
                  <div className="mt-1 text-[1.35rem] font-semibold text-white">
                    Why this matchup is on the desk
                  </div>
                </div>
              </div>
              <OverviewPanel detail={detail} sourcePath={currentGamePath} />
            </section>

            <GameConvergencePanel convergence={convergence} propCount={detail.props.length} />

            <FocusedMarketTrendPanel
              detail={detail}
              presentation={presentation}
              marketFocus={marketFocus}
            />

            <section id="markets" className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                    Market grid
                  </div>
                  <div className="mt-1 text-[1.35rem] font-semibold text-white">
                    Book table and tape
                  </div>
                </div>
              </div>
              <div id="market-target">
                <OddsTable detail={detail} marketFocus={marketFocus} bookFocus={bookFocus} boardContext={boardState} />
              </div>
            </section>

            {simulation ? (
              <section id="simulation" className="grid gap-3">
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                    Model deck
                  </div>
                  <div className="mt-1 text-[1.35rem] font-semibold text-white">
                    Simulation workbench
                  </div>
                </div>
                <SimulationIntelligencePanel simulation={simulation} />
              </section>
            ) : null}

            <section id="matchup" className="grid gap-3">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  Matchup view
                </div>
                <div className="mt-1 text-[1.35rem] font-semibold text-white">
                  Team context and live notes
                </div>
              </div>
              <MatchupPanel detail={detail} />
            </section>

            <section id="props" className="grid gap-3">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  Props desk
                </div>
                <div className="mt-1 text-[1.35rem] font-semibold text-white">
                  Attached prop opportunities
                </div>
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
