import Link from "next/link";

import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { getUfcSettledLedger } from "@/services/ufc/settled-ledger";

export const revalidate = 3600;

type ProofTone = "ready" | "partial" | "shadow";

type MlbProofSummary = {
  ok: boolean;
  settledCount: number;
  predictionCount: number;
  winCount: number;
  lossCount: number;
  winRate: number | null;
  unitsNet: number | null;
  brierScoreAvg: number | null;
  actualOddsCount: number;
  fallbackOddsCount: number;
};

type MmaProofSummary = {
  ok: boolean;
  settledCount: number;
  predictionCount: number;
  pendingCount: number;
  winCount: number;
  lossCount: number;
  accuracyPct: number | null;
  avgBrier: number | null;
  avgClvPct: number | null;
  clvCoveragePct: number | null;
  warnings: string[];
};

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function units(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}u`;
}

function num(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function record(wins: number, losses: number) {
  return `${wins}-${losses}`;
}

function proofTone(args: { settledCount: number; actualOddsCount?: number; brier?: number | null; clvCoveragePct?: number | null }): ProofTone {
  if (args.settledCount >= 100 && (args.actualOddsCount ?? 100) >= 80 && (args.brier != null || (args.clvCoveragePct ?? 0) >= 0.8)) return "ready";
  if (args.settledCount >= 20) return "partial";
  return "shadow";
}

function toneClasses(tone: ProofTone) {
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

function Tile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-2 font-display text-2xl font-black tracking-[-0.05em] text-white">{value}</div>
      <p className="mt-1 text-[11px] leading-4 opacity-75">{sub}</p>
    </div>
  );
}

function ProofCard({ href, sport, title, body, tone, children }: { href: string; sport: string; title: string; body: string; tone: ProofTone; children: React.ReactNode }) {
  const label = tone === "ready" ? "proof-ready" : tone === "partial" ? "building proof" : "shadow / thin";
  return (
    <Link href={href} className={`group rounded-[1.5rem] border p-5 transition hover:-translate-y-0.5 ${toneClasses(tone)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">{sport}</div>
          <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">{title}</h2>
        </div>
        <span className={pill(tone === "ready" ? "green" : tone === "partial" ? "amber" : "red")}>{label}</span>
      </div>
      <p className="mt-3 text-sm leading-6 opacity-80">{body}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
      <div className="mt-5 border-t border-white/10 pt-4 text-[11px] font-black uppercase tracking-[0.14em] opacity-80 group-hover:text-white">Open proof room →</div>
    </Link>
  );
}

function DecisionDisciplineCard() {
  return (
    <Link href="/accuracy/verdicts" className="group rounded-[1.5rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_18rem),rgba(2,6,12,0.92)] p-5 transition hover:-translate-y-0.5 hover:border-cyan-300/35">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300/80">Official verdict engine</div>
          <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.06em] text-white">Predictions are not picks.</h2>
        </div>
        <span className={pill("cyan")}>decision discipline</span>
      </div>
      <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
        The verdict engine is the promotion gate between raw model output and user-facing action. It splits every graded row into PLAY, LEAN, WATCH, PASS, or DATA_NOT_READY so SharkEdge stays selective instead of becoming a pick spammer.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="PLAY" value="Strict" sub="Only rows that clear data, market, edge, and confidence gates." />
        <Tile label="LEAN" value="Useful" sub="Model sees value, but not enough for official promotion." />
        <Tile label="WATCH" value="Observe" sub="Interesting setup without enough trust to act." />
        <Tile label="PASS" value="Saved" sub="A real product must avoid bad or thin spots." />
        <Tile label="DATA" value="Gated" sub="Missing market, stale feed, or unresolved proof blocks action." />
      </div>
      <div className="mt-5 border-t border-white/10 pt-4 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-200/80 group-hover:text-cyan-100">Open verdict dashboard →</div>
    </Link>
  );
}

function OperatingRule({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

async function readMlbSummary(): Promise<MlbProofSummary> {
  try {
    const card = await getSimModelScorecard({ league: "MLB", market: "ALL", modelVersion: "ALL", windowDays: 365 });
    return {
      ok: true,
      settledCount: Number(card.totals?.settledCount ?? 0),
      predictionCount: Number(card.totals?.predictionCount ?? 0),
      winCount: Number(card.totals?.winCount ?? 0),
      lossCount: Number(card.totals?.lossCount ?? 0),
      winRate: typeof card.totals?.winRate === "number" ? card.totals.winRate : null,
      unitsNet: typeof card.totals?.unitsNet === "number" ? card.totals.unitsNet : null,
      brierScoreAvg: typeof card.totals?.brierScoreAvg === "number" ? card.totals.brierScoreAvg : null,
      actualOddsCount: Number(card.totals?.actualOddsCount ?? 0),
      fallbackOddsCount: Number(card.totals?.fallbackOddsCount ?? 0)
    };
  } catch {
    return { ok: false, settledCount: 0, predictionCount: 0, winCount: 0, lossCount: 0, winRate: null, unitsNet: null, brierScoreAvg: null, actualOddsCount: 0, fallbackOddsCount: 0 };
  }
}

async function readMmaSummary(): Promise<MmaProofSummary> {
  const ledger = await getUfcSettledLedger({ limit: 150 });
  return {
    ok: ledger.ok,
    settledCount: ledger.settledCount,
    predictionCount: ledger.predictionCount,
    pendingCount: ledger.pendingCount,
    winCount: ledger.winCount,
    lossCount: ledger.lossCount,
    accuracyPct: ledger.accuracyPct,
    avgBrier: ledger.avgBrier,
    avgClvPct: ledger.avgClvPct,
    clvCoveragePct: ledger.clvCoveragePct,
    warnings: ledger.warnings
  };
}

export default async function AccuracyCommandCenterPage() {
  const [mlb, mma] = await Promise.all([readMlbSummary(), readMmaSummary()]);
  const mlbTone = proofTone({ settledCount: mlb.settledCount, actualOddsCount: mlb.actualOddsCount, brier: mlb.brierScoreAvg });
  const mmaTone = proofTone({ settledCount: mma.settledCount, clvCoveragePct: mma.clvCoveragePct, brier: mma.avgBrier });

  return (
    <main className="min-h-screen bg-[#02060b] px-3 py-4 text-white sm:px-5">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[1.75rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_20rem),rgba(2,6,12,0.94)] p-5 shadow-[0_0_80px_rgba(14,165,233,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300/75">Proof command center</div>
              <h1 className="mt-2 font-display text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">Accuracy is the product.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                SharkEdge only becomes elite if it proves what is proven, labels what is still shadow-mode, and refuses to sell confidence without settled results.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/accuracy/verdicts" className={pill("cyan")}>Verdicts</Link>
              <Link href="/sim" className={pill("slate")}>SimHub</Link>
              <Link href="/baseball/readiness" className={pill("slate")}>MLB readiness</Link>
              <Link href="/sim/ufc" className={pill("slate")}>MMA lab</Link>
            </div>
          </div>
        </section>

        <DecisionDisciplineCard />

        <section className="grid gap-4 lg:grid-cols-2">
          <ProofCard
            href="/accuracy/mlb"
            sport="MLB"
            title="MLB proof ledger"
            tone={mlbTone}
            body="The active proof lane. Tracks settled predictions, record, units, odds coverage, Brier score, moneyline rows, and totals rows."
          >
            <Tile label="Record" value={record(mlb.winCount, mlb.lossCount)} sub="Settled MLB rows" />
            <Tile label="Win rate" value={pct(mlb.winRate)} sub={`${mlb.settledCount}/${mlb.predictionCount} settled`} />
            <Tile label="Units" value={units(mlb.unitsNet)} sub="Actual/fallback odds aware" />
            <Tile label="Brier" value={num(mlb.brierScoreAvg)} sub={`${mlb.actualOddsCount} actual odds rows`} />
          </ProofCard>

          <ProofCard
            href="/accuracy/mma"
            sport="MMA"
            title="MMA proof ledger"
            tone={mmaTone}
            body="The new fight proof lane. Reads shadow predictions, resolved winners, CLV, Brier, calibration snapshots, and pass-discipline warnings."
          >
            <Tile label="Record" value={record(mma.winCount, mma.lossCount)} sub="Settled fight rows" />
            <Tile label="Accuracy" value={pct(mma.accuracyPct)} sub={`${mma.pendingCount} pending fights`} />
            <Tile label="Brier" value={num(mma.avgBrier)} sub="Fight probability calibration" />
            <Tile label="Avg CLV" value={pct(mma.avgClvPct)} sub={`${pct(mma.clvCoveragePct)} CLV coverage`} />
          </ProofCard>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <OperatingRule title="No proof, no promotion" body="A model can generate projections before it is promoted. Official plays need settled proof, not just a sharp-looking UI." />
          <OperatingRule title="Pass is a feature" body="Bad data, stale odds, thin samples, and weak calibration should turn into pass/watch labels instead of forced action." />
          <OperatingRule title="Calibrate or cut" body="The next elite layer is calibration buckets and postgame autopsy, so every miss teaches the model what to fix." />
        </section>

        {mma.warnings.length ? (
          <section className="rounded-[1.35rem] border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">MMA proof warnings</div>
            <div className="mt-3 grid gap-2">
              {mma.warnings.slice(0, 4).map((warning) => <div key={warning} className="rounded-xl border border-amber-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-amber-100/80">{warning}</div>)}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
