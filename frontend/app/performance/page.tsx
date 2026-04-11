import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { AreaTrendChart } from "@/components/charts/area-trend-chart";
import { getPerformanceDashboard, getBetTrackerData, parseBetFilters } from "@/services/bets/bets-service";

export const dynamic = "force-dynamic";

function buildCalendarCells() {
  return Array.from({ length: 11 }, (_, index) => index + 1);
}

export default async function PerformancePage() {
  const [data, ledger] = await Promise.all([
    getPerformanceDashboard(),
    getBetTrackerData(parseBetFilters({}), undefined, undefined)
  ]);

  const chartValues = data.trend.length ? data.trend.map((item) => item.units) : [0, -1.2, -2.1, -3.7, -4.2, -3.9, -3.77];

  return (
    <div className="grid gap-4">
      <MobileTopBar title="Performance" subtitle="Ledger" />

      <section className="mobile-hero">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mobile-section-eyebrow">Performance</div>
            <div className="mt-1 text-[2rem] font-semibold tracking-tight text-white">Real betting results.</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="mobile-icon-button">$</div>
            <div className="rounded-full bg-[#203554] px-4 py-2 text-sm text-[#9bc1ff]">Share</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
          <div>
            <div className="text-sm text-slate-500">Profit</div>
            <div className="mt-1 text-[1.8rem] font-semibold text-white">{`${data.summary.netUnits > 0 ? "+" : ""}${data.summary.netUnits.toFixed(2)}u`}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">ROI</div>
            <div className="mt-1 text-[1.8rem] font-semibold text-white">{`${data.summary.roi > 0 ? "+" : ""}${data.summary.roi.toFixed(2)}%`}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Record</div>
            <div className="mt-1 text-[1.25rem] font-semibold text-white">{data.summary.record}</div>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
          <AreaTrendChart values={chartValues} color="#7ca5d9" />
          <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
            <span>Week</span>
            <span>Month</span>
            <span>Year</span>
            <span className="rounded-full bg-[#394963] px-3 py-1 text-white">All</span>
          </div>
        </div>
      </section>

      <section className="mobile-surface">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[1.35rem] font-semibold text-white">Calendar</div>
          <div className="rounded-full bg-[#203554] px-4 py-2 text-sm text-[#9bc1ff]">Share</div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-sm text-slate-500">
          {['S','M','T','W','T','F','S'].map((item) => <div key={item}>{item}</div>)}
          {buildCalendarCells().map((day) => (
            <div key={day} className={day === 4 ? 'rounded-[16px] bg-[#2d7a44] px-2 py-3 text-white' : 'rounded-[16px] bg-white/[0.02] px-2 py-3 text-slate-400'}>
              <div>{day}</div>
              {day === 4 ? <div className="mt-1 text-xs">$2.06</div> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mobile-surface">
        <div className="text-[1.35rem] font-semibold text-white">Closing Line Value</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[18px] bg-white/[0.03] p-4">
            <div className="text-sm text-slate-500">Average CLV</div>
            <div className="mt-2 text-[1.8rem] font-semibold text-[#ff4f64]">
              {data.summary.averageClv === null ? '--' : `${data.summary.averageClv > 0 ? '+' : ''}${data.summary.averageClv.toFixed(2)}%`}
            </div>
          </div>
          <div className="rounded-[18px] bg-white/[0.03] p-4">
            <div className="text-sm text-slate-500">Beat Close</div>
            <div className="mt-2 text-[1.8rem] font-semibold text-white">
              {data.summary.positiveClvRate === null ? '--' : `${data.summary.positiveClvRate.toFixed(0)}%`}
            </div>
          </div>
        </div>
      </section>

      <section className="mobile-surface">
        <div className="text-[1.35rem] font-semibold text-white">Open tracking</div>
        <div className="mt-4 grid gap-3">
          {ledger.openBets.slice(0, 5).map((bet) => (
            <div key={bet.id} className="rounded-[18px] bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[1rem] font-semibold text-white">{bet.eventLabel ?? bet.selection}</div>
                <div className="text-sm text-slate-500">{bet.context?.confidenceTier ?? 'Open'}</div>
              </div>
              <div className="mt-1 text-sm text-slate-400">{bet.league} · {bet.selection}</div>
            </div>
          ))}
          {!ledger.openBets.length ? <div className="text-sm text-slate-400">No open bets are being tracked right now.</div> : null}
        </div>
      </section>
    </div>
  );
}
