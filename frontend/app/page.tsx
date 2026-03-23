import { BoardFilterBar } from "@/components/board/filter-bar";
import { GameCard } from "@/components/board/game-card";
import { LeagueSnapshot } from "@/components/board/league-snapshot";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { StatCard } from "@/components/ui/stat-card";
import { parseBoardFilters, getBoardPageData } from "@/services/odds/odds-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBoardFilters(resolved);
  const data = await getBoardPageData(filters);
  const gamesByLeague = data.games.reduce<Record<string, typeof data.games>>((groups, game) => {
    groups[game.leagueKey] = [...(groups[game.leagueKey] ?? []), game];
    return groups;
  }, {});
  const leagueOrder = filters.league === "ALL" ? ["NCAAB", "NBA"] : [filters.league];

  return (
    <div className="grid gap-6">
      <SectionTitle
        title="Pregame market board"
        description={
          data.source === "live"
            ? "Live pregame pricing is flowing in for the full NBA and NCAA men's basketball slate. Use it to scan books and context faster, not to promise guaranteed winners."
            : "A sharp, premium read on current NBA and NCAAB pricing, with standings and previous results layered in for context."
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Games" value={`${data.summary.totalGames}`} note="Current filtered board" />
        <StatCard label="Props" value={`${data.summary.totalProps}`} note="Basic player prop coverage" />
        <StatCard label="Books" value={`${data.summary.totalSportsbooks}`} note="Major U.S. books" />
        <StatCard
          label="Mode"
          value={data.source === "live" ? "Live odds" : filters.status === "live" ? "Live preview" : "Pregame"}
          note={data.sourceNote}
        />
      </div>

      <BoardFilterBar
        leagues={data.leagues}
        sportsbooks={data.sportsbooks}
        dates={data.availableDates}
        defaults={filters}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {data.snapshots.map((snapshot) => (
          <LeagueSnapshot key={snapshot.league.id} snapshot={snapshot} />
        ))}
      </div>

      {data.liveMessage ? (
        <EmptyState title="Live board coming next" description={data.liveMessage} />
      ) : null}

      {data.games.length ? (
        <div className="grid gap-6">
          {leagueOrder.map((leagueKey) =>
            gamesByLeague[leagueKey]?.length ? (
              <section key={leagueKey} className="grid gap-4">
                <SectionTitle
                  title={`${leagueKey} Slate`}
                  description={`${gamesByLeague[leagueKey].length} current games on the board.`}
                />
                <div className="grid gap-4 2xl:grid-cols-2">
                  {gamesByLeague[leagueKey].map((game) => (
                    <GameCard key={game.id} game={game} focusMarket={filters.market} />
                  ))}
                </div>
              </section>
            ) : null
          )}
        </div>
      ) : (
        <EmptyState
          title="No games match these filters"
          description="Try widening the date, league, or sportsbook filter to bring more of the board back in."
        />
      )}
    </div>
  );
}
