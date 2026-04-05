import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameCardView } from "@/lib/types/domain";

import { GameCard } from "./game-card";

type Props = {
  games: GameCardView[];
};

export function VerifiedBoardGrid({ games }: Props) {
  return (
    <section className="grid gap-4">
      <SectionTitle
        eyebrow="Verified board"
        title={games.length ? "Open these matchups first" : "No verified rows right now"}
        description={
          games.length
            ? "The board leads with games that still deserve attention now."
            : "The desk stays honest until stronger price coverage comes through."
        }
      />

      {games.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {games.map((game) => (
            <GameCard key={game.id} game={game} focusMarket="best" />
          ))}
        </div>
      ) : (
        <EmptyState
          eyebrow="Verified board"
          title="No matchup is strong enough to lead the page yet"
          description="The board is live, but SharkEdge is not going to fake conviction."
        />
      )}
    </section>
  );
}