import Link from "next/link";

import { buildGeneratedTrendControlPanel, type GeneratedTrendRunLogItem } from "@/services/trends/generated-trend-control-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseIntValue(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function fmtTime(value: string | null) {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function pct(value: number) {
  return `${value}%`;
}

function modeClass(run: GeneratedTrendRunLogItem) {
  if (!run.dryRun) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (run.readyCount > 0) return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function RunnerActions() {
  const dryRunHref = "/api/sharktrends/generated-runner/execute?mode=manual&dryRun=true&league=ALL&market=ALL&depth=core&limit=250&minSample=50&minRoiPct=0";
  const runnerHref = "/sharktrends/generated-runner";
  const auditHref = "/sharktrends/historical-audit";
  const verificationHref = "/sharktrends/verification";

  return (
    <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Runner controls</div>
      <div className="grid gap-3 md:grid-cols-4">
        <a href={dryRunHref} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Run dry-run now</a>
        <Link href={runnerHref} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Runner preview</Link>
        <Link href={auditHref} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Historical audit</Link>
        <Link href={verificationHref} className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Verification</Link>
      </div>
      <div className="mt-3 text-xs leading-5 text-slate-400">
        Write-mode runs stay protected by the execute endpoint. This panel provides a safe dry-run link and shows run logs from the generated trend runner.
      </div>
    </section>
  );
}

function RunCard({ run }: { run: GeneratedTrendRunLogItem }) {
  const readyPct = run.returnedCandidates ? Number(((run.readyCount / run.returnedCandidates) * 100).toFixed(1)) : 0;
  const persistedPct = run.returnedCandidates ? Number(((run.persistedCount / run.returnedCandidates) * 100).toFixed(1)) : 0;

  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{run.mode} · {run.status}</div>
          <div className="mt-2 text-lg font-semibold text-white">{fmtTime(run.createdAt)}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{run.league} · {run.market} · {run.depth} · limit {run.limitCount}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${modeClass(run)}`}>{run.dryRun ? "dry run" : "write run"}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-5">
        <span>Rows {run.rowsLoaded}</span>
        <span>Candidates {run.returnedCandidates}</span>
        <span>Ready {run.readyCount} ({pct(readyPct)})</span>
        <span>Persisted {run.persistedCount} ({pct(persistedPct)})</span>
        <span>Skipped {run.skippedCount}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Source</div>
          <div className="mt-2 text-sm font-semibold text-white">{run.sourceConnected ? "connected" : "not connected"}</div>
          <div className="mt-1 text-[11px] leading-5 text-slate-500">Skipped rows {run.rowsSkipped}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Backtest misses</div>
          <div className="mt-2 text-sm font-semibold text-white">No rows {run.noRowsCount}</div>
          <div className="mt-1 text-[11px] leading-5 text-slate-500">No matches {run.noMatchesCount} · thin sample {run.insufficientSampleCount}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Gates</div>
          <div className="mt-2 text-sm font-semibold text-white">Sample {run.minSample}</div>
          <div className="mt-1 text-[11px] leading-5 text-slate-500">Min ROI {run.minRoiPct}% · history {run.historyLimit}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-slate-400">
        {run.sourceNote ?? "No source note recorded."}
      </div>

      <details className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
        <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Top rejected reasons</summary>
        <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-400">
          {run.topRejectedReasons.length ? run.topRejectedReasons.map((item) => (
            <div key={item.reason} className="flex justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <span>{item.reason}</span>
              <span className="text-white">{item.count}</span>
            </div>
          )) : <div className="text-slate-500">No rejection details recorded in this run.</div>}
        </div>
      </details>
    </article>
  );
}

export default async function GeneratedRunnerControlPanelPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const limit = parseIntValue(readValue(resolved, "limit"), 25, 1, 100);
  const payload = await buildGeneratedTrendControlPanel(limit);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Generated Runner Control Panel</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Trend generation operations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Track generated trend discovery runs, source-row coverage, candidate counts, ready systems, persisted systems, and top rejection reasons.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link>
            <Link href="/api/sharktrends/generated-runner/control-panel" className="text-cyan-200 hover:text-cyan-100">API</Link>
          </div>
        </div>
      </section>

      <RunnerActions />

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Run log limit</span>
            <input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          </label>
          <button className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Reload logs</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Runs" value={payload.stats.runCount} note="Recent generated-runner logs loaded." />
        <Metric label="Latest" value={fmtTime(payload.stats.latestRunAt)} note="Most recent runner execution." />
        <Metric label="Rows" value={payload.stats.totalRowsLoaded} note="Historical rows loaded across shown runs." />
        <Metric label="Ready" value={payload.stats.totalReady} note="Backtest-ready candidates." />
        <Metric label="Persisted" value={payload.stats.totalPersisted} note="Gate-cleared systems written." />
        <Metric label="Skipped" value={payload.stats.totalSkipped} note="Candidates rejected by gates." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">
        {payload.sourceNote}
      </section>

      <section className="grid gap-4">
        {payload.runs.length ? payload.runs.map((run) => <RunCard key={run.id} run={run} />) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">
            No generated trend run logs are available yet. Use the dry-run action or execute endpoint to create the first logged run.
          </div>
        )}
      </section>
    </main>
  );
}
