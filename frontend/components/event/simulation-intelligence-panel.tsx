import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { EventSimulationView } from "@/services/simulation/simulation-view-service";
import { SimulationWorkbench } from "@/components/event/simulation-workbench";

type Props = {
  simulation: EventSimulationView;
};

function formatProbability(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function getComparisonLabel(marketType: string) {
  if (marketType === "spread_home") {
    return "Spread";
  }
  if (marketType === "total") {
    return "Total";
  }
  return marketType.replace(/_/g, " ");
}

function getDeltaTone(delta: number) {
  if (Math.abs(delta) >= 2.5) return "success" as const;
  if (Math.abs(delta) >= 1) return "brand" as const;
  return "muted" as const;
}

function getEdgeTone(edge: number) {
  if (Math.abs(edge) >= 12) return "success" as const;
  if (Math.abs(edge) >= 6) return "brand" as const;
  return "muted" as const;
}

export function SimulationIntelligencePanel({ simulation }: Props) {
  const summary = simulation.projectionSummary;

  if (!summary) {
    return null;
  }

  const driverBuckets = [
    {
      title: "Game drivers",
      items: simulation.simulationDrivers.gameDrivers
    },
    {
      title: "Style and coach",
      items: [...simulation.simulationDrivers.homeStyleNotes, ...simulation.simulationDrivers.awayStyleNotes, ...simulation.simulationDrivers.coachSignals].slice(0, 5)
    },
    {
      title: "Intangibles and weather",
      items: [
        ...(simulation.simulationDrivers.weatherNote ? [simulation.simulationDrivers.weatherNote] : []),
        ...simulation.simulationDrivers.intangibleSignals
      ].slice(0, 5)
    }
  ].filter((bucket) => bucket.items.length > 0);

  return (
    <section id="simulation" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="mobile-section-eyebrow">Simulation</div>
          <div className="mt-1 text-[1.35rem] font-semibold text-white">Sim engine view</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {simulation.simulationDrivers.sourceSummary.map((item) => (
            <Badge key={item} tone="muted">
              {item}
            </Badge>
          ))}
        </div>
      </div>

      <Card className="surface-panel p-4 sm:p-5">
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[0.72rem] uppercase tracking-[0.18em] text-slate-500">
                Projected scoreline
              </div>
              <div className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                {summary.headline}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {summary.leanSummary}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Total</div>
                <div className="mt-2 text-lg font-semibold text-white">{summary.projectedTotal.toFixed(1)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Spread home</div>
                <div className="mt-2 text-lg font-semibold text-white">{summary.projectedSpreadHome > 0 ? "+" : ""}{summary.projectedSpreadHome.toFixed(1)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Home win</div>
                <div className="mt-2 text-lg font-semibold text-white">{formatProbability(summary.winProbHome)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Prop sims</div>
                <div className="mt-2 text-lg font-semibold text-white">{simulation.playerProjectionCount}</div>
              </div>
            </div>
          </div>

          {simulation.eventBetComparisons.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {simulation.eventBetComparisons.map((comparison) => (
                <div
                  key={comparison.marketType}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">
                      {getComparisonLabel(comparison.marketType)}
                    </div>
                    <Badge tone={getDeltaTone(comparison.delta)}>
                      Delta {formatDelta(comparison.delta)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Sim</div>
                      <div className="mt-1 font-semibold text-white">{comparison.projected}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Market</div>
                      <div className="mt-1 font-semibold text-white">{comparison.marketLine}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Gap</div>
                      <div className="mt-1 font-semibold text-white">{formatDelta(comparison.delta)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {driverBuckets.length ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {driverBuckets.map((bucket) => (
                <div key={bucket.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    {bucket.title}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                    {bucket.items.map((item) => (
                      <div key={item} className="rounded-xl bg-white/[0.04] px-3 py-2">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[1.05rem] font-semibold text-white">Top player edges</div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                Sim vs market
              </div>
            </div>

            {simulation.topPlayerEdges.length ? (
              <div className="grid gap-3">
                {simulation.topPlayerEdges.map((edge) => (
                  <div
                    key={`${edge.playerId}:${edge.statKey}:${edge.marketLine}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-[0.72rem] uppercase tracking-[0.18em] text-slate-500">
                          {edge.statKey.replace(/_/g, " ")}
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white">
                          {edge.playerName}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-300">
                          Sim mean {edge.projectedMean} vs line {edge.marketLine} · median {edge.projectedMedian}
                        </div>
                        {edge.drivers.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {edge.drivers.map((driver) => (
                              <Badge key={driver} tone="muted">
                                {driver}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge tone={edge.suggestedSide === "NONE" ? "muted" : edge.suggestedSide === "OVER" ? "success" : "brand"}>
                          {edge.suggestedSide.toLowerCase()}
                        </Badge>
                        <Badge tone={getEdgeTone(edge.contextualEdgeScore)}>
                          Edge {edge.contextualEdgeScore > 0 ? "+" : ""}{edge.contextualEdgeScore.toFixed(1)}
                        </Badge>
                        {edge.overProbability != null ? (
                          <Badge tone="success">Over {formatProbability(edge.overProbability)}</Badge>
                        ) : null}
                        {edge.underProbability != null ? (
                          <Badge tone="brand">Under {formatProbability(edge.underProbability)}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-400">
                Player projection edges are not populated for this event yet.
              </div>
            )}
          </div>
        </div>
      </Card>

      <SimulationWorkbench simulation={simulation} />
    </section>
  );
}
