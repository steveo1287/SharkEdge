import Link from "next/link";

import { getMainSimBrainStatusReport } from "@/services/simulation/main-sim-brain-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function statusClass(status: string) {
  if (status === "GREEN") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (status === "YELLOW") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-red-300/25 bg-red-300/10 text-red-100";
}

function Tile({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function MessageList({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-3 grid gap-2 text-sm text-slate-300">
        {rows.length ? rows.map((row) => <div key={row} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">{row}</div>) : <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-slate-500">None.</div>}
      </div>
    </div>
  );
}

export default async function MainSimBrainStatusPage() {
  const report = await getMainSimBrainStatusReport(60);
  const status = report.status;
  const profile = report.playerImpactProfile;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Main Sim Brain</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Brain status + MLB v8 readiness</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              MLB now routes through v8 player impact, active learned weight profile, v7 market calibration, and accuracy guardrails. This page tells you whether that stack is safe to trust aggressively.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/mlb/v7/live" className="text-cyan-200 hover:text-cyan-100">MLB live</Link>
            <Link href="/api/sim/main-brain/status" className="text-cyan-200 hover:text-cyan-100">Status API</Link>
            <Link href="/api/sim/mlb-v8/player-impact-profile" className="text-cyan-200 hover:text-cyan-100">Profile API</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Tile label="Main status" value={status.status} note={status.canPublishAttackPicks ? "Attack picks allowed by health gate" : "Attack picks restricted"} />
        <Tile label="MLB health" value={status.mlbHealthStatus} note="Underlying v7/v8 health gate" />
        <Tile label="Rows" value={status.rowCount} note={`${status.gameCount} MLB games found`} />
        <Tile label="Profile" value={profile.status} note={`${profile.sampleSize} profile rows`} />
        <Tile label="Reliability" value={pct(status.profileReliability)} note="Learned profile reliability" />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Routing</div>
            <div className="mt-2 text-sm text-slate-400">Current brain labels by league.</div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusClass(status.status)}`}>{status.status}</div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Tile label="MLB" value={report.mainBrain.MLB} note="Primary upgraded stack" />
          <Tile label="NBA" value={report.mainBrain.NBA} note="Existing guarded anchor" />
          <Tile label="Default" value={report.mainBrain.default} note="Other leagues" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <MessageList title="Blockers" rows={status.blockers} />
        <MessageList title="Warnings" rows={status.warnings} />
        <MessageList title="Recommendations" rows={status.recommendations} />
      </section>
    </main>
  );
}
