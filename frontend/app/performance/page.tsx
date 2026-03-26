import { BreakdownPanel } from "@/components/performance/breakdown-panel";
import { TrendChart } from "@/components/performance/trend-chart";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import { getPerformanceDashboard } from "@/services/bets/bets-service";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const data = await getPerformanceDashboard();

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Performance"
        description="Trustworthy ledger analytics only. ROI, units, and CLV are computed from persisted bets, and unsupported gaps stay plainly labeled instead of being faked."
      />

      {data.setup ? (
        <div className="grid gap-4">
          <SetupStateCard title={data.setup.title} detail={data.setup.detail} steps={data.setup.steps} />
          <Card className="p-5 text-sm leading-7 text-slate-300">
            Performance stays blank on purpose until persisted bets and migrated trend tables are available. SharkEdge will not show fake ROI, CLV, leak signals, or segment winners just to fill the page.
          </Card>
        </div>
      ) : null}

      {!data.setup ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-8">
            <StatCard label="Total Bets" value={`${data.summary.totalBets}`} />
            <StatCard label="Record" value={data.summary.record} />
            <StatCard label="Win Rate" value={`${data.summary.winRate.toFixed(1)}%`} />
            <StatCard label="ROI" value={`${data.summary.roi > 0 ? "+" : ""}${data.summary.roi.toFixed(1)}%`} />
            <StatCard label="Net Units" value={`${data.summary.netUnits > 0 ? "+" : ""}${data.summary.netUnits.toFixed(2)}u`} />
            <StatCard label="Avg Odds / Stake" value={`${data.summary.averageOdds} / ${data.summary.averageStake.toFixed(2)}u`} />
            <StatCard
              label="Average CLV"
              value={
                data.summary.averageClv === null
                  ? "--"
                  : `${data.summary.averageClv > 0 ? "+" : ""}${data.summary.averageClv.toFixed(2)}%`
              }
            />
            <StatCard
              label="Average EV"
              value={
                data.summary.averageEv === null
                  ? "--"
                  : `${data.summary.averageEv > 0 ? "+" : ""}${data.summary.averageEv.toFixed(2)}%`
              }
              note="Bet-time market EV only when captured"
            />
          </div>

          <TrendChart points={data.trend} />

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="grid gap-4">
              <SectionTitle title="By Sport" />
              <BreakdownPanel rows={data.bySport} />
              <SectionTitle title="By League" />
              <BreakdownPanel rows={data.byLeague} />
              <SectionTitle title="By Market" />
              <BreakdownPanel rows={data.byMarket} />
            </div>

            <div className="grid gap-4">
              <SectionTitle title="By Sportsbook" />
              <BreakdownPanel rows={data.bySportsbook} />
              <SectionTitle title="By Day" />
              <BreakdownPanel rows={data.byDayOfWeek} />
              <SectionTitle title="By Timing" />
              <BreakdownPanel rows={data.byTiming} />
            </div>

            <div className="grid gap-4">
              <SectionTitle title="By Week" />
              <BreakdownPanel rows={data.byWeek} />
              <SectionTitle title="By Month" />
              <BreakdownPanel rows={data.byMonth} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            <Card className="p-5">
              <div className="font-display text-2xl font-semibold text-white">Recent Form</div>
              <div className="mt-4 grid gap-3">
                {data.recentForm.length ? (
                  data.recentForm.map((slice) => (
                    <div key={slice.label} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                      <div className="font-medium text-white">{slice.label}</div>
                      <div className="mt-1">{slice.record}</div>
                      <div className="mt-1">{slice.units > 0 ? "+" : ""}{slice.units.toFixed(2)}u</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                    No settled samples yet.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="font-display text-2xl font-semibold text-white">Best Segments</div>
              <div className="mt-4 grid gap-3">
                {data.bestSegments.length ? (
                  data.bestSegments.map((segment) => (
                    <div key={segment} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                      {segment}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                    Best segments will populate after the first settled samples.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="font-display text-2xl font-semibold text-white">Weak Spots</div>
              <div className="mt-4 grid gap-3">
                {data.worstSegments.length ? (
                  data.worstSegments.map((segment) => (
                    <div key={segment} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                      {segment}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                    Weak spots are intentionally blank until the ledger has enough real history.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="font-display text-2xl font-semibold text-white">Leak Detector</div>
              <div className="mt-4 grid gap-3">
                {data.leakSignals.length ? (
                  data.leakSignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300"
                    >
                      <div className="font-medium text-white">{signal.title}</div>
                      <div className="mt-1 leading-6">{signal.detail}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                        Sample {signal.sampleSize}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-400">
                    Leak signals stay blank until the sample is large enough to say something honest.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
