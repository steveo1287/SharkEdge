import Link from "next/link";

import { getDataControlTowerReport, type DataTowerStatus } from "@/services/ops/data-control-tower";
import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { getUfcSettledLedger, type UfcSettledLedgerRow } from "@/services/ufc/settled-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

type Sport = "MLB" | "MMA";

type CalibrationInput = {
  id: string;
  sport: Sport;
  label: string;
  modelVersion: string;
  probability: number | null;
  won: boolean | null;
  settled: boolean;
  oddsSource: string | null;
  dataLocked: boolean;
  lockReason: string | null;
};

type Bucket = {
  key: string;
  label: string;
  min: number;
  max: number;
  rows: CalibrationInput[];
  settled: CalibrationInput[];
  avgProbability: number | null;
  actualWinRate: number | null;
  error: number | null;
  brier: number | null;
  status: "good" | "watch" | "thin" | "bad";
};

const BUCKETS = [
  { key: "50-55", label: "50-55%", min: 0.5, max: 0.55 },
  { key: "55-60", label: "55-60%", min: 0.55, max: 0.6 },
  { key: "60-65", label: "60-65%", min: 0.6, max: 0.65 },
  { key: "65-70", label: "65-70%", min: 0.65, max: 0.7 },
  { key: "70+", label: "70%+", min: 0.7, max: 1.01 }
];

function avg(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
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

function statusTone(status: Bucket["status"]) {
  if (status === "good") return "green" as const;
  if (status === "watch") return "amber" as const;
  if (status === "bad") return "red" as const;
  return "slate" as const;
}

function rowDataLock(sport: Sport, oddsSource: string | null) {
  if (sport === "MLB" && (!oddsSource || oddsSource === "fallback" || oddsSource === "fallback_-110")) {
    return "MLB row has missing/fallback odds source.";
  }
  if (sport === "MMA" && !oddsSource) {
    return "MMA row is missing winner-market odds.";
  }
  return null;
}

function normalizeMlbRow(row: any): CalibrationInput | null {
  const probability = typeof row?.modelProbability === "number" ? row.modelProbability : null;
  if (probability == null) return null;
  const result = String(row?.resultBucket ?? "").toUpperCase();
  const settled = result.includes("WIN") || result.includes("LOSS") || result === "W" || result === "L";
  const won = result.includes("WIN") || result === "W" ? true : result.includes("LOSS") || result === "L" ? false : null;
  const oddsSource = row?.oddsSource ?? null;
  const lockReason = rowDataLock("MLB", oddsSource);
  return {
    id: String(row?.id ?? row?.gameId ?? Math.random()),
    sport: "MLB",
    label: row?.eventLabel ?? row?.gameId ?? "MLB game",
    modelVersion: row?.modelVersion ?? "MLB model",
    probability,
    won,
    settled,
    oddsSource,
    dataLocked: Boolean(lockReason),
    lockReason
  };
}

function normalizeMmaRow(row: UfcSettledLedgerRow): CalibrationInput | null {
  if (typeof row.pickProbability !== "number") return null;
  const oddsSource = row.pickOpenOddsAmerican || row.pickCloseOddsAmerican ? "market" : null;
  const lockReason = rowDataLock("MMA", oddsSource);
  return {
    id: row.id,
    sport: "MMA",
    label: `${row.fighterAName ?? "Fighter A"} vs ${row.fighterBName ?? "Fighter B"}`,
    modelVersion: row.modelVersion,
    probability: row.pickProbability,
    won: row.resultCorrect,
    settled: row.resultCorrect != null,
    oddsSource,
    dataLocked: Boolean(lockReason),
    lockReason
  };
}

function applyGlobalDataLock(rows: CalibrationInput[], officialPromotionAllowed: boolean, blockers: string[]) {
  if (officialPromotionAllowed) return rows;
  const reason = blockers[0] ? `Data Control Tower blocked calibration: ${blockers[0]}` : "Data Control Tower blocked calibration.";
  return rows.map((row) => ({ ...row, dataLocked: true, lockReason: row.lockReason ?? reason }));
}

function brier(rows: CalibrationInput[]) {
  const settled = rows.filter((row) => row.settled && typeof row.won === "boolean" && typeof row.probability === "number");
  if (!settled.length) return null;
  return settled.reduce((sum, row) => sum + ((row.probability ?? 0) - (row.won ? 1 : 0)) ** 2, 0) / settled.length;
}

function buildBuckets(rows: CalibrationInput[]): Bucket[] {
  return BUCKETS.map((bucket) => {
    const bucketRows = rows.filter((row) => typeof row.probability === "number" && row.probability >= bucket.min && row.probability < bucket.max);
    const settled = bucketRows.filter((row) => row.settled && typeof row.won === "boolean");
    const avgProbability = avg(settled.map((row) => row.probability));
    const actualWinRate = settled.length ? settled.filter((row) => row.won).length / settled.length : null;
    const error = avgProbability != null && actualWinRate != null ? actualWinRate - avgProbability : null;
    const absError = Math.abs(error ?? 0);
    const status: Bucket["status"] = settled.length < 10 ? "thin" : absError <= 0.05 ? "good" : absError <= 0.1 ? "watch" : "bad";
    return {
      ...bucket,
      rows: bucketRows,
      settled,
      avgProbability,
      actualWinRate,
      error,
      brier: brier(bucketRows),
      status
    };
  });
}

function CalibrationCard({ bucket }: { bucket: Bucket }) {
  const errorLabel = typeof bucket.error === "number" ? `${bucket.error >= 0 ? "+" : ""}${(bucket.error * 100).toFixed(1)} pts` : "—";
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300/75">Probability bucket</div>
          <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">{bucket.label}</h2>
        </div>
        <span className={pill(statusTone(bucket.status))}>{bucket.status}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Sample" value={`${bucket.settled.length}/${bucket.rows.length}`} sub="settled / eligible total" />
        <Metric label="Model avg" value={pct(bucket.avgProbability)} sub="average predicted win rate" />
        <Metric label="Actual" value={pct(bucket.actualWinRate)} sub="actual settled win rate" />
        <Metric label="Error" value={errorLabel} sub="actual minus predicted" />
        <Metric label="Brier" value={num(bucket.brier)} sub="lower is better" />
      </div>
      {bucket.status === "bad" ? (
        <p className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-xs leading-5 text-rose-100/80">
          This bucket is miscalibrated enough that official PLAY promotion should be restricted until the sample improves or the model is adjusted.
        </p>
      ) : bucket.status === "thin" ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400">
          Sample is thin. Use this bucket for monitoring, not claims.
        </p>
      ) : null}
    </article>
  );
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

function ExclusionSummary({ rows }: { rows: CalibrationInput[] }) {
  const excluded = rows.filter((row) => row.dataLocked);
  const reasons = Array.from(new Set(excluded.map((row) => row.lockReason).filter(Boolean) as string[])).slice(0, 5);
  return (
    <div className="rounded-[1.15rem] border border-rose-300/15 bg-rose-300/[0.05] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Calibration exclusions</div>
          <p className="mt-2 text-sm leading-6 text-rose-100/75">
            {excluded.length} of {rows.length} raw rows are excluded from calibration math so weak/fallback data cannot distort probability truth.
          </p>
        </div>
        <span className={pill(excluded.length ? "red" : "green")}>{excluded.length ? "data locked" : "clean"}</span>
      </div>
      {reasons.length ? (
        <div className="mt-3 grid gap-2">
          {reasons.map((reason) => <div key={reason} className="rounded-xl border border-rose-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-rose-100/80">{reason}</div>)}
        </div>
      ) : null}
    </div>
  );
}

function SportSection({ sport, rawRows }: { sport: Sport; rawRows: CalibrationInput[] }) {
  const rows = rawRows.filter((row) => !row.dataLocked);
  const buckets = buildBuckets(rows);
  const settled = rows.filter((row) => row.settled && typeof row.won === "boolean");
  const rawSettled = rawRows.filter((row) => row.settled && typeof row.won === "boolean");
  const overallBrier = brier(rows);
  const actual = settled.length ? settled.filter((row) => row.won).length / settled.length : null;
  const predicted = avg(settled.map((row) => row.probability));
  const badBuckets = buckets.filter((bucket) => bucket.status === "bad").length;
  const thinBuckets = buckets.filter((bucket) => bucket.status === "thin").length;
  const excluded = rawRows.length - rows.length;

  return (
    <section className="grid gap-4">
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/75">{sport} calibration</div>
            <h2 className="mt-1 font-display text-3xl font-black tracking-[-0.06em] text-white">Does the probability mean what it says?</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              A model saying 60% should win close to 60% over time. Only rows passing the Data Control Tower and row-level odds checks are used in bucket math.
            </p>
          </div>
          <span className={pill(excluded ? "red" : badBuckets ? "red" : thinBuckets ? "amber" : "green")}>{excluded ? "data locked" : badBuckets ? "miscalibrated" : thinBuckets ? "thin sample" : "stable"}</span>
        </div>
        <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Eligible rows" value={`${settled.length}/${rows.length}`} sub="settled / calibration rows" />
          <Metric label="Raw rows" value={`${rawSettled.length}/${rawRows.length}`} sub="before data lock" />
          <Metric label="Excluded" value={excluded} sub="removed from bucket math" />
          <Metric label="Predicted" value={pct(predicted)} sub="average eligible probability" />
          <Metric label="Brier" value={num(overallBrier)} sub="eligible probability error" />
        </div>
      </div>
      {excluded ? <ExclusionSummary rows={rawRows} /> : null}
      <div className="grid gap-3">
        {buckets.map((bucket) => <CalibrationCard key={`${sport}-${bucket.key}`} bucket={bucket} />)}
      </div>
    </section>
  );
}

export default async function CalibrationProofRoomPage() {
  const [mlbScorecard, mmaLedger, dataTower] = await Promise.all([
    getSimModelScorecard({ league: "MLB", market: "ALL", modelVersion: "ALL", windowDays: 365 }).catch(() => null),
    getUfcSettledLedger({ limit: 250 }),
    getDataControlTowerReport()
  ]);

  const mlbRawRows = [
    ...(((mlbScorecard?.recent ?? []) as any[]).map(normalizeMlbRow).filter(Boolean) as CalibrationInput[]),
    ...(((mlbScorecard?.recentTotals ?? []) as any[]).map(normalizeMlbRow).filter(Boolean) as CalibrationInput[])
  ];
  const mmaRawRows = mmaLedger.rows.map(normalizeMmaRow).filter(Boolean) as CalibrationInput[];
  const mlbRows = applyGlobalDataLock(mlbRawRows, dataTower.officialPromotionAllowed, dataTower.blockers);
  const mmaRows = applyGlobalDataLock(mmaRawRows, dataTower.officialPromotionAllowed, dataTower.blockers);

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Calibration proof room</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Probability has to earn trust.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Elite prediction products do not just show hit rate. Calibration now excludes data-locked rows before buckets are calculated.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/accuracy/data" className={pill(dataTone(dataTower.status))}>Data {dataTower.status}</Link>
              <Link href="/accuracy" className={pill("cyan")}>Proof center</Link>
              <Link href="/accuracy/verdicts" className={pill("slate")}>Verdicts</Link>
              <Link href="/accuracy/autopsy" className={pill("slate")}>Autopsy</Link>
              <Link href="/sim" className={pill("slate")}>SimHub</Link>
            </div>
          </div>
        </section>

        <section className={`rounded-[1.35rem] border p-4 ${dataTower.officialPromotionAllowed ? "border-emerald-300/15 bg-emerald-300/[0.05]" : "border-rose-300/15 bg-rose-300/[0.05]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Data calibration status</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {dataTower.officialPromotionAllowed ? "Data tower allows calibration math." : "Data tower blocks calibration math. Rows are displayed as raw/excluded until blockers clear."}
              </p>
            </div>
            <Link href="/accuracy/data" className={pill(dataTone(dataTower.status))}>Open data tower</Link>
          </div>
        </section>

        <SportSection sport="MLB" rawRows={mlbRows} />
        <SportSection sport="MMA" rawRows={mmaRows} />
      </div>
    </main>
  );
}
