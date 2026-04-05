import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { formatOpportunityAction } from "@/components/intelligence/opportunity-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import type { OpportunityView } from "@/lib/types/opportunity";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import {
  buildGameHubKalshiCards,
  buildGameHubMetrics,
  buildGameHubMovementCards,
  buildGameHubSplitsCards,
  buildGameHubTabs
} from "@/services/matchups/game-ui-adapter";
import {
  buildBetSignalOpportunity,
  buildPropOpportunity,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getStatusTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED" || status === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getSupportTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

function QuickJump({
  href,
  label,
  emphasis = false
}: {
  href: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <a
      href={href}
      className={
        emphasis
          ? "rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200"
          : "rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200"
      }
    >
      {label}
    </a>
  );
}

function MetricTile({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric-tile rounded-[1.2rem] border border-white/8 bg-slate-950/60 px-4 py-4">
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 font-display text-3xl font-semibold text-white">
        {value}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

function HubTab({
  href,
  label,
  active,
  count
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number | null;
}) {
  return (
    <a
      href={href}
      className={
        active
          ? "inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200"
          : "inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500"
      }
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white">
          {count}
        </span>
      ) : null}
    </a>
  );
}

function DeskCard({
  title,
  value,
  note,
  tone = "default"
}: {
  title: string;
  value: string;
  note: string;
  tone?: "default" | "success" | "premium" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/20 bg-emerald-500/8"
      : tone === "premium"
        ? "border-amber-300/20 bg-amber-400/8"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-500/8"
          : "border-white/8 bg-slate-950/60";

  return (
    <div className={`rounded-[1.25rem] border px-4 py-4 ${toneClass}`}>
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

function buildForYouOpportunities(routeId: string, detail: Awaited<ReturnType<typeof getMatchupDetail>>) {
  if (!detail) {
    return [];
  }

  const signalOpportunities = detail.betSignals.map((signal) =>
    buildBetSignalOpportunity(signal, detail.league.key, detail.providerHealth)
  );

  const propOpportunities = detail.props.slice(0, 6).map((prop) =>
    buildPropOpportunity(prop, detail.providerHealth)
  );

  return rankOpportunities<OpportunityView>([
    ...signalOpportunities,
    ...propOpportunities
  ])
    .map((opportunity) => ({
      ...opportunity,
      eventId: routeId
    }))
    .slice(0, 4);
}

export default async function GameDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  const tabs = buildGameHubTabs(detail);
  const forYou = buildForYouOpportunities(detail.routeId, detail);
  const headline = forYou[0] ?? null;
  const postureLabel = headline
    ? formatOpportunityAction(headline.actionState)
    : "No qualified edge";

  const metrics = buildGameHubMetrics(detail, postureLabel);
  const movementCards = buildGameHubMovementCards(detail);
  const splitsCards = buildGameHubSplitsCards(detail);
  const kalshiCards = buildGameHubKalshiCards(detail);

  const contextNotes = [
    detail.supportNote,
    detail.propsSupport.note,
    ...(detail.providerHealth.warnings ?? []),
    ...(detail.notes ?? [])
  ].filter(Boolean);

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
                    <Badge tone={headline.actionState === "BET_NOW" ? "success" : headline.actionState === "WAIT" ? "brand" : headline.actionState === "WATCH" ? "premium" : "muted"}>
                      {formatOpportunityAction(headline.actionState)}
                    </Badge>
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
                  This page should tell you the current posture fast: what the best angle is, what could kill it, how the number moved, and whether the feed is trustworthy enough to act.
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
                    opportunity.kind === "prop"
                      ? "Jump to props"
                      : "Jump to markets"
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
              <Card className="surface-panel p-5">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  Provider health
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={getProviderHealthTone(detail.providerHealth.state)}>
                    {detail.providerHealth.label}
                  </Badge>
                  {detail.currentOddsProvider ? (
                    <Badge tone="brand">{detail.currentOddsProvider}</Badge>
                  ) : null}
                  {detail.historicalOddsProvider ? (
                    <Badge tone="premium">{detail.historicalOddsProvider}</Badge>
                  ) : null}
                </div>
                <div className="mt-4 text-sm leading-7 text-slate-300">
                  {detail.providerHealth.summary}
                </div>
                {detail.providerHealth.asOf ? (
                  <div className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                    As of {formatGameDateTime(detail.providerHealth.asOf)}
                  </div>
                ) : null}
              </Card>

              <Card className="surface-panel p-5">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  Desk notes
                </div>
                <div className="mt-4 grid gap-3">
                  {contextNotes.length ? (
                    contextNotes.slice(0, 8).map((note) => (
                      <div
                        key={note}
                        className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300"
                      >
                        {note}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
                      No explicit provider or matchup notes were attached on this render.
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <MatchupPanel detail={detail} />
          </div>
        </section>
      </div>
    </BetSlipBoundary>
  );
}