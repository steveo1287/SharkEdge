import Link from "next/link";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";

export const dynamic = "force-dynamic";

// Production: 2026-04-18T14:00:00Z - LIVE BOARD REDESIGN

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};

  const data = await getBoardPageData(
    parseBoardFilters({
      league: resolvedSearch.league ?? "ALL",
      date: resolvedSearch.date ?? "today",
      status: resolvedSearch.status ?? "all"
    })
  );

  const games = data.games || [];

  return (
    <div className="min-h-screen bg-ink">
      {/* Header */}
      <div className="border-b border-bone/10 bg-surface/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="page-shell py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-[32px] font-bold text-text-primary">
                Live Odds Board
              </h1>
              <p className="text-bone/60 text-sm mt-1">
                {games.length} games • Real-time odds from {data.sportsbooks.length} books
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-bone/10 bg-surface">
                <span className="live-dot animate-pulse" />
                <span className="text-xs font-semibold uppercase text-mint">Live</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Games Grid */}
      <div className="page-shell py-8">
        {games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="text-center">
              <p className="text-bone/50 text-lg mb-2">No games available</p>
              <p className="text-bone/30 text-sm">Check back later for live odds</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/game/${game.id}`}
                className="group relative bg-surface border border-bone/10 rounded-lg p-4 hover:border-aqua/50 hover:bg-surface/80 transition-all duration-200 cursor-pointer"
              >
                {/* Game Header */}
                <div className="mb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="text-xs font-semibold uppercase text-bone/50 mb-1">
                        {game.leagueKey}
                      </div>
                      <div className="font-display font-bold text-text-primary group-hover:text-aqua transition-colors">
                        <div className="text-sm">{game.awayTeam.name}</div>
                        <div className="text-xs text-bone/60 my-1">@</div>
                        <div className="text-sm">{game.homeTeam.name}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-2 py-1 bg-aqua/10 text-aqua text-xs font-semibold rounded">
                        {game.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Markets Grid */}
                <div className="space-y-3 border-t border-bone/10 pt-4">
                  {/* Moneyline */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-bone/50">ML</div>
                      <div className="text-xs text-bone/70">{game.moneyline.bestBook}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-mint">
                        {game.moneyline.bestOdds ? (
                          <>
                            {game.moneyline.bestOdds > 0 ? "+" : ""}
                            {game.moneyline.bestOdds}
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                      {game.moneyline.movement !== 0 && (
                        <div className="text-[10px] text-bone/50 mt-0.5">
                          {game.moneyline.movement > 0 ? "↑" : "↓"} {Math.abs(game.moneyline.movement).toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Spread */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-bone/50">Spread</div>
                      <div className="text-xs text-bone/70">{game.spread.bestBook}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold">
                        {game.spread.lineLabel || "—"}
                      </div>
                      {game.spread.movement !== 0 && (
                        <div className="text-[10px] text-bone/50 mt-0.5">
                          {game.spread.movement > 0 ? "↑" : "↓"} {Math.abs(game.spread.movement).toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-bone/50">Total</div>
                      <div className="text-xs text-bone/70">{game.total.bestBook}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-aqua">
                        {game.total.lineLabel || "—"}
                      </div>
                      {game.total.movement !== 0 && (
                        <div className="text-[10px] text-bone/50 mt-0.5">
                          {game.total.movement > 0 ? "↑" : "↓"} {Math.abs(game.total.movement).toFixed(1)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-4 pt-3 border-t border-bone/10 text-[10px] text-bone/40 flex items-center justify-between">
                  <span>Click to view details</span>
                  <span className="group-hover:text-aqua transition-colors">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
