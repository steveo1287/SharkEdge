import Link from "next/link";

import { getStatsPipelineRunCenterSnapshot } from "@/services/ops/stats-pipeline-run-center";
import { PipelineRunPanel } from "./PipelineRunPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

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

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default async function StatsPipelineRunCenterPage() {
  const snapshot = await getStatsPipelineRunCenterSnapshot();

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Stats Pipeline Run Center</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Turn raw free data into sim-ready profiles.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Run the MLB roster intelligence builder and UFC model-feature builder, then immediately re-grade player tendencies and source coverage. This is the operating panel for keeping SimHub data honest.
              </p>
              <div className="mt-2 text-xs text-slate-500">Generated {when(snapshot.generatedAt)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={pill(snapshot.ok ? "green" : "amber")}>{snapshot.ok ? "READY" : "CHECK"}</span>
              <Link href="/accuracy/data/players" className={pill("cyan")}>Player data</Link>
              <Link href="/accuracy/data/sources" className={pill("cyan")}>Source matrix</Link>
              <Link href="/api/accuracy/data/pipeline/run" className={pill("slate")}>JSON</Link>
              <Link href="/sim" className={pill("slate")}>SimHub</Link>
            </div>
          </div>
        </section>

        <section className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">What this runs</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h2 className="font-display text-2xl font-black tracking-[-0.05em] text-white">MLB profile builder</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">PlayerGameStat / TeamGameStat → mlb_player_ratings, mlb_pitcher_ratings, mlb_lineup_snapshots.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <h2 className="font-display text-2xl font-black tracking-[-0.05em] text-white">UFC feature builder</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">UFC warehouse fighter/fight/stat/rating rows → ufc_model_features for the operational fight sim.</p>
            </div>
          </div>
        </section>

        <PipelineRunPanel initialSnapshot={snapshot} />
      </div>
    </main>
  );
}
