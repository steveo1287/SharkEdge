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
    <section className="mobile-hero">
      <div className="mobile-section-eyebrow">{eyebrow}</div>
      <h1 className="mt-2 text-[1.95rem] font-semibold leading-[1.05] tracking-tight text-white">
        {title}
      </h1>

      <div className="mt-5 rounded-[24px] border border-white/8 bg-white/[0.02] p-4">
        <AreaTrendChart values={chartValues} />
      </div>

      <div className="mt-5 grid grid-cols-[auto_1fr] gap-4">
        <SharkScoreRing score={score} tone={score >= 75 ? "success" : "brand"} />
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[18px] bg-white/[0.03] p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{metric.label}</div>
              <div className="mt-2 text-[1.2rem] font-semibold text-white">{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 text-sm leading-6 text-slate-400">{note}</div>
    </section>
  );
}

