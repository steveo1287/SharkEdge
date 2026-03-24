import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

type TrendsPlaceholderProps = {
  metrics: Array<{
    label: string;
    value: string;
    note: string;
  }>;
  savedTrendName: string;
};

export function TrendsPlaceholder({ metrics, savedTrendName }: TrendsPlaceholderProps) {
  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="text-xs uppercase tracking-[0.2em] text-sky-300">
          Foundation Live
        </div>
        <div className="mt-3 font-display text-3xl font-semibold text-white">
          Save, rerun, and grade trend queries
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          The data model and saved query foundation are already in place. The next
          phase will let you run filters across teams,
          players, markets, opponents, date ranges, and sample thresholds.
        </p>
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-slate-950/65 p-4 text-sm text-slate-300">
          Example saved trend: <span className="text-white">{savedTrendName}</span>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} />
        ))}
      </div>

      <Card className="p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {["Sport", "Market", "Player / Team", "Opponent", "Date Range", "Sample Size"].map(
            (label) => (
              <div
                key={label}
                className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-500"
              >
                {label}
              </div>
            )
          )}
        </div>
      </Card>
    </div>
  );
}
