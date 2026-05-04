import Link from "next/link";

import { backtestTrendCandidates, type HistoricalTrendEvent, type TrendBacktestSummary } from "@/services/trends/trend-backtester";
import { buildTrendFactoryPreview } from "@/services/trends/trend-factory";
import type { TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket } from "@/services/trends/trend-candidate-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUES = new Set(["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"]);
const MARKETS = new Set(["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"]);
const DEPTHS = new Set(["core", "expanded", "debug"]);

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseLimit(value: string | undefined) {
  if (!value) return 25;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.floor(parsed))) : 25;
}

function parseRows(value: string | undefined): HistoricalTrendEvent[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fmtPct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function fmtUnits(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}u`;
}

function chipClass(status: string) {
  if (status === "ready") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (status === "insufficient_sample") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (status === "no_matches") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-red-400/25 bg-red-400/10 text-red-200";
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: TrendBacktestSummary }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-950/65 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">{summary.candidateName}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">Grade {summary.grade} · {summary.qualityGate.replace(/_/g, " ")}</div>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${chipClass(summary.status)}`}>{summary.status.replace(/_/g, " ")}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4">
        <span>{summary.wins}-{summary.losses}{summary.pushes ? `-${summary.pushes}` : ""}</span>
        <span>{fmtUnits(summary.profitUnits)}</span>
        <span>{fmtPct(summary.roiPct)} ROI</span>
        <span>{fmtPct(summary.clvPct)} CLV</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500 sm:grid-cols-4">
        <span>Sample {summary.sampleSize}</span>
        <span>Win {fmtPct(summary.winRatePct)}</span>
        <span>Last 10 {summary.last10}</span>
        <span>Streak {summary.currentStreak ?? "TBD"}</span>
      </div>
      <div className="mt-3 text-xs leading-5 text-slate-400">{summary.sourceNote}</div>
      {summary.blockers.length ? <div className="mt-2 grid gap-1 text-[11px] leading-5 text-amber-100/80">{summary.blockers.slice(0, 3).map((blocker) => <div key={blocker}>- {blocker}</div>)}</div> : null}
    </article>
  );
}

export default async function TrendBacktestPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const leagueParam = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const marketParam = (readValue(resolved, "market") ?? "ALL").toLowerCase();
  const depthParam = (readValue(resolved, "depth") ?? "core").toLowerCase();
  const limit = parseLimit(readValue(resolved, "limit"));
  const minSample = parseLimit(readValue(resolved, "minSample") ?? "50");
  const rows = parseRows(readValue(resolved, "rows"));
  const league = (LEAGUES.has(leagueParam) ? leagueParam : "ALL") as TrendFactoryLeague | "ALL";
  const market = (MARKETS.has(marketParam) ? marketParam : "ALL") as TrendFactoryMarket | "ALL";
  const depth = (DEPTHS.has(depthParam) ? depthParam : "core") as TrendFactoryDepth;
  const preview = buildTrendFactoryPreview({ league, market, depth, limit });
  const summaries = backtestTrendCandidates(preview.candidates, rows, { minSample, historyLimit: 25 });
  const ready = summaries.filter((summary) => summary.status === "ready").length;
  const insufficient = summaries.filter((summary) => summary.status === "insufficient_sample").length;
  const noSource = rows.length === 0;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Trend Backtester</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Generated trend backtest preview</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">PR #164 foundation: evaluate Trend Factory candidates against supplied historical rows. This page does not fabricate historical data. When no source rows are connected, it reports no_rows and waits for the next data-wiring PR.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends/factory" className="text-cyan-200 hover:text-cyan-100">Factory</Link><Link href="/api/sharktrends/backtest" className="text-cyan-200 hover:text-cyan-100">API</Link><Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">Command board</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{Array.from(LEAGUES).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span><select name="market" defaultValue={market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{Array.from(MARKETS).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Depth</span><select name="depth" defaultValue={depth} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"><option value="core">core</option><option value="expanded">expanded</option><option value="debug">debug</option></select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Min sample</span><input name="minSample" defaultValue={String(minSample)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button className="md:col-span-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Run preview</button>
        </form>
      </section>

      {noSource ? <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">No historical row source is connected to this preview page yet. The engine is active, but every candidate correctly reports no_rows until PR #165/#166 wires persisted historical rows or generated-system result rows.</section> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Candidates" value={summaries.length} note="Generated candidates evaluated." />
        <Metric label="Source rows" value={rows.length} note="Historical rows supplied to the engine." />
        <Metric label="Ready" value={ready} note="Candidates clearing minimum sample." />
        <Metric label="Insufficient" value={insufficient} note="Matches found but sample too thin." />
        <Metric label="No rows" value={summaries.filter((summary) => summary.status === "no_rows").length} note="Waiting for source data." />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        {summaries.map((summary) => <SummaryCard key={summary.candidateId} summary={summary} />)}
      </section>
    </main>
  );
}
