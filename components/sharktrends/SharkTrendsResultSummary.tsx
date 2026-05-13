function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function units(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
}

export function SharkTrendsResultSummary({ result }: { result?: any }) {
  if (!result) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-slate-400">
        Run a backtest to see record, ROI, CLV, confidence, and exact matching games.
      </section>
    );
  }
  const cards = [
    ["Record", `${result.wins}-${result.losses}${result.pushes ? `-${result.pushes}` : ""}`],
    ["Win rate", pct(result.winRate)],
    ["Units", units(result.unitsFlatStake)],
    ["ROI", pct(result.roiFlatStake)],
    ["Avg odds", result.avgOddsAmerican ? Math.round(result.avgOddsAmerican) : "--"],
    ["CLV", result.clvAverage === null ? "--" : result.clvAverage.toFixed(1)],
    ["Sample", result.sampleSize],
    ["Grade", result.confidenceGrade]
  ];
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Backtest results</h2>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">Historical context, not a guarantee</span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-black/30 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
