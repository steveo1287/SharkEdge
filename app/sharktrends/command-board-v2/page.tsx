import Link from "next/link";

import { buildCommandBoardV2, type CommandBoardV2Game } from "@/services/trends/command-board-v2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(value: string | undefined) {
  const parsed = Number(value ?? 40);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : 40;
}

function pct(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed}%` : "TBD";
}

function units(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "TBD";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(Math.abs(parsed) >= 10 ? 1 : 2)}u`;
}

function price(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "TBD";
  return parsed > 0 ? `+${parsed}` : String(parsed);
}

function time(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function tierClass(tier: string) {
  if (tier === "action") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (tier === "watch") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (tier === "blocked") return "border-red-400/25 bg-red-400/10 text-red-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

function ProofStrip({ proof }: { proof: any }) {
  if (!proof) return <div className="text-xs text-slate-500">No proof packet.</div>;
  return <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-5"><span>{proof.record ?? "TBD"}</span><span>{units(proof.profitUnits)}</span><span>{pct(proof.roiPct)} ROI</span><span>{pct(proof.winRatePct)} hit</span><span>{pct(proof.clvPct)} CLV</span></div>;
}

function GameCard({ game }: { game: CommandBoardV2Game }) {
  const native = game.nativeTrend as any;
  const generated = game.generatedSystem as any;
  const market = game.market as any;
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${tierClass(game.commandTier)}`}>{game.commandTier}</span><span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100">Score {game.commandScore}</span><span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">{game.league}</span></div>
          <Link href={game.href} className="mt-3 block text-xl font-semibold leading-snug text-white hover:text-cyan-100">{game.eventLabel}</Link>
          <div className="mt-1 text-xs leading-5 text-slate-500">{time(game.startTime)} · {game.status}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-[0.12em] text-slate-500"><div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{game.counts.native}</div>native</div><div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{game.counts.generated}</div>verified</div><div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{game.counts.blockers}</div>blocks</div></div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Action gate</div><div className="mt-2 text-sm leading-6 text-slate-300">{game.actionGate}</div></div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Native SharkTrend</div>{native ? <><div className="mt-2 text-sm font-semibold text-white">{native.name}</div><div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{native.market} · {native.side} · score {native.score}</div><div className="mt-3"><ProofStrip proof={native.proof} /></div><div className="mt-3 text-[11px] text-slate-400">Price {price(native.price)} · edge {pct(native.edgePct)}</div></> : <div className="mt-2 text-xs text-slate-500">No native trend attached.</div>}</div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Verified Generated</div>{generated ? <><div className="mt-2 text-sm font-semibold text-white">{generated.name}</div><div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{generated.market} · {generated.side} · {generated.grade} {generated.verificationScore}</div><div className="mt-3"><ProofStrip proof={generated.proof} /></div><div className="mt-3 text-[11px] text-slate-400">{generated.reasons?.[0] ?? "Verified generated system attached."}</div></> : <div className="mt-2 text-xs text-slate-500">No verified generated system cleared gates.</div>}</div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Market Intelligence</div>{market ? <><div className="mt-2 text-sm font-semibold text-white">{market.sourceStatus}</div><div className="mt-1 text-[11px] text-slate-400">Line {price(market.lineMovement?.openPrice)} → {price(market.lineMovement?.currentPrice ?? market.lineMovement?.closingPrice)}</div><div className="mt-1 text-[11px] text-slate-400">CLV {pct(market.clv?.clvPct)} · books {market.bookDisagreement?.bookCount ?? 0}</div><div className="mt-1 text-[11px] text-slate-400">Bets {pct(market.splits?.betPct)} · money {pct(market.splits?.moneyPct)}</div></> : <div className="mt-2 text-xs text-slate-500">Market data not sourced.</div>}</div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2"><div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Reasons</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{game.reasons.length ? game.reasons.map((reason) => <div key={reason}>+ {reason}</div>) : <div className="text-slate-500">No support reasons listed.</div>}</div></div><div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Blockers</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{game.blockers.length ? game.blockers.map((blocker) => <div key={blocker}>- {blocker}</div>) : <div className="text-slate-500">No board blockers.</div>}</div></div></div>
    </article>
  );
}

export default async function CommandBoardV2Page({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const market = (readValue(resolved, "market") ?? "ALL").toLowerCase();
  const limit = parseLimit(readValue(resolved, "limit"));
  const payload = await buildCommandBoardV2({ league, market, limit });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Command Board v2</div><h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Game-first signal stack</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Native trends, verified generated systems, and sourced market intelligence are composed into one matchup card with reasons, blockers, and an action gate.</p></div><div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Main board</Link><Link href="/api/sharktrends/command-board-v2" className="text-cyan-200 hover:text-cyan-100">API</Link></div></div></section>
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4"><form method="get" className="grid gap-3 md:grid-cols-4"><label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span><select name="market" defaultValue={market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label><button className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Load board</button></form></section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Metric label="Games" value={payload.stats.games} note="Composed matchup cards." /><Metric label="Action" value={payload.stats.action} note="Full signal stack aligned." /><Metric label="Verified generated" value={payload.stats.verifiedGenerated} note="Verified systems attached." /><Metric label="Market sourced" value={payload.stats.marketSourced} note="Games with sourced market context." /></section>
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{payload.sourceNote}</section>
      <section className="grid gap-4">{payload.games.length ? payload.games.map((game) => <GameCard key={game.eventId} game={game} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">No command-board v2 games are available under this view.</div>}</section>
    </main>
  );
}
