import type { PropMarketType } from "@/lib/types/domain";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { StatCard } from "@/components/ui/stat-card";
import { PropsTable } from "@/components/props/props-table";
import { BOARD_SPORTS } from "@/lib/config/board-sports";
import { formatMarketType } from "@/lib/formatters/odds";
import { parsePropsFilters, getPropsExplorerData } from "@/services/odds/odds-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

export default async function PropsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parsePropsFilters(resolved);
  const data = await getPropsExplorerData(filters);
  const liveCoverageCount = data.coverage.filter((entry: any) => entry.status === "LIVE").length;
  const partialCoverageCount = data.coverage.filter((entry: any) => entry.status === "PARTIAL").length;
  const realBookCount = data.sportsbooks.length;

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Props Explorer"
        description="Every target sport is visible in the filter model. Real prop rows only render where a real market adapter exists, and unsupported sports stay visible with explicit provider states."
      />

      <Card className="p-4 text-sm leading-7 text-slate-400">{data.sourceNote}</Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live Props"
          value={`${data.props.length}`}
          note="Rows currently matching this real filter set"
        />
        <StatCard
          label="Coverage Live"
          value={`${liveCoverageCount}`}
          note="Sports with a real prop adapter"
        />
        <StatCard
          label="Coverage Partial"
          value={`${partialCoverageCount}`}
          note="Visible in the filter model without fake rows"
        />
        <StatCard
          label="Books"
          value={`${realBookCount}`}
          note={data.source === "live" ? "Books represented in the returned rows" : "Live book count returns once a prop adapter responds"}
        />
      </div>

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select
            name="league"
            defaultValue={filters.league}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="ALL">All sports</option>
            {BOARD_SPORTS.map((sport) => (
              <option key={sport.leagueKey} value={sport.leagueKey}>
                {sport.leagueLabel}
              </option>
            ))}
          </select>
          <select
            name="marketType"
            defaultValue={filters.marketType}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="ALL">All supported markets</option>
            <option value="player_points">Player Points</option>
            <option value="player_rebounds">Player Rebounds</option>
            <option value="player_assists">Player Assists</option>
            <option value="player_threes">Player Threes</option>
            <option value="fight_winner">Fight Winner</option>
            <option value="method_of_victory">Method of Victory</option>
            <option value="round_total">Round Total</option>
            <option value="round_winner">Round Winner</option>
          </select>
          <select
            name="team"
            defaultValue={filters.team}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="all">All teams / camps</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.abbreviation}
              </option>
            ))}
          </select>
          <select
            name="player"
            defaultValue={filters.player}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="all">All players / fighters</option>
            {data.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <select
            name="sportsbook"
            defaultValue={filters.sportsbook}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="all">All books</option>
            {data.sportsbooks.map((book) => (
              <option key={book.id} value={book.key}>
                {book.name}
              </option>
            ))}
          </select>
          <select
            name="valueFlag"
            defaultValue={filters.valueFlag}
            className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
          >
            <option value="all">All value states</option>
            <option value="BEST_PRICE">Best Price</option>
            <option value="MARKET_PLUS">Market Plus</option>
            <option value="STEAM">Steam</option>
          </select>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <select
              name="sortBy"
              defaultValue={filters.sortBy}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="best_price">Best Price</option>
              <option value="market_ev">Market EV</option>
              <option value="edge_score">Edge Score</option>
              <option value="line_movement">Line Movement</option>
              <option value="league">League</option>
              <option value="start_time">Event</option>
            </select>
            <button
              type="submit"
              className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300"
            >
              Apply
            </button>
          </div>
        </form>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.coverage.map((entry: any) => (
          <Card key={entry.leagueKey} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Props</div>
                <div className="mt-2 font-display text-2xl font-semibold text-white">
                  {BOARD_SPORTS.find((sport) => sport.leagueKey === entry.leagueKey)?.leagueLabel ??
                    entry.leagueKey}
                </div>
              </div>
              <Badge tone={getTone(entry.status)}>{entry.status}</Badge>
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-400">{entry.note}</div>
            <div className="mt-3 text-xs leading-6 text-slate-500">
              {entry.supportedMarkets.length
                ? entry.supportedMarkets
                    .map((market: PropMarketType) => formatMarketType(market))
                    .join(", ")
                : "No real prop markets wired yet."}
            </div>
          </Card>
        ))}
      </div>

      {data.props.length ? (
        <PropsTable props={data.props} />
      ) : (
        <EmptyState
          title="No real props match this filter set"
          description="That can mean the selected sport is PARTIAL or COMING SOON, or the current live props adapter does not have markets for this player, team, book, or market combination."
        />
      )}
    </div>
  );
}
