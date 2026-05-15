import Link from "next/link";

import { getPlayerTendencyCoverageReport, type TendencyCoverageLane, type TendencyCoverageMetric, type TendencyCoverageStatus } from "@/services/ops/player-tendency-coverage";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function tone(status: TendencyCoverageStatus | string) {
  if (status === "ELITE") return "green" as const;
  if (status === "USABLE") return "cyan" as const;
  if (status === "THIN") return "amber" as const;
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

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function MetricTile({ metric }: { metric: TendencyCoverageMetric }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{metric.label}</div>
        <span className={pill(tone(metric.status))}>{metric.status}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-white">{pct(metric.pct)}</div>
      <p className="mt-1 text-[11px] text-slate-500">{metric.count}/{metric.total}</p>
    </div>
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

function LaneSection({ lane }: { lane: TendencyCoverageLane }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">{lane.sport} profile lane</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">{lane.label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Player/fighter tendency quality determines whether the sim is reading matchup shape or just leaning on surface odds and generic team/fighter labels.
          </p>
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
        {lane.metrics.map((metric) => <MetricTile key={`${lane.sport}-${metric.key}`} metric={metric} />)}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Runtime sample</div>
          <div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
            {Object.entries(lane.sample).map(([key, value]) => <p key={key}>{key}: <span className="font-mono text-white">{String(value ?? "—")}</span></p>)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">Next actions</div>
          <div className="mt-2 space-y-1 text-xs leading-5 text-amber-100/80">
            {lane.nextActions.length ? lane.nextActions.slice(0, 5).map((item) => <p key={item}>• {item}</p>) : <p>No major profile gaps.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function PlayerTendencyCoveragePage() {
  const report = await getPlayerTendencyCoverageReport();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Roster & tendencies</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Elite sims need player-level shape.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                This checks whether SharkEdge has enough roster identity, player stat rows, Statcast tendencies, pitcher context, bullpen/probable context, and MMA fighter profile/style data to power serious matchup modeling.
              </p>
              <div className="mt-2 text-xs text-slate-500">Generated {when(report.generatedAt)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={pill(tone(report.status))}>{report.status}</span>
              <Link href="/accuracy/data/sources" className={pill("cyan")}>Source matrix</Link>
              <Link href="/accuracy/data" className={pill("slate")}>Data tower</Link>
              <Link href="/api/accuracy/data/players" className={pill("slate")}>JSON</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryTile label="Profile score" value={report.score} sub="Average MLB/MMA profile depth" />
          <SummaryTile label="Status" value={report.status} sub="Tendency-readiness grade" />
          <SummaryTile label="Blockers" value={report.blockers.length} sub="Missing profile lanes" />
          <SummaryTile label="Actions" value={report.nextActions.length} sub="Deduped next upgrades" />
        </section>

        {report.nextActions.length ? (
          <section className="rounded-[1.35rem] border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Highest-value tendency work</div>
            <div className="mt-3 grid gap-2">
              {report.nextActions.slice(0, 8).map((action) => <div key={action} className="rounded-xl border border-amber-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-amber-100/80">{action}</div>)}
            </div>
          </section>
        ) : null}

        <section className="grid gap-5">
          {report.lanes.map((lane) => <LaneSection key={lane.sport} lane={lane} />)}
        </section>
      </div>
    </main>
  );
}
