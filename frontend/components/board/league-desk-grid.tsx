import { Card } from "@/components/ui/card";
import Link from "next/link";
import type { BoardSportSectionView } from "@/lib/types/domain";

type Props = {
  sections: BoardSportSectionView[];
};

export function LeagueDeskGrid({ sections }: Props) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {sections.map((s) => (
        <Card key={s.leagueKey} className="surface-panel p-5">
          <div className="text-white text-xl">{s.leagueLabel}</div>

          <div className="text-slate-400 mt-2">
            Games: {s.games.length}
          </div>

          <Link
            href={`/leagues/${s.leagueKey}`}
            className="text-sky-400 mt-3 inline-block"
          >
            Open league →
          </Link>
        </Card>
      ))}
    </section>
  );
}