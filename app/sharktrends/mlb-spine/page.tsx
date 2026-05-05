import Link from "next/link";

import { buildMlbGameSpineHealth } from "@/services/mlb/mlb-game-spine";
import MlbSpineRefreshForm from "./refresh-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmt(value: string | null) {
  if (!value) return "never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

export default async function MlbSpinePage() {
  const health = await buildMlbGameSpineHealth();
  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div><div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Game Spine</div><h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Official game identity and results</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Stores MLB gamePk, teams, schedule status, results, and probable pitchers so odds and trends can attach to real games.</p></div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">SharkTrends</Link><Link href="/sharktrends/mlb-stat-trends" className="text-cyan-200 hover:text-cyan-100">MLB Stat Trends</Link><Link href="/sharktrends/provider-trigger" className="text-cyan-200 hover:text-cyan-100">Provider trigger</Link><Link href="/sharktrends/ingestion-health" className="text-cyan-200 hover:text-cyan-100">Ingestion health</Link></div>
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"><Metric label="Games" value={health.stats.games} note="Stored MLB games." /><Metric label="Today" value={health.stats.todayGames} note="Games stored for today." /><Metric label="Teams" value={health.stats.teams} note="Stored MLB teams." /><Metric label="Results" value={health.stats.results} note="Stored score/result rows." /><Metric label="Pitchers" value={health.stats.probablePitchers} note="Probable pitcher rows." /><Metric label="Latest" value={fmt(health.stats.latestUpdatedAt)} note="Latest spine update." /></section>
      <MlbSpineRefreshForm />
      {health.blockers.length ? <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100"><div className="font-semibold text-white">Current blockers</div><div className="mt-2 grid gap-1">{health.blockers.map((blocker) => <div key={blocker}>- {blocker}</div>)}</div></section> : null}
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Latest games</div><div className="mt-3 grid gap-3">{health.latestGames.length ? health.latestGames.map((game) => <div key={game.gamePk} className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-sm font-semibold text-white">{game.eventLabel}</div><div className="mt-1 text-xs text-slate-400">gamePk {game.gamePk} · {fmt(game.gameDate)} · {game.status} · score {game.score ?? "TBD"}</div><div className="mt-1 text-xs text-slate-500">Pitchers: {game.probablePitchers}</div></div>) : <div className="text-sm text-slate-400">No MLB games stored yet.</div>}</div></section>
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{health.sourceNote}</section>
    </main>
  );
}
