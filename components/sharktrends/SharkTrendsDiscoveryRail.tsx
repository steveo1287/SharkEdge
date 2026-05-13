"use client";

import type { SharkTrendDiscoveryFeed } from "@/src/server/sharktrends/discovery-miner";

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function units(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
}

export function SharkTrendsDiscoveryRail({
  feed,
  onRun
}: {
  feed?: SharkTrendDiscoveryFeed | null;
  onRun: (body: Record<string, unknown>) => void;
}) {
  const cards = feed?.cards ?? [];
  return (
    <section className="rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))] p-5 shadow-2xl shadow-emerald-950/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-emerald-300">Auto-mined systems</p>
          <h2 className="text-2xl font-semibold text-white">Deep MLB trend inventory</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            These are scanned from stored MLB context rows. No fabricated records, no future odds, and every card can be opened into exact matching games.
          </p>
        </div>
        <div className="rounded-full border border-slate-700 bg-black/30 px-4 py-2 text-xs text-slate-300">
          {feed?.scannedRows ?? 0} rows / {feed?.candidateCount ?? 0} candidate systems
        </div>
      </div>

      {cards.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {cards.slice(0, 12).map((card) => (
            <button
              key={card.id}
              onClick={() => onRun({ filters: card.filters })}
              className="group rounded-2xl border border-slate-800 bg-black/30 p-4 text-left transition hover:border-emerald-300/50 hover:bg-emerald-300/10"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  {card.confidenceGrade}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300">
                  {card.sampleSize} games
                </span>
                <span className={card.units >= 0 ? "rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[11px] text-emerald-200" : "rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-1 text-[11px] text-rose-200"}>
                  {units(card.units)}
                </span>
              </div>
              <div className="mt-3 text-lg font-semibold leading-snug text-white group-hover:text-emerald-100">{card.title}</div>
              <div className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{card.headline}</div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                  <span className="block text-slate-500">Record</span>
                  <span className="font-semibold text-white">{card.record}</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                  <span className="block text-slate-500">Win</span>
                  <span className="font-semibold text-white">{pct(card.winRate)}</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                  <span className="block text-slate-500">ROI</span>
                  <span className={card.roi >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>{pct(card.roi)}</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2">
                  <span className="block text-slate-500">Q</span>
                  <span className="font-semibold text-white">{card.dataQualityScore}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {card.conditions.slice(0, 5).map((condition) => (
                  <span key={condition} className="rounded-full bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
                    {condition}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          No mined trend systems cleared the current gates. That usually means the context table needs more rows, official results, or opening/closing prices.
        </div>
      )}

      {!!feed?.dataGaps?.length && (
        <div className="mt-5 rounded-2xl border border-sky-300/15 bg-sky-300/10 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-sky-200">Specific data gaps</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {feed.dataGaps.map((gap) => (
              <span key={gap} className="rounded-full bg-black/25 px-3 py-1 text-xs text-sky-100">
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
