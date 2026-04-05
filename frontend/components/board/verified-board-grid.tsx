import { GameCard } from "@/components/board/game-card";
import type { GameCardView } from "@/lib/types/domain";

type Props = {
  games: GameCardView[];
};

export function VerifiedBoardGrid({ games }: Props) {
  if (!games.length) {
    return (
      <div className="text-center text-slate-400">
        No verified games right now
      </div>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {games.map((g) => (
        <GameCard key={g.id} game={g} focusMarket="best" />
      ))}
    </section>
  );
}