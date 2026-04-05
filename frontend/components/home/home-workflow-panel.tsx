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

function getLeakTone(severity: "danger" | "premium" | "muted") {
  if (severity === "danger") {
    return "danger" as const;
  }

  if (severity === "premium") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function HomeWorkflowPanel({
  performanceData
}: {
  performanceData: PerformanceDashboardView | null;
}) {
  if (performanceData === null) {
    return (
      <Card className="surface-panel p-6">
        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
          Performance feed
        </div>
        <div className="mt-3 text-2xl font-semibold text-white">
          Workflow summary unavailable
        </div>
        <div className="mt-3 text-sm leading-7 text-slate-400">
          The homepage could not pull the performance dashboard fast enough on this render. The market desk stays live instead of blocking the whole page.
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/performance"
            className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
          >
            Open performance
          </Link>
          <Link
            href="/bets"
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
          >
            Open bets
          </Link>
        </div>
      </Card>
    );
  }

  if (performanceData.setup) {
    return (
      <Card className="surface-panel p-6">
        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-rose-300">
          Ledger blocked
        </div>
        <div className="mt-3 text-2xl font-semibold text-white">
          Performance is not wired cleanly yet
        </div>
        <div className="mt-3 text-sm leading-7 text-slate-400">
          {performanceData.setup.detail ??
            "The ledger stack is still blocked, so the homepage is staying honest instead of inventing win rates or fake CLV."}
        </div>
        <div className="mt-4 grid gap-2">
          {(performanceData.setup.steps ?? []).slice(0, 3).map((step) => (
            <div
              key={step}
              className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3 text-sm text-slate-300"
            >
              {step}
            </div>
          ))}
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

  const summary = performanceData.summary;
  const clvInsights = performanceData.clvInsights.slice(0, 4);
  const leakSignals = performanceData.leakSignals.slice(0, 3);

  return (
    <Card className="surface-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
          Tracked ledger
        </div>
        <Badge tone="success">{summary.record ?? "0-0-0"}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Open bets
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {summary.openBets ?? 0}
          </div>
        </div>
        <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Net units
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {formatSignedUnits(summary.netUnits)}
          </div>
        </div>
        <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            ROI
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {formatSignedPercent(summary.roi)}
          </div>
        </div>
        <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Avg CLV
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {formatSignedPercent(summary.averageClv)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          <span className="font-medium text-white">Best segment: </span>
          {performanceData.bestSegments[0] ??
            "Not enough settled history yet to separate a real strength."}
        </div>
        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          <span className="font-medium text-white">Weak spot: </span>
          {performanceData.worstSegments[0] ??
            "Weak spots stay blank until the ledger has enough truth."}
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            CLV insight
          </div>
          <div className="mt-3 grid gap-3">
            {clvInsights.length ? (
              clvInsights.map((insight) => (
                <div
                  key={`${insight.label}-${insight.value}`}
                  className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">
                      {insight.label}
                    </div>
                    <div className="text-sm font-semibold text-sky-300">
                      {insight.value}
                    </div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    {insight.note}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                CLV insights will appear here once enough tracked price history exists.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Leak detector
          </div>
          <div className="mt-3 grid gap-3">
            {leakSignals.length ? (
              leakSignals.map((signal) => (
                <div
                  key={signal.id}
                  className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-white">
                      {signal.title}
                    </div>
                    <Badge tone={getLeakTone(signal.severity)}>
                      {signal.sampleSize} sample
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    {signal.detail}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                No major workflow leak is surfacing above threshold right now.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/bets"
          className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
        >
          Open bets
        </Link>
        <Link
          href="/performance"
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
        >
          Open performance
        </Link>
      </div>
    </Card>
  );
}