import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { MatchupDecisionModule } from "@/components/game/matchup-decision-module";
import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { OpportunityActionBadge } from "@/components/intelligence/opportunity-badges";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildGameHubKalshiCards,
  buildGameHubMetrics,
  buildGameHubMovementCards,
  buildGameHubSplitsCards,
  buildGameHubTabs
} from "@/services/matchups/game-ui-adapter";
import { buildGameHubPresentation } from "@/services/matchups/game-hub-presenter";

import {
  DeskCard,
  getProviderHealthTone,
  getStatusTone,
  getSupportTone,
  HubTab,
  MetricTile,
  QuickJump
} from "./_components/game-hub-primitives";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function GameDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  const tabs = buildGameHubTabs(detail);
  const { forYou, headline, postureLabel, contextNotes, decisionModule } =
    buildGameHubPresentation(detail);

  const metrics = buildGameHubMetrics(detail, postureLabel);
  const movementCards = buildGameHubMovementCards(detail);
  const splitsCards = buildGameHubSplitsCards(detail);
  const kalshiCards = buildGameHubKalshiCards(detail);

  const marketSpotlight =
    decisionModule.focusTarget?.kind === "market"
      ? {
          marketType: decisionModule.focusTarget.marketType,
          sportsbookName: decisionModule.focusTarget.sportsbookName
        }
      : null;

  const spotlightPropId =
    decisionModule.focusTarget?.kind === "prop"
      ? decisionModule.focusTarget.propId
      : null;

  return (
    <BetSlipBoundary>
      <div className="grid gap-7">
        <Card className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-5">
              <div className="section-kicker">{detail.league.key} matchup hub</div>

              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={getStatusTone(detail.status)}>{detail.status}</Badge>
                  <Badge tone={getSupportTone(detail.supportStatus)}>
                    {detail.supportStatus}
                  </Badge>
                  <Badge tone={getProviderHealthTone(detail.providerHealth.state)}>
                    {detail.providerHealth.label}
                  </Badge>
                  {headline ? (
                    <OpportunityActionBadge actionState={headline.actionState} />
                  ) : null}
                </div>

                <h1 className="max-w-5xl font-display text-4xl font-semibold tracking-tight text-white md:text-5xl xl:text-[3.8rem] xl:leading-[0.98]">
                  {detail.eventLabel}
                </h1>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
                  <span>{formatGameDateTime(detail.startTime)}</span>
                  {detail.venue ? <span>{detail.venue}</span> : null}
                  {detail.stateDetail ? <span>{detail.stateDetail}</span> : null}
                  {detail.scoreboard ? <span>{detail.scoreboard}</span> : null}
                </div>

                <p className="max-w-3xl text-base leading-8 text-slate-300">
                  This page should tell you the current posture fast: what the best angle
                  is, what could kill it, how the number moved, and whether the feed is
                  trustworthy enough to act.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/board?league=${detail.league.key}`}
                  className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
                >
                  Open board
                </Link