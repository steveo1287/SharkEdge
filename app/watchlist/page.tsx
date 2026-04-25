import { SectionTitle } from "@/components/ui/section-title";
import { Card } from "@/components/ui/card";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { WatchlistWorkspace } from "@/components/watchlist/watchlist-workspace";
import {
  getWatchlistPageData,
  parseWatchlistFilters
} from "@/services/watchlist/watchlist-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WatchlistPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseWatchlistFilters(resolved);
  const data = await getWatchlistPageData(filters);

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_32%),linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.94))] p-0 shadow-[0_28px_90px_rgba(2,6,23,0.42)]">
        <div className="grid gap-5 px-6 py-6 md:px-8 lg:grid-cols-[minmax(0,1.15fr)_280px] lg:items-end">
          <div className="grid gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-300/80">
              Saved desk
            </div>
            <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Keep the good angles without losing the board context around them.
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              Saved plays, props, trends, and matchup looks stay attached to their live state, market,
              and timing so your next move is still grounded in the actual desk.
            </p>
          </div>
          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4">
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Queue</div>
            <div className="grid gap-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Plays</span>
                <span className="text-white">{data.summary.total}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Live / upcoming</span>
                <span className="text-white">
                  {data.summary.live} / {data.summary.upcoming}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-slate-950/70 px-4 py-3">
                <span>Plan</span>
                <span className="text-white">{data.plan.statusLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <ResearchStatusNotice
        eyebrow="Workflow beta"
        title="Useful queue, not a finished portfolio system"
        body="The watchlist is strongest as a saved-action desk. It keeps live state, market context, and linked alerts attached to good angles, but it is not pretending to be a full bankroll or portfolio manager yet."
        meta={`Unavailable rows: ${data.summary.unavailable}. Watchlist limit on this plan: ${data.plan.limits.watchlistItems}.`}
      />

      <SectionTitle
        title="Watchlist filters"
        description="Trim the desk down by sport, league, market, and live state without breaking the saved context."
      />

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select name="sport" defaultValue={filters.sport} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All sports</option>
            <option value="BASKETBALL">Basketball</option>
            <option value="BASEBALL">Baseball</option>
            <option value="HOCKEY">Hockey</option>
            <option value="FOOTBALL">Football</option>
            <option value="MMA">UFC</option>
            <option value="BOXING">Boxing</option>
          </select>
          <select name="league" defaultValue={filters.league} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All leagues</option>
            <option value="NBA">NBA</option>
            <option value="MLB">MLB</option>
            <option value="NHL">NHL</option>
            <option value="NFL">NFL</option>
            <option value="NCAAF">NCAAF</option>
            <option value="UFC">UFC</option>
            <option value="BOXING">Boxing</option>
          </select>
          <select name="market" defaultValue={filters.market} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All markets</option>
            <option value="spread">Spread</option>
            <option value="moneyline">Moneyline</option>
            <option value="total">Total</option>
            <option value="player_points">Player Points</option>
            <option value="player_rebounds">Player Rebounds</option>
            <option value="player_assists">Player Assists</option>
            <option value="player_threes">Player Threes</option>
            <option value="fight_winner">Fight Winner</option>
            <option value="method_of_victory">Method of Victory</option>
            <option value="round_total">Round Total</option>
            <option value="round_winner">Round Winner</option>
          </select>
          <select name="liveStatus" defaultValue={filters.liveStatus} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All states</option>
            <option value="live">Live</option>
            <option value="upcoming">Upcoming</option>
            <option value="final">Final</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <select name="status" defaultValue={filters.status} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300">
              Apply
            </button>
          </div>
        </form>
      </Card>

      <SectionTitle title="Saved desk" description="Everything you pinned, with its board state still attached." />

      <WatchlistWorkspace {...data} />
    </div>
  );
}
