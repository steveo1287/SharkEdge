import Link from "next/link";

import { buildOddsApiIoHealth } from "@/services/ingestion/odds-api-io-health";
import ProviderTriggerForm from "./form";

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

export default async function ProviderTriggerPage() {
  const health = await buildOddsApiIoHealth(10);
  const latest = health.recentRuns[0];

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Provider Trigger</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Start Odds-API.io ingestion</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">The provider is configured, but no run has been logged. Use this page to execute the server-side test or write run without exposing credentials in a URL.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sharktrends" className="text-cyan-200 hover:text-cyan-100">SharkTrends</Link>
            <Link href="/sharktrends/ingestion-health" className="text-cyan-200 hover:text-cyan-100">Health</Link>
            <Link href="/sharktrends/market-data-source" className="text-cyan-200 hover:text-cyan-100">Market source</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="API key" value={health.configured.apiKey ? "set" : "missing"} note="Server can see provider config." />
        <Metric label="Secret" value={health.configured.writeSecret ? "set" : "missing"} note="Write/cron config available." />
        <Metric label="Latest run" value={fmtTime(health.stats.latestRunAt)} note={latest ? `${latest.mode} · ${latest.ok ? "ok" : "fail"}` : "No run logged."} />
        <Metric label="Provider events" value={health.stats.totalProviderEvents} note="Events returned by provider." />
        <Metric label="Snapshots" value={health.stats.totalSnapshotsWritten} note="Rows written to odds snapshots." />
        <Metric label="Line history" value={health.stats.totalLineRowsWritten} note="Rows written to line history." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
        <ProviderTriggerForm />
      </section>

      {health.attachmentReadiness.blockers.length ? (
        <section className="rounded-[1.5rem] border border-red-400/20 bg-red-400/10 p-4 text-sm leading-6 text-red-50">
          <div className="font-semibold text-white">Current blockers</div>
          <div className="mt-2 grid gap-1">
            {health.attachmentReadiness.blockers.map((blocker) => <div key={blocker}>- {blocker}</div>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
