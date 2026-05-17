import { getLatestUfcStyleCalibrationSnapshot } from "@/services/ufc/style-calibration-store";
import type { UfcStyleBucketReport, UfcStylePathReport } from "@/services/ufc/style-calibration";

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function prob(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function smallPill(tone: "cyan" | "green" | "amber" | "red" | "slate" = "slate") {
  const tones = {
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-200",
    green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    red: "border-rose-300/25 bg-rose-300/10 text-rose-200",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  };
  return `rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${tones[tone]}`;
}

function styleAccuracyTone(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "slate" as const;
  if (value >= 58) return "green" as const;
  if (value >= 52) return "amber" as const;
  return "red" as const;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function BucketTable({ title, subtitle, rows, limit = 8 }: { title: string; subtitle: string; rows: UfcStyleBucketReport[]; limit?: number }) {
  const visible = rows.slice(0, limit);
  return (
    <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.20em] text-cyan-300">{title}</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
        </div>
        <span className={smallPill("slate")}>{rows.length} buckets</span>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Signal</th>
              <th className="px-3 py-2 text-right">Count</th>
              <th className="px-3 py-2 text-right">Pick acc</th>
              <th className="px-3 py-2 text-right">Win rate</th>
              <th className="px-3 py-2 text-right">Model p</th>
              <th className="px-3 py-2 text-right">Style p</th>
              <th className="px-3 py-2 text-right">Brier</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-b border-white/5 last:border-none">
                <td className="max-w-[24rem] px-3 py-3 font-semibold text-white">{row.key}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{row.count}</td>
                <td className="px-3 py-3 text-right"><span className={smallPill(styleAccuracyTone(row.pickAccuracyPct))}>{pct(row.pickAccuracyPct)}</span></td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(row.winRatePct)}</td>
                <td className="px-3 py-3 text-right font-mono text-sky-200">{prob(row.avgModelProbability)}</td>
                <td className="px-3 py-3 text-right font-mono text-cyan-200">{prob(row.avgStyleProbability)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{prob(row.avgBrier, 4)}</td>
              </tr>
            ))}
            {!visible.length ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No style samples yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PathTable({ rows }: { rows: UfcStylePathReport[] }) {
  const visible = rows.slice(0, 10);
  return (
    <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.20em] text-cyan-300">Path-to-victory audit</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Shows whether the generated fight-story path actually matched the winner.</p>
        </div>
        <span className={smallPill("slate")}>{rows.length} paths</span>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Path</th>
              <th className="px-3 py-2 text-right">Count</th>
              <th className="px-3 py-2 text-right">Success</th>
              <th className="px-3 py-2 text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-b border-white/5 last:border-none">
                <td className="max-w-[42rem] px-3 py-3 text-slate-200">{row.key}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{row.count}</td>
                <td className="px-3 py-3 text-right font-mono text-emerald-200">{row.successCount}</td>
                <td className="px-3 py-3 text-right"><span className={smallPill(styleAccuracyTone(row.successRatePct))}>{pct(row.successRatePct)}</span></td>
              </tr>
            ))}
            {!visible.length ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No path samples yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export async function UfcStyleCalibrationPanel({ modelVersion }: { modelVersion: string }) {
  const snapshot = await getLatestUfcStyleCalibrationSnapshot(modelVersion);

  if (!snapshot) {
    return (
      <section className="rounded-[1.5rem] border border-cyan-300/15 bg-slate-950/70 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Style calibration</div>
        <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">No style snapshot yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Run <code className="rounded bg-black/40 px-1.5 py-0.5 text-cyan-200">tsx scripts/worker-ufc-style-calibration.ts --modelVersion={modelVersion}</code> after fights resolve to populate archetype, warning, and path-to-victory accuracy.
        </p>
      </section>
    );
  }

  const report = snapshot.report;
  const brierDelta = typeof report.avgBrier === "number" && typeof report.avgStyleBrier === "number" ? report.avgBrier - report.avgStyleBrier : null;

  return (
    <section className="grid gap-4 rounded-[1.5rem] border border-cyan-300/15 bg-slate-950/75 p-4 shadow-[0_0_70px_rgba(14,165,233,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Style calibration</div>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.05em] text-white">Archetype and matchup-style proof</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            This reads the latest <span className="font-mono text-cyan-200">style-calibration</span> snapshot and shows which fighter archetypes, clash warnings, and path-to-victory explanations are actually converting after fights settle.
          </p>
          <div className="mt-2 text-xs text-slate-500">Generated {when(snapshot.generatedAt)} · {snapshot.fightCount} fights · {snapshot.modelVersion}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.flags.length ? report.flags.map((flag) => <span key={flag} className={smallPill(flag.includes("thin") ? "amber" : "red")}>{flag}</span>) : <span className={smallPill("green")}>sample clean</span>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Samples" value={String(report.sampleCount)} note="Resolved fights with style genome payload" />
        <Stat label="Pick accuracy" value={pct(report.pickAccuracyPct)} note="Main model pick hit rate" />
        <Stat label="Style accuracy" value={pct(report.stylePickAccuracyPct)} note="Style matchup pick hit rate" />
        <Stat label="Brier delta" value={prob(brierDelta, 4)} note="Positive means style Brier is better" />
        <Stat label="Paths tracked" value={String(report.paths.length)} note="Generated path-to-victory signals" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BucketTable title="Primary archetypes" subtitle="Which fighter style families are actually winning and grading well." rows={report.archetypes} />
        <BucketTable title="Style warnings" subtitle="Which clash warnings correlate with wins/losses and missed picks." rows={report.warnings} />
      </div>

      <PathTable rows={report.paths} />

      <details className="rounded-[1.25rem] border border-white/10 bg-white/[0.025] p-4">
        <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.20em] text-cyan-300">Clash bucket breakdown</summary>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <BucketTable title="Pace buckets" subtitle="Low, medium, and high pace calibration." rows={report.clashBuckets.pace} limit={5} />
          <BucketTable title="Finish volatility" subtitle="Whether chaos/finish-risk buckets are useful." rows={report.clashBuckets.finishVolatility} limit={5} />
          <BucketTable title="Decision reliability" subtitle="Which decision-reliability zones are safer or dangerous." rows={report.clashBuckets.decisionReliability} limit={5} />
          <BucketTable title="Wrestling initiative" subtitle="Tracks Fighter A/B wrestling edge buckets." rows={report.clashBuckets.wrestlingInitiative} limit={5} />
          <BucketTable title="Chaos index" subtitle="How volatile style clash buckets perform." rows={report.clashBuckets.chaos} limit={5} />
        </div>
      </details>
    </section>
  );
}
