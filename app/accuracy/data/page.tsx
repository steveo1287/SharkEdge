import Link from "next/link";

import { getDataControlTowerReport, type DataTowerLane, type DataTowerMetric, type DataTowerStatus } from "@/services/ops/data-control-tower";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function tone(status: DataTowerStatus) {
  if (status === "ELITE") return "green" as const;
  if (status === "USABLE") return "cyan" as const;
  if (status === "WEAK") return "amber" as const;
  return "red" as const;
}

function pill(toneKey: "purple" | "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    purple: "border-purple-300/25 bg-purple-300/10 text-purple-200",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[toneKey]}`;
}

function valueLabel(value: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function MetricTile({ metric }: { metric: DataTowerMetric }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{metric.label}</div>
        <span className={pill(tone(metric.status))}>{metric.status}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-white">{valueLabel(metric.value)}</div>
    </div>
  );
}

function LaneCard({ lane }: { lane: DataTowerLane }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">{lane.key} lane</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">{lane.label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{lane.recommendation}</p>
          <div className="mt-2 text-xs text-slate-500">Generated {when(lane.generatedAt)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={pill(tone(lane.status))}>{lane.status}</span>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Score</div>
            <div className="font-display text-3xl font-black tracking-[-0.06em] text-white">{lane.score}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {lane.metrics.map((metric) => <MetricTile key={`${lane.key}-${metric.key}`} metric={metric} />)}
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-2">
        <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.04] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-rose-200">Blockers</div>
          <p className="mt-1 text-xs leading-5 text-rose-100/75">{lane.blockers.length ? lane.blockers.join(" · ") : "None"}</p>
        </div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">Warnings</div>
          <p className="mt-1 text-xs leading-5 text-amber-100/75">{lane.warnings.length ? lane.warnings.slice(0, 6).join(" · ") : "None"}</p>
        </div>
      </div>
    </section>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

export default async function DataControlTowerPage() {
  const report = await getDataControlTowerReport();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Data Control Tower</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">No clean data, no official play.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                This is the data gate for SharkEdge. MLB quality, live odds readiness, and MMA operational status are scored together before anything deserves official promotion.
              </p>
              <div className="mt-2 text-xs text-slate-500">Generated {when(report.generatedAt)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={pill(tone(report.status))}>{report.status}</span>
              <Link href="/accuracy/data/pipeline" className={pill("cyan")}>Run pipeline</Link>
              <Link href="/accuracy/promotion" className={pill("purple")}>Promotion gate</Link>
              <Link href="/accuracy/official" className={pill("slate")}>Official</Link>
              <Link href="/baseball/readiness" className={pill("slate")}>MLB readiness</Link>
              <Link href="/sim/ufc" className={pill("slate")}>MMA lab</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryTile label="Tower score" value={report.score} sub="Average score across data lanes" />
          <SummaryTile label="Promotion" value={report.officialPromotionAllowed ? "Allowed" : "Blocked"} sub="Official PLAY data eligibility" />
          <SummaryTile label="Blockers" value={report.blockers.length} sub="Hard data reasons to stop promotion" />
          <SummaryTile label="Warnings" value={report.warnings.length} sub="Caution signals to monitor" />
          <SummaryTile label="Lanes" value={report.lanes.length} sub="MLB, odds, and MMA coverage" />
        </section>

        {report.nextActions.length ? (
          <section className="rounded-[1.35rem] border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Next data actions</div>
            <div className="mt-3 grid gap-2">
              {report.nextActions.map((action) => <div key={action} className="rounded-xl border border-amber-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-amber-100/80">{action}</div>)}
            </div>
          </section>
        ) : null}

        <section className="grid gap-4">
          {report.lanes.map((lane) => <LaneCard key={lane.key} lane={lane} />)}
        </section>
      </div>
    </main>
  );
}
