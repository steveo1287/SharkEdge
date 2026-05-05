import Link from "next/link";

import { buildOddsApiIoHealth } from "@/services/ingestion/odds-api-io-health";
import InlineProviderTrigger from "./inline-provider-trigger";

type ProviderHealthView = Awaited<ReturnType<typeof buildOddsApiIoHealth>>;

function fmtTime(value: string | null) {
  if (!value) return "never";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown provider health error";
}

function fallbackHealth(error: unknown): ProviderHealthView {
  const message = errorMessage(error);
  return {
    configured: {
      apiKey: false,
      writeSecret: false
    },
    stats: {
      latestRunAt: null,
      latestSuccessAt: null,
      totalProviderEvents: 0,
      totalOddsRows: 0,
      totalSnapshotsWritten: 0,
      totalLineRowsWritten: 0
    },
    recentRuns: [
      {
        id: "provider-health-fallback",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        mode: "health_check",
        dryRun: true,
        ok: false,
        providerEvents: 0,
        oddsRows: 0,
        snapshotsWritten: 0,
        lineRowsWritten: 0,
        error: message
      }
    ],
    attachmentReadiness: {
      ready: false,
      blockers: [`Provider verification fallback active: ${message}`],
      notes: ["SharkTrends provider health failed upstream, but the page is rendering in recovery mode."]
    }
  } as ProviderHealthView;
}

async function getSafeOddsApiIoHealth() {
  try {
    return await buildOddsApiIoHealth(10);
  } catch (error) {
    console.error("[sharktrends] provider verification fallback activated", error);
    return fallbackHealth(error);
  }
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${ok ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : "border-red-400/25 bg-red-400/10 text-red-200"}`}>
      {label}: {ok ? "set" : "missing"}
    </span>
  );
}

function MiniMetric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-slate-400">{note}</div>
    </div>
  );
}

export default async function ProviderVerificationPanel() {
  const health = await getSafeOddsApiIoHealth();
  const latest = health.recentRuns[0];
  const latestError = latest?.error ?? null;
  const canRunDry = health.configured.apiKey;
  const dryRunHref = "/api/admin/ingest/odds-api-io?sport=baseball&league=MLB&status=upcoming&eventLimit=5&dryRun=true";

  return (
    <section className="mx-auto grid max-w-7xl gap-3 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">Provider verification</div>
            <div className="mt-1 text-lg font-semibold text-white">Odds provider data pipe status</div>
            <div className="mt-1 text-slate-300">This shows why the board still has generated and market zeros.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill ok={health.configured.apiKey} label="api key" />
            <StatusPill ok={health.configured.writeSecret} label="secret" />
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <MiniMetric label="latest run" value={fmtTime(health.stats.latestRunAt)} note={latest ? `${latest.mode} · ${latest.dryRun ? "dry" : "write"} · ${latest.ok ? "ok" : "fail"}` : "No run logged."} />
          <MiniMetric label="latest success" value={fmtTime(health.stats.latestSuccessAt)} note="Latest successful write run." />
          <MiniMetric label="provider events" value={health.stats.totalProviderEvents} note="Events returned by provider." />
          <MiniMetric label="odds rows" value={health.stats.totalOddsRows} note="Rows normalized from provider." />
          <MiniMetric label="snapshots" value={health.stats.totalSnapshotsWritten} note="Rows written to snapshots." />
          <MiniMetric label="line history" value={health.stats.totalLineRowsWritten} note="Rows written to line history." />
        </div>

        <InlineProviderTrigger />

        {health.attachmentReadiness.blockers.length ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200">Current blockers</div>
            <div className="mt-2 grid gap-1 text-xs leading-5 text-red-50">
              {health.attachmentReadiness.blockers.slice(0, 6).map((blocker) => <div key={blocker}>- {blocker}</div>)}
            </div>
          </div>
        ) : null}

        {latestError ? (
          <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-50">
            Latest error: {latestError}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
          <Link href="/sharktrends/mlb-spine" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-cyan-100">MLB spine</Link>
          <Link href="/sharktrends/provider-trigger" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-emerald-100">Trigger page</Link>
          <a href={dryRunHref} className={`rounded-xl border px-3 py-2 ${canRunDry ? "border-amber-300/25 bg-black/20 text-amber-100" : "pointer-events-none border-white/10 bg-black/10 text-slate-500"}`}>Dry-test URL</a>
          <Link href="/sharktrends/ingestion-health" className="rounded-xl border border-amber-300/25 bg-black/20 px-3 py-2 text-amber-100">Full health</Link>
          <Link href="/sharktrends/market-data-source" className="rounded-xl border border-amber-300/25 bg-black/20 px-3 py-2 text-amber-100">Market source</Link>
          <Link href="/sharktrends?mode=all" className="rounded-xl border border-amber-300/25 bg-black/20 px-3 py-2 text-amber-100">Debug all games</Link>
        </div>
      </div>
    </section>
  );
}
