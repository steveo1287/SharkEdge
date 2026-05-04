import Link from "next/link";

import { buildCommandBoardV2, type CommandBoardV2Game } from "@/services/trends/command-board-v2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

type BoardMode = "command" | "all";

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(value: string | undefined) {
  const parsed = Number(value ?? 40);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : 40;
}

function parseMode(value: string | undefined): BoardMode {
  return value === "all" ? "all" : "command";
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

function generatedStatusClass(status: string | undefined) {
  if (status === "verified") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (status === "attached_pending_verification") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

function ProofStrip({ proof }: { proof: any }) {
  if (!proof) return <div className="text-xs text-slate-500">No proof packet.</div>;
  return <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-5"><span>{proof.record ?? "TBD"}</span><span>{units(proof.profitUnits)}</span><span>{pct(proof.roiPct)} ROI</span><span>{pct(proof.winRatePct)} hit</span><span>{pct(proof.clvPct)} CLV</span></div>;
}

function isCommandReady(game: CommandBoardV2Game) {
  return game.commandTier === "action"
    || game.counts.generatedVerified > 0
    || game.counts.generated > 0
    || Boolean(game.market);
}

function CardPill({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 text-center text-[10px] uppercase tracking-[0.12em] text-slate-500"><div className="text-sm font-semibold text-white">{value}</div>{label}</div>;
}

function GameCard({ game, compact = false }: { game: CommandBoardV2Game; compact?: boolean }) {
  const native = game.nativeTrend as any;
  const generated = game.generatedSystem as any;
  const market = game.market as any;
  const generatedStatus = generated?.verificationStatus === "verified" ? "Verified generated" : generated?.verificationStatus === "attached_pending_verification" ? "Generated pending verification" : "Generated system";

  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${tierClass(game.commandTier)}`}>{game.commandTier}</span><span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100">Score {game.commandScore}</span><span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">{game.league}</span></div>
          <Link href={game.href} className="mt-3 block text-xl font-semibold leading-snug text-white hover:text-cyan-100">{game.eventLabel}</Link>
          <div className="mt-1 text-xs leading-5 text-slate-500">{time(game.startTime)} · {game.status}</div>
        </div>
        <div className="grid grid-cols-4 gap-2"><CardPill label="native" value={game.counts.native} /><CardPill label="gen attach" value={game.counts.generated} /><CardPill label="verified" value={game.counts.generatedVerified ?? 0} /><CardPill label="blocks" value={game.counts.blockers} /></div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Action gate</div><div className="mt-2 text-sm leading-6 text-slate-300">{game.actionGate}</div></div>

      {!compact ? <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Native SharkTrend</div>{native ? <><div className="mt-2 text-sm font-semibold text-white">{native.name}</div><div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{native.market} · {native.side} · score {native.score}</div><div className="mt-3"><ProofStrip proof={native.proof} /></div><div className="mt-3 text-[11px] text-slate-400">Price {price(native.price)} · edge {pct(native.edgePct)}</div></> : <div className="mt-2 text-xs text-slate-500">No native trend attached.</div>}</div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="flex flex-wrap items-center gap-2"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Generated System</div>{generated?.verificationStatus ? <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.13em] ${generatedStatusClass(generated.verificationStatus)}`}>{generated.verificationStatus.replace(/_/g, " ")}</span> : null}</div>{generated ? <><div className="mt-2 text-sm font-semibold text-white">{generated.name}</div><div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{generated.market} · {generated.side} · {generated.grade} {generated.verificationScore}</div><div className="mt-3"><ProofStrip proof={generated.proof} /></div><div className="mt-3 text-[11px] text-slate-400">{generated.reasons?.[0] ?? generatedStatus}</div>{generated.blockers?.length ? <div className="mt-2 grid gap-1 text-[11px] text-amber-100/80">{generated.blockers.slice(0, 3).map((blocker: string) => <div key={blocker}>- {blocker}</div>)}</div> : null}</> : <div className="mt-2 text-xs text-slate-500">No generated system attached to this game.</div>}</div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Market Intelligence</div>{market ? <><div className="mt-2 text-sm font-semibold text-white">{market.sourceStatus}</div><div className="mt-1 text-[11px] text-slate-400">Line {price(market.lineMovement?.openPrice)} → {price(market.lineMovement?.currentPrice ?? market.lineMovement?.closingPrice)}</div><div className="mt-1 text-[11px] text-slate-400">CLV {pct(market.clv?.clvPct)} · books {market.bookDisagreement?.bookCount ?? 0}</div><div className="mt-1 text-[11px] text-slate-400">Bets {pct(market.splits?.betPct)} · money {pct(market.splits?.moneyPct)}</div></> : <div className="mt-2 text-xs text-slate-500">Market data not sourced.</div>}</div>
      </div> : null}

      {!compact ? <div className="mt-4 grid gap-2 md:grid-cols-2"><div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Reasons</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{game.reasons.length ? game.reasons.map((reason) => <div key={reason}>+ {reason}</div>) : <div className="text-slate-500">No support reasons listed.</div>}</div></div><div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3"><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Blockers</div><div className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">{game.blockers.length ? game.blockers.map((blocker) => <div key={blocker}>- {blocker}</div>) : <div className="text-slate-500">No board blockers.</div>}</div></div></div> : null}
    </article>
  );
}

export default async function CommandBoardV2Page({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const market = (readValue(resolved, "market") ?? "ALL").toLowerCase();
  const limit = parseLimit(readValue(resolved, "limit"));
  const mode = parseMode(readValue(resolved, "mode"));
  const payload = await buildCommandBoardV2({ league, market, limit });
  const commandGames = payload.games.filter(isCommandReady);
  const incompleteGames = payload.games.filter((game) => !isCommandReady(game));
  const visibleGames = mode === "all" ? payload.games : commandGames;
  const hasDataGap = payload.stats.generatedAttached === 0 || payload.stats.marketSourced === 0;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends Command Board</div><h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Game-first signal stack</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Default view shows command-ready games only. Incomplete raw games are collapsed so the board does not become an endless blocker feed.</p></div><div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends/ingestion-health" className="text-cyan-200 hover:text-cyan-100">Ingestion health</Link><Link href="/sharktrends/market-data-source" className="text-cyan-200 hover:text-cyan-100">Market source</Link><Link href="/sharktrends?mode=all" className="text-cyan-200 hover:text-cyan-100">Show all</Link></div></div></section>
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4"><form method="get" className="grid gap-3 md:grid-cols-4"><input type="hidden" name="mode" value={mode} /><label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span><select name="market" defaultValue={market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label><button className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Load board</button></form></section>
      {hasDataGap ? <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100"><div className="font-semibold text-white">Data pipe still incomplete</div><div className="mt-2">Generated attachments or market context are still missing from this view. Open ingestion health and market source before trusting the board as complete.</div><div className="mt-3 flex flex-wrap gap-2"><Link href="/sharktrends/ingestion-health" className="rounded-xl border border-amber-300/25 bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">Ingestion health</Link><Link href="/sharktrends/market-data-source" className="rounded-xl border border-amber-300/25 bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">Market source</Link><Link href="/sharktrends?mode=all" className="rounded-xl border border-amber-300/25 bg-black/20 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">Debug all games</Link></div></section> : null}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Metric label="Command games" value={commandGames.length} note="Games shown by default." /><Metric label="Hidden raw" value={incompleteGames.length} note="Incomplete games collapsed below." /><Metric label="Generated attached" value={payload.stats.generatedAttached ?? 0} note="Generated systems attached to games." /><Metric label="Verified generated" value={payload.stats.verifiedGenerated} note="Fully verified generated systems." /><Metric label="Market sourced" value={payload.stats.marketSourced} note="Games with market context." /></section>
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{payload.sourceNote}</section>
      <section className="grid gap-4">{visibleGames.length ? visibleGames.map((game) => <GameCard key={game.eventId} game={game} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">No command-ready games yet. This means the current games do not have generated-system attachments or market context. Use the health links above to fix the data pipe, or open debug mode to inspect raw games.</div>}</section>
      {mode !== "all" && incompleteGames.length ? <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Incomplete raw games</div><div className="mt-1 text-xs leading-5 text-slate-500">Collapsed by default. These are mostly useful for debugging missing generated attachments or market source rows.</div></div><span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">{incompleteGames.length}</span></div></summary><div className="mt-4 grid gap-3">{incompleteGames.slice(0, 12).map((game) => <GameCard key={game.eventId} game={game} compact />)}</div></details> : null}
    </main>
  );
}
