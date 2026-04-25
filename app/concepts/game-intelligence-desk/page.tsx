export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { LineMovementChart } from "@/components/charts/line-movement-chart";
import { MarketSparkline } from "@/components/charts/market-sparkline";
import { ConceptNav } from "@/components/concepts/concept-nav";
import {
  ConceptListRow,
  ConceptMetaChip,
  ConceptMetric,
  ConceptPageIntro,
  ConceptPanel,
  ConceptSectionHeader
} from "@/components/concepts/primitives";
import { ChangeBadge, getChangeExplanation, getChangeReasonLabels } from "@/components/intelligence/change-intelligence";
import { getOpportunityTrapLine, OpportunityBadgeRow } from "@/components/intelligence/opportunity-badges";
import { PrioritizationBadge } from "@/components/intelligence/prioritization";
import { IdentityTile } from "@/components/media/identity-tile";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import { getPlayerHeadshotUrl, getTeamLogoUrl, resolveMatchupHref } from "@/lib/utils/entity-routing";
import { getConceptSharedState } from "@/services/concepts/concept-surfaces";
import { buildChangeIntelligence } from "@/services/decision/change-intelligence";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { getDecisionMemoryForEvent, getDecisionMemoryKey } from "@/services/decision/decision-memory";
import { buildPrioritizationView } from "@/services/decision/prioritization-engine";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";
import { buildBetSignalOpportunity, buildPropOpportunity } from "@/services/opportunities/opportunity-service";

function getParticipant(detail: NonNullable<Awaited<ReturnType<typeof getConceptSharedState>>["featuredDetail"]>, role: "AWAY" | "HOME") {
  return detail.participants.find((participant) => participant.role === role) ?? null;
}

function formatFairLine(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function getLatestLine(detail: NonNullable<Awaited<ReturnType<typeof getConceptSharedState>>["featuredDetail"]>, metric: "spreadLine" | "totalLine") {
  const series = detail.lineMovement.map((point) => point[metric]).filter((value): value is number => typeof value === "number");
  return series.length ? series[series.length - 1] : null;
}

export default async function GameIntelligenceDeskConceptPage() {
  const state = await getConceptSharedState();
  const detail = state.featuredDetail;

  if (!detail) {
    notFound();
  }

  const awayParticipant = getParticipant(detail, "AWAY");
  const homeParticipant = getParticipant(detail, "HOME");
  const awayLogo = state.featuredGame ? getTeamLogoUrl(state.featuredGame.leagueKey, state.featuredGame.awayTeam) : null;
  const homeLogo = state.featuredGame ? getTeamLogoUrl(state.featuredGame.leagueKey, state.featuredGame.homeTeam) : null;
  const headlineSignal = detail.betSignals[0] ?? null;
  const headlineOpportunity = headlineSignal
    ? buildBetSignalOpportunity(headlineSignal, detail.league.key, detail.providerHealth)
    : null;
  const headlineSnapshot = buildOpportunitySnapshot(headlineOpportunity);
  const headlineDecision = headlineSnapshot ? buildDecisionFromOpportunitySnapshot(headlineSnapshot) : null;
  const memory = await getDecisionMemoryForEvent({ league: detail.league.key, eventExternalId: detail.externalEventId });
  const headlineChange = headlineDecision && headlineSignal
    ? buildChangeIntelligence(
        memory.get(getDecisionMemoryKey({ marketType: headlineSignal.marketType, selection: headlineSignal.selection }))?.decisionState ?? null,
        headlineDecision
      )
    : null;
  const headlinePriority = buildPrioritizationView({ decision: headlineDecision, change: headlineChange });
  const relatedWatchlist = state.watchlistData.items.filter((item) => item.eventExternalId === detail.externalEventId).slice(0, 3);
  const relatedAlerts = state.alertsData.notifications.filter((item) => item.betIntent?.externalEventId === detail.externalEventId).slice(0, 3);
  const topProps = detail.props
    .map((prop) => {
      const opportunity = buildPropOpportunity(prop, detail.providerHealth);
      const snapshot = buildOpportunitySnapshot(opportunity);
      const decision = snapshot ? buildDecisionFromOpportunitySnapshot(snapshot) : null;
      const change = decision
        ? buildChangeIntelligence(
            memory.get(getDecisionMemoryKey({ marketType: prop.marketType, selection: opportunity.selectionLabel }))?.decisionState ?? null,
            decision
          )
        : null;
      return { prop, opportunity, decision, change };
    })
    .sort((left, right) => right.opportunity.opportunityScore - left.opportunity.opportunityScore)
    .slice(0, 4);
  const reasonLabels = getChangeReasonLabels(headlineChange).slice(0, 3);
  const spreadNow = getLatestLine(detail, "spreadLine");
  const totalNow = getLatestLine(detail, "totalLine");
  const heroSubtitle = [detail.venue, detail.stateDetail, detail.supportNote].filter(Boolean).join(" | ");
  const focusHref = resolveMatchupHref({ leagueKey: detail.league.key, externalEventId: detail.externalEventId }) ?? "/board";

  return (
    <div className="concept-stage concept-stage-desk">
      <ConceptPageIntro
        kicker="Concept 2"
        title="Game Intelligence Desk"
        description="A flagship matchup room: team identity up top, live line history in view, and decision/change/activity modules arranged like a serious sports trading desk instead of a vertical widget stack."
        actions={<ConceptNav current="/concepts/game-intelligence-desk" />}
      />

      <ConceptPanel tone="accent" className="grid gap-8 p-6 md:p-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            <ConceptMetaChip tone="accent">{detail.league.key}</ConceptMetaChip>
            <ConceptMetaChip tone="muted">{detail.status}</ConceptMetaChip>
            <ConceptMetaChip tone="muted">{detail.supportStatus}</ConceptMetaChip>
          </div>
          <div className="text-sm uppercase tracking-[0.24em] text-slate-500">{formatGameDateTime(detail.startTime)}</div>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-3">
              <IdentityTile label={awayParticipant?.name ?? "Away"} shortLabel={awayParticipant?.abbreviation ?? "AWY"} imageUrl={awayLogo} size="lg" />
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.38em] text-slate-500">vs</div>
              <IdentityTile label={homeParticipant?.name ?? "Home"} shortLabel={homeParticipant?.abbreviation ?? "HME"} imageUrl={homeLogo} size="lg" />
            </div>
            <div className="grid gap-1">
              <div className="text-4xl font-semibold tracking-tight text-white md:text-5xl">{detail.eventLabel}</div>
              <div className="concept-copy max-w-3xl">{heroSubtitle}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 rounded-[1.55rem] border border-white/10 bg-[#07111c]/82 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="concept-kicker">Market pulse</div>
              <div className="mt-2 text-2xl font-semibold text-white">Current line, movement, and focus in one read</div>
            </div>
            <PrioritizationBadge prioritization={headlinePriority} />
          </div>
          <LineMovementChart points={detail.lineMovement} metric="spreadLine" label="Primary line movement" />
          <div className="grid gap-3 md:grid-cols-3">
            <ConceptMetric label="Spread now" value={spreadNow === null ? "N/A" : spreadNow.toFixed(1)} note="Current tracked spread line" />
            <ConceptMetric label="Total now" value={totalNow === null ? "N/A" : totalNow.toFixed(1)} note="Current tracked total line" />
            <ConceptMetric label="Focus read" value={headlineSignal ? `${headlineSignal.selection}` : "No lead read"} note={headlineSignal ? `${formatAmericanOdds(headlineSignal.oddsAmerican)} | ${headlineSignal.sportsbookName ?? "Book pending"}` : "SharkEdge is staying quiet."} />
          </div>
        </div>
      </ConceptPanel>

      <div className="grid gap-4 xl:grid-cols-3">
        <ConceptPanel className="grid gap-4 p-5">
          <ConceptSectionHeader label="Decision desk" title="Best angle" />
          <div className="text-2xl font-semibold text-white">{headlineSignal?.selection ?? "No qualified setup"}</div>
          {headlineOpportunity ? <OpportunityBadgeRow opportunity={headlineOpportunity} /> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <ConceptMetric label="Posture" value={headlineDecision?.actionState.replace(/_/g, " ") ?? "WATCH"} note="Current execution posture" />
            <ConceptMetric label="Fair line" value={formatFairLine(headlineSignal?.fairPrice?.fairOddsAmerican)} note="Pricing anchor" />
            <ConceptMetric label="Trap risk" value={headlineOpportunity ? (getOpportunityTrapLine(headlineOpportunity) ? "Raised" : "Clear") : "Pending"} note={headlineOpportunity ? getOpportunityTrapLine(headlineOpportunity) ?? "No active trap line." : "Waiting for a qualified read."} />
          </div>
        </ConceptPanel>

        <ConceptPanel className="grid gap-4 p-5">
          <ConceptSectionHeader label="What changed" title="Semantic movement" />
          <div className="flex flex-wrap gap-2">
            <ChangeBadge change={headlineChange} />
            {reasonLabels.map((label) => (
              <ConceptMetaChip key={label} tone="muted">{label}</ConceptMetaChip>
            ))}
          </div>
          <div className="text-sm leading-7 text-slate-300">
            {getChangeExplanation(headlineChange) ?? "No meaningful semantic change on the lead angle right now."}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <ConceptMetric label="Direction" value={headlineChange?.changeDirection ?? "unchanged"} note="Upgraded, downgraded, mixed, or unchanged." />
            <ConceptMetric label="Severity" value={headlineChange?.changeSeverity ?? "none"} note="How much the semantic state actually moved." />
          </div>
        </ConceptPanel>

        <ConceptPanel className="grid gap-4 p-5">
          <ConceptSectionHeader label="Market activity" title="Timing and support" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <ConceptMetric label="Attention" value={headlinePriority.shortAttentionLabel} note={headlinePriority.shortAttentionExplanation ?? "Priority is stable."} />
            <ConceptMetric label="Freshness" value={detail.providerHealth.freshnessLabel} note={detail.providerHealth.summary} />
            <ConceptMetric label="Watchlist" value={relatedWatchlist.length ? `${relatedWatchlist.length} linked` : "Not saved"} note={relatedWatchlist[0]?.selection ?? "No saved play tied to this event."} />
            <ConceptMetric label="Alerts" value={relatedAlerts.length ? `${relatedAlerts.length} active` : "Quiet"} note={relatedAlerts[0]?.title ?? "No live alert history on this event."} />
          </div>
        </ConceptPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-5">
          <ConceptPanel className="grid gap-4 p-5 md:p-6">
            <ConceptSectionHeader label="Execution grid" title="Odds table" detail="A tighter bookmaker matrix that keeps the current spread, moneyline, and total in one disciplined frame." action={<Link href={focusHref} className="concept-chip concept-chip-accent">Open live matchup</Link>} />
            <div className="overflow-hidden rounded-[1.25rem] border border-white/8">
              <div className="grid grid-cols-[1.25fr_repeat(3,minmax(0,1fr))] gap-px bg-white/8 text-[0.72rem] uppercase tracking-[0.18em] text-slate-500">
                <div className="bg-[#08121e] px-4 py-3">Book</div>
                <div className="bg-[#08121e] px-4 py-3">Spread</div>
                <div className="bg-[#08121e] px-4 py-3">Moneyline</div>
                <div className="bg-[#08121e] px-4 py-3">Total</div>
                {detail.books.slice(0, 7).map((book) => (
                  <Fragment key={book.sportsbook.id}>
                    <div className="bg-[#050d16] px-4 py-4 text-sm font-semibold text-white">{book.sportsbook.name}</div>
                    <div className="bg-[#050d16] px-4 py-4 text-sm text-slate-300">{book.spread}</div>
                    <div className="bg-[#050d16] px-4 py-4 text-sm text-slate-300">{book.moneyline}</div>
                    <div className="bg-[#050d16] px-4 py-4 text-sm text-slate-300">{book.total}</div>
                  </Fragment>
                ))}
              </div>
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-4 p-5 md:p-6">
            <ConceptSectionHeader label="Movement history" title="Where the number actually moved" detail="Primary line chart up top, then compact strips for spread and total so the page answers movement questions without filler." />
            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <LineMovementChart points={detail.lineMovement} metric="spreadLine" label="Spread history" />
              <div className="grid gap-3">
                <LineMovementChart points={detail.lineMovement} metric="totalLine" label="Total history" compact />
                <ConceptPanel tone="muted" className="grid gap-2 p-4">
                  <div className="concept-meta">Trend center</div>
                  {detail.trendCards.slice(0, 3).map((trend) => (
                    <ConceptListRow key={trend.id} title={trend.title} detail={`${trend.value} | ${trend.note}`} />
                  ))}
                </ConceptPanel>
              </div>
            </div>
          </ConceptPanel>
        </div>

        <div className="grid gap-5 content-start">
          <ConceptPanel className="grid gap-4 p-5">
            <ConceptSectionHeader label="Prop zone" title="Player relevance only where it earns the space" />
            <div className="grid gap-3">
              {topProps.map(({ prop, opportunity, change }) => (
                <div key={prop.id} className="concept-list-row gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <IdentityTile
                      label={prop.player.name}
                      shortLabel={prop.player.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}
                      imageUrl={getPlayerHeadshotUrl(prop.leagueKey, prop.player)}
                      size="sm"
                      subtle
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{prop.player.name}</div>
                      <div className="mt-1 text-sm text-slate-400">{prop.marketType.replace(/_/g, " ")} | {prop.line} | {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-400">{getChangeExplanation(change) ?? opportunity.reasonSummary}</div>
                    </div>
                  </div>
                  <div className="grid gap-2 justify-items-end">
                    <ChangeBadge change={change} />
                    <MarketSparkline values={[prop.lineMovement ?? 0, opportunity.opportunityScore / 25, prop.expectedValuePct ?? 0]} compact />
                  </div>
                </div>
              ))}
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-4 p-5">
            <ConceptSectionHeader label="Related alerts" title="What the system is already watching" />
            <div className="grid gap-2">
              {relatedAlerts.length ? relatedAlerts.map((notification) => (
                <ConceptListRow
                  key={notification.id}
                  eyebrow={notification.severity}
                  title={notification.title}
                  detail={notification.changeIntelligence?.shortExplanation ?? notification.body}
                  aside={<PrioritizationBadge prioritization={notification.prioritization} />}
                />
              )) : <div className="text-sm leading-6 text-slate-500">No linked alert queue for this event yet.</div>}
            </div>
          </ConceptPanel>

          <ConceptPanel className="grid gap-4 p-5">
            <ConceptSectionHeader label="Research cut" title="Supporting notes" />
            <div className="grid gap-2">
              {detail.notes.slice(0, 4).map((note) => (
                <ConceptListRow key={note} title={note} />
              ))}
            </div>
          </ConceptPanel>
        </div>
      </div>
    </div>
  );
}
