import Link from "next/link";

import { type DataSourceCoverageGroup, type DataSourceCoverageRow, type SourceCoverageStatus } from "@/services/ops/data-source-coverage";
import { getEnhancedDataSourceCoverageReport } from "@/services/ops/data-source-coverage-enhanced";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function statusTone(status: SourceCoverageStatus | string) {
  if (status === "LIVE") return "green" as const;
  if (status === "CONFIGURED") return "cyan" as const;
  if (status === "FALLBACK") return "amber" as const;
  if (status === "STALE") return "amber" as const;
  if (status === "PAID_REQUIRED") return "purple" as const;
  if (status === "ELITE") return "green" as const;
  if (status === "USABLE") return "cyan" as const;
  if (status === "WEAK") return "amber" as const;
  return "red" as const;
}

function pill(tone: "purple" | "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    purple: "border-purple-300/25 bg-purple-300/10 text-purple-200",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function valueText(value: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

function SourceRowCard({ source }: { source: DataSourceCoverageRow }) {
  return (
    <article className="rounded-[1.15rem] border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={pill(statusTone(source.status))}>{source.status}</span>
            <span className={pill(source.priority === "critical" ? "red" : source.priority === "high" ? "amber" : "slate")}>{source.priority}</span>
            <span className={pill("slate")}>{source.category}</span>
          </div>
          <h3 className="mt-3 font-display text-xl font-black tracking-[-0.04em] text-white">{source.label}</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">{source.nextAction}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Impact</div>
          <div className="font-display text-3xl font-black tracking-[-0.06em] text-white">{source.scoreImpact}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Runtime evidence</div>
          <p className="mt-1 text-xs leading-5 text-slate-300">{valueText(source.runtimeEvidence)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Env keys</div>
          <p className="mt-1 text-xs leading-5 text-slate-300">{source.envKeys.length ? source.envKeys.join(" / ") : "none"}</p>
        </div>
      </div>
    </article>
  );
}

function CoverageGroup({ group }: { group: DataSourceCoverageGroup }) {
  const badRows = group.rows.filter((row) => row.status !== "LIVE");
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">{group.sport} pipeline</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">{group.label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This matrix separates live data from configured, missing, stale, fallback, and paid-required inputs. Internal event-market snapshots now count as free odds-history evidence when available.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={pill(statusTone(group.status))}>{group.status}</span>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Score</div>
            <div className="font-display text-3xl font-black tracking-[-0.06em] text-white">{group.score}</div>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-3">
        <Metric label="Critical missing" value={group.criticalMissing} sub="Blocks elite stats confidence" />
        <Metric label="Live sources" value={group.rows.filter((row) => row.status === "LIVE").length} sub={`${group.rows.length} tracked inputs`} />
        <Metric label="Needs work" value={badRows.length} sub="Configured/missing/stale/fallback/paid" />
      </div>
      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {group.rows.map((source) => <SourceRowCard key={source.key} source={source} />)}
      </div>
    </section>
  );
}

export default async function DataSourceCoveragePage() {
  const report = await getEnhancedDataSourceCoverageReport();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Stats Pipeline Matrix</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Know every input before trusting the edge.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                This is the source-of-truth map for SharkEdge data. It now recognizes internal odds snapshots as free archive evidence before requiring paid history.
              </p>
              <div className="mt-2 text-xs text-slate-500">Generated {when(report.generatedAt)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={pill(statusTone(report.status))}>{report.status}</span>
              <Link href="/accuracy/data" className={pill("cyan")}>Data tower</Link>
              <Link href="/api/accuracy/data/sources" className={pill("slate")}>JSON</Link>
              <Link href="/sim" className={pill("slate")}>SimHub</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Metric label="Pipeline score" value={report.score} sub="Weighted source coverage" />
          <Metric label="Critical missing" value={report.criticalMissing} sub="Must fix before elite confidence" />
          <Metric label="Live" value={report.liveCount} sub="Currently live sources" />
          <Metric label="Configured" value={report.configuredCount} sub="Live/configured/stale/fallback" />
          <Metric label="Missing" value={report.missingCount} sub="No evidence or env wiring" />
          <Metric label="Paid required" value={report.paidRequiredCount} sub="Likely needs paid data" />
        </section>

        {report.blockers.length ? (
          <section className="rounded-[1.35rem] border border-rose-300/15 bg-rose-300/[0.05] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Critical source blockers</div>
            <div className="mt-3 grid gap-2">
              {report.blockers.slice(0, 8).map((blocker) => <div key={blocker} className="rounded-xl border border-rose-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-rose-100/80">{blocker}</div>)}
            </div>
          </section>
        ) : null}

        {report.nextActions.length ? (
          <section className="rounded-[1.35rem] border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Highest-value next data actions</div>
            <div className="mt-3 grid gap-2">
              {report.nextActions.map((action) => <div key={action} className="rounded-xl border border-amber-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-amber-100/80">{action}</div>)}
            </div>
          </section>
        ) : null}

        <section className="grid gap-5">
          {report.groups.map((group) => <CoverageGroup key={group.sport} group={group} />)}
        </section>
      </div>
    </main>
  );
}
