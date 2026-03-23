import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { StatCard } from "@/components/ui/stat-card";
import { BreakdownPanel } from "@/components/performance/breakdown-panel";
import { TrendChart } from "@/components/performance/trend-chart";
import { getPerformanceDashboard } from "@/services/bets/bets-service";

export default function PerformancePage() {
  const data = getPerformanceDashboard();

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Performance Dashboard"
        description="A founder-grade read on record, units, ROI, CLV placeholder, and where the mock portfolio is leaking."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Total Bets" value={`${data.summary.totalBets}`} />
        <StatCard label="Record" value={data.summary.record} />
        <StatCard label="Win Rate" value={`${data.summary.winRate.toFixed(1)}%`} />
        <StatCard label="ROI" value={`${data.summary.roi > 0 ? "+" : ""}${data.summary.roi.toFixed(1)}%`} />
        <StatCard label="Units" value={`${data.summary.units > 0 ? "+" : ""}${data.summary.units.toFixed(2)}u`} />
        <StatCard label="Avg Odds / CLV" value={`${data.summary.averageOdds} / ${data.summary.clv}`} />
      </div>

      <TrendChart points={data.trend} />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid gap-4">
          <SectionTitle title="By Sport" />
          <BreakdownPanel rows={data.bySport} />
          <SectionTitle title="By Market" />
          <BreakdownPanel rows={data.byMarket} />
        </div>

        <div className="grid gap-4">
          <SectionTitle title="By Sportsbook" />
          <BreakdownPanel rows={data.bySportsbook} />
          <SectionTitle title="By Timing" description="Live rows are placeholders until in-play logging is active." />
          <BreakdownPanel rows={data.byTiming} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="font-display text-2xl font-semibold text-white">Best Performing Angles</div>
          <div className="mt-4 grid gap-3">
            {data.bestAngles.map((angle) => (
              <div key={angle} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                {angle}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="font-display text-2xl font-semibold text-white">Leaks</div>
          <div className="mt-4 grid gap-3">
            {data.leaks.map((leak) => (
              <div key={leak} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                {leak}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
