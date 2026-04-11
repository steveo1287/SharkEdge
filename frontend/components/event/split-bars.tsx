type SplitBarItem = {
  label: string;
  leftLabel: string;
  rightLabel: string;
  leftPct?: number | null;
  rightPct?: number | null;
  note?: string;
};

export function SplitBars({
  items,
  summary
}: {
  items: SplitBarItem[];
  summary?: string;
}) {
  return (
    <section className="mobile-surface">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mobile-section-eyebrow">Splits</div>
          <div className="mt-1 text-[1.1rem] font-semibold text-white">Public position</div>
        </div>
        <div className="rounded-full bg-[#203554] px-3 py-1 text-[11px] text-[#9bc1ff]">Share</div>
      </div>

      {summary ? <div className="mt-3 text-sm leading-6 text-slate-400">{summary}</div> : null}

      <div className="mt-4 grid gap-4">
        {items.map((item) => {
          const left = typeof item.leftPct === "number" ? Math.max(0, Math.min(100, item.leftPct)) : null;
          const right = typeof item.rightPct === "number" ? Math.max(0, Math.min(100, item.rightPct)) : null;

          return (
            <div key={item.label}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm text-slate-300">
                <span>{item.label}</span>
                {item.note ? <span className="text-[11px] text-slate-500">{item.note}</span> : null}
              </div>

              {left !== null && right !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{item.leftLabel}</span>
                    <span>{item.rightLabel}</span>
                  </div>
                  <div className="overflow-hidden rounded-full bg-[#102033]">
                    <div className="flex h-8">
                      <div
                        className="flex items-center justify-start bg-[#14599f] px-3 text-sm font-semibold text-white"
                        style={{ width: `${left}%` }}
                      >
                        {left.toFixed(2)}%
                      </div>
                      <div
                        className="flex items-center justify-end bg-[#0d3d72] px-3 text-sm font-semibold text-white"
                        style={{ width: `${right}%` }}
                      >
                        {right.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm leading-6 text-slate-400">
                  {item.note ?? "Public ticket / money split feed is not wired for this matchup yet."}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

