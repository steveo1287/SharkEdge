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

function record(wins: number, losses: number, pushes = 0) {
  return pushes > 0 ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}

function scoreTone(value: number | null, good: number, ok: number) {
  if (value == null) return "muted" as const;
  if (value <= good) return "success" as const;
  if (value <= ok) return "premium" as const;
  return "danger" as const;
}

function recordTone(winPct: number | null) {
  if (winPct == null) return "muted" as const;
  if (winPct >= 0.55) return "success" as const;
  if (winPct >= 0.5) return "premium" as const;
  return "danger" as const;
}

function resultTone(result: "win" | "loss" | "push" | "pending") {
  if (result === "win") return "success" as const;
  if (result === "loss") return "danger" as const;
  if (result === "push") return "premium" as const;
  return "muted" as const;
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
  const last7 = summary.history.find((window) => window.key === "last7") ?? null;
  const last15 = summary.history.find((window) => window.key === "last15") ?? null;
  const allTime = summary.history.find((window) => window.key === "allTime") ?? null;

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
        eyebrow="Sim Performance"
        title="SharkEdge model record, history, and calibration command center."
        description="The sim record is now surfaced first: W-L-P, win rate, 7-day, 15-day, all-time windows, league health, and every graded pick trail."
        actions={[
          { href: "/sim", label: "Sim Hub" },
          { href: "/api/sim/accuracy?action=run", label: "Run Job", tone: "primary" },
          { href: "/api/sim/accuracy", label: "API JSON" }
        ]}
      />

      <section className="relative overflow-hidden rounded-[2rem] border border-sky-300/20 bg-slate-950/90 p-5 shadow-[0_24px_100px_rgba(56,189,248,0.14)] md:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(74,227,181,0.12),transparent_34%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
        <div className="relative grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={recordTone(allTime?.winPct ?? null)}>Live sim record</Badge>
              <Badge tone={scoreTone(allTime?.brier ?? null, 0.2, 0.25)}>Brier {num(allTime?.brier ?? null)}</Badge>
              <Badge tone="muted">{summary.gradedSnapshots} graded picks</Badge>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-sky-200/75">All-time straight-up model picks</div>
              <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:gap-6">
                <div className="font-mono text-6xl font-black tracking-[-0.08em] text-white md:text-8xl">
                  {allTime ? record(allTime.wins, allTime.losses, allTime.pushes) : "--"}
                </div>
                <div className="pb-2">
                  <div className="font-mono text-3xl font-bold text-mint md:text-4xl">{allTime ? pct(allTime.winPct, 1) : "--"}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">Win rate, pushes excluded</div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Snapshots</div>
                <div className="mt-2 font-mono text-2xl font-bold text-white">{summary.totalSnapshots}</div>
                <div className="mt-1 text-xs text-slate-400">Captured outputs</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Graded</div>
                <div className="mt-2 font-mono text-2xl font-bold text-white">{summary.gradedSnapshots}</div>
                <div className="mt-1 text-xs text-slate-400">Final attached</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pending</div>
                <div className="mt-2 font-mono text-2xl font-bold text-white">{summary.ungradedSnapshots}</div>
                <div className="mt-1 text-xs text-slate-400">Awaiting result</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Leagues</div>
                <div className="mt-2 font-mono text-2xl font-bold text-white">{summary.byLeague.length}</div>
                <div className="mt-1 text-xs text-slate-400">Tracked models</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {[last7, last15, allTime].filter(Boolean).map((window) => (
              <div key={window!.key} className="rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{window!.label}</div>
                    <div className="mt-2 font-mono text-3xl font-black tracking-[-0.04em] text-white">{record(window!.wins, window!.losses, window!.pushes)}</div>
                    <div className="mt-1 text-xs text-slate-400">{window!.graded} graded · {window!.snapshots} snapshots</div>
                  </div>
                  <Badge tone={recordTone(window!.winPct)}>{pct(window!.winPct, 1)}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="text-slate-500">Brier</div>
                    <div className="mt-1 font-mono font-semibold text-slate-100">{num(window!.brier)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="text-slate-500">Log loss</div>
                    <div className="mt-1 font-mono font-semibold text-slate-100">{num(window!.logLoss)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <div className="text-slate-500">Total MAE</div>
                    <div className="mt-1 font-mono font-semibold text-slate-100">{num(window!.totalMae, 2)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {summary.byLeague.map((league) => (
          <SimSignalCard key={league.league}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{league.league} model health</div>
                <div className="mt-2 text-2xl font-semibold text-white">{record(league.wins, league.losses, league.pushes)}</div>
                <div className="mt-1 text-xs text-slate-400">{league.graded} graded · {league.snapshots} snapshots · avg confidence {pct(league.avgConfidence, 0)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={recordTone(league.winPct)}>Record {pct(league.winPct, 1)}</Badge>
                <Badge tone={scoreTone(league.brier, 0.2, 0.25)}>Brier {num(league.brier)}</Badge>
              </div>
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

      <SimTableShell title="Recent prediction snapshots" description="Latest captured and graded model outputs with the sim side, W/L result, and calibration errors.">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Game</th><th className="px-3 py-2">League</th><th className="px-3 py-2 text-right">Captured</th><th className="px-3 py-2 text-right">Pick</th><th className="px-3 py-2 text-right">Result</th><th className="px-3 py-2 text-right">Home win%</th><th className="px-3 py-2 text-right">Final</th><th className="px-3 py-2 text-right">Brier</th><th className="px-3 py-2 text-right">Spread err</th><th className="px-3 py-2 text-right">Total err</th></tr></thead>
          <tbody>
            {summary.recent.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel}</div><div className="mt-1 text-[10px] text-slate-500">{row.status} · {row.tier ?? "tier pending"}</div></td>
                <td className="px-3 py-3 text-slate-300">{row.league}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{formatDate(row.capturedAt)}</td>
                <td className="px-3 py-3 text-right"><div className="font-semibold text-white">{row.modelPickLabel}</div><div className="mt-1 font-mono text-[10px] text-slate-500">{row.modelPick}</div></td>
                <td className="px-3 py-3 text-right"><Badge tone={resultTone(row.pickResult)}>{row.pickResult}</Badge></td>
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
