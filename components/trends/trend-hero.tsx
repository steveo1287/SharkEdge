import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { SharkScoreRing } from "@/components/branding/shark-score-ring";

type TrendHeroMetric = {
  label: string;
  value: string;
};

export function TrendHero({
  eyebrow,
  title,
  metrics,
  score,
  chartValues,
  note
}: {
  eyebrow: string;
  title: string;
  metrics: TrendHeroMetric[];
  score: number;
  chartValues: number[];
  note: string;
}) {
  return (
    <section className="panel p-5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">{eyebrow}</div>
      <h1 className="mt-2 font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] text-text-primary">
        {title}
      </h1>

      <div className="mt-5 rounded-md border border-bone/[0.08] bg-surface p-4">
        <AreaTrendChart values={chartValues} />
      </div>

      <div className="mt-5 grid grid-cols-[auto_1fr] gap-4">
        <SharkScoreRing score={score} tone={score >= 75 ? "success" : "brand"} />
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-md border border-bone/[0.08] bg-surface p-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">{metric.label}</div>
              <div className="mt-2 font-mono text-[18px] font-semibold tabular-nums text-text-primary">{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 text-[13px] leading-[1.55] text-bone/60">{note}</div>
    </section>
  );
}
