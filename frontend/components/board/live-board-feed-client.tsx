"use client";

import { useMemo, useState } from "react";

import { HighConvictionToggle } from "@/components/board/high-conviction-toggle";
import { LiveEdgeBoardCardShell } from "@/components/board/live-edge-board-card-shell";

type BoardFeedGame = {
  id: string;
  detailHref?: string | null;
  startTime: string;
  leagueKey: string;
  venue?: string | null;
  awayTeam: { abbreviation: string };
  homeTeam: { abbreviation: string };
  spread: { lineLabel: string; bestBook?: string | null };
  moneyline: { lineLabel: string };
  total: { lineLabel: string };
  edgeScore: { score: number };
  qualification?: { isWinnerMarketQualified?: boolean; targetWinnerAccuracy?: number };
  scoringBlend?: { degradedFactorBucketPenalty?: number };
};

export function LiveBoardFeedClient({ games }: { games: BoardFeedGame[] }) {
  const [highConvictionOnly, setHighConvictionOnly] = useState(false);

  const sortedGames = useMemo(() => {
    return [...games].sort((left, right) => {
      const leftQualified = left.qualification?.isWinnerMarketQualified ? 1 : 0;
      const rightQualified = right.qualification?.isWinnerMarketQualified ? 1 : 0;
      const leftPenalty = left.scoringBlend?.degradedFactorBucketPenalty ?? 0;
      const rightPenalty = right.scoringBlend?.degradedFactorBucketPenalty ?? 0;

      if (rightQualified !== leftQualified) {
        return rightQualified - leftQualified;
      }

      if (leftPenalty !== rightPenalty) {
        return leftPenalty - rightPenalty;
      }

      return right.edgeScore.score - left.edgeScore.score;
    });
  }, [games]);

  const visibleGames = useMemo(() => {
    if (!highConvictionOnly) {
      return sortedGames;
    }
    return sortedGames.filter((game) => game.qualification?.isWinnerMarketQualified);
  }, [highConvictionOnly, sortedGames]);

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Board controls</div>
          <div className="mt-1 text-sm text-slate-400">
            Prioritize qualified winner picks and de-emphasize downgraded factor buckets.
          </div>
        </div>
        <HighConvictionToggle checked={highConvictionOnly} onChange={setHighConvictionOnly} />
      </div>

      <div className="grid gap-4">
        {visibleGames.map((game) => (
          <LiveEdgeBoardCardShell key={game.id} game={game as never} />
        ))}

        {!visibleGames.length ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-400">
            No plays match the current conviction filter.
          </div>
        ) : null}
      </div>
    </section>
  );
}
