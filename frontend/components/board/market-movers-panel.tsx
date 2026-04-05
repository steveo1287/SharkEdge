import { Card } from "@/components/ui/card";
import type { GameCardView } from "@/lib/types/domain";
import Link from "next/link";

type Props = {
  games: GameCardView[];
};

export function MarketMoversPanel({ games }: Props) {
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {games.map((g) => (
        <Card key={g.id} className="surface-panel p-5">
          <div className="text-sm text-slate-400">
            {g.awayTeam.abbreviation} @ {g.homeTeam.abbreviation}
          </div>

          <div className="text-white text-xl mt-2">
            Movement: {g.spread.movement}
          </div>

          <Link
            href={`/game/${g.id}`}
            className="mt-4 inline-block text-sky-400"
          >
            Open matchup →
          </Link>
        </Card>
      ))}
    </section>
  );
}