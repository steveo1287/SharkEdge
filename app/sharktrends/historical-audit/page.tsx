import Link from "next/link";

import { buildHistoricalTrendAudit, type HistoricalTrendAuditBucket, type HistoricalTrendAuditIssue } from "@/services/trends/historical-trend-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseIntValue(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function pct(value: number) {
  return `${value}%`;
}

function coverageClass(value: number) {
  if (value >= 90) return "text-emerald-200";
  if (value >= 70) return "text-sky-200";
  if (value >= 50) return "text-amber-100";
  return "text-red-200";
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

function BucketTable({ title, description, buckets }: { title: string; description: string; buckets: HistoricalTrendAuditBucket[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-300">{buckets.length}</span>
      </div>
      {buckets.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[980px] w-full border-collapse text-left text-xs">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-3">Bucket</th>
                <th className="px-3 py-3">Rows</th>
                <th className="px-3 py-3">Price</th>
                <th className="px-3 py-3">Close</th>
                <th className="px-3 py-3">Result</th>
                <th className="px-3 py-3">Units</th>
                <th className="px-3 py-3">Venue</th>
                <th className="px-3 py-3">Filters</th>
                <th className="px-3 py-3">Record rows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {buckets.map((bucket) => (
                <tr key={bucket.key} className="align-top">
                  <td className="px-3 py-3 font-semibold text-white">{bucket.key}</td>
                  <td className="px-3 py-3">{bucket.rows}</td>
                  <td className={`px-3 py-3 ${coverageClass(bucket.priceCoveragePct)}`}>{pct(bucket.priceCoveragePct)}</td>
                  <td className={`px-3 py-3 ${coverageClass(bucket.closingPriceCoveragePct)}`}>{pct(bucket.closingPriceCoveragePct)}</td>
                  <td className={`px-3 py-3 ${coverageClass(bucket.resultCoveragePct)}`}>{pct(bucket.resultCoveragePct)}</td>
                  <td className={`px-3 py-3 ${coverageClass(bucket.unitsCoveragePct)}`}>{pct(bucket.unitsCoveragePct)}</td>
                  <td className={`px-3 py-3 ${coverageClass(bucket.venueCoveragePct)}`}>{pct(bucket.venueCoveragePct)}</td>
                  <td className={`px-3 py-3 ${coverageClass(bucket.filterCoveragePct)}`}>{pct(bucket.filterCoveragePct)}</td>
                  <td className="px-3 py-3 text-slate-400">W {bucket.winRows} · L {bucket.lossRows} · P {bucket.pushRows} · V {bucket.voidRows} · Pending {bucket.pendingRows} · Unknown {bucket.unknownRows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">No buckets available.</div>}
    </section>
  );
}

function IssueTable({ issues }: { issues: HistoricalTrendAuditIssue[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Normalization issues</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Sample of rows missing required backtest fields. This is the repair list for deeper generated trends.</div>
        </div>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-amber-100">{issues.length}</span>
      </div>
      {issues.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[900px] w-full border-collapse text-left text-xs">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <tr><th className="px-3 py-3">Issue</th><th className="px-3 py-3">League</th><th className="px-3 py-3">Market</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Matchup</th><th className="px-3 py-3">ID</th></tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {issues.map((issue, index) => (
                <tr key={`${issue.id}:${issue.issue}:${index}`} className="align-top">
                  <td className="px-3 py-3 font-semibold text-amber-100">{issue.issue}</td>
                  <td className="px-3 py-3">{issue.league ?? "TBD"}</td>
                  <td className="px-3 py-3">{issue.market ?? "TBD"}</td>
                  <td className="px-3 py-3">{issue.date ?? "TBD"}</td>
                  <td className="px-3 py-3 text-white">{issue.matchup ?? "TBD"}</td>
                  <td className="px-3 py-3 text-slate-500">{issue.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">No sampled normalization issues.</div>}
    </section>
  );
}

export default async function HistoricalTrendAuditPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = (readValue(resolved, "league") ?? "ALL").toUpperCase();
  const startDate = readValue(resolved, "startDate") || undefined;
  const endDate = readValue(resolved, "endDate") || undefined;
  const limit = parseIntValue(readValue(resolved, "limit"), 5000, 1, 50000);
  const sampleLimit = parseIntValue(readValue(resolved, "sampleLimit"), 100, 1, 1000);
  const audit = await buildHistoricalTrendAudit({ league, startDate, endDate, limit, sampleLimit });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Historical Trend Audit</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Backtest source coverage</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">PR #173 audit: show which historical rows can power generated trend backtests, where fields are missing, and which leagues/markets are ready for deeper generation.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends/generated-runner" className="text-cyan-200 hover:text-cyan-100">Runner</Link><Link href="/sharktrends/verification" className="text-cyan-200 hover:text-cyan-100">Verification</Link><Link href="/api/sharktrends/historical-audit" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Start date</span><input type="date" name="startDate" defaultValue={startDate} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">End date</span><input type="date" name="endDate" defaultValue={endDate} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Issue sample</span><input name="sampleLimit" defaultValue={String(sampleLimit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <button className="md:col-span-5 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Audit historical source</button>
        </form>
      </section>

      <section className={`rounded-[1.5rem] border p-4 text-sm leading-6 ${audit.readiness.usableForBacktest ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-amber-300/20 bg-amber-300/10 text-amber-100"}`}>
        <div className="font-semibold text-white">{audit.readiness.usableForBacktest ? "Backtest source usable" : "Backtest source not ready"}</div>
        <div className="mt-2">{audit.sourceNote}</div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Rows" value={audit.totals.rows} note="Normalized historical trend rows." />
        <Metric label="Price" value={pct(audit.totals.priceCoveragePct)} note="Rows with American price." />
        <Metric label="Close" value={pct(audit.totals.closingPriceCoveragePct)} note="Rows with closing price." />
        <Metric label="Result" value={pct(audit.totals.resultCoveragePct)} note="Rows with settled result." />
        <Metric label="Units" value={pct(audit.totals.unitsCoveragePct)} note="Rows with units." />
        <Metric label="Filters" value={pct(audit.totals.filterCoveragePct)} note="Rows with normalized filters." />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.25rem] border border-red-400/20 bg-red-400/5 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-200">Blockers</div><div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">{audit.readiness.blockers.length ? audit.readiness.blockers.map((item) => <div key={item}>- {item}</div>) : <div className="text-slate-500">No hard blockers.</div>}</div></div>
        <div className="rounded-[1.25rem] border border-cyan-300/20 bg-cyan-300/5 p-4"><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Recommendations</div><div className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">{audit.readiness.recommendations.map((item) => <div key={item}>• {item}</div>)}</div></div>
      </section>

      <BucketTable title="Coverage by league" description="League readiness for generated trend backtesting." buckets={audit.byLeague} />
      <BucketTable title="Coverage by market" description="Market readiness for generated trend backtesting." buckets={audit.byMarket} />
      <BucketTable title="Coverage by league + market" description="Most important buckets for deciding where to run the generated trend factory first." buckets={audit.byLeagueMarket} />
      <IssueTable issues={audit.issues} />
    </main>
  );
}
