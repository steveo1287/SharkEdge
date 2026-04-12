import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import { EventHero } from "@/components/event/event-hero";
import { SimulationIntelligencePanel } from "@/components/event/simulation-intelligence-panel";
import { LineMovementPanel } from "@/components/event/line-movement-panel";
import { MarketTileRow } from "@/components/event/market-tile-row";
import { SplitBars } from "@/components/event/split-bars";
import { TeamBadge } from "@/components/identity/team-badge";
import { formatOpportunityAction } from "@/components/intelligence/opportunity-badges";
import { HorizontalEventRail } from "@/components/mobile/horizontal-event-rail";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { buildForYouOpportunities } from "@/app/game/[id]/_components/game-hub-opportunities";
import { getBoardCommandData } from "@/services/board/board-command-service";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type SafeBoardData = Awaited<ReturnType<typeof getBoardCommandData>> | null;
type SafeForYouData = Awaited<ReturnType<typeof buildForYouOpportunities>>;
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

async function getSafeForYouData(
  routeId: string,
  detail: Awaited<ReturnType<typeof getMatchupDetail>>
): Promise<SafeForYouData> {
  try {
    if (!detail) {
      return [];
    }

    return await buildForYouOpportunities(routeId, detail);
  } catch {
    return [];
  }
}

function renderParticipantCard(label: string, participant: any) {
  return (
    <div className="mobile-surface">
      <div className="flex items-center gap-3">
        <TeamBadge
          name={participant?.name ?? label}
          abbreviation={participant?.abbreviation}
          size="md"
        />
        <div>
          <div className="text-[1rem] font-semibold text-white">
            {participant?.name ?? label}
          </div>
          <div className="text-sm text-slate-500">
            {participant?.record ?? participant?.subtitle ?? label}
          </div>
        </div>
      </div>

      {participant?.leaders?.length ? (
        <div className="mt-4 grid gap-2">
          {participant.leaders.slice(0, 3).map((leader: any) => (
            <div
              key={`${participant.id}-${leader.label}`}
              className="flex items-center justify-between gap-3 rounded-[16px] bg-white/[0.03] px-3 py-2 text-sm"
            >
              <span className="text-slate-400">{leader.label}</span>
              <span className="font-semibold text-white">{leader.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 text-sm leading-6 text-slate-400">
          Live leader summaries have not arrived for this side yet.
        </div>
      )}
    </div>
  );
}

export default async function GameDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  const [board, forYou, simulation] = await Promise.all([
    getSafeBoardData(detail.league.key),
    getSafeForYouData(detail.routeId, detail),
    getSafeSimulationData(detail.routeId)
  ]);

  const away =
    detail.participants.find((participant) => participant.role === "AWAY") ??
    detail.participants[0] ??
    null;

  const home =
    detail.participants.find((participant) => participant.role === "HOME") ??
    detail.participants[1] ??
    null;

  const headliner = forYou[0] ?? null;

  const railItems =
    board?.verifiedGames.slice(0, 8).map((game) => ({
      id: game.id,
      label: `${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation}`,
      note: new Date(game.startTime).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit"
      }),
      href: game.detailHref ?? `/game/${game.id}`,
      active: game.detailHref === `/game/${detail.routeId}` || game.id === detail.routeId
    })) ?? [];

  const tabs = [
    { label: "For You", href: "#for-you", active: true },
    { label: "Sim", href: "#simulation" },
    { label: "Social", href: "#matchup" },
    { label: "Props", href: "#props" },
    { label: "Popular", href: "#movement" },
    { label: "Run Line", href: "#splits" }
  ];

  return (
    <BetSlipBoundary>
      <div className="grid gap-4">
        <MobileTopBar
          title={detail.eventLabel}
          leftHref="/games"
          subtitle={detail.league.key}
          rightSlot={
            <button type="button" className="mobile-icon-button" aria-label="Share">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path
                  d="M12 5v10M8 9l4-4 4 4M5 15v2a2 2 0 002 2h10a2 2 0 002-2v-2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          }
        />

        {railItems.length ? <HorizontalEventRail items={railItems} /> : null}

        <EventHero detail={detail} tabs={tabs} />

        {headliner ? (
          <section id="for-you" className="mobile-surface">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mobile-section-eyebrow">For You</div>
                <div className="mt-1 text-[1.2rem] font-semibold text-white">
                  Best current angle
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  {headliner.reasonSummary}
                </div>
              </div>
              <SharkScoreRing
                score={Math.round(headliner.opportunityScore)}
                size="sm"
                tone={headliner.opportunityScore >= 70 ? "success" : "brand"}
              />
            </div>

            <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
              <div className="text-[1.1rem] font-semibold text-white">
                {headliner.selectionLabel}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {formatOpportunityAction(headliner.actionState)} · {headliner.confidenceTier}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">
                {headliner.whyItShows.slice(0, 3).map((reason) => (
                  <span key={reason} className="rounded-full border border-white/8 px-3 py-1">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {simulation ? <SimulationIntelligencePanel simulation={simulation} /> : null}

        <section>
          <div className="mb-3 text-[1.35rem] font-semibold text-white">Market strip</div>
          <MarketTileRow detail={detail} />
        </section>

        <section id="movement">
          <LineMovementPanel detail={detail} />
        </section>

        <section id="matchup" className="grid gap-3">
          <div className="text-[1.35rem] font-semibold text-white">Live matchup</div>
          {detail.scoreboard ? (
            <div className="mobile-surface text-sm text-slate-300">
              {detail.scoreboard} · {detail.stateDetail ?? detail.status}
            </div>
          ) : null}
          <div className="grid gap-3">
            {renderParticipantCard("Away", away)}
            {renderParticipantCard("Home", home)}
          </div>
        </section>

        <section id="splits">
          <SplitBars
            summary={detail.providerHealth.summary}
            items={[
              {
                label: "Moneyline",
                leftLabel: away?.abbreviation ?? "Away",
                rightLabel: home?.abbreviation ?? "Home",
                note: detail.supportNote
              },
              {
                label: "Spread",
                leftLabel: away?.abbreviation ?? "Away",
                rightLabel: home?.abbreviation ?? "Home",
                note: detail.propsSupport.note
              },
              {
                label: "Total",
                leftLabel: "Under",
                rightLabel: "Over",
                note:
                  detail.providerHealth.warnings[0] ??
                  "Public ticket and handle percentages are not wired for this matchup yet."
              }
            ]}
          />
        </section>

        <section id="props" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[1.35rem] font-semibold text-white">Props</div>
            <Link href={`/props?league=${detail.league.key}`} className="text-sm text-slate-500">
              View all
            </Link>
          </div>

          <div className="grid gap-3">
            {detail.props.slice(0, 6).map((prop) => (
              <Link
                key={prop.id}
                href={prop.gameHref ?? `/game/${detail.routeId}#props`}
                className="mobile-surface block"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {prop.marketType.replace(/_/g, " ")}
                    </div>
                    <div className="mt-2 text-[1rem] font-semibold text-white">
                      {prop.player.name} {prop.side} {prop.line}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {prop.team.abbreviation} vs {prop.opponent.abbreviation}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[1.1rem] font-semibold text-[#48e0d2]">
                      {prop.oddsAmerican > 0 ? `+${prop.oddsAmerican}` : prop.oddsAmerican}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {prop.sportsbook.name}
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {!detail.props.length ? (
              <div className="mobile-surface text-sm leading-6 text-slate-400">
                {detail.propsSupport.note}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-3">
          <div className="text-[1.35rem] font-semibold text-white">Trend support</div>
          <div className="grid gap-3">
            {detail.trendCards.slice(0, 4).map((trend) => (
              <Link key={trend.id} href={trend.href ?? "/trends"} className="mobile-surface block">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Trend support
                    </div>
                    <div className="mt-2 text-[1rem] font-semibold text-white">
                      {trend.title}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">
                      {trend.note}
                    </div>
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300">
                    {trend.value}
                  </div>
                </div>
              </Link>
            ))}

            {!detail.trendCards.length ? (
              <div className="mobile-surface text-sm leading-6 text-slate-400">
                Historical support is thin for this matchup right now.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </BetSlipBoundary>
  );
}