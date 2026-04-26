import Link from "next/link";

import { withTimeoutFallback } from "@/lib/utils/async";
import { getSimBoardFeed, type SimBoardFeed } from "@/services/sim/sim-board-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return value.toFixed(2);
}

function recommendationTone(value: string) {
  switch (value) {
    case "ATTACK":
      return "border-aqua/20 bg-aqua/[0.05] text-aqua";
    case "WATCH":
      return "border-amber-500/20 bg-amber-500/[0.05] text-amber-500";
    case "BUILDING":
      return "border-bone/[0.08] text-bone/55";
    default:
      return "border-red-500/20 bg-red-500/[0.05] text-red-400";
  }
}

export default async function SimPage() {
  const fallbackData: SimBoardFeed = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: 0,
      projectedEvents: 0,
      signalEvents: 0,
      marketReadyEvents: 0,
      attackableEvents: 0
    },
    events: [],
    setup: {
      status: "degraded",
      title: "Simulator timed out",
      detail: "Live simulator query took too long and was short-circuited for page stability.",
      steps: [
        "Verify database latency and connection pool health.",
        "Re-run workers to refresh current-market-state and edge signals."
      ]
    }
  };

  let data: SimBoardFeed = fallbackData;
  try {
    data = await withTimeoutFallback(getSimBoardFeed(), {
      timeoutMs: 4500,
      fallback: fallbackData
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    data = {
      ...fallbackData,
      setup: {
        status: "degraded",
        title: "Simulator failed to load",
        detail: message,
        steps: [
          "Check database connectivity and migration state.",
          "Check simulator query logs for failing relation/column lookups."
        ]
      }
    };
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            Simulation Board
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {data.setup?.status !== "ready" ? (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-amber-500">
              {data.setup?.title ?? "Simulator degraded"}
            </p>
            {data.setup?.detail ? (
              <p className="mt-2 text-[12px] text-amber-200/80">{data.setup.detail}</p>
            ) : null}
            {Array.isArray(data.setup?.steps) && data.setup.steps.length > 0 ? (
              <div className="mt-2 space-y-1 text-[12px] text-amber-200/80">
                {data.setup.steps.map((step: string, idx: number) => (
                  <p key={idx}>{step}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Events</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{data.summary.totalEvents}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Projection Ready</p>
            <p className="mt-2 font-mono text-[24px] text-aqua">{data.summary.projectedEvents}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Signal Ready</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{data.summary.signalEvents}</p>
          </div>
          <div className="rounded-xl border border-bone/[0.07] bg-surface p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-bone/45">Market Ready</p>
            <p className="mt-2 font-mono text-[24px] text-text-primary">{data.summary.marketReadyEvents}</p>
          </div>
          <div className="rounded-xl border border-aqua/20 bg-aqua/[0.04] p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-aqua/80">Attackable</p>
            <p className="mt-2 font-mono text-[24px] text-aqua">{data.summary.attackableEvents}</p>
          </div>
        </div>

        {data.events.length === 0 ? (
          <div className="rounded-2xl border border-bone/[0.07] bg-surface px-6 py-12 text-center">
            <p className="text-[14px] font-semibold text-bone/70">No events available</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {data.events.map((event) => (
              <div
                key={event.id}
                className="rounded-xl border border-bone/[0.07] bg-surface p-6"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[16px] font-semibold text-text-primary">
                      {event.name}
                    </h2>
                    <p className="text-[13px] text-bone/50">
                      {event.league} • {new Date(event.startTime).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${recommendationTone(event.diagnostics.recommendation)}`}>
                      {event.diagnostics.recommendation}
                    </span>
                    <span className="rounded-full border border-bone/[0.08] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-bone/55">
                      {event.diagnostics.confidenceBand} Confidence
                    </span>
                    <span className="rounded-full border border-bone/[0.08] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-bone/55">
                      {event.diagnostics.signalCount} Signals
                    </span>
                    <span className="rounded-full border border-aqua/20 bg-aqua/[0.05] px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-aqua">
                      Smart Score {formatScore(event.diagnostics.smartScore)}
                    </span>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Best Edge</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">
                      {formatScore(event.diagnostics.bestEdgeScore)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Best EV</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">
                      {formatPercent(event.diagnostics.bestEvPercent)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Markets</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">
                      {event.diagnostics.marketCount}
                    </p>
                  </div>
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-bone/45">Projection</p>
                    <p className="mt-2 font-mono text-[18px] text-text-primary">
                      {event.diagnostics.hasProjection ? "READY" : "PENDING"}
                    </p>
                  </div>
                </div>

                {event.projection ? (
                  <div className="mb-4 rounded-lg bg-ink/30 p-3">
                    <p className="mb-2 text-[12px] font-semibold text-bone/70">Projection</p>
                    <pre className="overflow-x-auto text-[11px] text-bone/60">
                      {JSON.stringify(event.projection, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="mb-4 rounded-lg bg-amber-500/[0.08] p-3 text-[12px] text-amber-500">
                    Simulation not available yet for this matchup
                  </div>
                )}

                {event.topSignals.length > 0 && (
                  <div className="rounded-lg bg-ink/30 p-3">
                    <p className="mb-2 text-[12px] font-semibold text-bone/70">Top Edge Signals</p>
                    <div className="space-y-2">
                      {event.topSignals.map((signal: any, idx: number) => (
                        <div
                          key={idx}
                          className="rounded border border-bone/[0.06] bg-ink/50 p-2 text-[11px]"
                        >
                          <p className="text-bone/70">
                            <span className="font-semibold text-aqua">{signal.marketType}</span>
                            {signal.selectionCompetitor && (
                              <span className="text-bone/60">
                                {" "}
                                on {signal.selectionCompetitor.name}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-bone/50">
                            Score: {formatScore(signal.edgeScore)} • EV: {formatPercent(signal.evPercent)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {event.diagnostics.hasProjection ? (
                    <Link
                      href={`/game/${event.id}#simulation`}
                      className="inline-flex items-center rounded-lg border border-aqua/25 bg-aqua/[0.06] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-aqua transition-colors hover:border-aqua/40 hover:bg-aqua/[0.10]"
                    >
                      Open simulation
                    </Link>
                  ) : null}
                  <Link
                    href={`/game/${event.id}`}
                    className="inline-flex items-center rounded-lg border border-bone/[0.08] px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-bone/70 transition-colors hover:border-bone/[0.16] hover:text-white"
                  >
                    Open matchup
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
