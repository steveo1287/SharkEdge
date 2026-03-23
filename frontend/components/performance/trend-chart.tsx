import { Card } from "@/components/ui/card";
import { formatUnits } from "@/lib/formatters/odds";

type TrendChartProps = {
  points: Array<{
    label: string;
    units: number;
  }>;
};

export function TrendChart({ points }: TrendChartProps) {
  const max = Math.max(...points.map((point) => Math.abs(point.units)), 1);

  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
        Recent Profit Path
      </div>
      <div className="mt-5 grid gap-3">
        {points.map((point, index) => (
          <div
            key={`${point.label}-${index}`}
            className="grid grid-cols-[70px_1fr_auto] items-center gap-3"
          >
            <div className="text-sm text-slate-400">{point.label}</div>
            <div className="h-3 rounded-full bg-slate-900">
              <div
                className={`h-3 rounded-full ${point.units >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                style={{ width: `${(Math.abs(point.units) / max) * 100}%` }}
              />
            </div>
            <div className="text-sm text-slate-300">{formatUnits(point.units)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
