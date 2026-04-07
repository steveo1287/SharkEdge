import { BoardHero } from "@/components/board/board-hero";
import { BoardSummaryStrip } from "@/components/board/board-summary-strip";
import { LeagueDeskGrid } from "@/components/board/league-desk-grid";
import { MarketMoversPanel } from "@/components/board/market-movers-panel";
import { ScoreboardContextGrid } from "@/components/board/scoreboard-context-grid";
import { VerifiedBoardGrid } from "@/components/board/verified-board-grid";
import {
  BOARD_DATE_ITEMS,
  BOARD_LEAGUE_ITEMS,
  getBoardCommandData
} from "@/services/board/board-command-service";

export const dynamic = "force-dynamic";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const board = await getBoardCommandData(resolvedSearch);

  return (
    <div className="grid gap-8">
      <BoardHero
        selectedLeague={board.selectedLeague}
        selectedDate={board.selectedDate}
        leagues={BOARD_LEAGUE_ITEMS}
        dates={BOARD_DATE_ITEMS}
      />

      <BoardSummaryStrip
        verifiedCount={board.verifiedGames.length}
        totalGames={board.boardData.summary.totalGames}
        sportsbooks={board.boardData.summary.totalSportsbooks}
        freshness={board.boardData.providerHealth.freshnessLabel}
      />

      <VerifiedBoardGrid games={board.verifiedGames} />

      <MarketMoversPanel games={board.movers} />

      <LeagueDeskGrid sections={board.leagueSections} />

      <ScoreboardContextGrid items={board.scoreboardItems} />
    </div>
  );
}