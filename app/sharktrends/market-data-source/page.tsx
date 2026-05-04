import Link from "next/link";

import { buildMarketDataSourceSummary } from "@/services/trends/market-data-source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtTime(value: string | null) {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

export default async function MarketDataSourcePage() {
  const payload = await buildMarketDataSourceSummary();

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Market Data Source</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Odds, splits, and line-history ingestion</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">PR #176 source view: confirm whether source-agnostic market data tables are populated before market intelligence relies on them.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends/market-intelligence" className="text-cyan-200 hover:text-cyan-100">Market intelligence</Link><Link href="/api/sharktrends/market-data-source" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className={`rounded-[1.5rem] border p-4 text-sm leading-6 ${payload.readiness.usableForMarketIntelligence ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-amber-300/20 bg-amber-300/10 text-amber-100"}`}>
        <div className="font-semibold text-white">{payload.readiness.usableForMarketIntelligence ? "Market source usable" : "Market source not ready"}</div>
        <div className="mt-2">{payload.sourceNote}</div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Books" value={payload.tables.books} note="Rows in market_books." />
        <Metric label="Odds snapshots" value={payload.tables.oddsSnapshots} note="Rows in market_odds_snapshots." />
        <Metric label="Betting splits" value={payload.tables.bettingSplits} note="Rows in market_betting_splits." />
        <Metric label="Line history" value={payload.tables.lineHistory} note="Rows in market_line_history." />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-red-400/20 bg-red-400/5 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200">Blockers</div><div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">{payload.readiness.blockers.length ? payload.readiness.blockers.map((item) => <div key={item}>- {item}</div>) : <div className="text-slate-500">No hard blockers.</div>}</div></div>
        <div className="rounded-[1.25rem] border border-cyan-300/20 bg-cyan-300/5 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Recommendations</div><div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">{payload.readiness.recommendations.map((item) => <div key={item}>• {item}</div>)}</div></div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Coverage by league</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Rows and freshness across the market ingestion tables.</div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">{payload.coverage.length}</span>
        </div>
        {payload.coverage.length ? (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-[900px] w-full border-collapse text-left text-xs">
              <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-slate-500"><tr><th className="px-3 py-3">League</th><th className="px-3 py-3">Odds</th><th className="px-3 py-3">Splits</th><th className="px-3 py-3">Lines</th><th className="px-3 py-3">Latest odds</th><th className="px-3 py-3">Latest splits</th><th className="px-3 py-3">Latest line</th></tr></thead>
              <tbody className="divide-y divide-white/10 text-slate-300">
                {payload.coverage.map((row) => <tr key={row.league}><td className="px-3 py-3 font-semibold text-white">{row.league}</td><td className="px-3 py-3">{row.oddsRows}</td><td className="px-3 py-3">{row.splitRows}</td><td className="px-3 py-3">{row.lineRows}</td><td className="px-3 py-3 text-slate-400">{fmtTime(row.latestOddsAt)}</td><td className="px-3 py-3 text-slate-400">{fmtTime(row.latestSplitsAt)}</td><td className="px-3 py-3 text-slate-400">{fmtTime(row.latestLineAt)}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">No market ingestion coverage is available yet.</div>}
      </section>
    </main>
  );
}
