import Link from "next/link";

import { getMlbPitcherDiversityAudit, type MlbPitcherDiversityAuditRow } from "@/services/players/mlb-pitcher-diversity-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-display text-3xl font-black tracking-tight text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

function riskClass(risk: MlbPitcherDiversityAuditRow["genericRisk"]) {
  if (risk === "LOW") return "border-emerald-300/35 bg-emerald-300/10 text-emerald-100";
  if (risk === "MEDIUM") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-red-300/35 bg-red-300/10 text-red-100";
}

function value(value: number | null) {
  return value == null ? "—" : String(value);
}

function RowCard({ row }: { row: MlbPitcherDiversityAuditRow }) {
  return <Link href={`/player-profiles/${encodeURIComponent(row.pitcherId)}`} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:border-cyan-300/35"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{row.team} · {row.roleTier ?? "UNKNOWN"} · {row.source}</div><div className="mt-1 font-display text-xl font-black tracking-tight text-white">{row.pitcherName}</div><div className="mt-1 text-xs text-slate-500">{row.snapshotAt?.slice(0, 10) ?? "—"}</div></div><div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${riskClass(row.genericRisk)}`}>{row.genericRisk}</span><div className="text-right"><div className="font-display text-3xl font-black text-white">{row.diversityScore}</div><div className="text-xs text-slate-500">diversity</div></div></div></div><div className="mt-4 grid gap-2 sm:grid-cols-4"><Stat label="K9" value={value(row.rawMetrics.strikeoutsPer9)} note="Raw/derived strikeout ceiling." /><Stat label="IP/Start" value={value(row.rawMetrics.inningsPerStart)} note="Outs ceiling input." /><Stat label="Pitch ct" value={value(row.rawMetrics.pitchCountAvg)} note="Workload ceiling." /><Stat label="Stuff/Velo" value={value(row.rawMetrics.stuffPlus ?? row.rawMetrics.velocity)} note="Ace separator." /></div>{row.issues.length ? <div className="mt-3 flex flex-wrap gap-2">{row.issues.map((issue) => <span key={issue} className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-100">{issue}</span>)}</div> : null}</Link>;
}

export default async function PitcherDiversityPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const source = first(params.source) ?? "calibrated-stat-pipe-v1";
  const seasonRaw = first(params.season);
  const season = Number.isInteger(Number(seasonRaw)) ? Number(seasonRaw) : null;
  const data = await getMlbPitcherDiversityAudit({ source, season, limit: 120 });
  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-7xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">MLB Pitcher Diversity Audit</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">Stop generic pitcher sims</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Flags pitcher rating rows that are missing raw stat inputs needed to separate aces from back-end starters: K rate/K9, innings, starts, pitch count, velocity, and Stuff+.</p></div><div className="flex gap-2"><Link href={`/api/mlb/player-data/pitcher-diversity?source=${encodeURIComponent(source)}${season ? `&season=${season}` : ""}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">JSON</Link><Link href="/player-profiles/calibration" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Calibration</Link></div></div></section><section className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4"><form className="grid gap-3 md:grid-cols-[1fr_10rem_7rem]" action="/player-profiles/pitcher-diversity"><input name="source" defaultValue={source} placeholder="rating source" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600" /><input name="season" defaultValue={seasonRaw ?? ""} placeholder="Season" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600" /><button className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">Audit</button></form></section><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Stat label="Pitchers" value={String(data.summary.pitchers)} note="Rows audited." /><Stat label="Avg score" value={data.summary.avgDiversityScore == null ? "—" : String(data.summary.avgDiversityScore)} note="Higher means less generic." /><Stat label="High risk" value={String(data.summary.highRisk)} note="Likely fallback-heavy." /><Stat label="Missing K" value={String(data.summary.missingKRate)} note="No K rate/K9." /><Stat label="Missing stuff" value={String(data.summary.missingStuffVelocity)} note="No velocity/Stuff+." /></section>{data.warnings.length ? <section className="grid gap-2">{data.warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">{warning}</div>)}</section> : null}<section className="grid gap-3">{data.rows.map((row) => <RowCard key={`${row.source}-${row.pitcherId}`} row={row} />)}{!data.rows.length ? <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No pitcher diversity rows returned. Run source sync and write calibration first.</div> : null}</section></div></main>;
}
