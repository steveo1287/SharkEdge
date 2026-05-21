import Link from "next/link";

import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { getUfcSettledLedger } from "@/services/ufc/settled-ledger";

export const revalidate = 3600;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

type RecordStats = {
  predictionCount: number;
  settledCount: number;
  pendingCount: number;
  winCount: number;
  lossCount: number;
  pushCount: number;
  winRate: number | null;
};

type WindowOption = {
  label: string;
  value: string;
  days: number | null;
};

const WINDOW_OPTIONS: WindowOption[] = [
  { label: "7D", value: "7", days: 7 },
  { label: "15D", value: "15", days: 15 },
  { label: "30D", value: "30", days: 30 },
  { label: "90D", value: "90", days: 90 },
  { label: "365D", value: "365", days: 365 },
  { label: "All Time", value: "all", days: null }
];

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function selectedWindow(value: string | undefined) {
  const normalized = String(value ?? "30").toLowerCase();
  return WINDOW_OPTIONS.find((option) => option.value === normalized || String(option.days) === normalized) ?? WINDOW_OPTIONS[2];
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function odds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function units(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}u`;
}

function record(wins?: number, losses?: number, pushes?: number) {
  const w = wins ?? 0;
  const l = losses ?? 0;
  const p = pushes ?? 0;
  return p ? `${w}-${l}-${p}` : `${w}-${l}`;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function oddsMode(value: string | null | undefined) {
  if (value === "actual_captured_odds") return "actual odds";
  if (value === "mixed_actual_and_fallback") return "mixed actual/fallback";
  if (value === "fallback_-110") return "fallback -110";
  return "no settled signals";
}

function zeroStats(): RecordStats {
  return { predictionCount: 0, settledCount: 0, pendingCount: 0, winCount: 0, lossCount: 0, pushCount: 0, winRate: null };
}

function statsFromScorecard(source: any): RecordStats {
  if (!source) return zeroStats();
  const winCount = Number(source.winCount ?? 0);
  const lossCount = Number(source.lossCount ?? 0);
  const pushCount = Number(source.pushCount ?? 0);
  const decisions = winCount + lossCount;

  return {
    predictionCount: Number(source.predictionCount ?? 0),
    settledCount: Number(source.settledCount ?? winCount + lossCount + pushCount),
    pendingCount: Number(source.pendingCount ?? 0),
    winCount,
    lossCount,
    pushCount,
    winRate: decisions > 0 ? winCount / decisions : null
  };
}

function mergeStats(...items: RecordStats[]): RecordStats {
  const merged = items.reduce((acc, item) => ({
    predictionCount: acc.predictionCount + item.predictionCount,
    settledCount: acc.settledCount + item.settledCount,
    pendingCount: acc.pendingCount + item.pendingCount,
    winCount: acc.winCount + item.winCount,
    lossCount: acc.lossCount + item.lossCount,
    pushCount: acc.pushCount + item.pushCount,
    winRate: null
  }), zeroStats());
  const decisions = merged.winCount + merged.lossCount;
  return { ...merged, winRate: decisions > 0 ? merged.winCount / decisions : null };
}

function rowDate(row: any) {
  const raw = row.fightDate ?? row.eventDate ?? row.recordedAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function filterMmaRows(rows: any[], days: number | null) {
  if (!days) return rows;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const date = rowDate(row);
    return date ? date.getTime() >= cutoff : false;
  });
}

function statsFromMmaRows(rows: any[]): RecordStats {
  const settled = rows.filter((row) => row.resultCorrect === true || row.resultCorrect === false || row.status === "RESOLVED" || row.status === "SETTLED");
  const winCount = settled.filter((row) => row.resultCorrect === true).length;
  const lossCount = settled.filter((row) => row.resultCorrect === false).length;
  const decisions = winCount + lossCount;

  return {
    predictionCount: rows.length,
    settledCount: settled.length,
    pendingCount: Math.max(0, rows.length - settled.length),
    winCount,
    lossCount,
    pushCount: 0,
    winRate: decisions > 0 ? winCount / decisions : null
  };
}

function statTone(stats: RecordStats) {
  if (stats.settledCount >= 100) return "border-emerald-300/20 bg-emerald-300/[0.06]";
  if (stats.settledCount >= 25) return "border-amber-300/20 bg-amber-300/[0.06]";
  return "border-white/10 bg-white/[0.03]";
}

function StatCard({ label, value, note, className = "" }: { label: string; value: string; note: string; className?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${className || "border-white/10 bg-white/[0.03]"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function RecordCard({ label, stats, note }: { label: string; stats: RecordStats; note: string }) {
  return (
    <StatCard
      label={label}
      value={record(stats.winCount, stats.lossCount, stats.pushCount)}
      note={`${pct(stats.winRate)} · ${stats.settledCount} graded · ${note}`}
      className={statTone(stats)}
    />
  );
}

function SectionTitle({ label, title, body }: { label: string; title: string; body?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{label}</div>
      <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{title}</h2>
      {body ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{body}</p> : null}
    </div>
  );
}

function FilterNav({ active }: { active: WindowOption }) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-3" aria-label="Accuracy record window">
      {WINDOW_OPTIONS.map((option) => {
        const isActive = option.value === active.value;
        return (
          <Link
            key={option.value}
            href={`/sim/accuracy?window=${option.value}`}
            className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${isActive ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

function QualityPill({ label }: { label: string }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">{label}</span>;
}

export default async function AccuracyV2Page({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const activeWindow = selectedWindow(param(resolved, "window") ?? param(resolved, "windowDays"));
  const scorecardDays = activeWindow.days ?? 3650;
  const windowLabel = activeWindow.days ? `${activeWindow.days} days` : "All time";

  const [mlbCard, mmaLedger] = await Promise.all([
    getSimModelScorecard({ league: "MLB", market: param(resolved, "market") ?? "ALL", modelVersion: "ALL", windowDays: scorecardDays }),
    getUfcSettledLedger({ modelVersion: param(resolved, "mmaModel") ?? "ufc-fight-iq-v1", limit: activeWindow.days ? 1000 : 5000 })
  ]);

  const mmaRows = filterMmaRows(mmaLedger.rows ?? [], activeWindow.days);
  const moneylineStats = statsFromScorecard(mlbCard.totals);
  const totalsStats = statsFromScorecard(mlbCard.totalsScorecard);
  const mlbStats = mergeStats(moneylineStats, totalsStats);
  const mmaStats = statsFromMmaRows(mmaRows);
  const overallStats = mergeStats(mlbStats, mmaStats);
  const primaryMoneyline = mlbCard.scorecards?.[0];
  const sampleLabel = `${overallStats.settledCount}/${overallStats.predictionCount}`;

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Accuracy Command Center</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Overall sim accuracy and top-play records</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Records are split by MLB and MMA, with MLB moneyline separated from MLB totals. The selected record window applies to every card on the page.
            </p>
            <div className="mt-3 text-xs text-slate-500">Window {windowLabel} · MLB generated {when(mlbCard.generatedAt)} · MMA generated {when(mmaLedger.generatedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/baseball/readiness" className="text-cyan-200 hover:text-cyan-100">MLB Readiness</Link>
            <Link href="/accuracy/mma" className="text-cyan-200 hover:text-cyan-100">MMA Accuracy</Link>
            <Link href="/api/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <FilterNav active={activeWindow} />

      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.04] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle
            label="Overall sim accuracy score"
            title={`${pct(overallStats.winRate)} · ${record(overallStats.winCount, overallStats.lossCount, overallStats.pushCount)}`}
            body="Combined top-play record across MLB moneyline, MLB totals, and MMA fight picks. Pushes are displayed but excluded from the accuracy percentage."
          />
          <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Graded sample</div>
            <div className="font-display text-4xl font-black tracking-[-0.06em] text-white">{sampleLabel}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">settled / tracked</div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RecordCard label="Top plays overall" stats={overallStats} note="MLB + MMA" />
          <RecordCard label="MLB top plays" stats={mlbStats} note="moneyline + totals" />
          <RecordCard label="MMA top plays" stats={mmaStats} note="settled fight picks" />
          <StatCard label="Pending/excluded" value={String(overallStats.pendingCount)} note="Not counted in the win/loss denominator" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
          <SectionTitle
            label="MLB record"
            title={`${record(mlbStats.winCount, mlbStats.lossCount, mlbStats.pushCount)} · ${pct(mlbStats.winRate)}`}
            body="MLB is separated from MMA so baseball performance cannot hide fight-sim performance."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RecordCard label="Moneyline top plays" stats={moneylineStats} note="sides only" />
            <RecordCard label="Totals accuracy" stats={totalsStats} note="over/under only" />
            <StatCard label="Moneyline units" value={units(mlbCard.totals?.unitsNet)} note={`${pctRaw(mlbCard.totals?.roi)} · ${oddsMode(mlbCard.totals?.roiMode)}`} />
            <StatCard label="Totals units" value={units(mlbCard.totalsScorecard?.unitsNet)} note={`${pctRaw(mlbCard.totalsScorecard?.roi)} · ${oddsMode(mlbCard.totalsScorecard?.roiMode)}`} />
            <StatCard label="MLB Brier" value={num(mlbCard.totals?.brierScoreAvg, 4)} note="Moneyline probability calibration" />
            <StatCard label="Totals MAE" value={num(mlbCard.totalsScorecard?.totalMae, 2)} note="Average total error" />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
          <SectionTitle
            label="MMA record"
            title={`${record(mmaStats.winCount, mmaStats.lossCount, mmaStats.pushCount)} · ${pct(mmaStats.winRate)}`}
            body="MMA reads the UFC settled ledger and is filtered independently to the same selected record window."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RecordCard label="Fight picks" stats={mmaStats} note="winner predictions" />
            <StatCard label="Pending fights" value={String(mmaStats.pendingCount)} note="Awaiting official result" />
            <StatCard label="MMA Brier" value={num(mmaLedger.avgBrier, 4)} note="Full returned MMA ledger" />
            <StatCard label="Avg CLV" value={pctRaw(mmaLedger.avgClvPct)} note={`${pct(mmaLedger.clvCoveragePct)} CLV coverage`} />
            <StatCard label="Should-pass" value={String(mmaLedger.shouldHavePassedCount)} note="Rows current discipline would avoid" />
            <StatCard label="Ledger rows" value={String(mmaRows.length)} note={`${mmaLedger.rows.length} loaded before window filter`} />
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            label="Top-play proof details"
            title="Records, odds quality, and calibration"
            body="This section keeps accuracy claims honest by showing sample size, actual odds coverage, and calibration metrics next to the record."
          />
          <QualityPill label={activeWindow.days ? `${activeWindow.days} day window` : "all time"} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Overall record" value={record(overallStats.winCount, overallStats.lossCount, overallStats.pushCount)} note={`${pct(overallStats.winRate)} combined accuracy`} />
          <StatCard label="MLB ML odds" value={`${mlbCard.totals?.actualOddsCount ?? 0}/${(mlbCard.totals?.actualOddsCount ?? 0) + (mlbCard.totals?.fallbackOddsCount ?? 0)}`} note={`Avg ${odds(mlbCard.totals?.avgSelectedAmericanOdds)}`} />
          <StatCard label="MLB ML ROI" value={pctRaw(mlbCard.totals?.roi)} note={oddsMode(mlbCard.totals?.roiMode)} />
          <StatCard label="MLB totals ROI" value={pctRaw(mlbCard.totalsScorecard?.roi)} note={oddsMode(mlbCard.totalsScorecard?.roiMode)} />
          <StatCard label="MMA CLV" value={pctRaw(mmaLedger.avgClvPct)} note="Closing-line value" />
          <StatCard label="Pending rows" value={String(overallStats.pendingCount)} note="Not graded yet" />
        </div>
      </section>

      {primaryMoneyline ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
          <SectionTitle label="MLB moneyline detail" title={`${primaryMoneyline.modelVersion} · ${record(primaryMoneyline.winCount, primaryMoneyline.lossCount, primaryMoneyline.pushCount)}`} />
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Win rate" value={pct(primaryMoneyline.winRate)} note="Pushes excluded" />
            <StatCard label="Units" value={units(primaryMoneyline.unitsNet)} note={`${pctRaw(primaryMoneyline.roi)} ROI`} />
            <StatCard label="Odds coverage" value={`${primaryMoneyline.actualOddsCount ?? 0}/${(primaryMoneyline.actualOddsCount ?? 0) + (primaryMoneyline.fallbackOddsCount ?? 0)}`} note={`Avg ${odds(primaryMoneyline.avgSelectedAmericanOdds)}`} />
            <StatCard label="Brier" value={num(primaryMoneyline.brierScoreAvg, 4)} note="All graded rows" />
            <StatCard label="Log loss" value={num(primaryMoneyline.logLossAvg, 4)} note="All graded rows" />
            <StatCard label="Sample" value={`${primaryMoneyline.settledCount}/${primaryMoneyline.predictionCount}`} note="Settled / tracked" />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <summary className="cursor-pointer list-none">
            <SectionTitle label="Recent MLB moneyline rows" title="Latest graded/captured sides" body="Most recent rows returned by the MLB accuracy ledger." />
          </summary>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
                <tr><th className="px-3 py-2">Game</th><th className="px-3 py-2">Signal</th><th className="px-3 py-2 text-right">Odds</th><th className="px-3 py-2 text-right">Model</th><th className="px-3 py-2 text-right">Result</th></tr>
              </thead>
              <tbody>{(mlbCard.recent ?? []).slice(0, 20).map((row: any) => (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel ?? row.gameId}</div><div className="mt-1 text-[10px] text-slate-500">{when(row.predictionTime)}</div></td>
                  <td className="px-3 py-3 text-slate-300">{row.side ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-200">{odds(row.selectedAmericanOdds)}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.modelProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{row.resultBucket}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>

        <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <summary className="cursor-pointer list-none">
            <SectionTitle label="Recent MMA rows" title="Latest fight picks" body="Rows are filtered to the same record window before display." />
          </summary>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
                <tr><th className="px-3 py-2">Fight</th><th className="px-3 py-2">Pick</th><th className="px-3 py-2">Actual</th><th className="px-3 py-2 text-right">Prob</th><th className="px-3 py-2 text-right">Result</th></tr>
              </thead>
              <tbody>{mmaRows.slice(0, 20).map((row: any) => (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3"><div className="font-semibold text-white">{row.fighterAName ?? "Fighter A"} vs {row.fighterBName ?? "Fighter B"}</div><div className="mt-1 text-[10px] text-slate-500">{row.eventLabel} · {when(row.recordedAt)}</div></td>
                  <td className="px-3 py-3 text-slate-300">{row.pickName ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-300">{row.actualWinnerName ?? "pending"}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.pickProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{row.resultCorrect === true ? "WIN" : row.resultCorrect === false ? "LOSS" : row.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      </div>
    </main>
  );
}
