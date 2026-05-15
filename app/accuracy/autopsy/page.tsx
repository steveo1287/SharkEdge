import Link from "next/link";

import { getDataControlTowerReport, type DataTowerStatus } from "@/services/ops/data-control-tower";
import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { getUfcSettledLedger, type UfcSettledLedgerRow } from "@/services/ufc/settled-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

type MlbRecentRow = {
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
  dataQualityGrade?: string | null;
};

type AutopsyRow = {
  id: string;
  sport: "MLB" | "MMA";
  eventLabel: string;
  pickLabel: string;
  resultLabel: string;
  modelVersion: string;
  capturedAt: string | null;
  modelProbability: number | null;
  marketProbability: number | null;
  oddsLabel: string;
  missType: "model" | "market" | "data" | "discipline" | "pending";
  shouldHavePassed: boolean;
  reason: string;
  severity: number;
  dataLocked: boolean;
};

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
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

function dataTone(status: DataTowerStatus) {
  if (status === "ELITE") return "green" as const;
  if (status === "USABLE") return "cyan" as const;
  if (status === "WEAK") return "amber" as const;
  return "red" as const;
}

function missTone(type: AutopsyRow["missType"]) {
  if (type === "discipline") return "amber" as const;
  if (type === "data") return "red" as const;
  if (type === "market") return "cyan" as const;
  if (type === "pending") return "slate" as const;
  return "red" as const;
}

function classifyMlb(row: MlbRecentRow): AutopsyRow {
  const result = String(row.resultBucket ?? "pending").toUpperCase();
  const isLoss = result.includes("LOSS") || result === "L";
  const isPending = result.includes("PENDING") || result.includes("OPEN") || result === "";
  const probability = row.modelProbability ?? null;
  const marketProbability = row.marketProbability ?? null;
  const missingActualOdds = !row.selectedAmericanOdds || row.oddsSource === "fallback" || row.oddsSource === "fallback_-110";
  const shouldHavePassed = Boolean(row.roiExclusionReason) || missingActualOdds || (typeof probability === "number" && probability < 0.56);
  let missType: AutopsyRow["missType"] = "model";
  let reason = "Model-side miss: the selected side did not win despite model support.";
  let dataLocked = false;

  if (isPending) {
    missType = "pending";
    reason = "Pending row: not eligible for final autopsy yet.";
  } else if (missingActualOdds) {
    missType = "data";
    dataLocked = true;
    reason = "Odds source was missing or fallback, so this is a data failure before it is a model failure.";
  } else if (row.dataQualityGrade === "D") {
    missType = "data";
    dataLocked = true;
    reason = "Data quality grade was D, so this row should not be treated as a clean model miss.";
  } else if (row.roiExclusionReason || (typeof probability === "number" && probability < 0.56)) {
    missType = "discipline";
    reason = row.roiExclusionReason ?? "Model probability was below official-play threshold.";
  } else if (typeof marketProbability === "number" && typeof probability === "number" && Math.abs(probability - marketProbability) < 0.025) {
    missType = "market";
    reason = "Market and model were too close; edge was probably too thin for official promotion.";
  }

  return {
    id: row.id,
    sport: "MLB",
    eventLabel: row.eventLabel ?? row.gameId,
    pickLabel: row.side ?? row.signalMarket ?? "MLB signal",
    resultLabel: result || "PENDING",
    modelVersion: row.modelVersion ?? "MLB model",
    capturedAt: row.predictionTime ?? null,
    modelProbability: probability,
    marketProbability,
    oddsLabel: odds(row.selectedAmericanOdds),
    missType,
    shouldHavePassed,
    reason,
    severity: isLoss ? (dataLocked ? 96 : shouldHavePassed ? 90 : 70) : isPending ? 20 : 30,
    dataLocked
  };
}

function classifyMma(row: UfcSettledLedgerRow): AutopsyRow {
  const pending = row.resultCorrect == null;
  const missingOdds = !row.pickOpenOddsAmerican && !row.pickCloseOddsAmerican;
  const dataQualityFail = row.dataQualityGrade === "D";
  const shouldHavePassed = row.shouldHavePassed || dataQualityFail || row.confidenceGrade === "LOW" || missingOdds || (typeof row.pickProbability === "number" && row.pickProbability < 0.56);
  let missType: AutopsyRow["missType"] = pending ? "pending" : row.resultCorrect ? "market" : "model";
  let reason = pending ? "Pending fight: not eligible for final autopsy yet." : row.resultCorrect ? "Resolved win; useful for calibration but not a miss." : "Fight-side model miss: selected fighter did not win.";
  let dataLocked = false;

  if (!pending && missingOdds) {
    missType = "data";
    dataLocked = true;
    reason = "Winner-market odds were missing, so this is a data failure before it is a model failure.";
  } else if (!pending && dataQualityFail) {
    missType = "data";
    dataLocked = true;
    reason = "Data quality grade was D, so this row should not be treated as a clean model miss.";
  } else if (!pending && shouldHavePassed) {
    missType = "discipline";
    reason = row.passReason ?? "Current pass discipline would avoid this fight.";
  } else if (!pending && row.resultCorrect === false && typeof row.closingLineValuePct === "number" && row.closingLineValuePct < 0) {
    missType = "market";
    reason = "Market moved against the pick; negative CLV suggests the edge was not strong enough.";
  }

  return {
    id: row.id,
    sport: "MMA",
    eventLabel: `${row.fighterAName ?? "Fighter A"} vs ${row.fighterBName ?? "Fighter B"}`,
    pickLabel: row.pickName ?? "Fight pick",
    resultLabel: pending ? "PENDING" : row.resultCorrect ? "WIN" : "LOSS",
    modelVersion: row.modelVersion,
    capturedAt: row.recordedAt,
    modelProbability: row.pickProbability,
    marketProbability: null,
    oddsLabel: `${odds(row.pickOpenOddsAmerican)} → ${odds(row.pickCloseOddsAmerican)}`,
    missType,
    shouldHavePassed,
    reason,
    severity: pending ? 20 : row.resultCorrect ? 25 : dataLocked ? 96 : shouldHavePassed ? 95 : 75,
    dataLocked
  };
}

function applyGlobalDataLock(rows: AutopsyRow[], officialPromotionAllowed: boolean, blockers: string[]) {
  if (officialPromotionAllowed) return rows;
  const reason = blockers[0] ? `Data Control Tower blocked autopsy classification: ${blockers[0]}` : "Data Control Tower blocked autopsy classification.";
  return rows.map((row) => {
    if (row.missType === "pending") return row;
    return {
      ...row,
      missType: "data" as const,
      shouldHavePassed: true,
      reason,
      severity: Math.max(row.severity, 96),
      dataLocked: true
    };
  });
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

function AutopsyCard({ row }: { row: AutopsyRow }) {
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={pill(row.sport === "MLB" ? "cyan" : "green")}>{row.sport}</span>
            <span className={pill(missTone(row.missType))}>{row.missType}</span>
            {row.dataLocked ? <span className={pill("red")}>data lock</span> : null}
            {row.shouldHavePassed ? <span className={pill("amber")}>should pass</span> : null}
          </div>
          <h2 className="mt-3 font-display text-2xl font-black tracking-[-0.05em] text-white">{row.eventLabel}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{row.reason}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Severity</div>
          <div className="font-display text-3xl font-black tracking-[-0.06em] text-white">{row.severity}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Pick" value={row.pickLabel} sub={row.modelVersion} />
        <StatTile label="Result" value={row.resultLabel} sub={when(row.capturedAt)} />
        <StatTile label="Model" value={pct(row.modelProbability)} sub="Pick probability" />
        <StatTile label="Market" value={pct(row.marketProbability)} sub="Market probability when available" />
        <StatTile label="Odds" value={row.oddsLabel} sub="Captured/open to close context" />
      </div>
    </article>
  );
}

export default async function AccuracyAutopsyPage() {
  const [mlbScorecard, mmaLedger, dataTower] = await Promise.all([
    getSimModelScorecard({ league: "MLB", market: "ALL", modelVersion: "ALL", windowDays: 365 }).catch(() => null),
    getUfcSettledLedger({ limit: 150 }),
    getDataControlTowerReport()
  ]);

  const mlbRows = ((mlbScorecard?.recent ?? []) as MlbRecentRow[])
    .filter((row) => String(row.resultBucket ?? "").toUpperCase().includes("LOSS") || row.roiExclusionReason || row.oddsSource === "fallback" || row.oddsSource === "fallback_-110" || row.dataQualityGrade === "D")
    .slice(0, 30)
    .map(classifyMlb);
  const mmaRows = mmaLedger.rows
    .filter((row) => row.resultCorrect === false || row.shouldHavePassed || row.resultCorrect == null || row.dataQualityGrade === "D" || (!row.pickOpenOddsAmerican && !row.pickCloseOddsAmerican))
    .slice(0, 30)
    .map(classifyMma);
  const rows = applyGlobalDataLock([...mlbRows, ...mmaRows], dataTower.officialPromotionAllowed, dataTower.blockers).sort((a, b) => b.severity - a.severity).slice(0, 40);
  const shouldPassCount = rows.filter((row) => row.shouldHavePassed).length;
  const dataCount = rows.filter((row) => row.missType === "data").length;
  const dataLockedCount = rows.filter((row) => row.dataLocked).length;
  const disciplineCount = rows.filter((row) => row.missType === "discipline").length;
  const modelCount = rows.filter((row) => row.missType === "model").length;

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Postgame autopsy</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Every miss needs a reason.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Autopsy now checks the Data Control Tower first, so bad/fallback data is labeled as data failure instead of being miscounted as a model failure.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/accuracy/data" className={pill(dataTone(dataTower.status))}>Data {dataTower.status}</Link>
              <Link href="/accuracy" className={pill("cyan")}>Proof center</Link>
              <Link href="/accuracy/verdicts" className={pill("slate")}>Verdicts</Link>
              <Link href="/accuracy/mlb" className={pill("slate")}>MLB proof</Link>
              <Link href="/accuracy/mma" className={pill("slate")}>MMA proof</Link>
            </div>
          </div>
        </section>

        <section className={`rounded-[1.35rem] border p-4 ${dataTower.officialPromotionAllowed ? "border-emerald-300/15 bg-emerald-300/[0.05]" : "border-rose-300/15 bg-rose-300/[0.05]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Data autopsy status</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {dataTower.officialPromotionAllowed ? "Data tower allows normal autopsy classification." : "Data tower blocks clean autopsy classification. Non-pending rows are treated as data-locked until blockers clear."}
              </p>
            </div>
            <Link href="/accuracy/data" className={pill(dataTone(dataTower.status))}>Open data tower</Link>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatTile label="Rows" value={rows.length} sub="Highest-severity recent autopsies" />
          <StatTile label="Data locked" value={dataLockedCount} sub="Not clean model evidence" />
          <StatTile label="Should pass" value={shouldPassCount} sub="Rows current discipline would avoid" />
          <StatTile label="Data misses" value={dataCount} sub="Missing/fallback odds or weak inputs" />
          <StatTile label="Discipline" value={disciplineCount} sub="Promotion gate should block these" />
          <StatTile label="Model misses" value={modelCount} sub="Actual model-side losses to study" />
        </section>

        <section className="grid gap-3">
          {rows.length ? rows.map((row) => <AutopsyCard key={`${row.sport}-${row.id}`} row={row} />) : (
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-8 text-center text-sm text-slate-400">
              No recent loss, pass-discipline, or data autopsy rows were available.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
