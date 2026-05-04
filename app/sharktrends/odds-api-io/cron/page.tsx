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

function latestMlbTime(coverage: Awaited<ReturnType<typeof buildMarketDataSourceSummary>>["coverage"]) {
  const mlb = coverage.find((row) => row.league === "MLB");
  if (!mlb?.latestOddsAt) return "never";
  const parsed = new Date(mlb.latestOddsAt);
  if (Number.isNaN(parsed.getTime())) return mlb.latestOddsAt;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function OddsApiIoCronPage() {
  const source = await buildMarketDataSourceSummary();
  const keySet = Boolean(process.env.ODDS_API_IO_KEY ?? process.env.ODDS_API_KEY);
  const secretSet = Boolean(process.env.CRON_SECRET ?? process.env.ODDS_API_IO_INGEST_SECRET ?? process.env.INGEST_SECRET);
  const mlb = source.coverage.find((row) => row.league === "MLB");

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Odds-API.io Cron</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">MLB first-league auto-fill</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Scheduled MLB odds ingestion every 30 minutes. This fills market odds snapshots and line history when the provider key and cron secret are configured.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sharktrends/odds-api-io" className="text-cyan-200 hover:text-cyan-100">Provider</Link>
            <Link href="/sharktrends/market-data-source" className="text-cyan-200 hover:text-cyan-100">Market source</Link>
            <Link href="/sharktrends/command-board-v2" className="text-cyan-200 hover:text-cyan-100">Board v2</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Provider key" value={keySet ? "set" : "missing"} note="ODDS_API_IO_KEY or ODDS_API_KEY." />
        <Metric label="Cron secret" value={secretSet ? "set" : "missing"} note="CRON_SECRET or ingest secret." />
        <Metric label="MLB odds rows" value={mlb?.oddsRows ?? 0} note="Rows in market_odds_snapshots for MLB." />
        <Metric label="Latest MLB odds" value={latestMlbTime(source.coverage)} note="Most recent captured odds row." />
      </section>

      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Scheduled route</div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 font-mono text-xs leading-6 text-slate-300">/api/cron/odds-api-io/mlb?eventLimit=15</div>
        <div className="mt-3 text-sm leading-6 text-slate-400">Vercel cron runs this route every 30 minutes. Manual write mode requires a valid secret through Bearer auth, x-cron-secret, x-ingest-secret, or the secret query parameter.</div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">{source.sourceNote}</section>
    </main>
  );
}
