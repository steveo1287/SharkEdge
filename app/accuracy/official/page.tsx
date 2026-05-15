import Link from "next/link";

import { gradeMmaLedgerVerdict, type OfficialVerdict } from "@/services/decision/official-verdict";
import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { getUfcSettledLedger, type UfcSettledLedgerRow } from "@/services/ufc/settled-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

type Sport = "MLB" | "MMA";

type MlbOfficialRow = {
  id: string;
  gameId: string;
  eventLabel?: string | null;
  modelVersion?: string | null;
  predictionTime?: string | null;
  side?: string | null;
  signalMarket?: string | null;
  resultBucket?: string | null;
  modelProbability?: number | null;
  marketProbability?: number | null;
  selectedAmericanOdds?: number | null;
  oddsSource?: string | null;
  roiExclusionReason?: string | null;
  units?: number | null;
  unitsNet?: number | null;
  brierScore?: number | null;
};

type OfficialResultRow = {
  id: string;
  sport: Sport;
  verdict: OfficialVerdict;
  score: number;
  eventLabel: string;
  pickLabel: string;
  modelVersion: string;
  capturedAt: string | null;
  settled: boolean;
  won: boolean | null;
  units: number | null;
  brier: number | null;
  clvPct: number | null;
  probability: number | null;
  marketProbability: number | null;
  oddsLabel: string;
  reason: string;
};

type VerdictStats = {
  verdict: OfficialVerdict;
  rows: OfficialResultRow[];
  settled: OfficialResultRow[];
  wins: number;
  losses: number;
  units: number | null;
  roi: number | null;
  winRate: number | null;
  avgBrier: number | null;
  avgClvPct: number | null;
};

const VERDICT_ORDER: OfficialVerdict[] = ["PLAY", "LEAN", "WATCH", "PASS", "DATA_NOT_READY"];

function avg(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function sum(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((total, value) => total + value, 0);
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function pctRaw(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function units(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}u`;
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

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function americanUnits(americanOdds: number | null | undefined, won: boolean | null) {
  if (won == null || typeof americanOdds !== "number" || !Number.isFinite(americanOdds)) return null;
  if (!won) return -1;
  return americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds);
}

function brier(probability: number | null | undefined, won: boolean | null) {
  if (won == null || typeof probability !== "number" || !Number.isFinite(probability)) return null;
  return (probability - (won ? 1 : 0)) ** 2;
}

function mlbWon(row: MlbOfficialRow) {
  const result = String(row.resultBucket ?? "").toUpperCase();
  if (result.includes("WIN") || result === "W") return true;
  if (result.includes("LOSS") || result === "L") return false;
  return null;
}

function mlbVerdict(row: MlbOfficialRow) {
  const reasons: string[] = [];
  let score = 25;
  const probability = row.modelProbability ?? null;
  const marketProbability = row.marketProbability ?? null;
  const edge = typeof probability === "number" && typeof marketProbability === "number" ? Math.abs(probability - marketProbability) : null;
  const hasActualOdds = typeof row.selectedAmericanOdds === "number" && row.oddsSource !== "fallback" && row.oddsSource !== "fallback_-110";

  if (!hasActualOdds) {
    reasons.push("actual odds missing or fallback odds used");
    score -= 25;
  } else {
    score += 15;
  }

  if (row.roiExclusionReason) {
    reasons.push(row.roiExclusionReason);
    score -= 25;
  }

  if (typeof probability === "number") {
    if (probability >= 0.62) score += 25;
    else if (probability >= 0.56) score += 12;
    else score -= 12;
  } else {
    reasons.push("model probability missing");
    score -= 30;
  }

  if (typeof edge === "number") {
    if (edge >= 0.045) score += 25;
    else if (edge >= 0.025) score += 10;
    else {
      reasons.push("edge under official threshold");
      score -= 8;
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  if (!hasActualOdds || !probability) return { verdict: "DATA_NOT_READY" as OfficialVerdict, score: finalScore, reason: reasons[0] ?? "missing proof inputs" };
  if (reasons.length && finalScore < 70) return { verdict: "PASS" as OfficialVerdict, score: finalScore, reason: reasons[0] };
  if (finalScore >= 82 && typeof edge === "number" && edge >= 0.045) return { verdict: "PLAY" as OfficialVerdict, score: finalScore, reason: "cleared probability, edge, and odds gates" };
  if (finalScore >= 62) return { verdict: "LEAN" as OfficialVerdict, score: finalScore, reason: "useful signal, not enough for official promotion" };
  return { verdict: "WATCH" as OfficialVerdict, score: finalScore, reason: reasons[0] ?? "watch-only signal" };
}

function normalizeMlb(row: MlbOfficialRow): OfficialResultRow {
  const won = mlbWon(row);
  const verdict = mlbVerdict(row);
  const unitsValue = typeof row.unitsNet === "number" ? row.unitsNet : typeof row.units === "number" ? row.units : americanUnits(row.selectedAmericanOdds, won);
  return {
    id: row.id,
    sport: "MLB",
    verdict: verdict.verdict,
    score: verdict.score,
    eventLabel: row.eventLabel ?? row.gameId,
    pickLabel: row.side ?? row.signalMarket ?? "MLB signal",
    modelVersion: row.modelVersion ?? "MLB model",
    capturedAt: row.predictionTime ?? null,
    settled: won != null,
    won,
    units: unitsValue,
    brier: typeof row.brierScore === "number" ? row.brierScore : brier(row.modelProbability, won),
    clvPct: null,
    probability: row.modelProbability ?? null,
    marketProbability: row.marketProbability ?? null,
    oddsLabel: odds(row.selectedAmericanOdds),
    reason: verdict.reason
  };
}

function normalizeMma(row: UfcSettledLedgerRow): OfficialResultRow {
  const verdict = gradeMmaLedgerVerdict(row);
  return {
    id: row.id,
    sport: "MMA",
    verdict: verdict.verdict,
    score: verdict.score,
    eventLabel: `${row.fighterAName ?? "Fighter A"} vs ${row.fighterBName ?? "Fighter B"}`,
    pickLabel: row.pickName ?? "Fight pick",
    modelVersion: row.modelVersion,
    capturedAt: row.recordedAt,
    settled: row.resultCorrect != null,
    won: row.resultCorrect,
    units: americanUnits(row.pickOpenOddsAmerican ?? row.pickCloseOddsAmerican, row.resultCorrect),
    brier: row.brier,
    clvPct: row.closingLineValuePct,
    probability: row.pickProbability,
    marketProbability: null,
    oddsLabel: `${odds(row.pickOpenOddsAmerican)} → ${odds(row.pickCloseOddsAmerican)}`,
    reason: verdict.passReasons[0] ?? verdict.reasons[0] ?? "graded by MMA verdict engine"
  };
}

function buildStats(rows: OfficialResultRow[], verdict: OfficialVerdict): VerdictStats {
  const verdictRows = rows.filter((row) => row.verdict === verdict);
  const settled = verdictRows.filter((row) => row.settled && row.won != null);
  const wins = settled.filter((row) => row.won).length;
  const losses = settled.filter((row) => row.won === false).length;
  const unitSum = sum(settled.map((row) => row.units));
  return {
    verdict,
    rows: verdictRows,
    settled,
    wins,
    losses,
    units: unitSum,
    roi: unitSum != null && settled.length ? unitSum / settled.length : null,
    winRate: settled.length ? wins / settled.length : null,
    avgBrier: avg(settled.map((row) => row.brier)),
    avgClvPct: avg(settled.map((row) => row.clvPct))
  };
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

function verdictTone(verdict: OfficialVerdict) {
  if (verdict === "PLAY") return "green" as const;
  if (verdict === "LEAN") return "cyan" as const;
  if (verdict === "WATCH") return "amber" as const;
  if (verdict === "PASS") return "red" as const;
  return "slate" as const;
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-white">{value}</div>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{sub}</p>
    </div>
  );
}

function StatsCard({ stats }: { stats: VerdictStats }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={pill(verdictTone(stats.verdict))}>{stats.verdict.replaceAll("_", " ")}</span>
          <h2 className="mt-3 font-display text-2xl font-black tracking-[-0.05em] text-white">{stats.wins}-{stats.losses}</h2>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Rows</div>
          <div className="font-display text-3xl font-black tracking-[-0.06em] text-white">{stats.rows.length}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Win rate" value={pct(stats.winRate)} sub={`${stats.settled.length} settled`} />
        <Metric label="Units" value={units(stats.units)} sub="1u flat-stake where odds exist" />
        <Metric label="ROI" value={pct(stats.roi)} sub="units divided by settled count" />
        <Metric label="Brier" value={num(stats.avgBrier)} sub="probability error" />
      </div>
      {stats.avgClvPct != null ? (
        <div className="mt-2 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.04] px-3 py-2 text-xs text-emerald-100/75">Average CLV: {pctRaw(stats.avgClvPct)}</div>
      ) : null}
    </section>
  );
}

function RecentTable({ rows }: { rows: OfficialResultRow[] }) {
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-4" open>
      <summary className="cursor-pointer list-none">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent official-result rows</div>
        <div className="mt-1 text-xs leading-5 text-slate-400">Latest rows after promotion-gate classification.</div>
      </summary>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Verdict</th>
              <th className="px-3 py-2">Pick</th>
              <th className="px-3 py-2 text-right">Prob</th>
              <th className="px-3 py-2 text-right">Odds</th>
              <th className="px-3 py-2 text-right">Result</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((row) => (
              <tr key={`${row.sport}-${row.id}`} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3"><div className="font-semibold text-white">{row.eventLabel}</div><div className="mt-1 text-[10px] text-slate-500">{row.sport} · {when(row.capturedAt)}</div></td>
                <td className="px-3 py-3"><span className={pill(verdictTone(row.verdict))}>{row.verdict.replaceAll("_", " ")}</span></td>
                <td className="px-3 py-3 text-slate-300">{row.pickLabel}</td>
                <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.probability)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{row.oddsLabel}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{row.settled ? row.won ? "WIN" : "LOSS" : "PENDING"}</td>
                <td className="px-3 py-3 text-slate-400">{row.reason}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No official-result rows available.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function OfficialPlayAccuracyPage() {
  const [mlbScorecard, mmaLedger] = await Promise.all([
    getSimModelScorecard({ league: "MLB", market: "ALL", modelVersion: "ALL", windowDays: 365 }).catch(() => null),
    getUfcSettledLedger({ limit: 250 })
  ]);

  const mlbRows = [
    ...(((mlbScorecard?.recent ?? []) as MlbOfficialRow[]).map(normalizeMlb)),
    ...(((mlbScorecard?.recentTotals ?? []) as MlbOfficialRow[]).map(normalizeMlb))
  ];
  const mmaRows = mmaLedger.rows.map(normalizeMma);
  const rows = [...mlbRows, ...mmaRows];
  const stats = VERDICT_ORDER.map((verdict) => buildStats(rows, verdict));
  const playStats = stats.find((item) => item.verdict === "PLAY") ?? buildStats(rows, "PLAY");
  const nonPlayRows = rows.filter((row) => row.verdict !== "PLAY");
  const nonPlaySettled = nonPlayRows.filter((row) => row.settled && row.won != null);
  const nonPlayLosses = nonPlaySettled.filter((row) => row.won === false).length;

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Official PLAY accuracy</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Judge the promoted picks separately.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Elite products do not grade every projection as a pick. This page compares official PLAYs against leans, watches, passes, and data-not-ready rows so promotion discipline can be measured directly.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/accuracy" className={pill("cyan")}>Proof center</Link>
              <Link href="/accuracy/verdicts" className={pill("slate")}>Verdicts</Link>
              <Link href="/accuracy/calibration" className={pill("slate")}>Calibration</Link>
              <Link href="/accuracy/autopsy" className={pill("slate")}>Autopsy</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Official PLAY record" value={`${playStats.wins}-${playStats.losses}`} sub={`${playStats.settled.length} settled PLAY rows`} />
          <Metric label="PLAY units" value={units(playStats.units)} sub="1u flat stake where odds exist" />
          <Metric label="PLAY ROI" value={pct(playStats.roi)} sub="official promotion quality" />
          <Metric label="PLAY Brier" value={num(playStats.avgBrier)} sub="official probability error" />
          <Metric label="Non-PLAY losses" value={nonPlayLosses} sub="losses the gate did not promote" />
        </section>

        <section className="grid gap-3 xl:grid-cols-5">
          {stats.map((item) => <StatsCard key={item.verdict} stats={item} />)}
        </section>

        <RecentTable rows={rows.sort((a, b) => (new Date(b.capturedAt ?? 0).getTime() || 0) - (new Date(a.capturedAt ?? 0).getTime() || 0))} />
      </div>
    </main>
  );
}
