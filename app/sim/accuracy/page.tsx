import Link from "next/link";

import {
  SimMetricTile,
  SimSignalCard,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getSimAccuracySummary } from "@/services/simulation/sim-accuracy-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function scoreTone(value: number | null, good: number, ok: number) {
  if (value == null) return "muted" as const;
  if (value <= good) return "success" as const;
  if (value <= ok) return "premium" as const;
  return "danger" as const;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export default async function SimAccuracyPage() {
  const summary = await getSimAccuracySummary(30);

  if (!summary.ok) {
    return (
      <div className="space-y-6">
        <SimWorkspaceHeader
          eyebrow="Sim Accuracy"
          title="Accuracy ledger is not ready."
          description={summary.error ?? "The database-backed ledger could not initialize. Add DATABASE_URL/POSTGRES_PRISMA_URL and rerun the capture job."}
          actions={[{ href: "/sim", label: "Sim Hub" }]}
        />
        <EmptyState title="No accuracy database available" description="Set the database URL in the runtime environment, then call /api/sim/accuracy?action=run to create the table, capture snapshots, and grade finals." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="Sim Accuracy"
        title="Prediction ledger, grading, and calibration health."
        description="This page shows whether SharkEdge probabilities and projected scores are earning trust. Snapshots are captured before games, then graded when final scores are available."
        actions={[
          { href: "/sim", label: "Sim Hub" },
          { href: "/api/sim/accuracy?action=run", label: "Run Job", tone: "primary" },
          { href: "/api/sim/accuracy", label: "API JSON" }
        ]}
      />

      <section className="grid gap-3 md:grid-cols-4">
        <SimMetricTile label="Snapshots" value={String(summary.totalSnapshots)} sub="Captured model outputs" />
        <SimMetricTile label="Graded" value={String(summary.gradedSnapshots)} sub="Final score attached" emphasis="strong" />
        <SimMetricTile label="Pending" value={String(summary.ungradedSnapshots)} sub="Awaiting final score" />
        <SimMetricTile label="Leagues" value={String(summary.byLeague.length)} sub="Tracked models" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {summary.byLeague.map((league) => (
          <SimSignalCard key={league.league}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{league.league} model health</div>
                <div className="mt-2 text-2xl font-semibold text-white">{league.snapshots} snapshots</div>
                <div className="mt-1 text-xs text-slate-400">{league.graded} graded · avg confidence {pct(league.avgConfidence, 0)}</div>
              </div>
              <Badge tone={scoreTone(league.brier, 0.2, 0.25)}>Brier {num(league.brier)}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <SimMetricTile label="Brier" value={num(league.brier)} sub="Lower is better" emphasis={league.brier != null && league.brier <= 0.2 ? "strong" : "normal"} />
              <SimMetricTile label="Log loss" value={num(league.logLoss)} sub="Prob. penalty" />
              <SimMetricTile label="Spread MAE" value={num(league.spreadMae, 2)} sub="Score margin miss" />
              <SimMetricTile label="Total MAE" value={num(league.totalMae, 2)} sub="Total miss" />
            </div>
            {league.calibrationBuckets.length ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Bucket</th><th className="px-3 py-2 text-right">Count</th><th className="px-3 py-2 text-right">Pred.</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Brier</th></tr></thead>
                  <tbody>{league.calibrationBuckets.map((bucket) => <tr key={`${league.league}:${bucket.bucket}`} className="border-b border-white/5 last:border-none"><td className="px-3 py-2 text-slate-200">{bucket.bucket}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{bucket.count}</td><td className="px-3 py-2 text-right font-mono text-sky-200">{pct(bucket.avgPredicted)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{pct(bucket.actualRate)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(bucket.brier)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-xs text-slate-400">No graded calibration buckets yet. Run capture before games and grade after finals.</div>
            )}
          </SimSignalCard>
        ))}
      </section>

      <SimTableShell title="Recent prediction snapshots" description="Latest captured and graded model outputs.">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Game</th><th className="px-3 py-2">League</th><th className="px-3 py-2 text-right">Captured</th><th className="px-3 py-2 text-right">Home win%</th><th className="px-3 py-2 text-right">Final</th><th className="px-3 py-2 text-right">Brier</th><th className="px-3 py-2 text-right">Spread err</th><th className="px-3 py-2 text-right">Total err</th></tr></thead>
          <tbody>
            {summary.recent.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel}</div><div className="mt-1 text-[10px] text-slate-500">{row.status} · {row.tier ?? "tier pending"}</div></td>
                <td className="px-3 py-3 text-slate-300">{row.league}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{formatDate(row.capturedAt)}</td>
                <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.modelHomeWinPct)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{row.finalAwayScore == null || row.finalHomeScore == null ? "--" : `${row.finalAwayScore}-${row.finalHomeScore}`}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.brier)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.spreadError, 2)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.totalError, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SimTableShell>

      <SimSignalCard>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Operational use</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Call capture before games and grade after finals. On Vercel, point a cron to /api/cron/sim-accuracy. Use CRON_SECRET for authorization if exposed publicly.</div>
          </div>
          <Link href="/api/cron/sim-accuracy" className="rounded-full border border-sky-400/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">Cron endpoint</Link>
        </div>
      </SimSignalCard>
    </div>
  );
}
