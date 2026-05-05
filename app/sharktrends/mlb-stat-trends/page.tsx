import Link from "next/link";

import { type MlbDecisionGate } from "@/services/mlb/mlb-elite-decision-layer";
import { buildMlbPregameContextTrends, type MlbPregameTrend } from "@/services/mlb/mlb-pregame-context-layer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type ReceiptRow = MlbPregameTrend["receipts"][number];

const gradeTone: Record<string, string> = {
  A: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100",
  B: "border-sky-300/30 bg-sky-400/10 text-sky-100",
  Watch: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  Pass: "border-slate-500/30 bg-slate-500/10 text-slate-300"
};

const receiptTone: Record<ReceiptRow["tone"], string> = {
  good: "border-emerald-300/20 bg-emerald-400/[0.06]",
  warn: "border-amber-300/20 bg-amber-400/[0.06]",
  neutral: "border-white/10 bg-white/[0.03]"
};

const actionTone: Record<MlbPregameTrend["actionability"], string> = {
  ACTIONABLE_CANDIDATE: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100",
  PRICE_REQUIRED: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
  WATCHLIST: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  PASS: "border-slate-500/30 bg-slate-500/10 text-slate-300"
};

const gateTone: Record<MlbDecisionGate["status"], string> = {
  PASS: "border-emerald-300/20 bg-emerald-400/[0.05] text-emerald-100",
  WARN: "border-amber-300/20 bg-amber-400/[0.05] text-amber-100",
  FAIL: "border-red-300/20 bg-red-400/[0.05] text-red-100",
  PENDING: "border-cyan-300/20 bg-cyan-400/[0.05] text-cyan-100"
};

function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function readDate(value: string | undefined) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined; }
function fmt(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function pct(value: number) { return `${Math.round(value * 100)}%`; }
function actionLabel(value: MlbPregameTrend["actionability"]) { return value.replace(/_/g, " ").toLowerCase(); }

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string | number; note: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const toneClass = tone === "good" ? "border-emerald-400/20 bg-emerald-400/[0.06]" : tone === "warn" ? "border-amber-300/20 bg-amber-400/[0.06]" : tone === "bad" ? "border-red-400/20 bg-red-400/[0.06]" : "border-white/10 bg-slate-950/60";
  return <div className={`rounded-2xl border p-4 ${toneClass}`}><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

function Receipt({ row }: { row: ReceiptRow }) {
  return <div className={`rounded-xl border p-3 ${receiptTone[row.tone]}`}><div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{row.label}</div><div className="mt-1 text-lg font-semibold text-white">{row.value}</div><div className="mt-1 text-xs leading-5 text-slate-400">{row.note}</div></div>;
}

function Gate({ gate }: { gate: MlbDecisionGate }) {
  return <div className={`rounded-xl border p-3 ${gateTone[gate.status]}`}><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-semibold uppercase tracking-[0.16em]">{gate.label}</div><div className="text-[10px] font-semibold uppercase tracking-[0.16em]">{gate.status}</div></div><div className="mt-2 text-xs leading-5 text-slate-300/80">{gate.note}</div></div>;
}

function MarketStrip({ trend }: { trend: MlbPregameTrend }) {
  const market = trend.marketContext;
  const tone = market.matched ? "border-cyan-300/20 bg-cyan-400/[0.05] text-cyan-100" : "border-amber-300/20 bg-amber-400/[0.05] text-amber-100";
  return <div className={`mt-4 rounded-xl border p-3 text-xs leading-5 ${tone}`}><span className="font-semibold uppercase tracking-[0.14em]">Market context:</span> {market.note} {market.sportsbook ? <span className="text-slate-300">Source: {market.sportsbook} · books {market.sourceCount}{market.hold == null ? "" : ` · hold ${(market.hold * 100).toFixed(1)}%`}</span> : null}</div>;
}

function PregameStrip({ trend }: { trend: MlbPregameTrend }) {
  const context = trend.pregameContext;
  const tone = context.promotionBlockedBy.length ? "border-amber-300/20 bg-amber-400/[0.05] text-amber-100" : "border-emerald-300/20 bg-emerald-400/[0.05] text-emerald-100";
  return <div className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${tone}`}><span className="font-semibold uppercase tracking-[0.14em]">Pregame context:</span> roof {context.roofType} · weather sensitivity {context.weatherSensitivity} · start {context.gameStartBucket} · lineup {context.lineupStatus} · weather {context.weatherStatus} · umpire {context.umpireStatus}. {context.notes.join(" ")}</div>;
}

function TrendCard({ trend }: { trend: MlbPregameTrend }) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-slate-950/65 p-4 shadow-[0_0_40px_rgba(14,165,233,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${gradeTone[trend.grade]}`}>{trend.grade}</span><span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${actionTone[trend.actionability]}`}>{actionLabel(trend.actionability)}</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">{trend.category}</span><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">{trend.market}</span></div>
          <h2 className="mt-3 font-display text-2xl font-semibold text-white">{trend.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{trend.decisionSummary}</p>
        </div>
        <div className="text-left md:text-right"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Decision score</div><div className="mt-1 text-3xl font-semibold text-white">{trend.decisionScore}</div><div className="mt-1 text-xs text-slate-500">Confidence {pct(trend.confidence)} · {fmt(trend.startTime)}</div></div>
      </div>
      <MarketStrip trend={trend} />
      <PregameStrip trend={trend} />
      <div className="mt-4 grid gap-3 md:grid-cols-3">{trend.receipts.map((row) => <Receipt key={`${trend.id}-${row.label}`} row={row} />)}</div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{trend.gates.map((gate) => <Gate key={`${trend.id}-${gate.key}`} gate={gate} />)}</div>
      {trend.riskFlags.length ? <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-3 text-xs leading-5 text-amber-100/80"><span className="font-semibold uppercase tracking-[0.14em] text-amber-200">Risk flags:</span> {trend.riskFlags.join(" ")}</div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{trend.matchup} · {trend.venue} · Source: {trend.source}</span><Link href={trend.actionHref} className="font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">Open sim</Link></div>
    </article>
  );
}

export default async function MlbStatTrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const payload = await buildMlbPregameContextTrends({ date: readDate(one(resolved.date)) });
  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/75 p-5 shadow-[0_0_70px_rgba(14,165,233,0.10)]"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB pregame-gated trends</div><h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Decision-grade MLB trend board</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Built from official schedule data, recent final scores, probable pitchers, pitcher stat logs, existing sportsbook consensus, and structured pregame context. The board now separates stat strength from market readiness and lineup/weather/umpire promotion blockers.</p></div><div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/trends?league=MLB" className="text-cyan-200 hover:text-cyan-100">Main trends</Link><Link href="/sharktrends/mlb-spine" className="text-cyan-200 hover:text-cyan-100">MLB spine</Link><Link href="/api/mlb/stat-trends" className="text-cyan-200 hover:text-cyan-100">JSON</Link></div></div></section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-8"><Metric label="Games" value={payload.stats.games} note={`MLB games on ${payload.date}.`} /><Metric label="Decision avg" value={payload.stats.avgDecisionScore} tone={payload.stats.avgDecisionScore >= 70 ? "good" : payload.stats.avgDecisionScore >= 55 ? "warn" : "neutral"} note="Average score across visible stat cards." /><Metric label="Market ready" value={payload.stats.marketReady} tone={payload.stats.marketReady ? "good" : "neutral"} note="Cards with clean enough price gate." /><Metric label="Context blocked" value={payload.stats.contextBlocked} tone={payload.stats.contextBlocked ? "warn" : "good"} note="Cards blocked by lineup/weather/umpire context." /><Metric label="Dome/roof" value={payload.stats.domeOrRetractable} tone={payload.stats.domeOrRetractable ? "good" : "neutral"} note="Cards in lower-weather-risk venues." /><Metric label="Weather sensitive" value={payload.stats.weatherSensitive} tone={payload.stats.weatherSensitive ? "warn" : "neutral"} note="High-sensitivity open-air cards." /><Metric label="Lineup pending" value={payload.stats.lineupPending} tone={payload.stats.lineupPending ? "warn" : "good"} note="Cards still waiting on lineup truth." /><Metric label="Umpire pending" value={payload.stats.umpirePending} tone={payload.stats.umpirePending ? "warn" : "good"} note="Cards still waiting on umpire context." /></section>
      {payload.blockers.length ? <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-100"><div className="font-semibold text-white">Current gates</div><div className="mt-2 grid gap-1">{payload.blockers.map((blocker) => <div key={blocker}>- {blocker}</div>)}</div></section> : null}
      <section className="grid gap-4">{payload.trends.length ? payload.trends.map((trend) => <TrendCard key={trend.id} trend={trend} />) : <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-400">No MLB stat trend cleared threshold for this date.</div>}</section>
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4"><div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Game snapshots</div><div className="mt-3 grid gap-3 lg:grid-cols-2">{payload.games.map((game) => <div key={game.gamePk} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-sm font-semibold text-white">{game.matchup}</div><div className="mt-1 text-xs text-slate-500">{fmt(game.startTime)} · {game.venue} · {game.status}</div><div className="mt-2 text-xs leading-5 text-slate-400">{game.away.abbreviation}: {game.away.wins}-{game.away.losses}, diff {game.away.runDiffPerGame > 0 ? "+" : ""}{game.away.runDiffPerGame.toFixed(1)} · {game.home.abbreviation}: {game.home.wins}-{game.home.losses}, diff {game.home.runDiffPerGame > 0 ? "+" : ""}{game.home.runDiffPerGame.toFixed(1)}</div><div className="mt-2 text-xs text-slate-500">Probables: {game.awayPitcher.name} vs {game.homePitcher.name}</div></div>)}</div></section>
      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{payload.sourceNote}</section>
    </main>
  );
}
