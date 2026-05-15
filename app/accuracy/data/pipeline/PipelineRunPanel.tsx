"use client";

import { useMemo, useState } from "react";

type SnapshotLike = {
  ok?: boolean;
  generatedAt?: string;
  players?: { ok?: boolean; report?: { score?: number; status?: string; generatedAt?: string } | null; error?: string | null };
  sources?: { ok?: boolean; report?: { score?: number; status?: string; generatedAt?: string } | null; error?: string | null };
};

type JobResult = {
  key: string;
  label: string;
  ok: boolean;
  durationMs: number;
  result?: unknown;
  error?: string | null;
};

type RunResult = {
  ok?: boolean;
  durationMs?: number;
  jobs?: JobResult[];
  before?: SnapshotLike;
  after?: SnapshotLike;
  deltas?: { playerTendencyScore?: number | null; sourceCoverageScore?: number | null };
  error?: string;
};

function pill(tone: "green" | "cyan" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function tone(status: string | undefined | null) {
  if (status === "ELITE" || status === "LIVE" || status === "READY") return "green" as const;
  if (status === "USABLE" || status === "CONFIGURED") return "cyan" as const;
  if (status === "THIN" || status === "WEAK" || status === "FALLBACK" || status === "STALE") return "amber" as const;
  if (status === "MISSING" || status === "BLOCKED" || status === "ERROR") return "red" as const;
  return "slate" as const;
}

function scoreText(value: number | undefined | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function deltaText(value: number | undefined | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value > 0) return `+${value}`;
  return String(value);
}

function when(value: string | undefined | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function resultNumber(result: unknown, key: string) {
  if (!result || typeof result !== "object") return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function MetricCard({ label, value, sub, status }: { label: string; value: string | number; sub: string; status?: string | null }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
        {status ? <span className={pill(tone(status))}>{status}</span> : null}
      </div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

function JobCard({ job }: { job: JobResult }) {
  const hitters = resultNumber(job.result, "hitters");
  const pitchers = resultNumber(job.result, "pitchers");
  const lineups = resultNumber(job.result, "lineups");
  const fights = resultNumber(job.result, "fights");
  const features = resultNumber(job.result, "features");
  return (
    <article className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={pill(job.ok ? "green" : "red")}>{job.ok ? "OK" : "FAILED"}</span>
          <h3 className="mt-3 font-display text-xl font-black tracking-[-0.04em] text-white">{job.label}</h3>
          <p className="mt-1 text-xs text-slate-500">Duration: {job.durationMs}ms</p>
        </div>
      </div>
      {job.error ? <p className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-xs leading-5 text-rose-100/80">{job.error}</p> : null}
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {hitters != null ? <MetricCard label="Hitters" value={hitters} sub="MLB ratings written" /> : null}
        {pitchers != null ? <MetricCard label="Pitchers" value={pitchers} sub="MLB ratings written" /> : null}
        {lineups != null ? <MetricCard label="Lineups" value={lineups} sub="MLB snapshots written" /> : null}
        {fights != null ? <MetricCard label="Fights" value={fights} sub="UFC fights scanned" /> : null}
        {features != null ? <MetricCard label="Features" value={features} sub="UFC model features upserted" /> : null}
      </div>
    </article>
  );
}

export function PipelineRunPanel({ initialSnapshot }: { initialSnapshot: SnapshotLike }) {
  const [snapshot, setSnapshot] = useState<SnapshotLike>(initialSnapshot);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerScore = snapshot.players?.report?.score;
  const sourceScore = snapshot.sources?.report?.score;
  const playerStatus = snapshot.players?.report?.status;
  const sourceStatus = snapshot.sources?.report?.status;

  const buttons = useMemo(() => ([
    { key: "both", label: "Run MLB + UFC", payload: { runMlb: true, runUfc: true } },
    { key: "mlb", label: "Run MLB only", payload: { runMlb: true, runUfc: false } },
    { key: "ufc", label: "Run UFC only", payload: { runMlb: false, runUfc: true } }
  ]), []);

  async function runPipeline(key: string, payload: Record<string, unknown>) {
    setRunning(key);
    setError(null);
    try {
      const response = await fetch("/api/accuracy/data/pipeline/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          mlbLookbackDays: 45,
          mlbLimit: 1500,
          includeLineups: true,
          ufcLimit: 50,
          modelVersion: "ufc-fight-iq-v1"
        })
      });
      const data = await response.json() as RunResult;
      setRunResult(data);
      if (data.after) setSnapshot(data.after);
      if (!response.ok && !data.ok) setError(data.error ?? "Pipeline completed with failures. Review job cards below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline request failed.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Player tendency score" value={scoreText(playerScore)} sub={`Generated ${when(snapshot.players?.report?.generatedAt ?? snapshot.generatedAt)}`} status={playerStatus} />
        <MetricCard label="Source coverage score" value={scoreText(sourceScore)} sub={`Generated ${when(snapshot.sources?.report?.generatedAt ?? snapshot.generatedAt)}`} status={sourceStatus} />
        <MetricCard label="Player score delta" value={deltaText(runResult?.deltas?.playerTendencyScore)} sub="Change from last run" />
        <MetricCard label="Source score delta" value={deltaText(runResult?.deltas?.sourceCoverageScore)} sub="Change from last run" />
      </section>

      <section className="rounded-[1.35rem] border border-cyan-300/15 bg-cyan-300/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Run builders</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Runs the free-route profile builders, then refreshes player tendency and source coverage grades.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {buttons.map((button) => (
              <button
                key={button.key}
                type="button"
                disabled={Boolean(running)}
                onClick={() => runPipeline(button.key, button.payload)}
                className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running === button.key ? "Running…" : button.label}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-xs leading-5 text-rose-100/80">{error}</p> : null}
      </section>

      {runResult ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">Last run result</div>
              <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">{runResult.ok ? "Pipeline completed" : "Pipeline completed with issues"}</h2>
              <p className="mt-2 text-xs text-slate-500">Duration: {runResult.durationMs ?? "—"}ms</p>
            </div>
            <span className={pill(runResult.ok ? "green" : "amber")}>{runResult.ok ? "OK" : "CHECK"}</span>
          </div>
          <div className="mt-5 grid gap-3">
            {(runResult.jobs ?? []).map((job) => <JobCard key={job.key} job={job} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
