import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { EventSimulationView } from "@/services/simulation/simulation-view-service";

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatProbability(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "N/A";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function getTone(score: number) {
  if (score >= 70) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "brand" as const;
}

function getSimulationScore(simulation: EventSimulationView) {
  const eventGap = Math.max(
    ...simulation.eventBetComparisons.map((comparison) => Math.abs(comparison.delta)),
    0
  );
  const propGap = Math.max(
    ...simulation.topPlayerEdges.map((edge) => Math.abs(edge.contextualEdgeScore)),
    0
  );

  return Math.max(0, Math.min(100, Math.round(eventGap * 14 + propGap * 1.4)));
}

type Props = {
  simulation: EventSimulationView;
  title?: string;
  subtitle?: string;
  href?: string | null;
  ctaLabel?: string;
};

export function SimulationSpotlightCard({
  simulation,
  title = "Sim engine spotlight",
  subtitle = "Model deck",
  href = null,
  ctaLabel = "Open simulation"
}: Props) {
  const summary = simulation.projectionSummary;

  if (!summary) {
    return null;
  }

  const score = getSimulationScore(simulation);
  const topEdges = simulation.topPlayerEdges.slice(0, 2);
  const topComparisons = simulation.eventBetComparisons.slice(0, 2);
  const leadBookCallout = simulation.bookMarketState?.gameMarkets.find((market) => market.bestBookCallout) ?? null;

  return (
    <Card className="surface-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="section-kicker">{subtitle}</div>
          <div className="mt-2 text-[1.2rem] font-semibold text-white">{title}</div>
          <div className="mt-2 text-sm leading-6 text-slate-400">
            {summary.headline}
          </div>
        </div>
        <SharkScoreRing score={score} size="sm" tone={getTone(score)} />
      </div>

      <div className="mt-4 rounded-[1.15rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
        {summary.leanSummary}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Projected total</div>
          <div className="mt-2 text-lg font-semibold text-white">{summary.projectedTotal.toFixed(1)}</div>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Home spread</div>
          <div className="mt-2 text-lg font-semibold text-white">{summary.projectedSpreadHome > 0 ? "+" : ""}{summary.projectedSpreadHome.toFixed(1)}</div>
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Home win</div>
          <div className="mt-2 text-lg font-semibold text-white">{formatProbability(summary.winProbHome)}</div>
        </div>
      </div>

      {topComparisons.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {topComparisons.map((comparison) => (
            <div key={comparison.marketType} className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3">
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <span>{comparison.marketType === "spread_home" ? "Spread" : "Total"}</span>
                <Badge tone={Math.abs(comparison.delta) >= 2 ? "success" : Math.abs(comparison.delta) >= 1 ? "brand" : "muted"}>
                  Gap {formatDelta(comparison.delta)}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-300">
                <span>Sim {comparison.projected}</span>
                <span>Market {comparison.marketLine}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {topEdges.length ? (
        <div className="mt-4 grid gap-3">
          {topEdges.map((edge) => (
            <div key={`${edge.playerId}:${edge.statKey}:${edge.marketLine}`} className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{edge.statKey.replace(/_/g, " ")}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{edge.playerName}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">
                    Mean {edge.projectedMean} · Median {edge.projectedMedian} · Line {edge.marketLine}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge tone={edge.suggestedSide === "OVER" ? "success" : edge.suggestedSide === "UNDER" ? "brand" : "muted"}>
                    {edge.suggestedSide}
                  </Badge>
                  <Badge tone={Math.abs(edge.contextualEdgeScore) >= 8 ? "success" : Math.abs(edge.contextualEdgeScore) >= 4 ? "brand" : "muted"}>
                    Edge {edge.contextualEdgeScore > 0 ? "+" : ""}{edge.contextualEdgeScore.toFixed(1)}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {leadBookCallout ? (
        <div className="mt-4 rounded-[1rem] border border-emerald-400/20 bg-emerald-500/6 px-4 py-3 text-sm leading-6 text-emerald-50">
          <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/80">Best book callout</div>
          <div className="mt-2">{leadBookCallout.bestBookCallout}</div>
        </div>
      ) : null}

      {href ? (
        <div className="mt-4">
          <Link
            href={href}
            className="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
          >
            {ctaLabel}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
