import Link from "next/link";

import { getMlbPlayerProfiles, type MlbPlayerProfileCard, type MlbPlayerTrait } from "@/services/players/mlb-player-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function signedPct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
}

function signedRuns(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}` : "—";
}

function TraitPill({ trait }: { trait: MlbPlayerTrait }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-2"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{trait.label}</div><div className="font-mono text-sm font-black text-cyan-100">{trait.score ?? "—"}</div></div><div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{trait.grade}</div></div>;
}

function PlayerCard({ profile }: { profile: MlbPlayerProfileCard }) {
  const href = `/player-profiles/${encodeURIComponent(profile.playerId)}`;
  return <Link href={href} className="rounded-[1.25rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:border-cyan-300/35"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{profile.team} · {profile.role} · {profile.roleTier}</div><h2 className="mt-2 font-display text-2xl font-black tracking-tight text-white">{profile.name}</h2><div className="mt-1 text-xs text-slate-500">{profile.primaryPosition ?? "MLB"} · confidence {profile.confidenceTier}</div></div><div className="text-right"><div className="text-xs text-slate-500">Overall</div><div className="font-display text-4xl font-black text-white">{profile.overall ?? "—"}</div></div></div><div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-3">{profile.traits.slice(0, 6).map((trait) => <TraitPill key={trait.key} trait={trait} />)}</div><div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-3"><div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Model impact</div><div className="mt-2 grid grid-cols-2 gap-3 text-sm"><div><div className="text-slate-500">Runs</div><div className="font-mono font-black text-white">{signedRuns(profile.modelImpact.projectedRunImpact)}</div></div><div><div className="text-slate-500">Win prob</div><div className="font-mono font-black text-white">{signedPct(profile.modelImpact.winProbabilityImpactPct)}</div></div></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{profile.modelImpact.propSignal}</p></div></Link>;
}

export default async function PlayerProfilesPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const q = first(params.q);
  const team = first(params.team);
  const role = first(params.role);
  const data = await getMlbPlayerProfiles({ q, team, role, limit: 120 });

  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-7xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">MLB Player Profiles</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">Player cards that explain the sim</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Batter and pitcher cards built from roster-intelligence ratings. These are not cosmetic cards; they expose the traits that move moneyline, team total, F5, NRFI/YRFI, and player prop projections.</p></div><div className="flex gap-2"><Link href="/api/mlb/players" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">JSON</Link><Link href="/sim/mlb" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">MLB Sim</Link></div></div></section><section className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4"><form className="grid gap-3 md:grid-cols-[1fr_10rem_10rem_7rem]" action="/player-profiles"><input name="q" defaultValue={q ?? ""} placeholder="Search player" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600" /><input name="team" defaultValue={team ?? ""} placeholder="Team" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600" /><select name="role" defaultValue={role ?? ""} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"><option value="">All roles</option><option value="BATTER">Batter</option><option value="STARTER">Starter</option><option value="RELIEVER">Reliever</option><option value="PITCHER">Pitcher</option></select><button className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">Filter</button></form></section><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Profiles</div><div className="mt-2 font-display text-3xl font-black text-white">{data.count}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Status</div><div className="mt-2 font-display text-3xl font-black text-white">{data.ok ? "LIVE" : "WARN"}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Role filter</div><div className="mt-2 font-display text-3xl font-black text-white">{role || "ALL"}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Team filter</div><div className="mt-2 font-display text-3xl font-black text-white">{team || "ALL"}</div></div></section>{data.warnings.length ? <section className="grid gap-2">{data.warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">{warning}</div>)}</section> : null}<section className="grid gap-3 lg:grid-cols-2">{data.profiles.map((profile) => <PlayerCard key={`${profile.role}-${profile.playerId}`} profile={profile} />)}{!data.profiles.length ? <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No MLB player profile rows returned yet. Seed roster intelligence or adjust the filters.</div> : null}</section></div></main>;
}
