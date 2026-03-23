import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { PropsTable } from "@/components/props/props-table";
import { parsePropsFilters, getPropsExplorerData } from "@/services/odds/odds-service";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parsePropsFilters(resolved);
  const data = getPropsExplorerData(filters);

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Props Explorer"
        description="Filter player markets across NBA and NCAAB without losing the board context."
      />

      <Card className="p-4">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select name="league" defaultValue={filters.league} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All leagues</option>
            <option value="NBA">NBA</option>
            <option value="NCAAB">NCAAB</option>
          </select>
          <select name="marketType" defaultValue={filters.marketType} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All prop types</option>
            <option value="player_points">Points</option>
            <option value="player_rebounds">Rebounds</option>
            <option value="player_assists">Assists</option>
            <option value="player_threes">3PM</option>
          </select>
          <select name="team" defaultValue={filters.team} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All teams</option>
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.abbreviation}
              </option>
            ))}
          </select>
          <select name="player" defaultValue={filters.player} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All players</option>
            {data.players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
          <select name="sportsbook" defaultValue={filters.sportsbook} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All books</option>
            {data.sportsbooks.map((book) => (
              <option key={book.id} value={book.key}>
                {book.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
            <input name="minEdge" defaultValue={filters.minEdge} placeholder="Min edge" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white" />
            <input name="minHitRate" defaultValue={filters.minHitRate} placeholder="Min hit %" className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white" />
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300">
              Apply
            </button>
          </div>
        </form>
      </Card>

      {data.props.length ? (
        <PropsTable props={data.props} />
      ) : (
        <EmptyState title="No props match this filter set" description="Try lowering the edge or hit-rate threshold, or widen the team / player filter." />
      )}
    </div>
  );
}
