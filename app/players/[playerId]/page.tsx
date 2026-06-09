import Link from "next/link";
import { notFound } from "next/navigation";

import { getMlbPlayerProfile, type MlbPlayerTrait } from "@/services/players/mlb-player-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ playerId: string }> };

function value(input: string | number | null | undefined) {
  if (input === null || input === undefined || input === "") return "—";
  return String(input);
}

function signedPct(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
}

function signedRuns(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}` : "—";
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 break-words font-mono text-sm font-black text-white">{value}</div></div>;
}

function TraitRow({ trait }: { trait: MlbPlayerTrait }) {
  return <div className="rounded-[1.1rem] border border-white/10 bg-[#06101b]/82 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-black text-white">{trait.label}</div><p className="mt-2 text-sm leading-6 text-slate-400">{trait.note}</p></div><div className="text-right"><div className="font-display text-3xl font-black text-white">{trait.score ?? "—"}</div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">{trait.grade}</div></div></div></div>;
}

export default async function PlayerProfileDetailPage({ params }: PageProps) {
  const { playerId } = await params;
  const profile = await getMlbPlayerProfile(decodeURIComponent(playerId));
  if (!profile) notFound();

  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-6xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">MLB Player Card</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">{profile.name}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{profile.team} · {profile.role} · {profile.roleTier}. This card explains how the player affects sim outputs and prop lanes.</p></div><div className="flex gap-2"><Link href="/player-profiles" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Profiles</Link><Link href={`/api/mlb/players/${encodeURIComponent(profile.playerId)}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">JSON</Link></div></div></section><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Overall</div><div className="mt-2 font-display text-4xl font-black text-white">{profile.overall ?? "—"}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Runs</div><div className="mt-2 font-display text-4xl font-black text-white">{signedRuns(profile.modelImpact.projectedRunImpact)}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Win prob</div><div className="mt-2 font-display text-4xl font-black text-white">{signedPct(profile.modelImpact.winProbabilityImpactPct)}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Confidence</div><div className="mt-2 font-display text-4xl font-black text-white">{profile.confidenceTier}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Season</div><div className="mt-2 font-display text-4xl font-black text-white">{profile.season ?? "—"}</div></div></section><section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Why it matters</div><div className="mt-4 grid gap-3">{profile.whyItMatters.map((line) => <div key={line} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">{line}</div>)}</div></section><section className="grid gap-3 md:grid-cols-2"><div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Traits</div><div className="mt-4 grid gap-3">{profile.traits.map((trait) => <TraitRow key={trait.key} trait={trait} />)}</div></div><div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Profile metadata</div><div className="mt-4 grid gap-3"><Stat label="Player ID" value={profile.playerId} /><Stat label="Team" value={profile.team} /><Stat label="Role" value={`${profile.role} · ${profile.roleTier}`} /><Stat label="Position" value={value(profile.primaryPosition)} /><Stat label="Handedness" value={value(profile.handedness)} /><Stat label="Source" value={profile.source} /><Stat label="Snapshot" value={value(profile.snapshotAt)} /><Stat label="Sim usage" value={profile.modelImpact.simUsage.join(", ")} /></div></div></section></div></main>;
}
