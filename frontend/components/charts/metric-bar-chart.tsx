type MetricBarItem = {
  label: string;
  value: number;
  hint?: string | null;
};

type MetricBarChartProps = {
  items: MetricBarItem[];
  valueFormatter?: (value: number) => string;
};

export function MetricBarChart({ items, valueFormatter = (value) => `${value}` }: MetricBarChartProps) {
  const cleanItems = items.filter((item) => Number.isFinite(item.value));
  const max = Math.max(1, ...cleanItems.map((item) => Math.abs(item.value)));

  if (!cleanItems.length) {
    return (
      <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-400">
        No chartable values are available.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {cleanItems.map((item) => {
        const width = Math.max(8, Math.round((Math.abs(item.value) / max) * 100));
        const positive = item.value >= 0;

        return (
          <div key={`${item.label}-${item.value}`} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em]">
              <span className="truncate text-slate-300">{item.label}</span>
              <span className={positive ? "text-emerald-300" : "text-rose-300"}>
                {valueFormatter(item.value)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={positive ? "h-full rounded-full bg-emerald-300" : "h-full rounded-full bg-rose-300"}
                style={{ width: `${width}%` }}
              />
            </div>
            {item.hint ? <div className="text-xs text-slate-500">{item.hint}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
