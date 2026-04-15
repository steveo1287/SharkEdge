import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PerformanceDashboardView } from "@/lib/types/ledger";

function formatSignedPercent(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatSignedUnits(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}u`;
}

function getReviewTone(
  label:
    | "GOOD_BET_LOST"
    | "BAD_BET_WON"
    | "BEAT_CLOSE"
    | "MISSED_TIMING"
    | "STALE_EDGE_MISTAKE"
    | "FAKE_MOVE_CHASE"
) {
  if (label === "BEAT_CLOSE") {
    return "success" as const;
  }

  if (label === "BAD_BET_WON" || label === "STALE_EDGE_MISTAKE" || label === "FAKE_MOVE_CHASE") {
    return "danger" as const;
  }

  return "premium" as const;
}

function getReviewLabel(
  label:
    | "GOOD_BET_LOST"
    | "BAD_BET_WON"
    | "BEAT_CLOSE"
    | "MISSED_TIMING"
    | "STALE_EDGE_MISTAKE"
    | "FAKE_MOVE_CHASE"
) {
  switch (label) {
    case "GOOD_BET_LOST":
      return "Good bets lost";
    case "BAD_BET_WON":
      return "Bad bets won";
    case "BEAT_CLOSE":
      return "Beat close";
    case "MISSED_TIMING":
      return "Missed timing";
    case "STALE_EDGE_MISTAKE":
      return "Stale-edge mistakes";
    case "FAKE_MOVE_CHASE":
      return "Fake-move chase";
    default:
      return label;
  }
}

export function HomePerformanceRail({
  performanceData
}: {
  performanceData: PerformanceDashboardView | null;
}) {
  if (performanceData === null) {
    return (
      <Card className="surface-panel p-6">
        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
          Form rail
        </div>
        <div className="mt-3 text-2xl font-semibold text-white">
          Trend tape unavailable
        </div>
        <div className="mt-3 text-sm leading-7 text-slate-400">
          The homepage stayed live even though the performance dashboard did not resolve in time.
        </div>
        <div className="mt-5">
          <Link
            href="/performance"
            className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
          >
            Open performance
          </Link>
        </div>
      </Card>
    );
  }

  if (performanceData.setup) {
    return (
      <Card className="surface-panel p-6">
        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-rose-300">
          Form rail blocked
        </div>
        <div className="mt-3 text-2xl font-semibold text-white">
          Ledger setup still needs wiring
        </div>
        <div className="mt-3 text-sm leading-7 text-slate-400">
          Recent-form and process-review panels stay honest until the ledger is fully live.
        </div>
        <div className="mt-4 grid gap-2">
          {performanceData.setup.steps.slice(0, 3).map((step) => (
            <div
              key={step}
              className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3 text-sm text-slate-300"
            >
              {step}
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const trend = performanceData.trend.slice(-8);
  const recentForm = performanceData.recentForm.slice(0, 3);
  const processReviews = performanceData.opportunityReviews
    .filter((review) => review.value > 0)
    .slice(0, 3);

  const maxAbsUnits = Math.max(
    1,
    ...trend.map((point) => Math.abs(point.units))
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <Card className="surface-panel p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Trend tape
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge
              tone={
                typeof performanceData.summary.averageClv === "number" &&
                performanceData.summary.averageClv >= 0
                  ? "success"
                  : "premium"
              }
            >
              Avg CLV {formatSignedPercent(performanceData.summary.averageClv)}
            </Badge>
            <Badge tone="brand">
              Beat close {formatSignedPercent(performanceData.summary.positiveClvRate, 0)}
            </Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <div className="text-sm font-medium text-white">
              Rolling units
            </div>
            <div className="rounded-[1.2rem] border border-white/8 bg-slate-950/65 px-4 py-5">
              {trend.length ? (
                <div className="grid gap-4">
                  <div className="flex h-44 items-end gap-2">
                    {trend.map((point) => {
                      const height = Math.max(
                        12,
                        Math.round((Math.abs(point.units) / maxAbsUnits) * 120)
                      );

                      return (
                        <div
                          key={`${point.label}-${point.units}`}
                          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                        >
                          <div
                            className={
                              point.units >= 0
                                ? "w-full rounded-t-md bg-emerald-400/80"
                                : "w-full rounded-t-md bg-rose-400/80"
                            }
                            style={{ height: `${height}px` }}
                          />
                          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                            {point.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                    <span>Net: {formatSignedUnits(performanceData.summary.netUnits)}</span>
                    <span>ROI: {formatSignedPercent(performanceData.summary.roi)}</span>
                    <span>Settled: {performanceData.summary.settledBets}</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm leading-7 text-slate-400">
                  Trend points have not populated yet.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              <span className="font-medium text-white">Best segment: </span>
              {performanceData.bestSegments[0] ??
                "No segment has separated from the pack yet."}
            </div>
            <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
              <span className="font-medium text-white">Weak spot: </span>
              {performanceData.worstSegments[0] ??
                "Weak spots stay blank until there is enough truth."}
            </div>
          </div>
        </div>
      </Card>

      <Card className="surface-panel p-5">
        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
          Recent form + process review
        </div>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-3">
            {recentForm.length ? (
              recentForm.map((slice) => (
                <div
                  key={slice.label}
                  className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">
                      {slice.label}
                    </div>
                    <div className="text-sm font-semibold text-sky-300">
                      {formatSignedUnits(slice.units)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    Record {slice.record}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                Recent-form snapshots will appear here once enough settled bets exist.
              </div>
            )}
          </div>

          <div className="grid gap-3">
            {processReviews.length ? (
              processReviews.map((review) => (
                <div
                  key={review.label}
                  className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">
                      {getReviewLabel(review.label)}
                    </div>
                    <Badge tone={getReviewTone(review.label)}>
                      {review.value}
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    {review.note}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                No major process-review counts are surfacing yet.
              </div>
            )}
          </div>

          <div className="pt-1">
            <Link
              href="/performance"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
            >
              Open full performance desk
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}