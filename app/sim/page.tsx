import Link from "next/link";

import { getSimBoardFeed } from "@/services/sim/sim-board-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimBoardData = Awaited<ReturnType<typeof getSimBoardFeed>>;
type SimEvent = SimBoardData["events"][number];
type SimSignal = SimEvent["topSignals"][number];

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

function formatSignedNumber(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") {
    return "—";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatWinProbability(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
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

function getProjectionMeta(projection: SimEvent["projection"]) {
  if (!projection?.metadataJson || typeof projection.metadataJson !== "object" || Array.isArray(projection.metadataJson)) {
    return null;
  }

  return projection.metadataJson as Record<string, unknown>;
}

function getProjectionSummaryRows(event: SimEvent) {
  const projection = event.projection;
  const meta = getProjectionMeta(projection);

  return [
    {
      label: "Home win",
      value: formatWinProbability(projection?.winProbHome),
      note: typeof projection?.winProbAway === "number" ? `Away ${formatWinProbability(projection.winProbAway)}` : null
    },
    {
      label: "Spread",
      value: formatSignedNumber(projection?.projectedSpreadHome, 1),
      note: "Home projection"
    },
    {
      label: "Total",
      value: typeof projection?.projectedTotal === "number" ? projection.projectedTotal.toFixed(1) : "—",
      note: "Projected combined score"
    },
    {
      label: "Score",
      value:
        typeof projection?.projectedAwayScore === "number" && typeof projection?.projectedHomeScore === "number"
          ? `${projection.projectedAwayScore.toFixed(1)} - ${projection.projectedHomeScore.toFixed(1)}`
          : "—",
      note: "Away - Home"
    },
    {
      label: "Confidence",
      value: typeof meta?.confidenceScore === "number" ? String(Math.round(meta.confidenceScore)) : "—",
      note: typeof meta?.confidenceLabel === "string" ? meta.confidenceLabel : null
    },
    {
      label: "Uncertainty",
      value: typeof meta?.uncertaintyScore === "number" ? String(Math.round(meta.uncertaintyScore)) : "—",
      note: Array.isArray(meta?.projectionBand)
        ? `Band ${meta?.projectionBand?.map((value) => (typeof value === "number" ? value.toFixed(1) : String(value))).join(" to ")}`
        : null
    }
  ];
}

function getSignalLabel(signal: SimSignal) {
  const subject = signal.selectionCompetitor?.name ?? signal.player?.name ?? signal.side ?? "Market";
  return `${signal.marketType} · ${subject}`;
}

function getSignalNote(signal: SimSignal) {
  const parts = [
    signal.sportsbook?.name ?? null,
    signal.side ?? null
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(" · ") : null;
}

export default async function SimPage() {
  const data = await getSimBoardFeed();

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
            {data.events.map((event: SimEvent) => {
              const projectionRows = getProjectionSummaryRows(event);

              return (
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
                      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-bone/60">Projection summary</p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {projectionRows.map((row) => (
                          <div key={row.label} className="rounded-lg border border-bone/[0.06] bg-ink/50 p-3">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-bone/45">{row.label}</p>
                            <p className="mt-2 font-mono text-[18px] text-text-primary">{row.value}</p>
                            {row.note ? <p className="mt-2 text-[11px] leading-5 text-bone/55">{row.note}</p> : null}
                          </div>
                        ))}
                      </div>
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
                        {event.topSignals.map((signal: SimSignal, idx: number) => (
                          <div
                            key={`${event.id}:${idx}:${signal.marketType}`}
                            className="rounded border border-bone/[0.06] bg-ink/50 p-3 text-[11px]"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-bone/75">
                                  <span className="font-semibold text-aqua">{getSignalLabel(signal)}</span>
                                </p>
                                {getSignalNote(signal) ? (
                                  <p className="mt-1 text-bone/45">{getSignalNote(signal)}</p>
                                ) : null}
                              </div>
                              <div className="text-right text-bone/55">
                                <div>Score {formatScore(signal.edgeScore)}</div>
                                <div>EV {formatPercent(signal.evPercent)}</div>
                              </div>
                            </div>
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
