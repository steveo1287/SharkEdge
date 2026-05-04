import Link from "next/link";

import { buildMarketDataSourceSummary } from "@/services/trends/market-data-source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

export default async function OddsApiIoProviderPage() {
  const marketSource = await buildMarketDataSourceSummary();
  const configured = Boolean(process.env.ODDS_API_IO_KEY ?? process.env.ODDS_API_KEY);
  const writeProtected = Boolean(process.env.ODDS_API_IO_INGEST_SECRET ?? process.env.INGEST_SECRET);
  const dryRunHref = "/api/admin/ingest/odds-api-io?sport=baseball&league=MLB&status=upcoming&eventLimit=5&dryRun=true";

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Odds-API.io Provider</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Free odds ingestion foundation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Backend provider wiring for odds snapshots and line-history rows. Dry-run is safe; write mode requires an ingest secret.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sharktrends/market-data-source" className="text-cyan-200 hover:text-cyan-100">Market source</Link>
            <Link href="/sharktrends/market-intelligence" className="text-cyan-200 hover:text-cyan-100">Market intelligence</Link>
            <Link href="/api/admin/ingest/odds-api-io" className="text-cyan-200 hover:text-cyan-100">Ingest API</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="API key" value={configured ? "set" : "missing"} note="Set ODDS_API_IO_KEY in Vercel." />
        <Metric label="Write secret" value={writeProtected ? "set" : "missing"} note="Set ODDS_API_IO_INGEST_SECRET for dryRun=false." />
        <Metric label="Odds rows" value={marketSource.tables.oddsSnapshots} note="Rows in market_odds_snapshots." />
        <Metric label="Line rows" value={marketSource.tables.lineHistory} note="Rows in market_line_history." />
      </section>

      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Provider actions</div>
        <div className="grid gap-3 md:grid-cols-3">
          <a href={dryRunHref} className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Run MLB dry-run</a>
          <Link href="/sharktrends/market-data-source" className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Check source rows</Link>
          <Link href="/sharktrends/command-board-v2" className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Open board v2</Link>
        </div>
        <div className="mt-3 text-xs leading-5 text-slate-400">
          Write mode uses the same endpoint with dryRun=false and a valid ingest secret through a Bearer token, x-ingest-secret header, or secret query parameter.
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Required Vercel variables</div>
        <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
          <div><span className="font-semibold text-white">ODDS_API_IO_KEY</span> — provider API key.</div>
          <div><span className="font-semibold text-white">ODDS_API_IO_INGEST_SECRET</span> — write-mode protection for ingestion.</div>
          <div><span className="font-semibold text-white">ODDS_API_IO_BOOKMAKERS</span> — optional comma-separated bookmaker list. Defaults to Bet365,Unibet.</div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">
        {marketSource.sourceNote}
      </section>
    </main>
  );
}
