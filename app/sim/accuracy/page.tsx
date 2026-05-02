import Link from "next/link";

import { getSimModelScorecard } from "@/services/sim/model-scorecard";

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

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function metricTone(value: number | null | undefined, good: number, ok: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-white/10 bg-white/[0.03]";
  if (value <= good) return "border-emerald-400/25 bg-emerald-400/[0.08]";
  if (value <= ok) return "border-amber-300/25 bg-amber-300/[0.08]";
  return "border-red-400/25 bg-red-400/[0.08]";
}

function clvTone(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-white/10 bg-white/[0.03]";
  if (value > 0.25) return "border-emerald-400/25 bg-emerald-400/[0.08]";
  if (value >= -0.25) return "border-amber-300/25 bg-amber-300/[0.08]";
  return "border-red-400/25 bg-red-400/[0.08]";
}

function Tile({ label, value, note, className = "border-white/10 bg-white/[0.03]" }: { label: string; value: string | number; note: string; className?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function BucketTable({ buckets }: { buckets: any[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
          <tr>
            <th className="px-3 py-2">Bucket</th>
            <th className="px-3 py-2 text-right">Count</th>
            <th className="px-3 py-2 text-right">Predicted</th>
            <th className="px-3 py-2 text-right">Actual</th>
            <th className="px-3 py-2 text-right">Cal. Err</th>
            <th className="px-3 py-2 text-right">Brier</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.bucket} className="border-b border-white/5 last:border-none">
              <td className="px-3 py-2 text-slate-200">{bucket.bucket}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-200">{bucket.predictionCount}</td>
              <td className="px-3 py-2 text-right font-mono text-sky-200">{pct(bucket.avgPredictedProbability)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-200">{pct(bucket.actualHitRate)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-200">{num(bucket.calibrationError, 4)}</td>
              <td className="px-3 py-2 text-right font-mono text-slate-200">{num(bucket.brierScoreAvg, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScorecardCard({ card }: { card: any }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{card.league} · {card.market}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{card.modelVersion}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-400">{card.settledCount} settled · {card.pendingCount} pending · {card.predictionCount} total</div>
        </div>
        <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
          {card.sampleWarning ? "Sample warning" : "Tracked"}
        </div>
      </div>

      {card.sampleWarning ? (
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100">{card.sampleWarning}</div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Brier" value={num(card.brierScoreAvg, 4)} note="Lower is better" className={metricTone(card.brierScoreAvg, 0.2, 0.25)} />
        <Tile label="Log loss" value={num(card.logLossAvg, 4)} note="Overconfidence penalty" className={metricTone(card.logLossAvg, 0.58, 0.7)} />
        <Tile label="Spread MAE" value={num(card.spreadMae, 2)} note="Margin miss" />
        <Tile label="Total MAE" value={num(card.totalMae, 2)} note="Total miss" />
        <Tile label="CLV avg" value={pctRaw(card.clvAvgPct)} note="Market-to-close proof" className={clvTone(card.clvAvgPct)} />
        <Tile label="Win rate" value={pct(card.winRate)} note="Pushes excluded" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.6fr]">
        <BucketTable buckets={card.calibrationBuckets ?? []} />
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Data quality</div>
          <div className="mt-3 grid gap-2 text-xs text-slate-300">
            {Object.entries(card.dataQualityBreakdown ?? {}).length ? Object.entries(card.dataQualityBreakdown).map(([grade, count]) => (
              <div key={grade} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span>{grade}</span>
                <span className="font-mono text-white">{String(count)}</span>
              </div>
            )) : <div className="text-slate-500">No quality flags yet.</div>}
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketList({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.map((item) => (
          <div key={`${title}:${item.league}:${item.market}:${item.modelVersion}`} className="rounded-xl border border-white/10 bg-black/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-white">{item.league} · {item.market}</div>
              <div className="font-mono text-xs text-cyan-100">Brier {num(item.brierScoreAvg, 4)}</div>
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-400">{item.modelVersion} · CLV {pctRaw(item.clvAvgPct)} · {item.settledCount} settled</div>
          </div>
        )) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">{empty}</div>}
      </div>
    </section>
  );
}

export default async function SimAccuracyPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = {
    league: readValue(resolved, "league") ?? "ALL",
    market: readValue(resolved, "market") ?? "ALL",
    modelVersion: readValue(resolved, "modelVersion") ?? "ALL",
    windowDays: readNumber(readValue(resolved, "windowDays")) ?? 90
  };
  const scorecard = await getSimModelScorecard(filters);

  if (!scorecard.ok) {
    return (
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[1.75rem] border border-red-400/20 bg-slate-950/80 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200">Sim Accuracy</div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-white">Calibration ledger is not ready.</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{scorecard.error ?? "Set DATABASE_URL/POSTGRES_PRISMA_URL, then call /api/sim/accuracy?action=run to initialize and populate the benchmark tables."}</p>
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/api/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </section>
      </main>
    );
  }

  const leagues = ["NBA", "MLB", "NHL", "NFL"];

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Sim Engine Benchmark</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Calibration Ledger v1</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Audit layer for NBA, MLB, NHL, and NFL simulation outputs. It measures calibration, Brier score, log loss, spread/total error, CLV, data quality, and strongest/weakest model markets without changing existing sim behavior.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/api/sim/accuracy?action=run" className="text-cyan-200 hover:text-cyan-100">Run ledger</Link>
            <Link href="/api/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <form method="get" className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 md:grid-cols-4">
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span>
          <select name="league" defaultValue={scorecard.filters.league ?? "ALL"} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="ALL">ALL</option>
            {leagues.map((league) => <option key={league} value={league}>{league}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span>
          <select name="market" defaultValue={scorecard.filters.market ?? "ALL"} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="ALL">ALL</option>
            <option value="moneyline">Moneyline</option>
            <option value="spread">Spread</option>
            <option value="total">Total</option>
            <option value="run_line">Run line</option>
            <option value="puck_line">Puck line</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Window</span>
          <select name="windowDays" defaultValue={String(scorecard.filters.windowDays)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="7">7 days</option>
            <option value="15">15 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">365 days</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Apply</button>
          <Link href="/sim/accuracy" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">Reset</Link>
        </div>
      </form>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Tile label="Predictions" value={scorecard.totals.predictionCount} note="Captured model snapshots" />
        <Tile label="Settled" value={scorecard.totals.settledCount} note="Finals graded" />
        <Tile label="Pending" value={scorecard.totals.pendingCount} note="Awaiting results" />
        <Tile label="Brier" value={num(scorecard.totals.brierScoreAvg, 4)} note="Probability calibration" className={metricTone(scorecard.totals.brierScoreAvg, 0.2, 0.25)} />
        <Tile label="Log loss" value={num(scorecard.totals.logLossAvg, 4)} note="Overconfidence penalty" className={metricTone(scorecard.totals.logLossAvg, 0.58, 0.7)} />
        <Tile label="CLV avg" value={pctRaw(scorecard.totals.clvAvgPct)} note="Market-to-close delta" className={clvTone(scorecard.totals.clvAvgPct)} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {leagues.map((league) => {
          const leagueCard = scorecard.byLeague[league];
          return (
            <div key={league} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">{league}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                <span>Predictions</span><span className="text-right font-mono text-white">{leagueCard?.predictionCount ?? 0}</span>
                <span>Settled</span><span className="text-right font-mono text-white">{leagueCard?.settledCount ?? 0}</span>
                <span>Brier</span><span className="text-right font-mono text-white">{num(leagueCard?.brierScoreAvg, 4)}</span>
                <span>CLV</span><span className="text-right font-mono text-white">{pctRaw(leagueCard?.clvAvgPct)}</span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <MarketList title="Strongest markets" items={scorecard.strongestMarkets} empty="Need at least 10 settled rows per market to rank strengths." />
        <MarketList title="Weakest markets" items={scorecard.weakestMarkets} empty="Need at least 10 settled rows per market to rank weaknesses." />
      </section>

      <section className="grid gap-4">
        {scorecard.scorecards.length ? scorecard.scorecards.map((card) => <ScorecardCard key={`${card.league}:${card.market}:${card.modelVersion}`} card={card} />) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-6 text-sm text-slate-400">
            No simulation predictions are recorded in this window. Call <code className="text-cyan-100">/api/sim/accuracy?action=run</code> before games and after finals to build the ledger.
          </div>
        )}
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent ledger rows</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Latest simulation snapshots captured by the benchmark ledger.</div>
          </div>
          <Link href="/api/sim/accuracy" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">JSON</Link>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
              <tr>
                <th className="px-3 py-2">Game</th>
                <th className="px-3 py-2">League</th>
                <th className="px-3 py-2">Market</th>
                <th className="px-3 py-2 text-right">Model</th>
                <th className="px-3 py-2 text-right">Market</th>
                <th className="px-3 py-2 text-right">Close</th>
                <th className="px-3 py-2 text-right">Result</th>
                <th className="px-3 py-2 text-right">Brier</th>
                <th className="px-3 py-2 text-right">CLV</th>
                <th className="px-3 py-2 text-right">Captured</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.recent.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel ?? row.gameId}</div><div className="mt-1 text-[10px] text-slate-500">{row.modelVersion}</div></td>
                  <td className="px-3 py-3 text-slate-300">{row.league}</td>
                  <td className="px-3 py-3 text-slate-300">{row.market}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.modelProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(row.marketProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(row.closingProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{row.resultBucket}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.brierScore, 4)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{pctRaw(row.clvPct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{fmtDate(row.predictionTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
