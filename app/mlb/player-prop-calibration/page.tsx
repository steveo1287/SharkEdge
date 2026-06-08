import Link from "next/link";

import { fetchPersistedMlbPlayerPropCalibrationRows } from "@/services/simulation/mlb-player-prop-calibration-persistence";
import { buildMlbPlayerPropBacktestReport, type MlbPlayerPropBacktestBucket } from "@/services/simulation/mlb-player-prop-calibration-backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function textParam(search: Record<string, string | string[] | undefined>, key: string) {
  const value = search[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

function numberParam(search: Record<string, string | string[] | undefined>, key: string, fallback: number) {
  const value = Number(textParam(search, key));
  return Number.isFinite(value) ? value : fallback;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number, digits = 3) {
  return value.toFixed(digits);
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = tone === "good"
    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
    : tone === "warn"
      ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
      : tone === "bad"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";
  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{label}</span>;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-display text-2xl font-black tracking-tight text-white">{value}</div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function BucketTable({ title, buckets }: { title: string; buckets: MlbPlayerPropBacktestBucket[] }) {
  return (
    <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-black tracking-tight text-white">{title}</h2>
        <Pill label={`${buckets.length} buckets`} />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-3">Key</th>
              <th className="py-2 pr-3 text-right">N</th>
              <th className="py-2 pr-3 text-right">Hit</th>
              <th className="py-2 pr-3 text-right">Pred</th>
              <th className="py-2 pr-3 text-right">Brier</th>
              <th className="py-2 pr-3 text-right">LogLoss</th>
              <th className="py-2 pr-3 text-right">ROI</th>
              <th className="py-2 text-right">Drift</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((row) => (
              <tr key={row.key} className="border-b border-white/[0.06] text-slate-300">
                <td className="py-2.5 pr-3 font-semibold text-white">{row.key}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{row.sampleSize}</td>
                <td className="py-2.5 pr-3 text-right font-mono text-aqua">{pct(row.hitRate)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{pct(row.averagePredicted)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(row.brierScore, 4)}</td>
                <td className="py-2.5 pr-3 text-right font-mono">{num(row.logLoss, 4)}</td>
                <td className={`py-2.5 pr-3 text-right font-mono ${row.roi >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{pct(row.roi)}</td>
                <td className={`py-2.5 text-right font-mono ${Math.abs(row.calibrationDrift) <= 0.03 ? "text-emerald-200" : "text-amber-200"}`}>{pct(row.calibrationDrift)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function MlbPlayerPropCalibrationPage({ searchParams }: PageProps) {
  const search = (await searchParams) ?? {};
  const lookbackDays = numberParam(search, "lookbackDays", 365);
  const rows = await fetchPersistedMlbPlayerPropCalibrationRows({ lookbackDays });
  const report = buildMlbPlayerPropBacktestReport(rows);
  const driftTone = Math.abs(report.calibrationDrift) <= 0.03 ? "good" : Math.abs(report.calibrationDrift) <= 0.07 ? "warn" : "bad";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02060b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(0,210,255,0.18),transparent_24rem),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.10),transparent_18rem),linear-gradient(180deg,#02060b_0%,#050b13_55%,#02060b_100%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-5 px-3 pb-24 pt-3 sm:px-5 md:pb-10">
        <header className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-2xl border border-aqua/30 bg-aqua/10 font-display text-lg font-black text-aqua">S</span><span><span className="block text-[10px] font-black uppercase tracking-[0.28em] text-aqua">SharkEdge</span><span className="block text-[11px] text-slate-500">MLB player prop calibration</span></span></Link>
            <div className="flex flex-wrap items-center gap-2"><Link href="/mlb/batter-box" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua">Batter Box</Link><Link href="/sim" className="rounded-full border border-aqua/25 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-aqua">SimHub</Link></div>
          </div>
        </header>

        <section className="rounded-[1.75rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.20),transparent_18rem),linear-gradient(135deg,rgba(5,18,32,0.98),rgba(2,7,13,0.98))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.36)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-aqua">Backtest proof</div>
              <h1 className="mt-3 max-w-4xl font-display text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl">MLB Player Prop Calibration</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">Brier score, log loss, ROI, hit rate, and calibration drift from settled player prop rows. This is the proof layer behind strict A+ edge gates.</p>
            </div>
            <div className="flex flex-col items-end gap-2"><Pill label={`${lookbackDays}d lookback`} /><Pill label={`drift ${pct(report.calibrationDrift)}`} tone={driftTone} /></div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Sample" value={String(report.sampleSize)} sub={`${report.wins}W / ${report.losses}L`} />
          <StatTile label="Hit rate" value={pct(report.hitRate)} sub={`Pred ${pct(report.averagePredicted)}`} />
          <StatTile label="Brier / LogLoss" value={num(report.brierScore, 4)} sub={`LogLoss ${num(report.logLoss, 4)}`} />
          <StatTile label="ROI" value={pct(report.roi)} sub={`${num(report.profitUnits, 2)} units`} />
        </section>

        {report.warnings.length ? <section className="rounded-[1.35rem] border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm leading-6 text-amber-100">{report.warnings.join(" ")}</section> : null}

        <BucketTable title="Market calibration" buckets={report.byMarket} />
        <BucketTable title="Player calibration" buckets={report.byPlayer} />
        <BucketTable title="Matchup-cluster calibration" buckets={report.byMatchupCluster} />
      </div>
    </main>
  );
}
