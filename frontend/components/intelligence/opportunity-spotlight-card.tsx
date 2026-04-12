import Link from "next/link";

import { formatOpportunityAction } from "@/components/intelligence/opportunity-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OpportunityView } from "@/lib/types/opportunity";

type Props = {
  opportunity: OpportunityView;
  href: string;
  ctaLabel: string;
};

function getTone(action: string) {
  if (action === "BET_NOW") return "success" as const;
  if (action === "WAIT") return "brand" as const;
  if (action === "WATCH") return "premium" as const;
  return "muted" as const;
}

function getTierTone(tier: string | undefined) {
  if (tier === "PRIME") return "success" as const;
  if (tier === "ACTIONABLE") return "brand" as const;
  if (tier === "WATCH") return "premium" as const;
  return "muted" as const;
}

function formatOdds(value: number | null) {
  if (typeof value !== "number") {
    return null;
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPercent(value: number | null) {
  if (typeof value !== "number") {
    return null;
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatLine(value: string | number | null) {
  if (typeof value === "number") {
    return `${value}`;
  }

  if (typeof value === "string" && value.trim().length) {
    return value;
  }

  return null;
}

function formatStake(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2
  }).format(value);
}

export function OpportunitySpotlightCard({
  opportunity,
  href,
  ctaLabel
}: Props) {
  const oddsLabel = formatOdds(opportunity.displayOddsAmerican);
  const evLabel = formatPercent(opportunity.expectedValuePct);
  const lineLabel = formatLine(opportunity.displayLine);
  const stakeLabel = formatStake(opportunity.sizing.recommendedStake);
  const bankrollLabel = `${opportunity.sizing.bankrollPct.toFixed(2)}% BR`;
  const hasPortfolioPenalty =
    opportunity.sizing.correlationPenalty < 0.99 ||
    opportunity.sizing.competitionPenalty < 0.99;
  const ranking = opportunity.ranking;
  const decisionTone = opportunity.decisionAction
    ? getTone(opportunity.decisionAction)
    : "muted";

  return (
    <Card className="surface-panel p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={getTone(opportunity.actionState)}>
            {formatOpportunityAction(opportunity.actionState)}
          </Badge>

          <div className="text-xs text-slate-500">
            Score {Math.round(opportunity.opportunityScore)}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
            {opportunity.eventLabel}
          </div>
          <div className="mt-2 text-lg font-semibold text-white sm:text-xl">
            {opportunity.selectionLabel}
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            {opportunity.reasonSummary}
          </div>

          {opportunity.triggerSummary ? (
            <div className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-xs leading-5 text-emerald-100">
              <span className="mr-2 uppercase tracking-[0.18em] text-emerald-300/80">Trigger</span>
              {opportunity.triggerSummary}
            </div>
          ) : null}

          {opportunity.killSummary ? (
            <div className="mt-2 rounded-2xl border border-rose-400/15 bg-rose-400/5 px-3 py-2 text-xs leading-5 text-rose-100">
              <span className="mr-2 uppercase tracking-[0.18em] text-rose-300/80">Kill</span>
              {opportunity.killSummary}
            </div>
          ) : null}
          <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
            Stake {stakeLabel} • {bankrollLabel}
            {hasPortfolioPenalty
              ? ` • Corr ${(opportunity.sizing.correlationPenalty * 100).toFixed(0)}% • Comp ${(opportunity.sizing.competitionPenalty * 100).toFixed(0)}%`
              : ""}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="muted">{opportunity.marketType.replace(/_/g, " ")}</Badge>

          {opportunity.sportsbookName ? (
            <Badge tone="brand">{opportunity.sportsbookName}</Badge>
          ) : null}

          {oddsLabel ? <Badge tone="premium">{oddsLabel}</Badge> : null}

          {evLabel ? <Badge tone="success">EV {evLabel}</Badge> : null}

          {lineLabel ? <Badge tone="muted">Line {lineLabel}</Badge> : null}

          <Badge tone={opportunity.sizing.recommendation === "NO_BET" ? "danger" : "muted"}>
            Size {opportunity.sizing.label}
          </Badge>

          {ranking ? (
            <Badge tone={getTierTone(ranking.recommendationTier)}>
              {ranking.recommendationTier.toLowerCase()}
            </Badge>
          ) : null}

          {ranking ? <Badge tone="muted">CLV {ranking.expectedClvScore}</Badge> : null}
          {ranking ? <Badge tone={ranking.fragilityScore >= 65 ? "danger" : "muted"}>Fragility {ranking.fragilityScore}</Badge> : null}
          {ranking ? <Badge tone="premium">Reliability {ranking.trendReliabilityScore}</Badge> : null}
          {opportunity.decisionAction ? (
            <Badge tone={decisionTone}>Decision {opportunity.decisionAction.toLowerCase().replace(/_/g, " ")}</Badge>
          ) : null}
          {opportunity.stakeTier ? <Badge tone="muted">Stake {opportunity.stakeTier.toLowerCase()}</Badge> : null}
          {opportunity.marketRegime ? (
            <Badge tone="muted">{opportunity.marketRegime.toLowerCase().replace(/_/g, " ")}</Badge>
          ) : null}
          {typeof opportunity.modelEdgePercent === "number" ? (
            <Badge tone={opportunity.modelEdgePercent >= 0 ? "success" : "danger"}>
              Model {opportunity.modelEdgePercent > 0 ? "+" : ""}{opportunity.modelEdgePercent.toFixed(1)}%
            </Badge>
          ) : null}
          {opportunity.thesisCluster?.duplicateCount && opportunity.thesisCluster.duplicateCount > 1 ? (
            <Badge tone="danger">thesis dup x{opportunity.thesisCluster.duplicateCount}</Badge>
          ) : null}

          {hasPortfolioPenalty ? (
            <Badge tone="danger">Portfolio clipped</Badge>
          ) : null}

          {opportunity.executionContext?.status === "HISTORICAL" ? (
            <Badge
              tone={
                opportunity.executionContext.classification === "EXCELLENT_ENTRY"
                  ? "success"
                  : opportunity.executionContext.classification === "MISSED_OPPORTUNITY"
                    ? "danger"
                    : "muted"
              }
            >
              Exec {opportunity.executionContext.executionScore}
            </Badge>
          ) : null}

          {opportunity.truthCalibration.status === "APPLIED" ? (
            <Badge
              tone={opportunity.truthCalibration.scoreDelta >= 0 ? "brand" : "danger"}
            >
              Cal {opportunity.truthCalibration.scoreDelta >= 0 ? "+" : ""}
              {opportunity.truthCalibration.scoreDelta}
            </Badge>
          ) : null}

          {opportunity.marketMicrostructure.status === "APPLIED" ? (
            <Badge
              tone={
                opportunity.marketMicrostructure.regime === "STALE_COPY"
                  ? "success"
                  : opportunity.marketMicrostructure.regime === "FRAGMENTED"
                    ? "danger"
                    : "premium"
              }
            >
              {opportunity.marketMicrostructure.regime.toLowerCase().replace(/_/g, " ")}
            </Badge>
          ) : null}
        </div>

        {opportunity.decisionRationale?.length ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-5 text-slate-300">
            <span className="mr-2 uppercase tracking-[0.16em] text-slate-500">Decision basis</span>
            {opportunity.decisionRationale.slice(0, 3).join(" • ")}
          </div>
        ) : null}

        {opportunity.thesisCluster ? (
          <div className="text-xs leading-5 text-slate-400">
            Thesis: {opportunity.thesisCluster.label}
            {opportunity.thesisCluster.correlationCount > 1
              ? ` • cluster ${opportunity.thesisCluster.correlationCount}`
              : ""}
            {!opportunity.thesisCluster.isPrimary ? " • secondary expression" : ""}
          </div>
        ) : null}
        {opportunity.trendIntelligence ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-xs leading-5 text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="uppercase tracking-[0.16em] text-slate-500">Trend stack</span>
              <Badge tone={opportunity.trendIntelligence.supportiveLensCount > opportunity.trendIntelligence.contraryLensCount ? "success" : opportunity.trendIntelligence.contraryLensCount > 0 ? "danger" : "muted"}>
                {opportunity.trendIntelligence.intelligenceScore}
              </Badge>
              <Badge tone="premium">
                {opportunity.trendIntelligence.activeLensCount} lenses
              </Badge>
            </div>
            <div className="mt-2 text-slate-200">
              {opportunity.trendIntelligence.summary}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {opportunity.trendIntelligence.lenses
                .filter((lens) => lens.state !== "NOT_APPLICABLE")
                .slice(0, 4)
                .map((lens) => (
                  <Badge
                    key={lens.key}
                    tone={
                      lens.state === "SUPPORTIVE"
                        ? "success"
                        : lens.state === "CONTRARY"
                          ? "danger"
                          : lens.state === "MIXED"
                            ? "premium"
                            : "muted"
                    }
                  >
                    {lens.label} {lens.state.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                ))}
            </div>
            {opportunity.trendIntelligence.topAngle ? (
              <div className="mt-2 text-slate-400">
                {opportunity.trendIntelligence.topAngle}
              </div>
            ) : null}
          </div>
        ) : null}


        {(typeof opportunity.fairOddsAmerican === "number" || typeof opportunity.confidenceBandLow === "number") ? (
          <div className="text-xs leading-5 text-slate-400">
            {typeof opportunity.fairOddsAmerican === "number"
              ? `Fair ${opportunity.fairOddsAmerican > 0 ? "+" : ""}${opportunity.fairOddsAmerican}`
              : "Fair n/a"}
            {typeof opportunity.pushProbability === "number"
              ? ` • Push ${(opportunity.pushProbability * 100).toFixed(1)}%`
              : ""}
            {typeof opportunity.confidenceBandLow === "number" && typeof opportunity.confidenceBandHigh === "number"
              ? ` • Band ${opportunity.confidenceBandLow} to ${opportunity.confidenceBandHigh}`
              : ""}
          </div>
        ) : null}

        <Link
          href={href}
          className="mt-2 w-full rounded-full bg-sky-500 px-4 py-2 text-center text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
        >
          {ctaLabel}
        </Link>
      </div>
    </Card>
  );
}
