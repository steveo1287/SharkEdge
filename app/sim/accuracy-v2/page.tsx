import Link from "next/link";

import { getMlbAccuracyMarketLedger, type MlbAuditMarket } from "@/services/sim/mlb-accuracy-market-ledger";
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

type WindowOption = { label: string; value: string; days: number | null };

const WINDOW_OPTIONS: WindowOption[] = [
  { label: "7D", value: "7", days: 7 },
  { label: "15D", value: "15", days: 15 },
  { label: "30D", value: "30", days: 30 },
  { label: "90D", value: "90", days: 90 },
  { label: "365D", value: "365", days: 365 },
  { label: "All Time", value: "all", days: null }
];

const AUDIT_MARKETS: Array<{ label: string; value: "ALL" | MlbAuditMarket }> = [
  { label: "All", value: "ALL" },
  { label: "Moneyline", value: "MONEYLINE" },
  { label: "O/U", value: "FULL_TOTAL" },
  { label: "F5", value: "F5_MONEYLINE" },
  { label: "NRFI", value: "NRFI_YRFI" }
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

function day(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
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

function statsFromAuditSummaries(summaries: Array<{ predictionCount: number; settledCount: number; pendingCount: number; winCount: number; lossCount: number; pushCount: number }>): RecordStats {
  const stats = summaries.reduce((acc, item) => ({
    predictionCount: acc.predictionCount + item.predictionCount,
    settledCount: acc.settledCount + item.settledCount,
    pendingCount: acc.pendingCount + item.pendingCount,
    winCount: acc.winCount + item.winCount,
    lossCount: acc.lossCount + item.lossCount,
    pushCount: acc.pushCount + item.pushCount,
    winRate: null
  }), zeroStats());
  const decisions = stats.winCount + stats.lossCount;
  return { ...stats, winRate: decisions > 0 ? stats.winCount / decisions : null };
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
  return { predictionCount: rows.length, settledCount: settled.length, pendingCount: Math.max(0, rows.length - settled.length), winCount, lossCount, pushCount: 0, winRate: decisions > 0 ? winCount / decisions : null };
}

function statTone(stats: RecordStats) {
  if (stats.settledCount >= 100) return "border-emerald-300/20 bg-emerald-300/[0.06]";
  if (stats.settledCount >= 25) return "border-amber-300/20 bg-amber-300/[0.06]";
  return "border-white/10 bg-white/[0.03]";
}

function urlWith(params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return `/sim/accuracy?${query.toString()}`;
}

function StatCard({ label, value, note, className = "" }: { label: string; value: string; note: string; className?: string }) {
  return <div className={`rounded-2xl border p-4 ${className || "border-white/10 bg-white/[0.03]"}`}><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div><div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{note}</div></div>;
}

function RecordCard({ label, stats, note }: { label: string; stats: RecordStats; note: string }) {
  return <StatCard label={label} value={record(stats.winCount, stats.lossCount, stats.pushCount)} note={`${pct(stats.winRate)} · ${stats.settledCount} graded · ${note}`} className={statTone(stats)} />;
}

function SectionTitle({ label, title, body }: { label: string; title: string; body?: string }) {
  return <div><div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{label}</div><h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{title}</h2>{body ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{body}</p> : null}</div>;
}

function FilterNav({ active, date, auditMarket }: { active: WindowOption; date: string | null; auditMarket: string }) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-3" aria-label="Accuracy record window">
      {WINDOW_OPTIONS.map((option) => {
        const isActive = option.value === active.value && !date;
        return <Link key={option.value} href={urlWith({ window: option.value, auditMarket })} className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${isActive ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}>{option.label}</Link>;
      })}
    </nav>
  );
}

function DateNavigator({ selectedDate, previousDate, nextDate, today, activeWindow, auditMarket }: { selectedDate: string; previousDate: string; nextDate: string; today: string; activeWindow: WindowOption; auditMarket: string }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SectionTitle label="Date audit" title={`Snapshot date: ${selectedDate}`} body="Jump backward or forward to inspect exactly what the model logged on a specific date. This is based on captured pregame snapshots, not retroactive picks." />
        <form action="/sim/accuracy" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="window" value={activeWindow.value} />
          <input type="hidden" name="auditMarket" value={auditMarket} />
          <input name="date" type="date" defaultValue={selectedDate} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white" />
          <button className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-100">Load Date</button>
        </form>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.14em]">
        <Link href={urlWith({ date: previousDate, window: activeWindow.value, auditMarket })} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-300 hover:text-white">Previous day</Link>
        <Link href={urlWith({ date: today, window: activeWindow.value, auditMarket })} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-cyan-100">Today</Link>
        <Link href={urlWith({ date: nextDate, window: activeWindow.value, auditMarket })} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-300 hover:text-white">Next day</Link>
        <Link href={urlWith({ window: activeWindow.value, auditMarket })} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-slate-300 hover:text-white">Back to window</Link>
      </div>
    </section>
  );
}

function AuditMarketNav({ active, date, windowValue }: { active: string; date: string | null; windowValue: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {AUDIT_MARKETS.map((item) => (
        <Link key={item.value} href={urlWith({ auditMarket: item.value, date, window: windowValue })} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] ${active === item.value ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}>{item.label}</Link>
      ))}
    </div>
  );
}

function ResultPill({ value }: { value: string }) {
  const tone = value === "WIN" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : value === "LOSS" ? "border-rose-300/30 bg-rose-300/10 text-rose-100" : value === "PUSH" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-white/10 bg-white/[0.04] text-slate-300";
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${tone}`}>{value}</span>;
}

export default async function AccuracyV2Page({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const activeWindow = selectedWindow(param(resolved, "window") ?? param(resolved, "windowDays"));
  const selectedDate = param(resolved, "date") ?? null;
  const auditMarket = (param(resolved, "auditMarket") ?? "ALL").toUpperCase();
  const scorecardDays = activeWindow.days ?? 3650;
  const windowLabel = selectedDate ? `Date ${selectedDate}` : activeWindow.days ? `${activeWindow.days} days` : "All time";

  const [mlbCard, marketAudit, mmaLedger] = await Promise.all([
    getSimModelScorecard({ league: "MLB", market: param(resolved, "market") ?? "ALL", modelVersion: "ALL", windowDays: scorecardDays }),
    getMlbAccuracyMarketLedger({ date: selectedDate, windowDays: scorecardDays, limit: selectedDate ? 1000 : 250 }),
    getUfcSettledLedger({ modelVersion: param(resolved, "mmaModel") ?? "ufc-fight-iq-v1", limit: activeWindow.days ? 1000 : 5000 })
  ]);

  const mmaRows = filterMmaRows(mmaLedger.rows ?? [], activeWindow.days);
  const marketAuditStats = statsFromAuditSummaries(marketAudit.summaries);
  const moneylineStats = statsFromScorecard(mlbCard.totals);
  const totalsStats = statsFromScorecard(mlbCard.totalsScorecard);
  const mmaStats = statsFromMmaRows(mmaRows);
  const overallStats = statsFromAuditSummaries([...marketAudit.summaries, { predictionCount: mmaStats.predictionCount, settledCount: mmaStats.settledCount, pendingCount: mmaStats.pendingCount, winCount: mmaStats.winCount, lossCount: mmaStats.lossCount, pushCount: mmaStats.pushCount }]);
  const sampleLabel = `${marketAuditStats.settledCount}/${marketAuditStats.predictionCount}`;
  const filteredAuditRows = marketAudit.rows.filter((row) => auditMarket === "ALL" || row.market === auditMarket).slice(0, 200);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Accuracy Command Center</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Transparent prediction ledger</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              The page now expands every saved MLB snapshot into moneyline, over/under, first-five, and NRFI/YRFI audit rows. Rows that cannot be graded yet say exactly why instead of being hidden.
            </p>
            <div className="mt-3 text-xs text-slate-500">{windowLabel} · MLB audit generated {when(marketAudit.generatedAt)} · legacy scorecard generated {when(mlbCard.generatedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">Sim Hub</Link>
            <Link href="/baseball/readiness" className="text-cyan-200 hover:text-cyan-100">MLB Readiness</Link>
            <Link href={`/api/sim/accuracy?windowDays=${scorecardDays}`} className="text-cyan-200 hover:text-cyan-100">API JSON</Link>
          </div>
        </div>
      </section>

      <FilterNav active={activeWindow} date={selectedDate} auditMarket={auditMarket} />
      <DateNavigator selectedDate={marketAudit.dateNavigation.selectedDate} previousDate={marketAudit.dateNavigation.previousDate} nextDate={marketAudit.dateNavigation.nextDate} today={marketAudit.dateNavigation.today} activeWindow={activeWindow} auditMarket={auditMarket} />

      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.04] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionTitle label="MLB audit ledger" title={`${record(marketAuditStats.winCount, marketAuditStats.lossCount, marketAuditStats.pushCount)} · ${pct(marketAuditStats.winRate)}`} body="This record is calculated from the visible audit rows below. Pending, missing-line, and missing-inning rows are tracked but excluded from the win/loss denominator." />
          <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right"><div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Graded sample</div><div className="font-display text-4xl font-black tracking-[-0.06em] text-white">{sampleLabel}</div><div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">settled / tracked</div></div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {marketAudit.summaries.map((summary) => <RecordCard key={summary.market} label={summary.label} stats={{ predictionCount: summary.predictionCount, settledCount: summary.settledCount, pendingCount: summary.pendingCount, winCount: summary.winCount, lossCount: summary.lossCount, pushCount: summary.pushCount, winRate: summary.winRate }} note={summary.statusNote} />)}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
          <SectionTitle label="Legacy MLB scorecard" title={`${record(moneylineStats.winCount + totalsStats.winCount, moneylineStats.lossCount + totalsStats.lossCount, moneylineStats.pushCount + totalsStats.pushCount)} · ML/O-U`} body="The old scorecard is kept for units/ROI continuity. The transparent audit table below is the new trust layer." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RecordCard label="Moneyline top plays" stats={moneylineStats} note="legacy official ROI" />
            <RecordCard label="Totals accuracy" stats={totalsStats} note="legacy full-game O/U" />
            <StatCard label="Moneyline units" value={units(mlbCard.totals?.unitsNet)} note={`${pctRaw(mlbCard.totals?.roi)} · ${oddsMode(mlbCard.totals?.roiMode)}`} />
            <StatCard label="Totals units" value={units(mlbCard.totalsScorecard?.unitsNet)} note={`${pctRaw(mlbCard.totalsScorecard?.roi)} · ${oddsMode(mlbCard.totalsScorecard?.roiMode)}`} />
          </div>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
          <SectionTitle label="Overall product record" title={`${record(overallStats.winCount, overallStats.lossCount, overallStats.pushCount)} · ${pct(overallStats.winRate)}`} body="Combined visible MLB audit rows plus MMA fight-pick ledger. MLB market rows remain separated above so one market cannot hide another." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RecordCard label="MLB audit rows" stats={marketAuditStats} note="ML/O-U/F5/NRFI" />
            <RecordCard label="MMA top plays" stats={mmaStats} note="fight picks" />
            <StatCard label="Pending MLB rows" value={String(marketAuditStats.pendingCount)} note="Tracked but not graded" />
            <StatCard label="MMA CLV" value={pctRaw(mmaLedger.avgClvPct)} note={`${pct(mmaLedger.clvCoveragePct)} CLV coverage`} />
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle label="Market-by-market audit" title="Every MLB prediction row for the selected date/window" body="Moneyline and full-game totals settle from final score. F5 and NRFI/YRFI remain pending unless inning-level settlement data is attached to result_json." />
          <AuditMarketNav active={auditMarket} date={selectedDate} windowValue={activeWindow.value} />
        </div>
        {marketAudit.error ? <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm text-rose-100">{marketAudit.error}</div> : null}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[1180px] w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
              <tr>
                <th className="px-3 py-2">Captured</th><th className="px-3 py-2">Game</th><th className="px-3 py-2">Market</th><th className="px-3 py-2">Pick</th><th className="px-3 py-2 text-right">Line</th><th className="px-3 py-2 text-right">Model</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Result</th><th className="px-3 py-2">Transparency</th>
              </tr>
            </thead>
            <tbody>
              {filteredAuditRows.length ? filteredAuditRows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3 font-mono text-slate-400"><div>{when(row.capturedAt)}</div><div className="mt-1 text-[10px] text-slate-600">{day(row.startTime)}</div></td>
                  <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel}</div><div className="mt-1 text-[10px] text-slate-500">{row.gameId}</div></td>
                  <td className="px-3 py-3 font-black uppercase tracking-[0.12em] text-cyan-100">{row.market.replace(/_/g, " ")}</td>
                  <td className="px-3 py-3 text-slate-200">{row.side ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-300">{row.line == null ? "—" : num(row.line)}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{row.modelProbability != null ? pct(row.modelProbability) : row.modelValue != null ? num(row.modelValue) : "—"}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-300">{row.actualValue == null ? "—" : num(row.actualValue)}</td>
                  <td className="px-3 py-3 text-right"><ResultPill value={row.resultBucket} /></td>
                  <td className="px-3 py-3"><div className="text-slate-300">{row.settlementStatus.replace(/_/g, " ")}</div><div className="mt-1 max-w-md text-[10px] leading-4 text-slate-500">{row.details}</div></td>
                </tr>
              )) : <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No MLB audit rows found for this date/window.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-2 text-xs leading-5 text-slate-400">
          {marketAudit.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
        </div>
      </section>

      <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
        <summary className="cursor-pointer list-none"><SectionTitle label="Recent MMA rows" title="Latest fight picks" body="MMA remains visible below the MLB audit so total app accuracy cannot hide baseball-specific market performance." /></summary>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs"><thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Fight</th><th className="px-3 py-2">Pick</th><th className="px-3 py-2">Actual</th><th className="px-3 py-2 text-right">Prob</th><th className="px-3 py-2 text-right">Result</th></tr></thead><tbody>{mmaRows.slice(0, 20).map((row: any) => <tr key={row.id} className="border-b border-white/5 last:border-none"><td className="px-3 py-3"><div className="font-semibold text-white">{row.fighterAName ?? "Fighter A"} vs {row.fighterBName ?? "Fighter B"}</div><div className="mt-1 text-[10px] text-slate-500">{row.eventLabel} · {when(row.recordedAt)}</div></td><td className="px-3 py-3 text-slate-300">{row.pickName ?? "—"}</td><td className="px-3 py-3 text-slate-300">{row.actualWinnerName ?? "pending"}</td><td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.pickProbability)}</td><td className="px-3 py-3 text-right font-mono text-slate-200">{row.resultCorrect === true ? "WIN" : row.resultCorrect === false ? "LOSS" : row.status}</td></tr>)}</tbody></table>
        </div>
      </details>
    </main>
  );
}
