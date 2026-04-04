import { cn } from "@/lib/utils/cn";

type LineMovementPoint = {
  capturedAt: string;
  spreadLine: number | null;
  totalLine: number | null;
};

type LineMovementChartProps = {
  points: LineMovementPoint[];
  metric?: "spreadLine" | "totalLine";
  label: string;
  compact?: boolean;
};

function buildPath(points: number[], width: number, height: number) {
  if (points.length === 1) {
    return `M 0 ${height / 2} L ${width} ${height / 2}`;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function LineMovementChart({
  points,
  metric = "spreadLine",
  label,
  compact = false
}: LineMovementChartProps) {
  const series = points
    .map((point) => point[metric])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (series.length < 2) {
    return (
      <div
        className={cn(
          "rounded-[1.2rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm text-slate-400",
          compact ? "min-h-[92px]" : "min-h-[148px]"
        )}
      >
        {label} history is not deep enough yet.
      </div>
    );
  }

  const width = compact ? 220 : 420;
  const height = compact ? 64 : 108;
  const path = buildPath(series, width, height);
  const delta = series[series.length - 1] - series[0];
  const deltaLabel = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;

  return (
    <div
      className={cn(
        "rounded-[1.2rem] border border-white/8 bg-slate-950/60 px-4 py-4",
        compact ? "grid gap-3" : "grid gap-4"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.64rem] uppercase tracking-[0.24em] text-slate-500">{label}</div>
          <div className="mt-1 text-sm text-slate-300">
            {series.length} tracked snapshot{series.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className={cn("font-display font-semibold", delta >= 0 ? "text-emerald-300" : "text-rose-200")}>
          {deltaLabel}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className={cn("w-full", compact ? "h-16" : "h-28")} aria-hidden="true">
        <defs>
          <linearGradient id={`${label.replace(/\s+/g, "-")}-stroke`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path
          d={path}
          fill="none"
          stroke={`url(#${label.replace(/\s+/g, "-")}-stroke)`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={compact ? 2.75 : 3.25}
        />
      </svg>
    </div>
  );
}
