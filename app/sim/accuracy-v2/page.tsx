import Link from "next/link";

import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { getUfcSettledLedger } from "@/services/ufc/settled-ledger";

export const revalidate = 3600;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

type MaturityTone = "ready" | "partial" | "blocked";

type RecordStats = {
  predictionCount: number;
  settledCount: number;
  pendingCount: number;
  winCount: number;
  lossCount: number;
  pushCount: number;
  winRate: number | null;
};

const WINDOW_OPTIONS = [
  { label: "7D", value: "7", days: 7 },
  { label: "15D", value: "15", days: 15 },
  { label: "30D", value: "30", days: 30 },
  { label: "90D", value: "90", days: 90 },
  { label: "365D", value: "365", days: 365 },
  { label: "All Time", value: "all", days: null }
] as const;

function v(params: Record<string, string | string[] | undefined>, key: string) {
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

function maturityTone(sample: number, actualOdds: number, brier: number | null | undefined): MaturityTone {
  if (sample >= 100 && actualOdds >= 80 && typeof brier === "number") return "ready";
  if (sample >= 25) return "partial";
  return "blocked";
}

function toneClasses(tone: MaturityTone) {
  if (tone === "ready") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (tone === "partial") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-300/10 text-rose-100";
}

function pill(tone: "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function zeroStats(): RecordStats {
  return { predictionCount: 0, settledCount: 0, pendingCount: 0, winCount: 0, lossCount: 0, pushCount: 0, winRate: null };
}

function statsFromCard(source: any): RecordStats {
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

function mmaRowDate(row: any) {
  const raw = row.fightDate ?? row.eventDate ?? row.recordedAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function filterMmaRows(rows: any[], days: number | null) {
  if (!days) return rows;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const date = mmaRowDate(row);
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

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function RecordTile({ label, stats, note }: { label: string; stats: RecordStats; note: string }) {
  return <Tile label={label} value={record(stats.winCount, stats.lossCount, stats.pushCount)} note={`${pct(stats.winRate)} · ${note}`} />;
}

function SportMaturityCard({ sport, title, tone, body, href }: { sport: string; title: string; tone: MaturityTone; body: string; href: string }) {
  const label = tone === "ready" ? "proof-ready" : tone === "partial" ? "building proof" : "shadow only";
  return (
    <Link href={href} className={`rounded-[1.15rem] border p-4 transition hover:-translate-y-0.5 ${toneClasses(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{sport}</div>
        <span className={pill(tone === "ready" ? "green" : tone === "partial" ? "amber" : "red")}>{label}</span>
      </div>
      <h3 className="mt-3 font-display text-xl font-black tracking-[-0.04em] text-white">{title}</h3>
      <p className="mt-2 text-xs leading-5 opacity-80">{body}</p>
    </Link>
  );
}

function MaturityMetric({ label, value, sub, pass }: { label: string; value: string | number; sub: string; pass: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">{label}</div>
        <span className={pill(pass ? "green" : "amber")}>{pass ? "pass" : "watch"}</span>
      </div>
      <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-white">{value}</div>
      <p className="mt-1 text-[11px] leading-4 opacity-75">{sub}</p>
    </div>
  );
}

function AccuracyMaturityGate({ totals, overall }: { totals: any; overall: RecordStats }) {
  const sample = overall.settledCount;
  const predictionCount = overall.predictionCount;
  const actualOdds = Number(totals?.actualOddsCount ?? 0);
  const fallbackOdds = Number(totals?.fallbackOddsCount ?? 0);
  const brier = typeof totals?.brierScoreAvg === "number" ? totals.brierScoreAvg : null;
  const tone = maturityTone(sample, actualOdds, brier);
  const label = tone === "ready" ? "Accuracy proof is usable" : tone === "partial" ? "Accuracy proof is building" : "Accuracy proof is thin";
  const note = tone === "ready"
    ? "The selected window has enough settled top-play rows to use this as a public proof layer."
    : tone === "partial"
      ? "The selected window has some settled proof. Keep building larger samples, better actual-odds coverage, CLV, and calibration buckets."
      : "The selected window is still thin. Keep official plays selective and keep building settled rows before overclaiming.";

  return (
    <section className={`rounded-[1.5rem] border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ${toneClasses(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">Accuracy maturity gate</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{label}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">{note}</p>
        </div>
        <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Overall sim accuracy</div>
          <div className="font-display text-4xl font-black tracking-[-0.06em] text-white">{pct(overall.winRate)}</div>
          <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-75">{record(overall.winCount, overall.lossCount, overall.pushCount)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <MaturityMetric label="Top-play sample" value={`${sample}/${predictionCount}`} sub="MLB moneyline, MLB totals, and MMA settled picks." pass={sample >= 100} />
        <MaturityMetric label="Actual MLB odds" value={`${actualOdds}/${actualOdds + fallbackOdds}`} sub="ROI proof is weaker when fallback odds drive results." pass={actualOdds >= Math.max(20, Number(totals?.settledCount ?? 0) * 0.8)} />
        <MaturityMetric label="MLB Brier" value={num(brier, 4)} sub="Probability calibration, not just wins and losses." pass={typeof brier === "number"} />
        <MaturityMetric label="Still missing" value="CLV" sub="Closing-line value and calibration buckets are still the next proof upgrades." pass={false} />
      </div>
    </section>
  );
}

export default async function AccuracyV2Page({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const windowOption = selectedWindow(v(resolved, "window") ?? v(resolved, "windowDays"));
  const scorecardDays = windowOption.days ?? 3650;
  const [card, mmaLedger] = await Promise.all([
    getSimModelScorecard({ league: "MLB", market: v(resolved, "market") ?? "ALL", modelVersion: "ALL", windowDays: scorecardDays }),
    getUfcSettledLedger({ modelVersion: v(resolved, "mmaModel") ?? "ufc-fight-iq-v1", limit: 250 })
  ]);

  const primary = card.scorecards[0];
  const rows = card.recent ?? [];
  const mmaRows = filterMmaRows(mmaLedger.rows ?? [], windowOption.days);
  const mlbMoneylineStats = statsFromCard(card.totals);
  const mlbTotalsStats = statsFromCard(card.totalsScorecard);
  const mlbOverallStats = mergeStats(mlbMoneylineStats, mlbTotalsStats);
  const mmaStats = statsFromMmaRows(mmaRows);
  const overallTopPlayStats = mergeStats(mlbOverallStats, mmaStats);
  const windowLabel = windowOption.value === "all" ? "All time" : `${windowOption.days} days`;
  const mmaTone = mmaStats.settledCount >= 100 ? "ready" : mmaStats.settledCount >= 20 ? "partial" : "blocked";

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Accuracy Command Center</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Overall sim accuracy and top-play record</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              One proof surface for SharkEdge records: overall sim score, top-play win/losses, totals accuracy, MLB split, and MMA split. The selected window controls every record shown below.
            </p>
            <div className="mt-3 text-xs text-slate-500">Window {windowLabel} · generated {when(card.generatedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/baseball/readiness" className="text-cyan-200 hover:text-cyan-100">MLB Readiness</Link>
            <Link href="/sim/ufc" className="text-cyan-200 hover:text-cyan-100">MMA Lab</Link>
            <Link href="/api/sim/accuracy?action=run" className="text-cyan-200 hover:text-cyan-100">Run ledger</Link>
            <Link href="/api/sim/accuracy" className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-3" aria-label="Accuracy record window">
        {WINDOW_OPTIONS.map((option) => {
          const active = option.value === windowOption.value;
          return (
            <Link
              key={option.value}
              href={`/sim/accuracy?window=${option.value}`}
              className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${active ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>

      <AccuracyMaturityGate totals={card.totals} overall={overallTopPlayStats} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Tile label="Overall sim accuracy" value={pct(overallTopPlayStats.winRate)} note={`${record(overallTopPlayStats.winCount, overallTopPlayStats.lossCount, overallTopPlayStats.pushCount)} across MLB + MMA top plays`} />
        <RecordTile label="Top plays overall" stats={overallTopPlayStats} note={`${overallTopPlayStats.settledCount} graded top plays`} />
        <RecordTile label="Totals accuracy" stats={mlbTotalsStats} note="MLB over/under top plays" />
        <RecordTile label="MLB record" stats={mlbOverallStats} note="Moneyline + totals split below" />
        <RecordTile label="MMA record" stats={mmaStats} note="Settled fight picks only" />
        <Tile label="Pending/excluded" value={String(overallTopPlayStats.pendingCount)} note="Not counted in win/loss denominator" />
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <SportMaturityCard
          sport="MLB"
          title={`MLB ${record(mlbOverallStats.winCount, mlbOverallStats.lossCount, mlbOverallStats.pushCount)} · ${pct(mlbOverallStats.winRate)}`}
          tone={maturityTone(Number(mlbOverallStats.settledCount ?? 0), Number(card.totals?.actualOddsCount ?? 0), card.totals?.brierScoreAvg)}
          body={`Moneyline top plays are ${record(mlbMoneylineStats.winCount, mlbMoneylineStats.lossCount, mlbMoneylineStats.pushCount)}. Totals top plays are ${record(mlbTotalsStats.winCount, mlbTotalsStats.lossCount, mlbTotalsStats.pushCount)} at ${pct(mlbTotalsStats.winRate)}.`}
          href="/baseball/readiness"
        />
        <SportMaturityCard
          sport="MMA"
          title={`MMA ${record(mmaStats.winCount, mmaStats.lossCount, mmaStats.pushCount)} · ${pct(mmaStats.winRate)}`}
          tone={mmaTone}
          body={`${mmaStats.settledCount} settled fight picks in this window, ${mmaStats.pendingCount} pending. MMA remains separated from MLB so one sport cannot hide the other.`}
          href="/accuracy/mma"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">MLB moneyline top plays</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile label="Record" value={record(mlbMoneylineStats.winCount, mlbMoneylineStats.lossCount, mlbMoneylineStats.pushCount)} note={`${pct(mlbMoneylineStats.winRate)} · pushes excluded`} />
            <Tile label="Units" value={units(card.totals.unitsNet)} note={`${pctRaw(card.totals.roi)} · ${mode(card.totals.roiMode)}`} />
            <Tile label="Odds coverage" value={`${card.totals.actualOddsCount ?? 0}/${(card.totals.actualOddsCount ?? 0) + (card.totals.fallbackOddsCount ?? 0)}`} note={`Avg ${odds(card.totals.avgSelectedAmericanOdds)}`} />
            <Tile label="Sample" value={`${card.totals.settledCount}/${card.totals.predictionCount}`} note={`${card.totals.pendingCount} pending/excluded`} />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">MLB totals top plays</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile label="Record" value={record(mlbTotalsStats.winCount, mlbTotalsStats.lossCount, mlbTotalsStats.pushCount)} note={`${pct(mlbTotalsStats.winRate)} · over/under`} />
            <Tile label="Units" value={units(card.totalsScorecard?.unitsNet)} note={`${pctRaw(card.totalsScorecard?.roi)} · ${mode(card.totalsScorecard?.roiMode)}`} />
            <Tile label="Total MAE" value={num(card.totalsScorecard?.totalMae, 2)} note="Average total error" />
            <Tile label="Sample" value={`${mlbTotalsStats.settledCount}/${mlbTotalsStats.predictionCount}`} note={`${mlbTotalsStats.pendingCount} pending/excluded`} />
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">MMA fight picks</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Tile label="Record" value={record(mmaStats.winCount, mmaStats.lossCount, mmaStats.pushCount)} note={`${pct(mmaStats.winRate)} · settled fights`} />
            <Tile label="Brier" value={num(mmaLedger.avgBrier, 4)} note="MMA probability calibration" />
            <Tile label="Avg CLV" value={pctRaw(mmaLedger.avgClvPct)} note={`${pct(mmaLedger.clvCoveragePct)} CLV coverage`} />
            <Tile label="Pending" value={String(mmaStats.pendingCount)} note="Not in the win/loss denominator" />
          </div>
        </div>
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
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{primary.modelVersion} · Moneyline detail</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Record" value={record(primary.winCount, primary.lossCount, primary.pushCount)} note="Moneyline top plays" />
            <Tile label="Win rate" value={pct(primary.winRate)} note="Pushes excluded" />
            <Tile label="Units" value={units(primary.unitsNet)} note={`${pctRaw(primary.roi)} · ${mode(primary.roiMode)}`} />
            <Tile label="Odds coverage" value={`${primary.actualOddsCount ?? 0}/${(primary.actualOddsCount ?? 0) + (primary.fallbackOddsCount ?? 0)}`} note={`Avg ${odds(primary.avgSelectedAmericanOdds)}`} />
            <Tile label="Brier" value={num(primary.brierScoreAvg, 4)} note="All graded rows" />
            <Tile label="Log loss" value={num(primary.logLossAvg, 4)} note="All graded rows" />
          </div>
        </section>
      ) : null}

      {card.recentTotals && card.recentTotals.length > 0 ? (
        <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <summary className="cursor-pointer list-none">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent totals ledger rows</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Latest over/under signals with result status.</div>
          </summary>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Game</th><th className="px-3 py-2">Signal</th><th className="px-3 py-2 text-right">Odds</th><th className="px-3 py-2 text-right">Mkt Total</th><th className="px-3 py-2 text-right">Mdl Total</th><th className="px-3 py-2 text-right">Result</th><th className="px-3 py-2 text-right">Captured</th></tr></thead>
              <tbody>{card.recentTotals.slice(0, 20).map((row: any) => (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel ?? row.gameId}</div><div className="mt-1 text-[10px] text-slate-500">{row.modelVersion}</div></td>
                  <td className="px-3 py-3 text-slate-300"><div>{row.side ?? "—"}</div><div className="mt-1 text-[10px] text-slate-600">{row.signalMarket ?? row.roiExclusionReason ?? "no signal"}</div></td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-200"><div>{odds(row.selectedAmericanOdds)}</div><div className="mt-1 text-[10px] text-slate-600">{row.oddsSource ?? "fallback"}</div></td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.marketTotal, 1)}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{num(row.modelTotal, 1)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{row.resultBucket}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{when(row.predictionTime)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      ) : null}

      <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <summary className="cursor-pointer list-none">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent moneyline ledger rows</div>
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

      <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <summary className="cursor-pointer list-none">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent MMA ledger rows</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Filtered to the same selected record window.</div>
        </summary>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Fight</th><th className="px-3 py-2">Pick</th><th className="px-3 py-2">Actual</th><th className="px-3 py-2 text-right">Prob</th><th className="px-3 py-2 text-right">CLV</th><th className="px-3 py-2 text-right">Result</th><th className="px-3 py-2 text-right">Recorded</th></tr></thead>
            <tbody>{mmaRows.slice(0, 20).map((row: any) => (
              <tr key={row.id} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3"><div className="font-semibold text-white">{row.fighterAName ?? "Fighter A"} vs {row.fighterBName ?? "Fighter B"}</div><div className="mt-1 text-[10px] text-slate-500">{row.eventLabel}</div></td>
                <td className="px-3 py-3 text-slate-300">{row.pickName ?? "—"}</td>
                <td className="px-3 py-3 text-slate-300">{row.actualWinnerName ?? "pending"}</td>
                <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.pickProbability)}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-200">{pctRaw(row.closingLineValuePct)}</td>
                <td className="px-3 py-3 text-right"><span className={pill(row.resultCorrect === true ? "green" : row.resultCorrect === false ? "red" : "slate")}>{row.resultCorrect === true ? "win" : row.resultCorrect === false ? "loss" : row.status}</span></td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{when(row.recordedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
