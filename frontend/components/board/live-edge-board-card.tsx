import Link from "next/link";

import { SharkScoreRing } from "@/components/branding/shark-score-ring";
import type { GameCardView } from "@/lib/types/domain";

export function LiveEdgeBoardCard({ game }: { game: GameCardView }) {
  return (
    <Link href={game.detailHref ?? `/game/${game.id}`} className="mobile-board-card">
      <div className="grid grid-cols-[auto_1fr] gap-4">
        <SharkScoreRing score={game.edgeScore.score} size="sm" tone={game.edgeScore.score >= 65 ? "success" : game.edgeScore.score >= 45 ? "warning" : "brand"} />
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{game.leagueKey}</div>
            <div className="text-[11px] text-slate-500">
              {new Date(game.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <div className="text-[1rem] font-semibold text-white">{game.awayTeam.abbreviation} vs {game.homeTeam.abbreviation}</div>
              <div className="mt-1 text-[12px] text-slate-500">{game.venue}</div>
            </div>
            <div className="text-right">
              <div className="text-[1.2rem] font-semibold text-[#48e0d2]">
                {game.spread.lineLabel}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">{game.spread.bestBook}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
            <div>
              <div className="text-slate-500">Best EV</div>
              <div className="mt-1 font-semibold text-[#48e0d2]">{game.spread.lineLabel}</div>
            </div>
            <div>
              <div className="text-slate-500">{game.awayTeam.abbreviation}</div>
              <div className="mt-1 font-semibold text-white">{game.moneyline.lineLabel}</div>
            </div>
            <div>
              <div className="text-slate-500">{game.homeTeam.abbreviation}</div>
              <div className="mt-1 font-semibold text-white">{game.total.lineLabel}</div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

