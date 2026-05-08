import Link from "next/link";
import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function v(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function windowDays(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 365;
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function odds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function record(wins?: number, losses?: number, pushes?: number) {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const p = pushes ?? 0;
  return p ? `${w}-${l}-${p}` : `${w}-${l}`;
}

function units(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}u`;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function mode(value: string | null | undefined) {
  if (value === "actual_captured_odds") return "actual captured odds";
  if (value === "mixed_actual_and_fallback") return "mixed actual + fallback";
  if (value === "fallback_-110") return "fallback -110 only";
  return "no settled signals";
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

export default async function AccuracyV2Page({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const days = windowDays(v(resolved, "windowDays"));
  const card = await getSimModelScorecard({ league: "MLB", market: v(resolved, "market") ?? "ALL", modelVersion: "ALL", windowDays: days });
  const primary = card.scorecards[0];
  const rows = card.recent ?? [];

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MLB Sim Accuracy</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Moneyline signal scorecard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Record and unit return now use top MLB moneyline signals only, deduped to the latest capture per game/model. Governor no-bet rows are counted as a quality flag instead of removing every signal.
            </p>
            <div className="mt-3 text-xs text-slate-500">Window {card.filters.windowDays} days · generated {when(card.generatedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/api/sim/accuracy?action=run" className="text-cyan-200 hover:text-cyan-100">Run ledger</Link>
            <Link href="/api/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <form method="get" className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 md:grid-cols-3">
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Window</span>
          <select name="windowDays" defaultValue={String(card.filters.windowDays)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
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
        <Tile label="Record" value={record(card.totals.winCount, card.totals.lossCount, card.totals.pushCount)} note="Top moneyline signals only" />
        <Tile label="Win rate" value={pct(card.totals.winRate)} note="Pushes excluded" />
        <Tile label="Units" value={units(card.totals.unitsNet)} note={`${pctRaw(card.totals.roi)} · ${mode(card.totals.roiMode)}`} />
        <Tile label="Odds coverage" value={`${card.totals.actualOddsCount ?? 0}/${(card.totals.actualOddsCount ?? 0) + (card.totals.fallbackOddsCount ?? 0)}`} note={`Avg ${odds(card.totals.avgSelectedAmericanOdds)}`} />
        <Tile label="Brier" value={num(card.totals.brierScoreAvg, 4)} note="Probability calibration" />
        <Tile label="Sample" value={`${card.totals.settledCount}/${card.totals.predictionCount}`} note={`${card.totals.pendingCount} excluded/pending`} />
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Signal quality</div>
        <div className="mt-3 grid gap-2 text-xs text-slate-300">
          {primary && Object.entries(primary.dataQualityBreakdown ?? {}).length ? Object.entries(primary.dataQualityBreakdown).map(([label, count]) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span>{label}</span>
              <span className="font-mono text-white">{String(count)}</span>
            </div>
          )) : <div className="text-slate-500">No signal rows yet.</div>}
        </div>
      </section>

      {primary ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{primary.modelVersion}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Record" value={record(primary.winCount, primary.lossCount, primary.pushCount)} note="Moneyline signals" />
            <Tile label="Win rate" value={pct(primary.winRate)} note="Pushes excluded" />
            <Tile label="Units" value={units(primary.unitsNet)} note={`${pctRaw(primary.roi)} · ${mode(primary.roiMode)}`} />
            <Tile label="Odds coverage" value={`${primary.actualOddsCount ?? 0}/${(primary.actualOddsCount ?? 0) + (primary.fallbackOddsCount ?? 0)}`} note={`Avg ${odds(primary.avgSelectedAmericanOdds)}`} />
            <Tile label="Brier" value={num(primary.brierScoreAvg, 4)} note="All graded rows" />
            <Tile label="Log loss" value={num(primary.logLossAvg, 4)} note="All graded rows" />
          </div>
        </section>
      ) : null}

      <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <summary className="cursor-pointer list-none">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent ledger rows</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Latest 20 rows with signal and odds status.</div>
        </summary>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Game</th><th className="px-3 py-2">Signal</th><th className="px-3 py-2 text-right">Odds</th><th className="px-3 py-2 text-right">Model</th><th className="px-3 py-2 text-right">Market</th><th className="px-3 py-2 text-right">Result</th><th className="px-3 py-2 text-right">Captured</th></tr></thead>
            <tbody>{rows.slice(0, 20).map((row: any) => (
              <tr key={row.id} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel ?? row.gameId}</div><div className="mt-1 text-[10px] text-slate-500">{row.modelVersion}</div></td>
                <td className="px-3 py-3 text-slate-300"><div>{row.side ?? "—"}</div><div className="mt-1 text-[10px] text-slate-600">{row.signalMarket ?? row.roiExclusionReason ?? "no signal"}</div></td>
                <td className="px-3 py-3 text-right font-mono text-emerald-200"><div>{odds(row.selectedAmericanOdds)}</div><div className="mt-1 text-[10px] text-slate-600">{row.oddsSource ?? "fallback"}</div></td>
                <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.modelProbability)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(row.marketProbability)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{row.resultBucket}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{when(row.predictionTime)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
