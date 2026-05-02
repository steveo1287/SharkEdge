import Link from "next/link";

import { getSimModelEdgeLab } from "@/services/sim/model-edge-lab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function readNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function gradeClass(grade: string) {
  if (grade === "ELITE") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (grade === "STRONG") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (grade === "STABLE") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (grade === "WATCH") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (grade === "SUPPRESS") return "border-red-400/25 bg-red-400/10 text-red-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function actionClass(action: string) {
  if (action === "PROMOTE") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (action === "KEEP_PRIMARY") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (action === "SUPPRESS") return "border-red-400/25 bg-red-400/10 text-red-200";
  if (action === "COLLECT_SAMPLE") return "border-slate-500/25 bg-slate-800/60 text-slate-300";
  return "border-amber-300/25 bg-amber-300/10 text-amber-100";
}

function Tile({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function RowCard({ row }: { row: any }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{row.league} · {row.market}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{row.modelVersion}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-400">{row.settledCount} settled · {row.pendingCount} pending · {row.predictionCount} total</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${gradeClass(row.grade)}`}>{row.grade}</span>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionClass(row.recommendedAction)}`}>{row.recommendedAction}</span>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">{row.benchmarkScore}/100</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <Tile label="Brier" value={num(row.brierScoreAvg, 4)} note="Calibration" />
        <Tile label="Log loss" value={num(row.logLossAvg, 4)} note="Confidence" />
        <Tile label="Cal. err" value={num(row.calibrationErrorAvg, 4)} note="Bucket drift" />
        <Tile label="CLV" value={pctRaw(row.clvAvgPct)} note="Close proof" />
        <Tile label="Win rate" value={pct(row.winRate)} note="Result only" />
        <Tile label="Spread MAE" value={num(row.spreadMae, 2)} note="Margin miss" />
        <Tile label="Total MAE" value={num(row.totalMae, 2)} note="Total miss" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Strengths</div>
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
            {row.strengths.map((item: string) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-red-400/15 bg-red-400/[0.04] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-200">Weaknesses</div>
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
            {row.weaknesses.map((item: string) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Next actions</div>
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-slate-300">
            {row.nextActions.map((item: string) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        {row.flags.length ? row.flags.map((flag: string) => <span key={flag}>#{flag}</span>) : <span>#no-flags</span>}
      </div>
    </section>
  );
}

export default async function SimEdgeLabPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const lab = await getSimModelEdgeLab({
    league: readValue(resolved, "league") ?? "ALL",
    market: readValue(resolved, "market") ?? "ALL",
    modelVersion: readValue(resolved, "modelVersion") ?? "ALL",
    windowDays: readNumber(readValue(resolved, "windowDays")) ?? 90
  });

  if (!lab.ok) {
    return (
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.75rem] border border-red-400/20 bg-slate-950/80 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">Model Edge Lab</div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-white">Edge lab is not ready.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{lab.error ?? "Set the database URL and run the sim accuracy ledger first."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Sim Model Edge Lab</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Champion/challenger model control</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Promotion and suppression layer for the sim engine. It grades each league/market/model by calibration, Brier, log loss, CLV, sample size, pending volume, and overconfidence risk.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">Accuracy</Link>
            <Link href="/api/sim/edge-lab" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <form method="get" className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 md:grid-cols-4">
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span>
          <select name="league" defaultValue={lab.filters.league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            {['ALL', 'NBA', 'MLB', 'NHL', 'NFL'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span>
          <select name="market" defaultValue={lab.filters.market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            {['ALL', 'moneyline', 'spread', 'total', 'run_line', 'puck_line'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Window</span>
          <select name="windowDays" defaultValue={String(lab.filters.windowDays)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            {['30', '90', '365'].map((value) => <option key={value} value={value}>{value} days</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Apply</button>
          <Link href="/sim/edge-lab" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Reset</Link>
        </div>
      </form>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Tile label="Candidates" value={lab.totals.candidateCount} note="League/market/model rows" />
        <Tile label="Promotable" value={lab.totals.promotableCount} note="Eligible for primary signal" />
        <Tile label="Suppress" value={lab.totals.suppressCount} note="Should not drive top UI" />
        <Tile label="Small sample" value={lab.totals.insufficientSampleCount} note="Audit mode only" />
        <Tile label="Avg benchmark" value={num(lab.totals.averageBenchmarkScore, 1)} note="Composite 0-100" />
      </section>

      {lab.champion ? (
        <section className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Current champion</div>
          <div className="mt-2 text-2xl font-semibold text-white">{lab.champion.league} · {lab.champion.market}</div>
          <div className="mt-1 text-sm leading-6 text-slate-300">{lab.champion.summary}</div>
        </section>
      ) : null}

      <section className="grid gap-4">
        {lab.rows.length ? lab.rows.map((row) => <RowCard key={row.id} row={row} />) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6 text-sm text-slate-400">No model scorecards found. Run the sim accuracy ledger first.</div>
        )}
      </section>
    </main>
  );
}
