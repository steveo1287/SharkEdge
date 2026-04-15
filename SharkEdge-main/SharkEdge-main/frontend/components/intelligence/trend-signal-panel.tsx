import Link from "next/link";

import { TrendValueBadge } from "@/components/intelligence/trend-signal-badges";
import type { TrendCardView } from "@/lib/types/domain";

export function TrendSignalPanel({ trend }: { trend: TrendCardView }) {
  return (
    <Link
      href={trend.href ?? "/trends"}
      className="rounded-[1.35rem] border border-white/8 bg-[#0a1422]/90 p-4 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
          Predictive trend
        </div>
        <TrendValueBadge tone={trend.tone} value={trend.value} />
      </div>

      <div className="mt-3 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
        {trend.sampleSize} qualified samples
      </div>

      <div className="mt-3 text-lg font-semibold leading-tight text-white">
        {trend.title}
      </div>

      <div className="mt-2 text-sm leading-6 text-slate-400">{trend.note}</div>

      {trend.whyItMatters ? (
        <div className="mt-3 rounded-2xl border border-sky-400/10 bg-sky-400/5 px-3 py-2 text-xs leading-5 text-sky-100">
          <span className="mr-2 uppercase tracking-[0.16em] text-sky-300/80">Why it matters</span>
          {trend.whyItMatters}
        </div>
      ) : null}

      {trend.caution ? (
        <div className="mt-2 text-xs leading-5 text-slate-500">
          <span className="mr-2 uppercase tracking-[0.16em] text-slate-500">Caution</span>
          {trend.caution}
        </div>
      ) : null}
    </Link>
  );
}