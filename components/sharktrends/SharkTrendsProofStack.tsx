function units(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function pct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function SplitCard({ title, rows }: { title: string; rows?: Array<any> }) {
  if (!rows?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-black/30 p-4">
      <div className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">{title}</div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="rounded-xl border border-slate-800/80 bg-slate-950/80 p-3">
            <div className="text-sm font-semibold text-white">{row.label}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>{row.record}</span>
              <span>{row.sampleSize} games</span>
              <span className={row.units >= 0 ? "text-emerald-300" : "text-rose-300"}>{units(row.units)}</span>
              <span>{pct(row.roi)} ROI</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SharkTrendsProofStack({ proof }: { proof?: any }) {
  if (!proof) return null;
  return (
    <section className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.18),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.98))] shadow-2xl shadow-cyan-950/20">
      <div className="border-b border-cyan-400/10 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Trend proof
          </span>
          <span className="rounded-full border border-slate-700 bg-black/30 px-3 py-1 text-xs text-slate-300">
            {proof.sampleSize ?? 0} graded games
          </span>
          <span className="rounded-full border border-slate-700 bg-black/30 px-3 py-1 text-xs text-slate-300">
            {proof.market}
          </span>
        </div>
        <h2 className="mt-4 max-w-5xl text-2xl font-semibold leading-tight text-white md:text-3xl">
          {proof.headline}
        </h2>
        <p className="mt-3 max-w-4xl text-sm text-slate-400">
          This is historical context from stored SharkEdge rows only. It is a research signal, not a prediction guarantee.
        </p>
      </div>

      <div className="grid gap-4 p-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <div>
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">Conditions matched</div>
            <div className="flex flex-wrap gap-2">
              {(proof.conditions ?? []).map((condition: string) => (
                <span key={condition} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100">
                  {condition}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-black/30 p-4">
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-500">Evidence stack</div>
            <div className="space-y-2 text-sm text-slate-300">
              {(proof.evidenceBullets ?? []).map((bullet: string) => (
                <div key={bullet} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>

          {!!proof.cautionFlags?.length && (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.2em] text-amber-200">Read before trusting it</div>
              <div className="space-y-2 text-sm text-amber-100">
                {proof.cautionFlags.map((flag: string) => (
                  <div key={flag}>{flag}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4">
          <SplitCard title="Best split pockets" rows={proof.splitHighlights?.best} />
          <SplitCard title="Weak / fade zones" rows={proof.splitHighlights?.worst} />
        </div>
      </div>
    </section>
  );
}
