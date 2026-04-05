import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { GameHubTabs } from "@/components/game/game-hub-tabs";
import { GameMovementPanel } from "@/components/game/game-movement-panel";
import { GamePlaceholderPanel } from "@/components/game/game-placeholder-panel";
import { GameTrendsPanel } from "@/components/game/game-trends-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import {
  formatOpportunityAction,
  getOpportunityTrapLine,
  getOpportunityTone,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import { LeagueBadge } from "@/components/identity/league-badge";
import { TeamBadge } from "@/components/identity/team-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatGameDateTime } from "@/lib/formatters/date";
import {
  adaptGameDetailToHub,
  parseGameHubTab
} from "@/lib/adapters/game-ui-adapter";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
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
  searchParams?: Promise<{
    tab?: string;
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

function formatFairLine(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value}`;
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
    <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/55 p-4">
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 font-display text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

function ParticipantCard({
  role,
  name,
  abbreviation,
  score,
  subtitle
}: {
  role: string;
  name: string;
  abbreviation: string | null;
  score: string | null;
  subtitle: string | null;
}) {
  return (
    <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/55 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <TeamBadge
            name={name}
            abbreviation={abbreviation ?? name.slice(0, 3).toUpperCase()}
            size="lg"
          />
          <div className="min-w-0">
            <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              {role}
            </div>
            <div className="truncate text-xl font-semibold text-white">{name}</div>
            {subtitle ? (
              <div className="mt-1 truncate text-sm text-slate-400">{subtitle}</div>
            ) : null}
          </div>
        </div>

        {score ? (
          <div className="text-right">
            <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              Score
            </div>
            <div className="mt-1 font-display text-2xl font-semibold text-white">{score}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderHubPanel(
  tab: ReturnType<typeof parseGameHubTab>,
  detail: Awaited<ReturnType<typeof getMatchupDetail>>,
  hub: ReturnType<typeof adaptGameDetailToHub>
) {
  if (!detail) {
    return null;
  }

  switch (tab) {
    case "for-you":
      return <OverviewPanel detail={detail} />;

    case "markets":
      return detail.hasVerifiedOdds ? (
        <OddsTable detail={detail} />
      ) : (
        <EmptyState
          eyebrow="Markets"
          title="Verified odds are not ready for this matchup"
          description="SharkEdge keeps this execution tab visible, but plainspoken, when the provider mesh has not earned a full verified board."
        />
      );

    case "props":
      return <PropList props={detail.props} support={detail.propsSupport} />;

    case "movement":
      return <GameMovementPanel movement={hub.movement} />;

    case "splits":
      return (
        <GamePlaceholderPanel
          eyebrow="Splits"
          title="Public money and handle"
          description="This slot is reserved for crowd-vs-sharp market intelligence."
          note={hub.splits.note}
        />
      );

    case "trends":
      return <GameTrendsPanel trends={hub.trends} leagueKey={detail.league.key} />;

    case "kalshi":
      return (
        <GamePlaceholderPanel
          eyebrow="Kalshi"
          title="Event-market overlays"
          description="This slot is reserved for Kalshi vs sportsbook probability comparison."
          note={hub.kalshi.note}
        />
      );

    case "feed":
      return (
        <GamePlaceholderPanel
          eyebrow="Feed"
          title="Live research stream"
          description="This slot is reserved for stories, notes, social, and event-linked context."
          note={hub.feed.note}
        />
      );

    default:
      return <OverviewPanel detail={detail} />;
  }
}

export default async function GamePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = parseGameHubTab(resolvedSearchParams?.tab);

  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  const hub = adaptGameDetailToHub(detail, activeTab);

  const showVerifiedOdds = detail.hasVerifiedOdds;
  const headlineSignal = detail.betSignals[0] ?? null;
  const secondarySignals = detail.betSignals.slice(1, 3);
  const headlineOpportunity = headlineSignal
    ? buildBetSignalOpportunity(headlineSignal, detail.league.key, detail.providerHealth)
    : null;

  const secondarySignalOpportunities = secondarySignals.map((signal) => ({
    signal,
    opportunity: buildBetSignalOpportunity(signal, detail.league.key, detail.providerHealth)
  }));

  const topPropOpportunities = detail.props
    .map((prop) => ({
      prop,
      opportunity: buildPropOpportunity(prop, detail.providerHealth)
    }))
    .sort((left, right) => right.opportunity.opportunityScore - left.opportunity.opportunityScore)
    .slice(0, 3);

  const trapStack = rankOpportunities(
    [
      headlineOpportunity,
      ...secondarySignalOpportunities.map((entry) => entry.opportunity),
      ...topPropOpportunities.map((entry) => entry.opportunity)
    ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.trapFlags.length))
  ).slice(0, 3);

  const providerLabels = [
    detail.currentOddsProvider,
    detail.historicalOddsProvider,
    detail.liveScoreProvider,
    detail.statsProvider
  ].filter(Boolean) as string[];

  const heroMeta = [detail.venue, detail.stateDetail, detail.scoreboard]
    .filter(Boolean)
    .join(" | ");

  const signalSummary = headlineSignal
    ? `${headlineSignal.selection} at ${headlineSignal.oddsAmerican > 0 ? "+" : ""}${headlineSignal.oddsAmerican}`
    : "No qualified signal yet";

  const decisionReasons =
    headlineOpportunity?.whyItShows.slice(0, 2) ??
    headlineSignal?.reasons?.slice(0, 2).map((reason) => reason.detail) ??
    detail.notes.slice(0, 2);

  const headlineTrapLine = headlineOpportunity
    ? getOpportunityTrapLine(headlineOpportunity)
    : null;

  const postureLabel = headlineOpportunity
    ? formatOpportunityAction(headlineOpportunity.actionState)
    : "WATCH";

  const postureTone = headlineOpportunity
    ? getOpportunityTone(headlineOpportunity.actionState)
    : "muted";

  const participants = detail.participants.slice(0, 2);

  return (
    <BetSlipBoundary>
      <div className="grid gap-6">
        <Card className="surface-panel-strong overflow-hidden p-6 xl:p-8">
          <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <LeagueBadge league={detail.league.key} />
                {detail.status ? <Badge tone={getStatusTone(detail.status)}>{detail.status}</Badge> : null}
                {detail.supportStatus ? (
                  <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
                ) : null}
                {!showVerifiedOdds ? <Badge tone="muted">Odds still thin</Badge> : null}
              </div>

              <div className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-400">
                {formatGameDateTime(detail.startTime)}
              </div>

              <div className="mt-4 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
                {hub.hero.title}
              </div>

              {heroMeta ? (
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{heroMeta}</p>
              ) : null}

              <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">
                {hub.hero.subtitle}
              </p>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                {participants.map((participant) => (
                  <ParticipantCard
                    key={participant.id}
                    role={participant.role}
                    name={participant.name}
                    abbreviation={participant.abbreviation}
                    score={participant.score}
                    subtitle={participant.subtitle}
                  />
                ))}
              </div>

              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="Best angle"
                  value={signalSummary}
                  note="Lead read only."
                />
                <MetricTile
                  label="Posture"
                  value={postureLabel}
                  note="Bet now, wait, watch, or pass."
                />
                <MetricTile
                  label="Fair line"
                  value={formatFairLine(headlineSignal?.fairPrice?.fairOddsAmerican)}
                  note="Pricing anchor."
                />
                <MetricTile
                  label="Verified board"
                  value={hub.hero.verifiedOddsLabel}
                  note="Current matchup execution coverage."
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="section-kicker">Decision desk</div>
                  <div className="mt-3 text-2xl font-semibold leading-tight text-white">
                    What matters right now.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={postureTone}>{postureLabel}</Badge>
                  {headlineSignal ? <Badge tone="success">{headlineSignal.confidenceTier} tier</Badge> : null}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-sky-400/15 bg-sky-500/10 px-4 py-4">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-sky-300">
                  Lead read
                </div>
                <div className="mt-3 text-lg font-semibold leading-tight text-white">
                  {headlineSignal ? headlineSignal.selection : "No bet qualified yet"}
                </div>
                {headlineOpportunity ? (
                  <div className="mt-3">
                    <OpportunityBadgeRow opportunity={headlineOpportunity} />
                  </div>
                ) : null}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                      EV
                    </div>
                    <div className="mt-1 text-base font-semibold text-emerald-300">
                      {typeof headlineSignal?.expectedValuePct === "number"
                        ? `${headlineSignal.expectedValuePct > 0 ? "+" : ""}${headlineSignal.expectedValuePct.toFixed(2)}%`
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                      Fair line
                    </div>
                    <div className="mt-1 text-base font-semibold text-white">
                      {formatFairLine(headlineSignal?.fairPrice?.fairOddsAmerican)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-900/70 px-4 py-3">
                  <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                    Why now
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    {decisionReasons[0] ??
                      "The page stays visible, but SharkEdge will not invent a reason to fire when the edge is not there."}
                  </div>
                </div>

                <div
                  className={`rounded-[1.15rem] border px-4 py-3 ${
                    headlineTrapLine
                      ? "border-rose-400/20 bg-rose-500/8"
                      : "border-white/8 bg-slate-900/70"
                  }`}
                >
                  <div
                    className={`text-[0.66rem] uppercase tracking-[0.2em] ${
                      headlineTrapLine ? "text-rose-200/80" : "text-slate-500"
                    }`}
                  >
                    Kill switch
                  </div>
                  <div
                    className={`mt-2 text-sm leading-6 ${
                      headlineTrapLine ? "text-rose-100" : "text-slate-300"
                    }`}
                  >
                    {headlineTrapLine ??
                      headlineOpportunity?.whatCouldKillIt[0] ??
                      "If price quality slips or disagreement widens, this drops back to watch only."}
                  </div>
                </div>
              </div>

              <div className="rounded-[1.15rem] border border-white/8 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-300">
                {detail.providerHealth.summary}
              </div>
            </div>
          </div>
        </Card>

        <Card className="surface-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="section-kicker">Matchup hub</div>
              <div className="mt-2 text-2xl font-semibold text-white">
                One event, multiple intelligence views
              </div>
              <div className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                The hero stays stable. The operating surface below swaps by task instead of forcing one long scroll page.
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge tone={getProviderHealthTone(detail.providerHealth.state)}>
                {detail.providerHealth.label}
              </Badge>
              {providerLabels.map((label) => (
                <Badge key={label} tone="muted">
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <GameHubTabs routeId={detail.routeId} tabs={hub.tabs} activeTab={hub.activeTab} />
          </div>
        </Card>

        {renderHubPanel(activeTab, detail, hub)}

        {trapStack.length ? (
          <Card className="surface-panel p-5">
            <div className="section-kicker">Risk stack</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              What could still kill the position
            </div>
            <div className="mt-4 grid gap-3">
              {trapStack.map((opportunity) => (
                <div
                  key={`${opportunity.id}-trap`}
                  className="rounded-[1.15rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm leading-6 text-rose-100"
                >
                  {opportunity.selectionLabel}:{" "}
                  {getOpportunityTrapLine(opportunity) ?? opportunity.reasonSummary}
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="surface-panel p-5">
            <div className="section-kicker">Coverage truth</div>
            <div className="mt-2 text-2xl font-semibold text-white">What to trust on this page</div>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                {detail.supportNote}
              </div>
              {detail.providerHealth.warnings.length ? (
                <div className="rounded-[1.15rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-amber-100">
                  {detail.providerHealth.warnings[0]}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="surface-panel p-5">
            <div className="section-kicker">Navigation posture</div>
            <div className="mt-2 text-2xl font-semibold text-white">How to use this hub</div>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                For You = decision layer.
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                Markets / Props / Movement = execution layers.
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                Splits / Trends / Kalshi / Feed = intelligence expansion layers.
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/leagues/${detail.league.key}`}
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
              >
                Open league desk
              </Link>
              <Link
                href="/board"
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white"
              >
                Back to board
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </BetSlipBoundary>
  );
}