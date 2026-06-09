import Link from "next/link";

import { getMlbPlayerMarketDrivers, type MlbPlayerDriverMarket, type MlbPlayerMarketDriver } from "@/services/players/mlb-player-market-drivers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const MARKET_OPTIONS: Array<{ key: MlbPlayerDriverMarket; label: string }> = [
  { key: "all", label: "All" },
  { key: "moneyline", label: "Moneyline" },
  { key: "team_total", label: "Team totals" },
  { key: "first_five", label: "First five" },
  { key: "pitcher_strikeouts", label: "Pitcher Ks" },
  { key: "pitcher_outs", label: "Pitcher outs" },
  { key: "nrfi_yrfi", label: "NRFI/YRFI" },
  { key: "player_props", label: "Player props" }
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function signed(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}` : "—";
}

function DriverCard({ driver }: { driver: MlbPlayerMarketDriver }) {
  return <Link href={driver.href} className="rounded-[1.2rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:border-cyan-300/35"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">{driver.team} · {driver.role} · {driver.roleTier}</div><h2 className="mt-2 font-display text-2xl font-black tracking-tight text-white">{driver.name}</h2><div className="mt-1 text-xs text-slate-500">{driver.primaryTrait?.label ?? "Trait"} {driver.primaryTrait?.score ?? "—"} · {driver.secondaryTrait?.label ?? "support"} {driver.secondaryTrait?.score ?? "—"}</div></div><div className="text-right"><div className="text-xs text-slate-500">Driver</div><div className="font-display text-4xl font-black text-white">{driver.driverScore}</div><div className="font-mono text-xs text-emerald-200">OVR {driver.overall ?? "—"}</div></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Runs</div><div className="mt-1 font-mono font-black text-white">{signed(driver.projectedRunImpact)}</div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Win prob</div><div className="mt-1 font-mono font-black text-white">{signed(driver.winProbabilityImpactPct, "%")}</div></div></div><div className="mt-4 grid gap-2">{driver.reasons.slice(0, 3).map((reason) => <div key={reason} className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.045] p-2 text-xs leading-5 text-cyan-100">{reason}</div>)}</div><div className="mt-3 rounded-2xl border border-amber-300/10 bg-amber-300/[0.045] p-2 text-xs leading-5 text-amber-100">{driver.riskNotes[0]}</div></Link>;
}

export default async function PlayerDriversPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const market = first(params.market) ?? "all";
  const team = first(params.team);
  const board = await getMlbPlayerMarketDrivers({ market, team, limit: 60 });

  return <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-6"><div className="mx-auto grid max-w-7xl gap-5 pb-16"><section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">MLB Player Market Drivers</div><h1 className="mt-2 font-display text-4xl font-black tracking-tight text-white sm:text-5xl">Market-specific player edges</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Ranks player cards by the market they influence: moneyline, team totals, first five, pitcher strikeouts, pitcher outs, NRFI/YRFI, and player props. This is the shortlist layer for sim explanations and ticket reasoning.</p></div><div className="flex gap-2"><Link href={`/api/mlb/player-drivers?market=${encodeURIComponent(board.market)}&team=${encodeURIComponent(team ?? "")}`} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">JSON</Link><Link href="/player-profiles/matchup" className="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Matchup</Link></div></div></section><section className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4"><form className="grid gap-3 md:grid-cols-[1fr_12rem_7rem]" action="/player-profiles/drivers"><select name="market" defaultValue={board.market} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none">{MARKET_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select><input name="team" defaultValue={team ?? ""} placeholder="Team" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600" /><button className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">Rank</button></form></section><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Market</div><div className="mt-2 font-display text-3xl font-black text-white">{board.market}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Drivers</div><div className="mt-2 font-display text-3xl font-black text-white">{board.count}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Team</div><div className="mt-2 font-display text-3xl font-black text-white">{board.team ?? "ALL"}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Status</div><div className="mt-2 font-display text-3xl font-black text-white">{board.ok ? "LIVE" : "WARN"}</div></div></section><section className="grid gap-2">{board.marketNotes.map((note) => <div key={note} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">{note}</div>)}{board.warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">{warning}</div>)}</section><section className="grid gap-3 lg:grid-cols-2">{board.drivers.map((driver) => <DriverCard key={`${driver.market}-${driver.playerId}`} driver={driver} />)}{!board.drivers.length ? <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No market drivers returned. Seed player profile rows or loosen filters.</div> : null}</section></div></main>;
}
