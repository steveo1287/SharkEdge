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

function getMlbCertaintyState(simulation: EventSimulationView) {
  const context = simulation.mlbSourceNativeContext;
  if (!context) {
    return null;
  }

  const lineupScore =
    (context.home.lineupCertainty === "HIGH" ? 12 : context.home.lineupCertainty === "MEDIUM" ? 8 : 4) +
    (context.away.lineupCertainty === "HIGH" ? 12 : context.away.lineupCertainty === "MEDIUM" ? 8 : 4);
  const starterScore = (context.home.starterConfidence + context.away.starterConfidence) * 0.2;
  const bullpenScore = (context.home.bullpenCoverage + context.away.bullpenCoverage) * 0.15;
  const score = lineupScore + starterScore + bullpenScore;

  if (score >= 42) {
    return { label: "HIGH certainty", tone: "success" as const };
  }
  if (score >= 30) {
    return { label: "MEDIUM certainty", tone: "brand" as const };
  }
  return { label: "LOW certainty", tone: "muted" as const };
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

  const mlbCertaintyState = getMlbCertaintyState(simulation);

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

          {simulation.bookMarketState ? (
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Book mesh</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {simulation.bookMarketState.summary.booksInMesh.length} books
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  {simulation.bookMarketState.summary.gameMarketCount} game markets · {simulation.bookMarketState.summary.playerMarketCount} player markets
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Outliers</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {simulation.bookMarketState.summary.outlierBookCount}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  Books currently hanging numbers away from consensus.
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Stale books</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {simulation.bookMarketState.summary.staleBookCount}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300">
                  Mesh entries older than the current median freshness band.
                </div>
              </div>
            </div>
          ) : null}

          {simulation.bookMarketState?.gameMarkets.some((market) => market.bestBookCallout) ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {simulation.bookMarketState.gameMarkets
                .filter((market) => market.bestBookCallout)
                .slice(0, 2)
                .map((market) => (
                  <div key={`callout:${market.marketType}`} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">Best book callout · {market.label}</div>
                      <Badge tone="brand">{market.simSide}</Badge>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-emerald-50">
                      {market.bestBookCallout}
                    </div>
                    {market.executionTriggers.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {market.executionTriggers.map((trigger) => (
                          <Badge key={`${market.marketType}:${trigger}`} tone="muted">
                            {trigger}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
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
            {simulation.mlbSourceNativeContext ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[1.05rem] font-semibold text-white">MLB source-native context</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="brand">
                      Coverage {simulation.mlbSourceNativeContext.sourceCoverageScore}
                    </Badge>
                    {mlbCertaintyState ? (
                      <Badge tone={mlbCertaintyState.tone}>{mlbCertaintyState.label}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Venue and run environment</div>
                    <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                      <div>
                        {simulation.mlbSourceNativeContext.venue.venueName ?? "Venue unknown"}
                        {simulation.mlbSourceNativeContext.venue.stationCode ? ` · ${simulation.mlbSourceNativeContext.venue.stationCode}` : ""}
                      </div>
                      <div>
                        Roof {simulation.mlbSourceNativeContext.venue.roofType ?? "UNKNOWN"} · wind {simulation.mlbSourceNativeContext.venue.windSensitivity ?? "UNKNOWN"}
                      </div>
                      {simulation.mlbSourceNativeContext.venue.altitudeFeet != null ? (
                        <div>Altitude {simulation.mlbSourceNativeContext.venue.altitudeFeet} ft</div>
                      ) : null}
                      {simulation.mlbSourceNativeContext.venue.parkFactor != null ? (
                        <div>Park factor {simulation.mlbSourceNativeContext.venue.parkFactor.toFixed(3)} · baseline run factor {simulation.mlbSourceNativeContext.venue.baselineRunFactor?.toFixed?.(3) ?? simulation.mlbSourceNativeContext.venue.baselineRunFactor}</div>
                      ) : null}
                    </div>
                  </div>

                  {[simulation.mlbSourceNativeContext.away, simulation.mlbSourceNativeContext.home].map((team) => (
                    <div key={team.abbreviation} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{team.abbreviation} lineup</div>
                        <Badge tone={team.lineupCertainty === "HIGH" ? "success" : team.lineupCertainty === "MEDIUM" ? "brand" : "muted"}>
                          {team.lineupCertainty} certainty
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                        <div>Strength {team.lineupStrength} · contact {team.lineupContactScore} · power {team.lineupPowerScore}</div>
                        {team.topBats.length ? <div>Top bats {team.topBats.join(", ")}</div> : null}
                      </div>
                    </div>
                  ))}

                  {[simulation.mlbSourceNativeContext.away, simulation.mlbSourceNativeContext.home].map((team) => (
                    <div key={`${team.abbreviation}:staff`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{team.abbreviation} staff</div>
                        <Badge tone={team.starterConfidence >= 70 ? "success" : team.starterConfidence >= 55 ? "brand" : "muted"}>
                          Starter {team.starterConfidence}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                        <div>Probable {team.starterName ?? "TBD"}</div>
                        <div>Bullpen freshness {team.bullpenFreshness} · coverage {team.bullpenCoverage}</div>
                        <div>Risk {team.bullpenRisk}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Re-simulation state</div>
                    <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                      <div>Current MLB number is being interpreted through lineup certainty, probable starter confidence, and bullpen availability.</div>
                      {mlbCertaintyState ? <div>Overall state: <span className="font-semibold text-white">{mlbCertaintyState.label}</span></div> : null}
                      <div>Use high-certainty states for stronger conviction. Use low-certainty states as watchlist conditions until more source-native context firms up.</div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Source summary</div>
                    <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                      {simulation.mlbSourceNativeContext.sourceSummary.map((item) => (
                        <div key={item} className="rounded-xl bg-white/[0.04] px-3 py-2">{item}</div>
                      ))}
                    </div>
                  </div>
                </div>

                {simulation.mlbSourceNativeContext.matchupFlags.length ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Matchup flags</div>
                    <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
                      {simulation.mlbSourceNativeContext.matchupFlags.map((item) => (
                        <div key={item} className="rounded-xl bg-white/[0.04] px-3 py-2">{item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

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
