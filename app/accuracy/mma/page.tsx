import Link from "next/link";

import { getUfcSettledLedger } from "@/services/ufc/settled-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 25;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
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

function maturityTone(settled: number, clvCoverage: number | null | undefined) {
  if (settled >= 100 && typeof clvCoverage === "number" && clvCoverage >= 0.8) return "ready" as const;
  if (settled >= 20) return "partial" as const;
  return "shadow" as const;
}

function toneClasses(tone: "ready" | "partial" | "shadow") {
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

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function Breakdown({ title, values }: { title: string; values: Record<string, number> }) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
      <div className="mt-3 grid gap-2 text-xs text-slate-300">
        {entries.length ? entries.map(([label, count]) => (
          <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <span>{label}</span>
            <span className="font-mono text-white">{count}</span>
          </div>
        )) : <div className="text-slate-500">No rows yet.</div>}
      </div>
    </section>
  );
}

export default async function MmaAccuracyPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const modelVersion = param(resolved, "modelVersion") ?? "ufc-fight-iq-v1";
  const ledger = await getUfcSettledLedger({ modelVersion, limit: 150 });
  const tone = maturityTone(ledger.settledCount, ledger.clvCoveragePct);
  const maturityLabel = tone === "ready" ? "MMA proof is usable" : tone === "partial" ? "MMA proof is building" : "MMA remains shadow-only";
  const maturityNote = tone === "ready"
    ? "MMA has enough settled fights and CLV coverage to start serving as a real proof layer."
    : tone === "partial"
      ? "MMA has settled results, but the sample and CLV coverage are not yet strong enough to market as elite."
      : "Fight Lab predictions should remain shadow/calibration output until enough fights settle with winner and CLV data.";

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/80 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">MMA Accuracy Ledger</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Settled fight proof layer</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              MMA Fight Lab is now connected to a proof surface. This page reads shadow predictions, resolved winners, CLV, Brier score, pass-discipline flags, and calibration snapshots.
            </p>
            <div className="mt-3 text-xs text-slate-500">Model {ledger.modelVersion} · generated {when(ledger.generatedAt)}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <Link href="/accuracy" className="text-cyan-200 hover:text-cyan-100">Accuracy Home</Link>
            <Link href="/sim/ufc" className="text-cyan-200 hover:text-cyan-100">Fight Lab</Link>
            <Link href="/sim" className="text-cyan-200 hover:text-cyan-100">SimHub</Link>
          </div>
        </div>
      </section>

      <section className={`rounded-[1.5rem] border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)] ${toneClasses(tone)}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">MMA maturity gate</div>
            <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{maturityLabel}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">{maturityNote}</p>
          </div>
          <div className="rounded-[1.15rem] border border-white/10 bg-black/25 px-4 py-3 text-right">
            <div className="text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Settled fights</div>
            <div className="font-display text-4xl font-black tracking-[-0.06em] text-white">{ledger.settledCount}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Tile label="Record" value={`${ledger.winCount}-${ledger.lossCount}`} note="Resolved shadow predictions only" />
        <Tile label="Accuracy" value={pct(ledger.accuracyPct)} note="Pick winner hit rate" />
        <Tile label="Brier" value={num(ledger.avgBrier, 4)} note="Probability calibration" />
        <Tile label="Avg CLV" value={pctRaw(ledger.avgClvPct)} note={`${pct(ledger.clvCoveragePct)} CLV coverage`} />
        <Tile label="Pending" value={String(ledger.pendingCount)} note="Recorded fights still waiting for results" />
        <Tile label="Should-pass" value={String(ledger.shouldHavePassedCount)} note="Settled fights current discipline would avoid" />
      </section>

      {ledger.latestCalibration ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Latest calibration snapshot</div>
              <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">{ledger.latestCalibration.snapshotLabel}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">Generated {when(ledger.latestCalibration.generatedAt)} · {ledger.latestCalibration.fightCount} fights</p>
            </div>
            <span className={pill("cyan")}>{ledger.latestCalibration.modelVersion}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Tile label="Accuracy" value={pct(ledger.latestCalibration.accuracyPct)} note="Snapshot hit rate" />
            <Tile label="Brier" value={num(ledger.latestCalibration.brierScore, 4)} note="Snapshot calibration" />
            <Tile label="Log loss" value={num(ledger.latestCalibration.logLoss, 4)} note="Penalizes overconfidence" />
            <Tile label="Cal error" value={num(ledger.latestCalibration.calibrationError, 4)} note="Bucket calibration error" />
            <Tile label="Avg CLV" value={pctRaw(ledger.latestCalibration.avgClvPct)} note="Closing line value" />
          </div>
        </section>
      ) : null}

      {ledger.warnings.length ? (
        <section className="rounded-[1.5rem] border border-amber-300/15 bg-amber-300/[0.05] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200">Proof warnings</div>
          <div className="mt-3 grid gap-2">
            {ledger.warnings.map((warning) => (
              <div key={warning} className="rounded-xl border border-amber-300/15 bg-black/20 px-3 py-2 text-xs leading-5 text-amber-100/80">{warning}</div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="Status breakdown" values={ledger.statusBreakdown} />
        <Breakdown title="Data quality" values={ledger.dataQualityBreakdown} />
        <Breakdown title="Confidence" values={ledger.confidenceBreakdown} />
      </div>

      <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4" open>
        <summary className="cursor-pointer list-none">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Recent MMA ledger rows</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Latest shadow predictions with winner, CLV, Brier, and pass discipline.</div>
        </summary>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
              <tr>
                <th className="px-3 py-2">Fight</th>
                <th className="px-3 py-2">Pick</th>
                <th className="px-3 py-2">Actual</th>
                <th className="px-3 py-2 text-right">Prob</th>
                <th className="px-3 py-2 text-right">Open</th>
                <th className="px-3 py-2 text-right">Close</th>
                <th className="px-3 py-2 text-right">CLV</th>
                <th className="px-3 py-2 text-right">Brier</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.slice(0, 40).map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{row.fighterAName ?? "Fighter A"} vs {row.fighterBName ?? "Fighter B"}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{row.eventLabel} · {when(row.recordedAt)}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-300">
                    <div>{row.pickName ?? "—"}</div>
                    <div className="mt-1 text-[10px] text-slate-600">{row.dataQualityGrade ?? "—"} / {row.confidenceGrade ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{row.actualWinnerName ?? "pending"}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(row.pickProbability)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{odds(row.pickOpenOddsAmerican)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{odds(row.pickCloseOddsAmerican)}</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-200">{pctRaw(row.closingLineValuePct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.brier, 4)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={pill(row.resultCorrect === true ? "green" : row.resultCorrect === false ? "red" : row.shouldHavePassed ? "amber" : "slate")}>{row.resultCorrect === true ? "win" : row.resultCorrect === false ? "loss" : row.shouldHavePassed ? "pass" : row.status}</span>
                  </td>
                </tr>
              ))}
              {!ledger.rows.length ? (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-500">No MMA ledger rows yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  );
}
