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

function DiagnosticTile({
  label,
  value,
  note,
  accent = "default"
}: {
  label: string;
  value: string;
  note?: string | null;
  accent?: "default" | "brand" | "success" | "danger";
}) {
  const valueClass = {
    default: "text-text-primary",
    brand: "text-aqua",
    success: "text-mint",
    danger: "text-crimson"
  }[accent];

  return (
    <div className="rounded-[22px] border border-bone/[0.08] bg-black/28 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bone/50">{label}</div>
      <div className={`mt-2 font-mono text-[20px] font-semibold ${valueClass}`}>{value}</div>
      {note ? <div className="mt-2 text-[11px] leading-5 text-bone/55">{note}</div> : null}
    </div>
  );
}

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
  const timingTileValue = `${Math.round(opportunity.scoreComponents.timingQuality)}`;
  const sourceTileValue = `${Math.round(opportunity.sourceQuality.score)}`;
  const pathTileValue = `${Math.round(opportunity.scoreComponents.marketPath)}`;
  const penaltyTileValue = `${Math.abs(Math.round(opportunity.scoreComponents.penalties))}`;

  return (
    <Card className="panel overflow-hidden p-4 shadow-[0_18px_42px_rgba(0,0,0,0.22)] transition hover:border-cyan-300/20 hover:shadow-[0_18px_42px_rgba(0,0,0,0.26),0_0_24px_rgba(34,211,238,0.06)] sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={getTone(opportunity.actionState)}>
            {formatOpportunityAction(opportunity.actionState)}
          </Badge>

          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums text-bone/55">
            Score <span className="text-text-primary">{Math.round(opportunity.opportunityScore)}</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            {opportunity.eventLabel}
          </div>
          <div className="mt-2 font-display text-[18px] font-semibold tracking-[-0.01em] text-text-primary sm:text-[20px]">
            {opportunity.selectionLabel}
          </div>
          <div className="mt-2 text-[13px] leading-[1.55] text-bone/65">
            {opportunity.reasonSummary}
          </div>

          {opportunity.triggerSummary ? (
            <div className="mt-3 rounded-md border border-mint/25 bg-mint/[0.06] px-3 py-2 text-[12px] leading-[1.5] text-mint">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-mint/75">Trigger</span>
              <span className="text-bone/85">{opportunity.triggerSummary}</span>
            </div>
          ) : null}

          {opportunity.killSummary ? (
            <div className="mt-2 rounded-md border border-crimson/25 bg-crimson/[0.06] px-3 py-2 text-[12px] leading-[1.5] text-crimson">
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-crimson/75">Kill</span>
              <span className="text-bone/85">{opportunity.killSummary}</span>
            </div>
          ) : null}
          <div className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums text-bone/55">
            Stake <span className="text-text-primary">{stakeLabel}</span> · {bankrollLabel}
            {hasPortfolioPenalty
              ? ` · Corr ${(opportunity.sizing.correlationPenalty * 100).toFixed(0)}% · Comp ${(opportunity.sizing.competitionPenalty * 100).toFixed(0)}%`
              : ""}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DiagnosticTile
            label="Timing"
            value={timingTileValue}
            note={opportunity.timingState.toLowerCase().replace(/_/g, " ")}
            accent={opportunity.actionState === "BET_NOW" ? "success" : opportunity.actionState === "WAIT" ? "brand" : "default"}
          />
          <DiagnosticTile
            label="Source quality"
            value={sourceTileValue}
            note={opportunity.sourceQuality.label}
            accent={opportunity.sourceQuality.score >= 70 ? "success" : opportunity.sourceQuality.score >= 45 ? "brand" : "default"}
          />
          <DiagnosticTile
            label="Path"
            value={pathTileValue}
            note={opportunity.marketMicrostructure.regime.toLowerCase().replace(/_/g, " ")}
            accent={opportunity.marketMicrostructure.pathTrusted ? "brand" : "default"}
          />
          <DiagnosticTile
            label="Penalty"
            value={penaltyTileValue}
            note={opportunity.trapFlags.length ? opportunity.trapFlags.slice(0, 2).join(" · ").toLowerCase().replace(/_/g, " ") : "no active trap flags"}
            accent={opportunity.trapFlags.length ? "danger" : "default"}
          />
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
          <div className="rounded-md border border-bone/[0.08] bg-surface px-3 py-2 text-[12px] leading-[1.5] text-bone/65">
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Decision basis</span>
            <span className="text-bone/85">{opportunity.decisionRationale.slice(0, 3).join(" · ")}</span>
          </div>
        ) : null}

        {opportunity.thesisCluster ? (
          <div className="text-[12px] leading-[1.5] text-bone/55">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Thesis</span>{" "}
            <span className="text-bone/75">{opportunity.thesisCluster.label}</span>
            {opportunity.thesisCluster.correlationCount > 1
              ? ` · cluster ${opportunity.thesisCluster.correlationCount}`
              : ""}
            {!opportunity.thesisCluster.isPrimary ? " · secondary expression" : ""}
          </div>
        ) : null}

        {opportunity.weatherSourcePlan?.applicable ? (
          <div className="rounded-md border border-bone/[0.08] bg-surface px-3 py-3 text-[12px] leading-[1.5] text-bone/65">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Weather sourcing</span>
              <Badge
                tone={
                  opportunity.weatherSourcePlan.sourceConfidence >= 70
                    ? "success"
                    : opportunity.weatherSourcePlan.sourceConfidence >= 45
                      ? "premium"
                      : "muted"
                }
              >
                {opportunity.weatherSourcePlan.sourceConfidence}
              </Badge>
              <Badge tone="premium">
                {opportunity.weatherSourcePlan.primaryObservationProvider ?? "n/a"} / {opportunity.weatherSourcePlan.primaryForecastProvider ?? "n/a"}
              </Badge>
              {opportunity.weatherSourcePlan.visualizationProvider ? (
                <Badge tone="muted">
                  Map {opportunity.weatherSourcePlan.visualizationProvider}
                </Badge>
              ) : null}
            </div>
            <div className="mt-2 text-bone/85">
              {opportunity.weatherSourcePlan.summary}
            </div>
            <div className="mt-1 text-bone/55">
              Station {opportunity.weatherSourcePlan.stationJoinStatus.toLowerCase().replace(/_/g, " ")} · Venue {opportunity.weatherSourcePlan.venueJoinStatus.toLowerCase().replace(/_/g, " ")}
              {opportunity.weatherSourcePlan.joinMethod ? ` · ${opportunity.weatherSourcePlan.joinMethod.toLowerCase().replace(/_/g, " ")}` : ""}
            </div>
            {(opportunity.weatherSourcePlan.venueName || opportunity.weatherSourcePlan.stationCode || opportunity.weatherSourcePlan.roofType) ? (
              <div className="mt-2 text-bone/55">
                {opportunity.weatherSourcePlan.venueName ? `Venue ${opportunity.weatherSourcePlan.venueName}` : "Venue n/a"}
                {opportunity.weatherSourcePlan.stationCode ? ` · Station ${opportunity.weatherSourcePlan.stationCode}` : ""}
                {opportunity.weatherSourcePlan.roofType ? ` · ${opportunity.weatherSourcePlan.roofType.toLowerCase().replace(/_/g, " ")}` : ""}
                {opportunity.weatherSourcePlan.weatherExposure ? ` · ${opportunity.weatherSourcePlan.weatherExposure.toLowerCase()}` : ""}
                {typeof opportunity.weatherSourcePlan.altitudeFeet === "number" ? ` · ${opportunity.weatherSourcePlan.altitudeFeet} ft` : ""}
              </div>
            ) : null}
            {opportunity.weatherSourcePlan.parkFactorNote ? (
              <div className="mt-1 text-bone/55">
                {opportunity.weatherSourcePlan.parkFactorNote}
              </div>
            ) : null}
          </div>
        ) : null}

        {opportunity.trendIntelligence ? (
          <div className="rounded-md border border-bone/[0.08] bg-surface px-3 py-3 text-[12px] leading-[1.5] text-bone/65">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/55">Trend stack</span>
              <Badge tone={opportunity.trendIntelligence.supportiveLensCount > opportunity.trendIntelligence.contraryLensCount ? "success" : opportunity.trendIntelligence.contraryLensCount > 0 ? "danger" : "muted"}>
                {opportunity.trendIntelligence.intelligenceScore}
              </Badge>
              <Badge tone="premium">
                {opportunity.trendIntelligence.activeLensCount} lenses
              </Badge>
              <Badge
                tone={
                  opportunity.trendIntelligence.sourceCoverageScore >= 70
                    ? "success"
                    : opportunity.trendIntelligence.sourceCoverageScore >= 45
                      ? "premium"
                      : "muted"
                }
              >
                Source {opportunity.trendIntelligence.sourceCoverageScore}
              </Badge>
            </div>
            <div className="mt-2 text-bone/85">
              {opportunity.trendIntelligence.summary}
            </div>
            <div className="mt-1 text-bone/55">
              {opportunity.trendIntelligence.sourceSummary}
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
                    {lens.label} {lens.state.toLowerCase().replace(/_/g, " ")}{lens.sourceStatus ? ` · ${lens.sourceStatus.toLowerCase().replace(/_/g, " ")}` : ""}
                  </Badge>
                ))}
            </div>
            {opportunity.trendIntelligence.topAngle ? (
              <div className="mt-2 text-bone/55">
                {opportunity.trendIntelligence.topAngle}
              </div>
            ) : null}
          </div>
        ) : null}


        {(typeof opportunity.fairOddsAmerican === "number" || typeof opportunity.confidenceBandLow === "number") ? (
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums text-bone/55">
            {typeof opportunity.fairOddsAmerican === "number"
              ? <>Fair <span className="text-text-primary">{opportunity.fairOddsAmerican > 0 ? "+" : ""}{opportunity.fairOddsAmerican}</span></>
              : "Fair n/a"}
            {typeof opportunity.pushProbability === "number"
              ? <> · Push <span className="text-text-primary">{(opportunity.pushProbability * 100).toFixed(1)}%</span></>
              : ""}
            {typeof opportunity.confidenceBandLow === "number" && typeof opportunity.confidenceBandHigh === "number"
              ? <> · Band <span className="text-text-primary">{opportunity.confidenceBandLow} to {opportunity.confidenceBandHigh}</span></>
              : ""}
          </div>
        ) : null}

        <Link
          href={href}
          className="mt-2 inline-flex w-full items-center justify-center rounded-sm border border-aqua/40 bg-aqua/[0.08] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aqua transition-colors hover:border-aqua/60 hover:bg-aqua/[0.12]"
        >
          {ctaLabel}
        </Link>
      </div>
    </Card>
  );
}
