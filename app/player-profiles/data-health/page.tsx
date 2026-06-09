import Link from "next/link";

import { getMlbPlayerDataHealth } from "@/services/players/mlb-player-data-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusClass(status: string) {
  if (status === "PASS") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (status === "WARN") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  return "border-red-400/25 bg-red-400/10 text-red-200";
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-display text-3xl font-black tracking-tight text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

export default async function PlayerDataHealthPage() {
  const health = await getMlbPlayerDataHealth();
  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-7xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">MLB Player Data Pipe</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">Stat pipe health</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Tracks the identity map, raw stat snapshots, and compiled rating rows that feed elite player cards. This is the data foundation for accuracy.</p></div><div className="flex gap-2"><Link href="/api/mlb/player-data/health" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">JSON</Link><Link href="/player-profiles/grade" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Grade</Link><Link href="/player-profiles/gaps" className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">Gaps</Link></div></div></section><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Grade" value={health.grade} note="Current stat-pipe readiness." /><Stat label="Score" value={`${health.score}/100`} note="Five readiness checks." /><Stat label="Database" value={health.databaseReady ? "READY" : "DOWN"} note="Server database state." /><Stat label="Status" value={health.ok ? "LIVE" : "WARN"} note="Pipeline health result." /></section>{health.warnings.length ? <section className="grid gap-2">{health.warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">{warning}</div>)}</section> : null}<section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Readiness checks</div><div className="mt-4 grid gap-3">{health.checks.map((check) => <div key={check.key} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-black text-white">{check.label}</div><p className="mt-2 text-sm leading-6 text-slate-400">{check.detail}</p></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusClass(check.status)}`}>{check.status}</span></div></div>)}</div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Tables</div><div className="mt-4 grid gap-3 md:grid-cols-2">{health.tables.map((table) => <div key={table.name} className="rounded-[1.15rem] border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black text-white">{table.name}</div><div className="mt-1 text-xs text-slate-500">Latest {table.latestAt ?? "—"}</div></div><div className="font-display text-3xl font-black text-white">{table.rows}</div></div></div>)}</div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">Ingest endpoint</div><pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-6 text-slate-300">{`POST /api/mlb/player-data/ingest
{
  "source": "stat-provider-name",
  "capturedAt": "2026-06-09T12:00:00Z",
  "batters": [{ "playerId": "mlbam-...", "playerName": "...", "team": "NYY", "season": 2026, "avg": .285, "obp": .370, "slg": .540 }],
  "pitchers": [{ "pitcherId": "mlbam-...", "pitcherName": "...", "team": "NYY", "season": 2026, "xera": 3.20, "kRate": .29 }]
}`}</pre></section></div></main>;
}
