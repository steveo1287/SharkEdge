import { AlertCenter } from "@/components/alerts/alert-center";
import { Card } from "@/components/ui/card";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import { WatchlistWorkspace } from "@/components/watchlist/watchlist-workspace";
import { getAlertsPageData } from "@/services/alerts/alerts-service";
import {
  getBetTrackerData,
  getPerformanceDashboard,
  parseBetFilters
} from "@/services/bets/bets-service";
import {
  getWatchlistPageData,
  parseWatchlistFilters
} from "@/services/watchlist/watchlist-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function Tab({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <a
      href={href}
      className={
        active
          ? "rounded-full border border-aqua/30 bg-aqua/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-aqua"
          : "rounded-full border border-bone/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-bone/50 hover:text-bone/80"
      }
    >
      {label}
    </a>
  );
}

export default async function SavedPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const tab = typeof resolved.tab === "string" ? resolved.tab : "plays";

  const [watchlistData, alertsData, betData, performance] = await Promise.all([
    getWatchlistPageData(parseWatchlistFilters(resolved)),
    getAlertsPageData(),
    getBetTrackerData(parseBetFilters(resolved), undefined, undefined),
    getPerformanceDashboard()
  ]);

  return (
    <div className="grid gap-6">
      {/* Header */}
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-6 xl:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.28em] text-emerald-300">Saved desk</div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white xl:text-4xl">
              Plays, picks, and watchlist in one place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Saved plays stay attached to their live state. Tracked bets carry CLV, result, and timing.
              Alert preferences live here instead of a separate page.
            </p>
          </div>

          <div className="grid gap-3 rounded-[1.7rem] border border-white/10 bg-slate-950/65 p-4 md:grid-cols-2">
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Watchlist</div>
              <div className="mt-2 text-2xl font-semibold text-white">{watchlistData.summary.total}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Open bets</div>
              <div className="mt-2 text-2xl font-semibold text-white">{betData.summary.openBets}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Record</div>
              <div className="mt-2 text-2xl font-semibold text-white">{performance.summary.record}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">CLV rate</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">
                {performance.summary.positiveClvRate === null
                  ? "--"
                  : `${performance.summary.positiveClvRate.toFixed(0)}%`}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Tab strip */}
      <div className="flex flex-wrap gap-2">
        <Tab label="Watchlist" active={tab === "plays" || !tab} href="?tab=plays" />
        <Tab label="Bets"      active={tab === "bets"}           href="?tab=bets" />
        <Tab label="Alerts"    active={tab === "alerts"}         href="?tab=alerts" />
      </div>

      {/* Watchlist tab */}
      {(tab === "plays" || !tab) && (
        <>
          <ResearchStatusNotice
            eyebrow="Workflow beta"
            title="Queue, not a full portfolio system"
            body="The watchlist keeps live state, market context, and linked alerts attached to good angles. It is not a bankroll or portfolio manager."
            meta={`Unavailable rows: ${watchlistData.summary.unavailable}. Limit: ${watchlistData.plan.limits.watchlistItems}.`}
          />
          <SectionTitle title="Saved desk" description="Pinned plays with board state still attached." />
          <WatchlistWorkspace {...watchlistData} />
        </>
      )}

      {/* Bets tab */}
      {tab === "bets" && (
        <>
          <SectionTitle
            title="Bet tracker"
            description="Your tracked picks with CLV, result, and timing."
          />
          <Card className="p-4">
            <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              <select name="status" defaultValue={parseBetFilters(resolved).status} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
                <option value="ALL">All bets</option>
                <option value="OPEN">Open</option>
                <option value="SETTLED">Settled</option>
                <option value="WIN">Wins</option>
                <option value="LOSS">Losses</option>
                <option value="PUSH">Pushes</option>
              </select>
              <select name="league" defaultValue={parseBetFilters(resolved).league} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
                <option value="ALL">All leagues</option>
                {betData.leagues.map((league) => (
                  <option key={league.key} value={league.key}>{league.label}</option>
                ))}
              </select>
              <select name="window" defaultValue={parseBetFilters(resolved).window} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
              <div className="xl:col-span-4 flex justify-end">
                <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300">
                  Apply
                </button>
              </div>
            </form>
          </Card>

          <Card className="p-5">
            <div className="grid gap-3 md:grid-cols-4 text-sm">
              <div>
                <div className="text-slate-500 uppercase tracking-[0.18em] text-[0.68rem]">Record</div>
                <div className="mt-2 text-xl font-semibold text-white">{performance.summary.record}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-[0.18em] text-[0.68rem]">CLV rate</div>
                <div className="mt-2 text-xl font-semibold text-emerald-300">
                  {performance.summary.positiveClvRate === null
                    ? "--"
                    : `${performance.summary.positiveClvRate.toFixed(0)}%`}
                </div>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-[0.18em] text-[0.68rem]">Open</div>
                <div className="mt-2 text-xl font-semibold text-white">{betData.summary.openBets}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase tracking-[0.18em] text-[0.68rem]">Total tracked</div>
                <div className="mt-2 text-xl font-semibold text-white">{betData.summary.totalBets}</div>
              </div>
            </div>
            {betData.summary.totalBets === 0 && (
              <div className="mt-6 rounded-2xl border border-bone/10 bg-surface px-5 py-8 text-center">
                <div className="text-sm text-slate-400">No tracked bets yet.</div>
                <div className="mt-2 text-xs text-slate-500">Add bets from any SimHub pick or board game.</div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Alerts tab */}
      {tab === "alerts" && (
        <>
          <SectionTitle
            title="Alert preferences"
            description="Price movement, line changes, and threshold alerts."
          />
          <AlertCenter {...alertsData} />
        </>
      )}
    </div>
  );
}
