import Link from "next/link";

import { runGeneratedTrendDiscovery, type GeneratedTrendRunnerSummary } from "@/services/trends/generated-trend-runner";
import type { TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket } from "@/services/trends/trend-candidate-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUES = ["ALL", "MLB", "NBA", "NFL", "NHL", "NCAAF", "UFC", "BOXING"] as const;
const MARKETS = ["ALL", "moneyline", "spread", "total", "player_prop", "fight_winner"] as const;
const DEPTHS = ["core", "expanded", "debug"] as const;

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseEnum<T extends readonly string[]>(value: string | undefined, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes((value ?? fallback) as T[number]) ? (value ?? fallback) as T[number] : fallback;
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

function parseBool(value: string | undefined) {
  if (!value) return true;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function pct(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function units(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}u`;
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

function SelectField({ label, name, value, options }: { label: string; name: string; value: string; options: readonly string[] }) {
  return (
    <label className="grid gap-1 text-xs text-slate-400">
      <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select name={name} defaultValue={value} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function CandidateTable({ summary }: { summary: GeneratedTrendRunnerSummary }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Top ready candidates</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Highest ROI ready systems from this runner pass. Persistence still obeys gates and dry-run mode.</div>
        </div>
        <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100">{summary.backtest.topCandidates.length}</span>
      </div>
      {summary.backtest.topCandidates.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[900px] w-full border-collapse text-left text-xs">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-slate-500">
              <tr><th className="px-3 py-3">System</th><th className="px-3 py-3">Sample</th><th className="px-3 py-3">ROI</th><th className="px-3 py-3">Units</th><th className="px-3 py-3">Grade</th><th className="px-3 py-3">Gate</th><th className="px-3 py-3">Blockers</th></tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {summary.backtest.topCandidates.map((candidate) => (
                <tr key={candidate.candidateId} className="align-top">
                  <td className="px-3 py-3 font-semibold text-white">{candidate.name}</td>
                  <td className="px-3 py-3">{candidate.sampleSize}</td>
                  <td className="px-3 py-3">{pct(candidate.roiPct)}</td>
                  <td className="px-3 py-3">{units(candidate.profitUnits)}</td>
                  <td className="px-3 py-3">{candidate.grade}</td>
                  <td className="px-3 py-3">{candidate.qualityGate.replace(/_/g, " ")}</td>
                  <td className="px-3 py-3 text-slate-400">{candidate.blockers.length ? candidate.blockers.join(" · ") : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-slate-400">No ready candidates yet. This usually means no historical rows are connected, no candidate matched, or sample gates were not met.</div>}
    </section>
  );
}

export default async function GeneratedRunnerPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const league = parseEnum((readValue(resolved, "league") ?? "ALL").toUpperCase(), LEAGUES, "ALL") as TrendFactoryLeague | "ALL";
  const market = parseEnum((readValue(resolved, "market") ?? "ALL").toLowerCase(), MARKETS, "ALL") as TrendFactoryMarket | "ALL";
  const depth = parseEnum((readValue(resolved, "depth") ?? "core").toLowerCase(), DEPTHS, "core") as TrendFactoryDepth;
  const limit = parseNumber(readValue(resolved, "limit"), 250, 1, 1000);
  const minSample = parseNumber(readValue(resolved, "minSample"), 50, 1, 5000);
  const minRoiPct = Number.isFinite(Number(readValue(resolved, "minRoiPct"))) ? Number(readValue(resolved, "minRoiPct")) : 0;
  const historyLimit = parseNumber(readValue(resolved, "historyLimit"), 100, 1, 500);
  const startDate = readValue(resolved, "startDate") || undefined;
  const endDate = readValue(resolved, "endDate") || undefined;
  const dryRun = parseBool(readValue(resolved, "dryRun"));
  const summary = await runGeneratedTrendDiscovery({ league, market, depth, limit, minSample, minRoiPct, historyLimit, startDate, endDate, dryRun });

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Generated Trend Runner</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Historical wiring + nightly runner preview</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Runs the proof pipeline: Trend Factory → Historical Source → Backtest → Quality-Gated Persistence. Dry-run is on by default so this page is safe to inspect.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Link href="/sharktrends/builder" className="text-cyan-200 hover:text-cyan-100">Builder</Link><Link href="/sharktrends/backtest" className="text-cyan-200 hover:text-cyan-100">Backtest</Link><Link href="/sharktrends/generated-attachments" className="text-cyan-200 hover:text-cyan-100">Attachments</Link><Link href="/api/sharktrends/generated-runner" className="text-cyan-200 hover:text-cyan-100">API</Link></div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4">
        <form method="get" className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SelectField label="League" name="league" value={league} options={LEAGUES} />
          <SelectField label="Market" name="market" value={market} options={MARKETS} />
          <SelectField label="Depth" name="depth" value={depth} options={DEPTHS} />
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Limit</span><input name="limit" defaultValue={String(limit)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Min sample</span><input name="minSample" defaultValue={String(minSample)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Min ROI</span><input name="minRoiPct" defaultValue={String(minRoiPct)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Start date</span><input type="date" name="startDate" defaultValue={startDate} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">End date</span><input type="date" name="endDate" defaultValue={endDate} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" /></label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300"><input type="checkbox" name="dryRun" value="1" defaultChecked={dryRun} className="h-4 w-4 accent-cyan-300" />Dry run</label>
          <input type="hidden" name="historyLimit" value={String(historyLimit)} />
          <button className="md:col-span-3 xl:col-span-6 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Run generated discovery</button>
        </form>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Historical rows" value={summary.historicalSource.rowsLoaded} note={summary.historicalSource.connected ? "Source connected." : "No source rows."} />
        <Metric label="Candidates" value={summary.factory.returnedCandidates} note="Generated candidates scanned." />
        <Metric label="Ready" value={summary.backtest.ready} note="Backtest-ready candidates." />
        <Metric label="No matches" value={summary.backtest.noMatches} note="Rows loaded but filters did not match." />
        <Metric label="Persisted" value={summary.persistence.persisted} note={summary.dryRun ? "Dry-run only." : "Rows written."} />
        <Metric label="Skipped" value={summary.persistence.skipped} note="Rejected by gates." />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-400">
        <div className="font-semibold text-white">Historical source</div>
        <div className="mt-2">{summary.historicalSource.note}</div>
        <div className="mt-3 grid gap-2">{summary.notes.map((note) => <div key={note}>• {note}</div>)}</div>
      </section>

      <CandidateTable summary={summary} />

      <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4">
        <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Persistence decisions</summary>
        <div className="mt-4 grid gap-2 text-xs leading-5 text-slate-400">
          {summary.persistence.decisions.slice(0, 80).map((decision) => <div key={decision.candidateId} className="rounded-xl border border-white/10 bg-black/25 p-3"><span className={decision.persisted ? "text-emerald-200" : "text-amber-100"}>{decision.persisted ? "persisted" : "skipped"}</span> · {decision.name} · {decision.reason}</div>)}
        </div>
      </details>
    </main>
  );
}
