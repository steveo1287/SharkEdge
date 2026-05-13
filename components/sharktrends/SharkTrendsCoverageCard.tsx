import type { MlbHistoricalOddsCoverage } from "@/src/server/sharktrends/coverage";

function stat(label: string, value: string | number) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

export function SharkTrendsCoverageCard({ coverage }: { coverage: MlbHistoricalOddsCoverage }) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5 shadow-2xl shadow-black/30">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300">Warehouse coverage</p>
          <h2 className="text-2xl font-semibold text-white">MLB historical odds audit</h2>
        </div>
        <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
          Quality {coverage.dataQualityScore}/100
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {stat("Events", coverage.eventCount)}
        {stat("Graded", coverage.gradedEventCount)}
        {stat("Markets", coverage.marketCount)}
        {stat("Snapshots", coverage.snapshotCount)}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-black/30 p-4 text-sm text-slate-300">
          <div className="text-slate-500">Seasons</div>
          <div className="mt-1 text-white">{coverage.seasonsAvailable.join(", ") || "none yet"}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-black/30 p-4 text-sm text-slate-300">
          <div className="text-slate-500">Sources</div>
          <div className="mt-1 text-white">{coverage.sourceKeys.join(", ") || "none yet"}</div>
        </div>
      </div>
    </section>
  );
}
