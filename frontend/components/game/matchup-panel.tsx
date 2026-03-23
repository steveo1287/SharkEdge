import { Card } from "@/components/ui/card";
import type { GameDetailView } from "@/lib/types/domain";

type MatchupPanelProps = {
  detail: GameDetailView;
};

export function MatchupPanel({ detail }: MatchupPanelProps) {
  const keys = [
    "pace",
    "offensiveRating",
    "defensiveRating",
    "recentForm",
    "split",
    "atsLast10"
  ];

  return (
    <Card className="p-5">
      <div className="grid gap-4">
        {keys.map((key) => (
          <div
            key={key}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-line bg-slate-950/65 px-4 py-3"
          >
            <div className="text-sm text-slate-300">{String(detail.matchup.away.stats[key])}</div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{key}</div>
            <div className="text-right text-sm text-slate-300">
              {String(detail.matchup.home.stats[key])}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
