import Link from "next/link";

import { gradeMmaLedgerVerdict, gradeMlbOfficialVerdict, summarizeVerdicts, type OfficialVerdict } from "@/services/decision/official-verdict";
import { applyPromotionGateV2, type PromotionGateDecision } from "@/services/decision/promotion-gate";
import { getDataControlTowerReport } from "@/services/ops/data-control-tower";
import { buildSimCardViewModels, type SimCardViewModel } from "@/services/simulation/build-sim-card-view-model";
import { readSimCache, SIM_CACHE_KEYS, type SimMarketSnapshot, type SimPrioritySnapshot } from "@/services/simulation/sim-cache";
import { getUfcSettledLedger, type UfcSettledLedgerRow } from "@/services/ufc/settled-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

type GateRow = {
  id: string;
  sport: "MLB" | "MMA";
  eventLabel: string;
  pickLabel: string;
  probability: number | null;
  baseVerdict: OfficialVerdict;
  finalVerdict: OfficialVerdict;
  gate: PromotionGateDecision;
};

async function readMlbModels() {
  const [priority, market] = await Promise.all([
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null)
  ]);
  const rows = priority?.rows ?? [];
  const edges = (market?.edges ?? []) as Parameters<typeof buildSimCardViewModels>[1];
  return {
    models: buildSimCardViewModels(rows, edges),
    actualOddsCoveragePct: market?.lineCount ? 1 : 0,
    generatedAt: priority?.generatedAt ?? market?.generatedAt ?? null
  };
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function pill(tone: "purple" | "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    purple: "border-purple-300/25 bg-purple-300/10 text-purple-200",
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

function dataTone(status: string) {
  if (status === "ELITE") return "green" as const;
  if (status === "USABLE") return "cyan" as const;
  if (status === "WEAK") return "amber" as const;
  return "red" as const;
}

function mlbPickLabel(model: SimCardViewModel) {
  const action = model.primaryAction;
  if (action.side === "home") return `${model.homeTeam} ML`;
  if (action.side === "away") return `${model.awayTeam} ML`;
  if (action.side === "over") return "Over";
  if (action.side === "under") return "Under";
  return action.marketType === "projection_only" ? "Projection only" : action.action;
}

function confidenceGrade(confidence: number | null | undefined) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "MEDIUM";
  if (confidence >= 0.7) return "HIGH";
  if (confidence < 0.5) return "LOW";
  return "MEDIUM";
}

function mlbGateRow(model: SimCardViewModel, actualOddsCoveragePct: number | null): GateRow {
  const verdict = gradeMlbOfficialVerdict(model);
  const action = model.primaryAction;
  const probability = action.modelProbability ?? model.lean.pct ?? null;
  const gate = applyPromotionGateV2({
    sport: "MLB",
    verdict,
    probability,
    hasMarketOdds: model.dataStatus === "ready" && action.action !== "NO_MARKET" && action.odds != null,
    hasClosingLineValue: false,
    dataQualityGrade: model.dataStatus === "ready" ? "B" : "D",
    confidenceGrade: confidenceGrade(model.confidence),
    calibrationBucketStatus: "unknown",
    calibrationBucketSample: null,
    settledProofSample: null,
    actualOddsCoveragePct
  });
  return {
    id: model.gameId,
    sport: "MLB",
    eventLabel: `${model.awayTeam} @ ${model.homeTeam}`,
    pickLabel: mlbPickLabel(model),
    probability,
    baseVerdict: verdict.verdict,
    finalVerdict: gate.finalVerdict,
    gate
  };
}

function mmaGateRow(row: UfcSettledLedgerRow, settledProofSample: number): GateRow {
  const verdict = gradeMmaLedgerVerdict(row);
  const gate = applyPromotionGateV2({
    sport: "MMA",
    verdict,
    probability: row.pickProbability,
    hasMarketOdds: Boolean(row.pickOpenOddsAmerican || row.pickCloseOddsAmerican),
    hasClosingLineValue: row.closingLineValuePct != null,
    closingLineValuePct: row.closingLineValuePct,
    dataQualityGrade: row.dataQualityGrade,
    confidenceGrade: row.confidenceGrade,
    calibrationBucketStatus: "unknown",
    calibrationBucketSample: null,
    settledProofSample,
    actualOddsCoveragePct: null
  });
  return {
    id: row.id,
    sport: "MMA",
    eventLabel: `${row.fighterAName ?? "Fighter A"} vs ${row.fighterBName ?? "Fighter B"}`,
    pickLabel: row.pickName ?? "Fight pick",
    probability: row.pickProbability,
    baseVerdict: verdict.verdict,
    finalVerdict: gate.finalVerdict,
    gate
  };
}

function applyDataTowerLock(rows: GateRow[], officialPromotionAllowed: boolean): GateRow[] {
  if (officialPromotionAllowed) return rows;
  return rows.map((row) => {
    if (row.finalVerdict !== "PLAY") return row;
    return {
      ...row,
      finalVerdict: "PASS",
      gate: {
        ...row.gate,
        finalVerdict: "PASS",
        officialPlayEligible: false,
        blocked: true,
        downgraded: true,
        blockers: Array.from(new Set([...row.gate.blockers, "Data Control Tower blocks official promotion"]))
      }
    };
  });
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{value}</div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{sub}</p>
    </div>
  );
}

function GateRowCard({ row }: { row: GateRow }) {
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={pill(row.sport === "MLB" ? "cyan" : "green")}>{row.sport}</span>
            <span className={pill(verdictTone(row.baseVerdict))}>raw {row.baseVerdict.replaceAll("_", " ")}</span>
            <span className={pill(verdictTone(row.finalVerdict))}>final {row.finalVerdict.replaceAll("_", " ")}</span>
            {row.gate.downgraded ? <span className={pill("amber")}>downgraded</span> : null}
            {row.gate.blocked ? <span className={pill("red")}>blocked</span> : null}
          </div>
          <h2 className="mt-3 font-display text-2xl font-black tracking-[-0.05em] text-white">{row.eventLabel}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{row.pickLabel} · model probability {pct(row.probability)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-right">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Gate score</div>
          <div className="font-display text-3xl font-black tracking-[-0.06em] text-white">{row.gate.gateScore}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.04] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-rose-200">Blockers</div>
          <p className="mt-1 text-xs leading-5 text-rose-100/75">{row.gate.blockers.length ? row.gate.blockers.join(" · ") : "None"}</p>
        </div>
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-200">Warnings</div>
          <p className="mt-1 text-xs leading-5 text-amber-100/75">{row.gate.warnings.length ? row.gate.warnings.join(" · ") : "None"}</p>
        </div>
      </div>
    </article>
  );
}

function counts(rows: GateRow[], verdict: OfficialVerdict, field: "baseVerdict" | "finalVerdict") {
  return rows.filter((row) => row[field] === verdict).length;
}

export default async function PromotionGatePage() {
  const [mlb, mmaLedger, dataTower] = await Promise.all([readMlbModels(), getUfcSettledLedger({ limit: 150 }), getDataControlTowerReport()]);
  const mlbRows = mlb.models.map((model) => mlbGateRow(model, mlb.actualOddsCoveragePct));
  const mmaRows = mmaLedger.rows.map((row) => mmaGateRow(row, mmaLedger.settledCount));
  const rawRows = [...mlbRows, ...mmaRows];
  const rows = applyDataTowerLock(rawRows, dataTower.officialPromotionAllowed);
  const rawSummary = summarizeVerdicts(rawRows, (row) => ({ verdict: row.baseVerdict, officialPlayEligible: row.baseVerdict === "PLAY", score: row.gate.gateScore, reasons: [], passReasons: [] }));
  const finalPlayCount = counts(rows, "PLAY", "finalVerdict");
  const downgraded = rows.filter((row) => row.gate.downgraded).length;
  const blocked = rows.filter((row) => row.gate.blocked).length;
  const displayRows = rows.filter((row) => row.baseVerdict === "PLAY" || row.gate.downgraded || row.gate.blocked).sort((a, b) => b.gate.gateScore - a.gate.gateScore).slice(0, 40);

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-purple-300/15 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(168,85,247,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-purple-200/75">Promotion Gate v2</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Make PLAY earn promotion.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                This layer sits after the verdict engine and the Data Control Tower. Raw PLAYs are downgraded when odds, CLV, sample depth, data quality, confidence, calibration, or global data eligibility are not strong enough.
              </p>
              <div className="mt-2 text-xs text-slate-500">MLB generated {when(mlb.generatedAt)} · MMA generated {when(mmaLedger.generatedAt)} · Data tower generated {when(dataTower.generatedAt)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/accuracy/data" className={pill(dataTone(dataTower.status))}>Data {dataTower.status}</Link>
              <Link href="/accuracy/official" className={pill("purple")}>Official</Link>
              <Link href="/accuracy/verdicts" className={pill("cyan")}>Verdicts</Link>
              <Link href="/accuracy/calibration" className={pill("green")}>Calibration</Link>
              <Link href="/accuracy/autopsy" className={pill("amber")}>Autopsy</Link>
            </div>
          </div>
        </section>

        <section className={`rounded-[1.35rem] border p-4 ${dataTower.officialPromotionAllowed ? "border-emerald-300/15 bg-emerald-300/[0.05]" : "border-rose-300/15 bg-rose-300/[0.05]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Data promotion status</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {dataTower.officialPromotionAllowed ? "Data tower allows official promotion." : "Data tower blocks official promotion. Raw PLAYs cannot survive until blockers clear."}
              </p>
            </div>
            <Link href="/accuracy/data" className={pill(dataTone(dataTower.status))}>Open data tower</Link>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Raw PLAYs" value={rawSummary.counts.PLAY} sub="Before Promotion Gate v2" />
          <Metric label="Final PLAYs" value={finalPlayCount} sub="After elite restrictions" />
          <Metric label="Downgraded" value={downgraded} sub="Raw verdict changed by gate" />
          <Metric label="Blocked" value={blocked} sub="Hard blocker present" />
          <Metric label="Data score" value={dataTower.score} sub={`${dataTower.status} tower status`} />
        </section>

        <section className="grid gap-3">
          {displayRows.length ? displayRows.map((row) => <GateRowCard key={`${row.sport}-${row.id}`} row={row} />) : (
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-8 text-center text-sm text-slate-400">
              No raw PLAY, downgraded, or blocked rows available.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
