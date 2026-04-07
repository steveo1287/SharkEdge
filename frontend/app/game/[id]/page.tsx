import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { OpportunityActionBadge } from "@/components/intelligence/opportunity-badges";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import {
  DiagnosticNotesPanel,
  ProviderHealthSummaryPanel
} from "@/components/intelligence/provider-diagnostic-shells";
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
  const { forYou, headline, postureLabel, contextNotes } =
    buildGameHubPresentation(detail);

  const metrics = buildGameHubMetrics(detail, postureLabel);
  const movementCards = buildGameHubMovementCards(detail);
  const splitsCards = buildGameHubSplitsCards(detail);
  const kalshiCards = buildGameHubKalshiCards(detail);

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
                </Link>
                <Link
                  href={`/props?league=${detail.league.key}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open props
                </Link>
                <Link
                  href={`/trends?league=${detail.league.key}&sample=5`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open trends
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {tabs.map((tab, index) => (
                  <HubTab
                    key={tab.id}
                    href={tab.href}
                    label={tab.label}
                    active={tab.active || index === 0}
                    count={tab.count}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4">
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                Desk posture
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {metrics.map((metric) => (
                  <MetricTile
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    note={metric.note}
                  />
                ))}
              </div>

              <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4">
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Quick jumps
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <QuickJump href="#for-you" label="For You" emphasis />
                  <QuickJump href="#markets" label="Markets" />
                  <QuickJump href="#props" label="Props" />
                  <QuickJump href="#movement" label="Movement" />
                  <QuickJump href="#feed" label="Feed" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <section id="for-you" className="grid gap-4">
          <SectionTitle
            eyebrow="For you"
            title="What actually deserves attention"
            description="This is the short list for this matchup. If nothing qualifies, the page should say that cleanly."
          />

          {forYou.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {forYou.map((opportunity) => (
                <OpportunitySpotlightCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  href={
                    opportunity.kind === "prop"
                      ? `/game/${detail.routeId}#props`
                      : `/game/${detail.routeId}#markets`
                  }
                  ctaLabel={
                    opportunity.kind === "prop" ? "Jump to props" : "Jump to markets"
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No qualified angle right now"
              description="Nothing on this matchup cleared the current threshold. That is better than fake conviction."
            />
          )}

          <OverviewPanel detail={detail} />
        </section>

        <section id="markets" className="grid gap-4">
          <SectionTitle
            eyebrow="Markets"
            title="Book table and tape"
            description="Verified books, price context, and stored movement snapshots for this matchup."
          />
          <OddsTable detail={detail} />
        </section>

        <section id="props" className="grid gap-4">
          <SectionTitle
            eyebrow="Props"
            title="Prop context"
            description="Only the markets that belong on the matchup page stay here."
          />
          <PropList props={detail.props} support={detail.propsSupport} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section id="movement" className="grid gap-4">
            <SectionTitle
              eyebrow="Movement"
              title="Line pressure"
              description="Opening versus latest movement, plus current market range context."
            />
            <div className="grid gap-4">
              {movementCards.map((card) => (
                <DeskCard
                  key={`${card.title}-${card.value}`}
                  title={card.title}
                  value={card.value}
                  note={card.note}
                  tone={card.tone}
                />
              ))}
            </div>
          </section>

          <section id="splits" className="grid gap-4">
            <SectionTitle
              eyebrow="Splits"
              title="Public / money / health"
              description="If split data is not wired, the page should say that instead of pretending."
            />
            <div className="grid gap-4">
              {splitsCards.map((card) => (
                <DeskCard
                  key={`${card.title}-${card.value}`}
                  title={card.title}
                  value={card.value}
                  note={card.note}
                  tone={card.tone}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section id="trends" className="grid gap-4">
            <SectionTitle
              eyebrow="Trends"
              title="Historical support"
              description="Published trend support attached to this matchup."
            />
            {detail.trendCards.length ? (
              <div className="grid gap-4">
                {detail.trendCards.map((trend) => (
                  <Link
                    key={trend.id}
                    href={trend.href ?? "/trends"}
                    className="rounded-[1.35rem] border border-white/8 bg-[#0a1422]/90 p-4 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                        Trend support
                      </div>
                      <Badge
                        tone={
                          trend.tone === "success"
                            ? "success"
                            : trend.tone === "premium"
                              ? "premium"
                              : trend.tone === "brand"
                                ? "brand"
                                : "muted"
                        }
                      >
                        {trend.value}
                      </Badge>
                    </div>
                    <div className="mt-3 text-lg font-semibold leading-tight text-white">
                      {trend.title}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">
                      {trend.note}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No trend support attached"
                description="This matchup does not have published trend cards on this render."
              />
            )}
          </section>

          <section id="kalshi" className="grid gap-4">
            <SectionTitle
              eyebrow="Kalshi"
              title="Prediction-market bridge"
              description="The shell is here. Full contract overlay wiring comes later."
            />
            <div className="grid gap-4">
              {kalshiCards.map((card) => (
                <DeskCard
                  key={`${card.title}-${card.value}`}
                  title={card.title}
                  value={card.value}
                  note={card.note}
                  tone={card.tone}
                />
              ))}
            </div>
          </section>
        </div>

        <section id="feed" className="grid gap-4">
          <SectionTitle
            eyebrow="Feed"
            title="Matchup intelligence and provider notes"
            description="Participant detail, context notes, and feed honesty all stay visible here."
          />

          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <div className="grid gap-4">
              <ProviderHealthSummaryPanel
                title="Provider health"
                state={detail.providerHealth.state}
                label={detail.providerHealth.label}
                summary={detail.providerHealth.summary}
                badges={[
                  detail.currentOddsProvider ? (
                    <Badge key="current-provider" tone="brand">
                      {detail.currentOddsProvider}
                    </Badge>
                  ) : null,
                  detail.historicalOddsProvider ? (
                    <Badge key="historical-provider" tone="premium">
                      {detail.historicalOddsProvider}
                    </Badge>
                  ) : null
                ]}
                asOfLabel={
                  detail.providerHealth.asOf
                    ? `As of ${formatGameDateTime(detail.providerHealth.asOf)}`
                    : null
                }
              />

              <DiagnosticNotesPanel
                title="Desk notes"
                notes={contextNotes.slice(0, 8)}
                emptyMessage="No explicit provider or matchup notes were attached on this render."
              />
            </div>

            <MatchupPanel detail={detail} />
          </div>
        </section>
      </div>
    </BetSlipBoundary>
  );
}