import Link from "next/link";

import { getSimDataHealthReport, type SimDataHealthProbe, type SimDataHealthStatus } from "@/services/ops/sim-data-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function tone(status: SimDataHealthStatus | string) {
  if (status === "ELITE") return "green" as const;
  if (status === "USABLE") return "cyan" as const;
  if (status === "WEAK") return "amber" as const;
  return "red" as const;
}

function pill(toneKey: "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[toneKey]}`;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function age(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 60) return `${value}m`;
  return `${Math.round(value / 60)}h`;
}

function Metric({ label, value, sub, status }: { label: string; value: string | number; sub: string; status?: string }) {
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

function ProbeCard({ probe }: { probe: SimDataHealthProbe }) {
  return (
    <article className="rounded-[1.15rem] border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={pill(tone(probe.status))}>{probe.status}</span>
            <span className={pill(probe.priority === "critical" ? "red" : probe.priority === "high" ? "amber" : "slate")}>{probe.priority}</span>
            <span className={pill("slate")}>{probe.category}</span>
          </div>
          <h3 className="mt-3 font-display text-xl font-black tracking-[-0.04em] text-white">{probe.label}</h3>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Rows</div>
          <div className="font-display text-3xl font-black tracking-[-0.06em] text-white">{probe.count ?? "—"}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Latest</div>
          <p className="mt-1 text-xs leading-5 text-slate-300">{when(probe.latestAt)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Age</div>
          <p className="mt-1 text-xs leading-5 text-slate-300">{age(probe.ageMinutes)} / max {age(probe.maxFreshMinutes)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Error</div>
          <p className="mt-1 text-xs leading-5 text-slate-300">{probe.error ?? "—"}</p>
        </div>
      </div>
      {probe.blocker ? <p className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-xs leading-5 text-rose-100/80">{probe.blocker}</p> : null}
      {probe.warning ? <p className="mt-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-xs leading-5 text-amber-100/80">{probe.warning}</p> : null}
    </article>
  );
}

export default async function SimDataHealthPage() {
  const report = await getSimDataHealthReport();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Sim Data Health</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Runtime truth before projection trust.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                This panel checks the actual tables and caches that SimHub depends on: MLB player/pitcher ratings, lineup snapshots, UFC model features, market snapshots, and live sim caches.
              </p>
              <div className="mt-2 text-xs text-slate-500">Generated {when(report.generatedAt)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={pill(tone(report.status))}>{report.status}</span>
              <Link href="/accuracy/data/pipeline" className={pill("cyan")}>Run pipeline</Link>
              <Link href="/api/sim/refresh?wait=1&statsForce=1" className={pill("amber")}>Force refresh</Link>
              <Link href="/api/sim/health" className={pill("slate")}>JSON</Link>
              <Link href="/sim" className={pill("slate")}>SimHub</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Health score" value={report.score} sub="Weighted runtime source score" status={report.status} />
          <Metric label="Blockers" value={report.blockers.length} sub="Hard reasons to distrust output" />
          <Metric label="Warnings" value={report.warnings.length} sub="Weak/stale source warnings" />
          <Metric label="MLB board" value={report.cache.mlbBoard.gameCount ?? "—"} sub={`Generated ${when(report.cache.mlbBoard.generatedAt)}`} status={report.cache.mlbBoard.stale ? "WEAK" : "USABLE"} />
          <Metric label="Market lines" value={report.cache.market.lineCount ?? "—"} sub={`Generated ${when(report.cache.market.generatedAt)}`} status={report.cache.market.stale ? "WEAK" : "USABLE"} />
        </section>

        {report.nextActions.length ? (
          <section className="rounded-[1.35rem] border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Next actions</div>
            <div className="mt-3 grid gap-2">
              {report.nextActions.map((action) => <div key={action} className="rounded-xl border border-amber-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-amber-100/80">{action}</div>)}
            </div>
          </section>
        ) : null}

        <section className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Cache status</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Metric label="Refresh ok" value={String(report.cache.refreshStatus.ok ?? "—")} sub={`Last success ${when(report.cache.refreshStatus.lastSuccessAt)}`} />
            <Metric label="Refresh running" value={String(report.cache.refreshStatus.running ?? "—")} sub={report.cache.refreshStatus.reason ?? "No reason recorded"} />
            <Metric label="Market games" value={report.cache.market.gameCount ?? "—"} sub={`Expires ${when(report.cache.market.expiresAt)}`} />
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-2">
          {report.probes.map((probe) => <ProbeCard key={probe.key} probe={probe} />)}
        </section>
      </div>
    </main>
  );
}
