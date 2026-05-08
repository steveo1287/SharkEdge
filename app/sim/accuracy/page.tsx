import Link from "next/link";

import { getSimModelScorecard } from "@/services/sim/model-scorecard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RoiObject = {
  roi?: number | null;
  unitsNet?: number | null;
  roiMode?: string | null;
  actualOddsCount?: number | null;
  fallbackOddsCount?: number | null;
  avgSelectedAmericanOdds?: number | null;
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
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function fmtAmericanOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function metricTone(value: number | null | undefined, good: number, ok: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-white/10 bg-white/[0.03]";
  if (value <= good) return "border-emerald-400/25 bg-emerald-400/[0.08]";
  if (value <= ok) return "border-amber-300/25 bg-amber-300/[0.08]";
  return "border-red-400/25 bg-red-400/[0.08]";
}

function roiTone(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-white/10 bg-white/[0.03]";
  if (value > 0) return "border-emerald-400/25 bg-emerald-400/[0.08]";
  if (value >= -2) return "border-amber-300/25 bg-amber-300/[0.08]";
  return "border-red-400/25 bg-red-400/[0.08]";
}

function recordText(winCount?: number, lossCount?: number, pushCount?: number) {
  const wins = winCount ?? 0;
  const losses = lossCount ?? 0;
  const pushes = pushCount ?? 0;
  return pushes > 0 ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}

function gradeFromMetrics(brier: number | null | undefined, logLoss: number | null | undefined) {
  if (typeof brier !== "number" || typeof logLoss !== "number") return { label: "Incomplete", note: "Needs more settled MLB games." };
  if (brier <= 0.2 && logLoss <= 0.58) return { label: "Strong", note: "Calibration and confidence are healthy." };
  if (brier <= 0.25 && logLoss <= 0.7) return { label: "Watch", note: "Usable, but calibration needs monitoring." };
  return { label: "Needs tuning", note: "Model is missing too often or too confidently." };
}

function roiModeLabel(mode: string | null | undefined) {
  switch (mode) {
    case "actual_captured_odds": return "actual captured odds";
    case "mixed_actual_and_fallback": return "mixed actual odds + -110 fallback";
    case "fallback_-110": return "fallback -110 only";
    case "no_settled_picks": return "needs settled picks";
    default: return "odds status unknown";
  }
}

function roiNote(source: RoiObject) {
  if (source.roi == null) return "Needs settled picks";
  const actual = source.actualOddsCount ?? 0;
  const fallback = source.fallbackOddsCount ?? 0;
  const roi = `${source.roi > 0 ? "+" : ""}${source.roi.toFixed(1)}%`;
  const avgOdds = source.avgSelectedAmericanOdds != null ? ` · avg ${fmtAmericanOdds(source.avgSelectedAmericanOdds)}` : "";

  if (source.roiMode === "actual_captured_odds") return `${roi} · actual odds ${actual}/${actual + fallback}${avgOdds}`;
  if (source.roiMode === "mixed_actual_and_fallback") return `${roi} · ${actual} actual, ${fallback} fallback${avgOdds}`;
  if (source.roiMode === "fallback_-110") return `${roi} · fallback -110`;
  return roi;
}

function unitsText(value: number | null | undefined) {
  return value != null ? `${value > 0 ? "+" : ""}${value.toFixed(1)}u` : "—";
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

function CalibrationBuckets({ buckets }: { buckets: any[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Confidence bucket performance</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">Shows where the MLB model is beating or missing its expected probability.</div>
      <div className="mt-4 grid gap-2">
        {buckets.map((bucket) => {
          const actual = typeof bucket.actualHitRate === "number" ? bucket.actualHitRate : null;
          const predicted = typeof bucket.avgPredictedProbability === "number" ? bucket.avgPredictedProbability : null;
          const edgeGap = actual != null && predicted != null ? actual - predicted : null;
          const count = bucket.predictionCount ?? 0;
          return (
            <div key={bucket.bucket} className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-semibold text-white">{bucket.bucket}% confidence</div>
                <div className="font-mono text-slate-300">{count} picks · Gap {pct(edgeGap)}</div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-[110px_1fr_100px_100px_100px] md:items-center">
                <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Actual vs expected</div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-cyan-300/70" style={{ width: `${Math.max(0, Math.min(100, (actual ?? 0) * 100))}%` }} />
                </div>
                <div className="text-right font-mono text-xs text-slate-200">Actual {pct(actual)}</div>
                <div className="text-right font-mono text-xs text-sky-200">Expected {pct(predicted)}</div>
                <div className="text-right font-mono text-xs text-slate-200">Brier {num(bucket.brierScoreAvg, 4)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MarketCard({ card }: { card: any }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">MLB · {card.market}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{card.modelVersion}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-400">{recordText(card.winCount, card.lossCount, card.pushCount)} · {card.settledCount} settled · {card.pendingCount} pending · {card.predictionCount} total</div>
        </div>
        <div className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
          {card.sampleWarning ? "Sample warning" : roiModeLabel(card.roiMode)}
        </div>
      </div>

      {card.sampleWarning ? (
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100">{card.sampleWarning}</div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Record" value={recordText(card.winCount, card.lossCount, card.pushCount)} note="Wins-losses-pushes" />
        <Tile label="Win rate" value={pct(card.winRate)} note="Pushes excluded" />
        <Tile label="ROI / Units" value={unitsText(card.unitsNet)} note={roiNote(card)} className={roiTone(card.roi)} />
        <Tile label="Odds coverage" value={`${card.actualOddsCount ?? 0}/${(card.actualOddsCount ?? 0) + (card.fallbackOddsCount ?? 0)}`} note={`Actual odds rows · avg ${fmtAmericanOdds(card.avgSelectedAmericanOdds)}`} />
        <Tile label="Brier" value={num(card.brierScoreAvg, 4)} note="Lower is better" className={metricTone(card.brierScoreAvg, 0.2, 0.25)} />
        <Tile label="Log loss" value={num(card.logLossAvg, 4)} note="Overconfidence penalty" className={metricTone(card.logLossAvg, 0.58, 0.7)} />
      </div>
    </section>
  );
}

function RecentLedger({ rows }: { rows: any[] }) {
  const visibleRows = rows.slice(0, 20);
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent MLB ledger rows</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Latest 20 snapshots with captured odds coverage.</div>
          </div>
          <Link href="/api/sim/accuracy" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">JSON</Link>
        </div>
      </summary>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Game</th>
              <th className="px-3 py-2">Pick</th>
              <th className="px-3 py-2 text-right">Odds</th>
              <th className="px-3 py-2 text-right">Model</th>
              <th className="px-3 py-2 text-right">Market</th>
              <th className="px-3 py-2 text-right">Edge</th>
              <th className="px-3 py-2 text-right">Result</th>
              <th className="px-3 py-2 text-right">Brier</th>
              <th className="px-3 py-2 text-right">Captured</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const edge = typeof row.modelProbability === "number" && typeof row.marketProbability === "number" ? row.modelProbability - row.marketProbability : null;
              return (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel ?? row.gameId}</div><div className="mt-1 text-[10px] text-slate-500">{row.modelVersion}</div></td>
                  <td className="px-3 py-3 text-slate-300">{row.side ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-200"><div>{fmtAmericanOdds(row.selectedAmericanOdds)}</div><div className="mt-1 max-w-[120px] truncate text-[10px] text-slate-600">{row.oddsSource ?? "fallback"}</div></td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.modelProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(row.marketProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(edge)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{row.resultBucket}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.brierScore, 4)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{fmtDate(row.predictionTime)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function SimAccuracyPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = {
    league: "MLB",
    market: readValue(resolved, "market") ?? "ALL",
    modelVersion: readValue(resolved, "modelVersion") ?? "ALL",
    windowDays: readNumber(readValue(resolved, "windowDays")) ?? 90
  };
  const scorecard = await getSimModelScorecard(filters);
  const primaryCard = scorecard.scorecards[0];
  const health = gradeFromMetrics(scorecard.totals.brierScoreAvg, scorecard.totals.logLossAvg);
  const showMarketRankings = scorecard.scorecards.length > 1;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Sim Accuracy</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Model scorecard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              MLB-only accuracy board for graded simulation snapshots. ROI now uses captured American odds when present, with an explicit -110 fallback count for older rows without stored odds.
            </p>
            <div className="mt-3 text-xs text-slate-500">Generated {fmtDate(scorecard.generatedAt)} · Window {scorecard.filters.windowDays} days · Market {scorecard.filters.market}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/api/sim/accuracy?action=run" className="text-cyan-200 hover:text-cyan-100">Run ledger</Link>
            <Link href="/api/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      {!scorecard.databaseReady ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3 text-xs leading-5 text-amber-200">
          <span className="font-semibold">Database unavailable</span> — metrics will populate once DATABASE_URL is set and the Prisma migration has run. <Link href="/api/sim/accuracy?action=run" className="underline hover:text-amber-100">Initialize ledger</Link>
        </div>
      ) : null}

      <form method="get" className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 md:grid-cols-3">
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span>
          <select name="market" defaultValue={scorecard.filters.market ?? "ALL"} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="ALL">All MLB markets</option>
            <option value="moneyline">Moneyline</option>
            <option value="spread">Spread</option>
            <option value="total">Total</option>
            <option value="run_line">Run line</option>
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
        <Tile label="Record" value={recordText(scorecard.totals.winCount, scorecard.totals.lossCount, scorecard.totals.pushCount)} note="Wins-losses-pushes" />
        <Tile label="Win rate" value={pct(scorecard.totals.winRate)} note="Pushes excluded" />
        <Tile label="ROI / Units" value={unitsText(scorecard.totals.unitsNet)} note={roiNote(scorecard.totals)} className={roiTone(scorecard.totals.roi)} />
        <Tile label="Odds coverage" value={`${scorecard.totals.actualOddsCount ?? 0}/${(scorecard.totals.actualOddsCount ?? 0) + (scorecard.totals.fallbackOddsCount ?? 0)}`} note={`${roiModeLabel(scorecard.totals.roiMode)} · avg ${fmtAmericanOdds(scorecard.totals.avgSelectedAmericanOdds)}`} />
        <Tile label="Brier" value={num(scorecard.totals.brierScoreAvg, 4)} note="Probability calibration" className={metricTone(scorecard.totals.brierScoreAvg, 0.2, 0.25)} />
        <Tile label="Sample" value={`${scorecard.totals.settledCount}/${scorecard.totals.predictionCount}`} note={`${scorecard.totals.pendingCount} pending`} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Model health</div>
          <div className="mt-3 font-display text-3xl font-semibold text-white">{health.label}</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{health.note}</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Data quality</div>
          <div className="mt-3 grid gap-2 text-xs text-slate-300">
            {primaryCard && Object.entries(primaryCard.dataQualityBreakdown ?? {}).length ? Object.entries(primaryCard.dataQualityBreakdown).map(([grade, count]) => (
              <div key={grade} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span>{grade}</span>
                <span className="font-mono text-white">{String(count)}</span>
              </div>
            )) : <div className="text-slate-500">No MLB quality flags yet.</div>}
          </div>
        </div>
        <div className={`rounded-[1.5rem] border p-4 ${roiTone(scorecard.totals.roi)}`}>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">ROI · 1 unit flat</div>
          <div className={`mt-3 font-display text-4xl font-bold ${scorecard.totals.roi != null && scorecard.totals.roi > 0 ? "text-emerald-300" : scorecard.totals.roi != null && scorecard.totals.roi < 0 ? "text-red-300" : "text-white"}`}>
            {scorecard.totals.roi != null ? `${scorecard.totals.roi > 0 ? "+" : ""}${scorecard.totals.roi.toFixed(1)}%` : "—"}
          </div>
          <div className="mt-2 font-mono text-sm text-slate-300">
            {scorecard.totals.unitsNet != null ? `${scorecard.totals.unitsNet > 0 ? "+" : ""}${scorecard.totals.unitsNet.toFixed(2)} units net` : "No settled picks yet"}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {scorecard.totals.winCount}W–{scorecard.totals.lossCount}L · {roiModeLabel(scorecard.totals.roiMode)} · {(scorecard.totals.actualOddsCount ?? 0)} actual / {(scorecard.totals.fallbackOddsCount ?? 0)} fallback
          </p>
        </div>
      </section>

      {primaryCard?.calibrationBuckets?.length ? <CalibrationBuckets buckets={primaryCard.calibrationBuckets} /> : null}

      <section className="grid gap-4">
        {scorecard.scorecards.length ? scorecard.scorecards.map((card) => <MarketCard key={`${card.league}:${card.market}:${card.modelVersion}`} card={card} />) : (
          <div className="rounded-[1.5rem] border border-cyan-300/15 bg-slate-950/80 p-6">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">No MLB records yet</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The accuracy ledger is empty for this window. Call <Link href="/api/sim/accuracy?action=capture" className="font-mono text-cyan-100 hover:text-cyan-50">/api/sim/accuracy?action=capture</Link> before games start to snapshot current model predictions, then <Link href="/api/sim/accuracy?action=grade" className="font-mono text-cyan-100 hover:text-cyan-50">/api/sim/accuracy?action=grade</Link> after final scores are in to grade them.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/api/sim/accuracy?action=capture" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Capture now</Link>
              <Link href="/api/sim/accuracy?action=grade" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:bg-white/[0.06]">Grade finals</Link>
            </div>
          </div>
        )}
      </section>

      {showMarketRankings ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Strongest markets</div>
            <div className="mt-3 text-xs text-slate-400">Shown only when multiple MLB markets have enough settled rows.</div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Weakest markets</div>
            <div className="mt-3 text-xs text-slate-400">Shown only when multiple MLB markets have enough settled rows.</div>
          </div>
        </section>
      ) : null}

      <RecentLedger rows={scorecard.recent} />
    </main>
  );
}
