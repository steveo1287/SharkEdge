import Link from "next/link";

import { buildOddsApiIoHealth, type OddsApiIoRunLog } from "@/services/ingestion/odds-api-io-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(value: string | undefined) {
  const parsed = Number(value ?? 25);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : 25;
}

function fmtTime(value: string | null) {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

function RunCard({ run }: { run: OddsApiIoRunLog }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{run.mode} · {run.league} · {run.status}</div>
          <div className="mt-2 text-sm font-semibold text-white">{fmtTime(run.createdAt)}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{run.dryRun ? "dry run" : "write run"} · {run.ok ? "ok" : "failed"}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${run.ok ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-red-400/25 bg-red-400/10 text-red-200"}`}>{run.ok ? "ok" : "fail"}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-5">
        <span>Events {run.providerEvents}</span>
        <span>Matched {run.matchedInternalEvents}</span>
        <span>Odds {run.oddsRows}</span>
        <span>Snapshots {run.snapshotsWritten}</span>
        <span>Lines {run.lineRowsWritten}</span>
      </div>
      <div className="mt-3 text-xs leading-5 text-slate-500">Rate remaining: {run.rateLimitRemaining ?? "unknown"}</div>
      {run.error ? <div className="mt-3 rounded-xl border border-red-400/15 bg-red-400/5 p-3 text-xs leading-5 text-red-100">{run.error}</div> : null}
    </article>
  );
}

export default async function IngestionHealthPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const limit = parseLimit(readValue(resolved, "limit"));
  const health = await buildOddsApiIoHealth(limit);
  const mlb = health.marketCoverage.coverage.find((row) => row.league === "MLB");

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Ingestion Health</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Odds provider run log</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Tracks Odds-API.io runs, rows written, rate-limit hints, market coverage, and why the market movement lane may still be empty.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sharktrends/odds-api-io/cron" className="text-cyan-200 hover:text-cyan-100">Cron</Link>
            <Link href="/sharktrends/market-data-source" className="text-cyan-200 hover:text-cyan-100">Market source</Link>
            <Link href="/sharktrends/command-board-v2" className="text-cyan-200 hover:text-cyan-100">Board v2</Link>
          </div>
        </div>
      </section>

      <section className={`rounded-[1.5rem] border p-4 text-sm leading-6 ${health.attachmentReadiness.blockers.length ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"}`}>
        <div className="font-semibold text-white">{health.attachmentReadiness.blockers.length ? "Attachment not fully ready" : "Attachment ready"}</div>
        <div className="mt-2">{health.sourceNote}</div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="API key" value={health.configured.apiKey ? "set" : "missing"} note="Provider credential visible to server." />
        <Metric label="Secret" value={health.configured.writeSecret ? "set" : "missing"} note="Write/cron secret configured." />
        <Metric label="Runs" value={health.stats.runCount} note="Logged ingestion runs." />
        <Metric label="Latest success" value={fmtTime(health.stats.latestSuccessAt)} note="Latest successful write run." />
        <Metric label="MLB odds" value={mlb?.oddsRows ?? 0} note="Market odds rows for MLB." />
        <Metric label="MLB lines" value={mlb?.lineRows ?? 0} note="Line-history rows for MLB." />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Provider events" value={health.stats.totalProviderEvents} note="Total events seen across shown runs." />
        <Metric label="Odds rows" value={health.stats.totalOddsRows} note="Provider odds rows normalized." />
        <Metric label="Snapshots written" value={health.stats.totalSnapshotsWritten} note="Rows written into snapshots." />
        <Metric label="Line rows written" value={health.stats.totalLineRowsWritten} note="Rows written into line history." />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">Blockers</div>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
            {health.attachmentReadiness.blockers.length ? health.attachmentReadiness.blockers.map((blocker) => <div key={blocker}>- {blocker}</div>) : <div className="text-slate-500">No current blockers.</div>}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-cyan-300/20 bg-cyan-300/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Next checks</div>
          <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
            <div>• Run one write ingestion if no runs are logged.</div>
            <div>• Confirm MLB odds and line rows are above zero.</div>
            <div>• Open Market Intelligence and Command Board v2 after rows land.</div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <form method="get" className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Run limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Reload</button>
        </form>
        <div className="grid gap-3">
          {health.recentRuns.length ? health.recentRuns.map((run) => <RunCard key={run.id} run={run} />) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">No Odds-API.io ingestion runs have been logged yet.</div>}
        </div>
      </section>
    </main>
  );
}
