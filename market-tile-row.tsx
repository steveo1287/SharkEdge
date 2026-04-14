import { cn } from "@/lib/utils/cn";

type MarketSparklineProps = {
  values: Array<number | null | undefined>;
  compact?: boolean;
  accent?: "cyan" | "green" | "rose";
  className?: string;
};

function normalizeSeries(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function buildPath(points: number[], width: number, height: number) {
  if (points.length < 2) {
    return "";
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

const accentMap = {
  cyan: { stroke: "#44a4ff", fill: "rgba(68,164,255,0.12)" },
  green: { stroke: "#22c55e", fill: "rgba(34,197,94,0.12)" },
  rose: { stroke: "#fb7185", fill: "rgba(251,113,133,0.12)" }
} as const;

export function MarketSparkline({
  values,
  compact = false,
  accent = "cyan",
  className
}: MarketSparklineProps) {
  const series = normalizeSeries(values);
  const width = compact ? 92 : 140;
  const height = compact ? 28 : 42;

  if (series.length < 2) {
    return <div className={cn("h-7 w-24 rounded-full border border-white/8 bg-white/[0.03]", className)} />;
  }

  const path = buildPath(series, width, height);
  const colors = accentMap[accent];
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn(compact ? "h-7 w-24" : "h-10 w-36", className)} aria-hidden="true">
      <path d={area} fill={colors.fill} />
      <path d={path} fill="none" stroke={colors.stroke} strokeWidth={compact ? 2.1 : 2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
