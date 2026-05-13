import { SharkTrendsWarningBanner } from "./SharkTrendsWarningBanner";

export function SharkTrendsQualifiers({ qualifiers, warnings }: { qualifiers: any[]; warnings?: string[] }) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Live qualifiers</h2>
        <span className="text-sm text-slate-500">Today and upcoming MLB games</span>
      </div>
      <SharkTrendsWarningBanner warnings={warnings} />
      {!qualifiers?.length ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-black/30 p-4 text-sm text-slate-400">No current games match every required condition with available fields.</div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {qualifiers.map((row) => (
            <div key={`${row.eventId}-${row.team}-${row.marketType}`} className="rounded-2xl border border-slate-800 bg-black/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-white">{row.team} vs {row.opponent}</div>
                  <div className="text-sm text-slate-400">{row.marketType} {row.side} {row.currentOddsAmerican ?? ""}</div>
                </div>
                <div className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">{row.matchScore}%</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {row.matchedConditions.map((condition: string) => <span key={condition} className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">{condition}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
