import { BreakdownPanel } from "@/components/performance/breakdown-panel";
import { TrendChart } from "@/components/performance/trend-chart";
import { Card } from "@/components/ui/card";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import { SetupStateCard } from "@/components/ui/setup-state-card";
import { StatCard } from "@/components/ui/stat-card";
import { getPerformanceDashboard, getBetTrackerData, parseBetFilters } from "@/services/bets/bets-service";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const [data, ledger] = await Promise.all([
    getPerformanceDashboard(),
    getBetTrackerData(parseBetFilters({}), undefined, undefined)
  ]);

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_36%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.45)]">
        <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.2fr)_280px] lg:items-end">
          <div className="grid gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-sky-300/80">
              Ledger performance
            </div>
            <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Real betting performance, not fake scoreboard chest-thumping.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              ROI, net units, record, and CLV stay tied to persisted bets only. If tracking is thin,
              SharkEdge leaves the gaps visible instead of inventing hot streaks.
            </p>
          </div>
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Desk view</div>
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Ledger mode</span>
                <span className="text-white">{data.setup ? "Setup" : "Tracked"}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Settled / open</span>
                <span className="text-white">
                  {ledger.settledBets.length} / {ledger.openBets.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>CLV tracked</span>
                <span className="text-white">{data.summary.trackedClvBets}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <ResearchStatusNotice
        eyebrow="Workflow beta"
        title={data.setup ? "Blocked until the ledger is real" : "Ledger truth, not fake flexing"}
        body={
          data.setup
            ? "This desk only earns its place when the database-backed ledger is actually wired. Until then, SharkEdge stays plain about what is missing instead of inventing ROI or hot streaks."
            : "Performance only reads from persisted bets, tracked closes, and real grading logic. If CLV or EV coverage is thin, the gaps stay visible instead of being smoothed over with fake confidence."
        }
        tone={data.setup ? "danger" : "premium"}
        meta={
          data.setup
            ? data.setup.detail
            : `Tracked CLV bets: ${data.summary.trackedClvBets}. Average EV is only shown when bet-time market captures exist.`
        }
      />

      <SectionTitle
        title="Performance snapshot"
        description="One clean page for ledger truth, segment breakdowns, and where the closing line has been beating you or backing you."
      />

      {data.setup ? (
        <div className="grid gap-4">
          <SetupStateCard title={data.setup.title} detail={data.setup.detail} steps={data.setup.steps} />
          <Card className="p-5 text-sm leading-7 text-slate-300">
            Performance stays blank until persisted bets and the required trend tables are live.
            SharkEdge will not fake ROI, CLV, or segment winners just to fill the page.
          </Card>
        </div>
      ) : null}

      {!data.setup ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-9">
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
              label="Beat the Close"
              value={
                data.summary.positiveClvRate === null
                  ? "--"
                  : `${data.summary.positiveClvRate.toFixed(0)}%`
              }
              note={
                data.summary.trackedClvBets
                  ? `${data.summary.trackedClvBets} tracked bets`
                  : "Need tracked closes"
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

          <div className="grid gap-4 xl:grid-cols-5">
            {data.clvInsights.map((insight) => (
              <StatCard key={insight.label} label={insight.label} value={insight.value} note={insight.note} />
            ))}
          </div>

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

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="font-display text-2xl font-semibold text-white">Recent Settled Bets</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{ledger.settledBets.length} settled</div>
              </div>
              <div className="mt-4 grid gap-3">
                {ledger.settledBets.slice(0, 5).map((bet) => (
                  <div key={bet.id} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="line-clamp-1 font-medium text-white">{bet.eventLabel ?? bet.selection}</div>
                      <div className="text-sm text-slate-400">{bet.result}</div>
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{bet.league} | {bet.selection}</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="font-display text-2xl font-semibold text-white">Open Tracking</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{ledger.openBets.length} open</div>
              </div>
              <div className="mt-4 grid gap-3">
                {ledger.openBets.slice(0, 5).map((bet) => (
                  <div key={bet.id} className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="line-clamp-1 font-medium text-white">{bet.eventLabel ?? bet.selection}</div>
                      <div className="text-sm text-slate-400">{bet.context?.confidenceTier ?? "No tier"}</div>
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{bet.league} | {bet.selection}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
