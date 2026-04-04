import Link from "next/link";
import { notFound } from "next/navigation";

import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { LineMovementChart } from "@/components/charts/line-movement-chart";
import { MatchupPanel } from "@/components/game/matchup-panel";
import { OddsTable } from "@/components/game/odds-table";
import { OverviewPanel } from "@/components/game/overview-panel";
import { PropList } from "@/components/game/prop-list";
import {
  ChangeBadge,
  getChangeExplanation,
  getChangeReasonLabels
} from "@/components/intelligence/change-intelligence";
import {
  formatOpportunityAction,
  getOpportunityTrapLine,
  getOpportunityTone,
  OpportunityBadgeRow
} from "@/components/intelligence/opportunity-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { IdentityTile } from "@/components/media/identity-tile";
import { formatGameDateTime } from "@/lib/formatters/date";
import { getDecisionMemoryForEvent, getDecisionMemoryKey } from "@/services/decision/decision-memory";
import { buildChangeIntelligence } from "@/services/decision/change-intelligence";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";
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

function QuickJump({ href, label, emphasis = false }: { href: string; label: string; emphasis?: boolean }) {
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
    <div className="metric-tile">
      <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 font-display text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </div>
  );
}

function formatFairLine(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function getParticipantForRole(
  detail: Awaited<ReturnType<typeof getMatchupDetail>>,
  role: "AWAY" | "HOME"
) {
  return detail?.participants.find((participant) => participant.role === role) ?? null;
}

export default async function GamePage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getMatchupDetail(id);

  if (!detail) {
    notFound();
  }

  const showVerifiedOdds = detail.hasVerifiedOdds;
  const awayParticipant = getParticipantForRole(detail, "AWAY");
  const homeParticipant = getParticipantForRole(detail, "HOME");
  const headlineSignal = detail.betSignals[0] ?? null;
  const secondarySignals = detail.betSignals.slice(1, 3);
  const headlineOpportunity = headlineSignal
    ? buildBetSignalOpportunity(headlineSignal, detail.league.key, detail.providerHealth)
    : null;
  const decisionMemory = await getDecisionMemoryForEvent({
    league: detail.league.key,
    eventExternalId: detail.externalEventId
  });
  const headlineSnapshot = buildOpportunitySnapshot(headlineOpportunity);
  const headlineDecision = headlineSnapshot
    ? buildDecisionFromOpportunitySnapshot(headlineSnapshot)
    : null;
  const headlineChange = headlineSignal && headlineDecision
    ? buildChangeIntelligence(
        decisionMemory.get(
          getDecisionMemoryKey({
            marketType: headlineSignal.marketType,
            selection: headlineSignal.selection
          })
        )?.decisionState ?? null,
        headlineDecision
      )
    : null;
  const secondarySignalOpportunities = secondarySignals.map((signal) => ({
    signal,
    opportunity: buildBetSignalOpportunity(signal, detail.league.key, detail.providerHealth)
  }));
  const topPropOpportunities = detail.props
    .map((prop) => {
      const opportunity = buildPropOpportunity(prop, detail.providerHealth);
      const snapshot = buildOpportunitySnapshot(opportunity);
      const decision = snapshot ? buildDecisionFromOpportunitySnapshot(snapshot) : null;
      const change = decision
        ? buildChangeIntelligence(
            decisionMemory.get(
              getDecisionMemoryKey({
                marketType: prop.marketType,
                selection: opportunity.selectionLabel
              })
            )?.decisionState ?? null,
            decision
          )
        : null;

      return {
        prop,
        opportunity,
        change
      };
    })
    .sort((left, right) => right.opportunity.opportunityScore - left.opportunity.opportunityScore)
    .slice(0, 3);
  const trapStack = rankOpportunities(
    [
      headlineOpportunity,
      ...secondarySignalOpportunities.map((entry) => entry.opportunity),
      ...topPropOpportunities.map((entry) => entry.opportunity)
    ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.trapFlags.length))
  ).slice(0, 3);
  const trendPreview = detail.trendCards.slice(0, 2);
  const providerLabels = [
    detail.currentOddsProvider,
    detail.historicalOddsProvider,
    detail.liveScoreProvider,
    detail.statsProvider
  ].filter(Boolean) as string[];
  const heroMeta = [detail.venue, detail.stateDetail, detail.scoreboard].filter(Boolean).join(" | ");
  const signalSummary = headlineSignal
    ? `${headlineSignal.selection} at ${headlineSignal.oddsAmerican > 0 ? "+" : ""}${headlineSignal.oddsAmerican}`
    : "No qualified signal yet";
  const decisionReasons =
    headlineOpportunity?.whyItShows.slice(0, 2) ??
    headlineSignal?.reasons?.slice(0, 2).map((reason) => reason.detail) ??
    detail.notes.slice(0, 2);
  const headlineTrapLine = headlineOpportunity ? getOpportunityTrapLine(headlineOpportunity) : null;
  const postureLabel = headlineOpportunity ? formatOpportunityAction(headlineOpportunity.actionState) : "WATCH";
  const postureTone = headlineOpportunity ? getOpportunityTone(headlineOpportunity.actionState) : "muted";
  const headlineChangeReasonLabels = getChangeReasonLabels(headlineChange).slice(0, 2);
  const modelFactors = detail.nbaModel?.available ? detail.nbaModel.factors.slice(0, 3) : [];
  const matchupNotes = detail.notes.slice(0, 3);
  const topResearchNote =
    trendPreview[0]?.note ?? modelFactors[0]?.note ?? matchupNotes[0] ?? detail.supportNote;

  return (
    <BetSlipBoundary>
      <div className="grid gap-6">
      <Card className="surface-panel-strong overflow-hidden p-6 xl:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.06fr_0.94fr]">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{detail.league.key}</Badge>
              {detail.status ? <Badge tone={getStatusTone(detail.status)}>{detail.status}</Badge> : null}
              {detail.supportStatus ? (
                <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
              ) : null}
              {!showVerifiedOdds ? <Badge tone="muted">Odds still thin</Badge> : null}
            </div>

            <div className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-400">
              {formatGameDateTime(detail.startTime)}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <IdentityTile
                  label={awayParticipant?.name ?? "Away"}
                  shortLabel={awayParticipant?.abbreviation ?? "AWY"}
                  size="lg"
                />
                <div className="text-[0.74rem] font-semibold uppercase tracking-[0.32em] text-slate-500">
                  at
                </div>
                <IdentityTile
                  label={homeParticipant?.name ?? "Home"}
                  shortLabel={homeParticipant?.abbreviation ?? "HME"}
                  size="lg"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {awayParticipant ? <Badge tone="muted">{awayParticipant.name}</Badge> : null}
                {homeParticipant ? <Badge tone="muted">{homeParticipant.name}</Badge> : null}
              </div>
            </div>
            <div className="mt-4 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              {detail.eventLabel}
            </div>
            {heroMeta ? (
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{heroMeta}</p>
            ) : null}
            <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">
              {headlineOpportunity?.reasonSummary ??
                headlineSignal?.supportNote ??
                detail.supportNote ??
                "No force-fit conviction. The matchup stays live only if the number earns it."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <QuickJump href="#thesis" label="Market thesis" emphasis />
              <QuickJump href="#odds" label="Execution zone" />
              <QuickJump href="#props" label="Prop zone" />
              <QuickJump href="#research" label="Deep research" />
              <Link
                href={`/board?league=${detail.league.key}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200"
              >
                Back to board
              </Link>
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
                label="Trap risk"
                value={headlineTrapLine ? "Raised" : trapStack.length ? `${trapStack.length} flags` : "Clear"}
                note="Kill switch before conviction."
              />
            </div>
          </div>

            <div className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-slate-950/72 p-5">
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
                <ChangeBadge change={headlineChange} />
              </div>
            </div>

              <div className="rounded-[1.25rem] border border-sky-400/15 bg-sky-500/10 px-4 py-4">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-sky-300">Lead read</div>
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
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">EV</div>
                  <div className="mt-1 text-base font-semibold text-emerald-300">
                    {typeof headlineSignal?.expectedValuePct === "number"
                      ? `${headlineSignal.expectedValuePct > 0 ? "+" : ""}${headlineSignal.expectedValuePct.toFixed(2)}%`
                      : "N/A"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Fair line</div>
                  <div className="mt-1 text-base font-semibold text-white">
                    {formatFairLine(headlineSignal?.fairPrice?.fairOddsAmerican)}
                  </div>
                </div>
                </div>
              </div>

            <div className="grid gap-3 md:grid-cols-2">
              {getChangeExplanation(headlineChange) ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-900/70 px-4 py-3 md:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">What changed</div>
                    <ChangeBadge change={headlineChange} />
                    {headlineChangeReasonLabels.map((label) => (
                      <Badge key={label} tone="muted">{label}</Badge>
                    ))}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    {getChangeExplanation(headlineChange)}
                  </div>
                </div>
              ) : null}
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-900/70 px-4 py-3">
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Why now</div>
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
                <div className={`mt-2 text-sm leading-6 ${headlineTrapLine ? "text-rose-100" : "text-slate-300"}`}>
                  {headlineTrapLine ??
                    headlineOpportunity?.whatCouldKillIt[0] ??
                    "If price quality slips or disagreement widens, this drops back to watch only."}
                </div>
              </div>
            </div>

            <LineMovementChart
              points={detail.lineMovement}
              metric="spreadLine"
              label="Spread pulse"
              compact
            />

            <div className="flex flex-wrap gap-3">
              <QuickJump href="#odds" label="Compare books" emphasis />
              <QuickJump href="#props" label="Check props" />
              <QuickJump href="#research" label="Open research" />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="grid gap-6">
          <section id="thesis" className="grid gap-4">
            <SectionTitle
              eyebrow="Market thesis"
              title="Best angle first, runners-up second"
              description="Lead read first. Everything else has to justify the screen space."
            />
            <OverviewPanel detail={detail} />
          </section>

          {showVerifiedOdds ? (
            <section id="odds" className="grid gap-4">
              <SectionTitle
                eyebrow="Execution zone"
                title="Best price, movement, and trust in one place"
                description="Book comparison, no-vig context, movement, and support honesty without a separate scavenger hunt."
              />
              <OddsTable detail={detail} />
            </section>
          ) : (
            <section id="odds" className="grid gap-4">
              <SectionTitle
                eyebrow="Execution zone"
                title="Odds board"
                description="This slot stays visible, but plainspoken, when verified book coverage is not ready."
              />
              <EmptyState
                eyebrow="Execution zone"
                title="Verified odds are not ready for this matchup"
                description="You can still use the page for context and matchup-linked props, but SharkEdge will not fake a full odds board when the provider mesh has not earned it."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      href={`/board?league=${detail.league.key}`}
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                    >
                      Back to board
                    </Link>
                    <a
                      href="#props"
                      className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                    >
                      Check props
                    </a>
                  </div>
                }
              />
            </section>
          )}

          <section id="props" className="grid gap-4">
            <SectionTitle
              eyebrow="Prop zone"
              title="Props tied directly to this game"
              description="Same posture system. Best prop first, filler buried."
            />
            <PropList props={detail.props} support={detail.propsSupport} />
          </section>
        </div>

        <div className="grid gap-6 content-start">
          <Card className="surface-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="section-kicker">Why now</div>
                <div className="mt-2 text-2xl font-semibold text-white">What can still move this matchup</div>
              </div>
              {trendPreview.length ? (
                <Link
                  href={`/trends?league=${detail.league.key}`}
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                >
                  Open trends
                </Link>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3">
              {topPropOpportunities.length ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Prop posture</div>
                  <div className="mt-3 grid gap-2">
                    {topPropOpportunities.slice(0, 2).map(({ prop, opportunity, change }) => (
                      <div
                        key={prop.id}
                        className="rounded-[1rem] border border-white/8 bg-slate-900/70 px-3 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium text-white">{prop.player.name}</div>
                          <ChangeBadge change={change} />
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {prop.marketType.replace(/_/g, " ")} | {opportunity.actionState.replace(/_/g, " ")} | {opportunity.opportunityScore}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-300">
                          {getChangeExplanation(change) ?? opportunity.reasonSummary}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {trendPreview[0] ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
                  <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                    {trendPreview[0].title}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">{trendPreview[0].value}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">{trendPreview[0].note}</div>
                </div>
              ) : null}

              {modelFactors.length ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4">
                  <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Model pulse</div>
                  <div className="mt-3 grid gap-2">
                    {modelFactors.map((factor) => (
                      <div key={factor.label} className="rounded-[1rem] border border-white/8 bg-slate-900/70 px-3 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{factor.label}</div>
                        <div className="mt-2 text-sm font-medium text-white">
                          {factor.awayValue} vs {factor.homeValue}
                        </div>
                        {factor.note ? (
                          <div className="mt-1 text-xs leading-5 text-slate-500">{factor.note}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {topResearchNote && !trendPreview.length && !modelFactors.length ? (
                <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-4 text-sm leading-6 text-slate-300">
                  {topResearchNote}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="surface-panel p-5">
            <div className="section-kicker">Coverage truth</div>
            <div className="mt-2 text-2xl font-semibold text-white">What to trust on this page</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={getSupportTone(detail.supportStatus)}>{detail.supportStatus}</Badge>
              <Badge tone={getProviderHealthTone(detail.providerHealth.state)}>
                {detail.providerHealth.label}
              </Badge>
              {providerLabels.length ? (
                providerLabels.map((label) => (
                  <Badge key={label} tone="muted">
                    {label}
                  </Badge>
                ))
              ) : (
                <Badge tone="muted">Provider labels pending</Badge>
              )}
            </div>

            <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
              {trapStack.length ? (
                <div className="rounded-[1.15rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3">
                  <div className="text-[0.66rem] uppercase tracking-[0.2em] text-rose-200/80">Trap warnings</div>
                  <div className="mt-2 grid gap-2">
                    {trapStack.map((opportunity) => (
                      <div key={`${opportunity.id}-trap`} className="text-sm leading-6 text-rose-100">
                        {opportunity.selectionLabel}: {getOpportunityTrapLine(opportunity) ?? opportunity.reasonSummary}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                {detail.supportNote}
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                {detail.providerHealth.summary}
              </div>
              <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3">
                {detail.providerHealth.asOf
                  ? `Provider timestamp: ${detail.providerHealth.freshnessLabel.toLowerCase()} at ${detail.providerHealth.asOf.slice(11, 16)} UTC.`
                  : "No provider timestamp was returned for this matchup yet."}
              </div>
              {detail.providerHealth.warnings.length ? (
                <div className="rounded-[1.15rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-amber-100">
                  {detail.providerHealth.warnings[0]}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <section id="research" className="grid gap-4">
        <SectionTitle
          eyebrow="Deep research"
          title="Participant form, leaders, and box score detail"
          description="Once the market is worth your attention, stay here to understand the teams or fighters behind the number."
        />
        <MatchupPanel detail={detail} />
      </section>
      </div>
    </BetSlipBoundary>
  );
}
