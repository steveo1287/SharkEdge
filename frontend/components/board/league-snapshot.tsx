import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueSnapshotView } from "@/lib/types/domain";
import { formatLongDate } from "@/lib/formatters/date";

type LeagueSnapshotProps = {
  snapshot: LeagueSnapshotView;
};

export function LeagueSnapshot({ snapshot }: LeagueSnapshotProps) {
  return (
    <Card className="p-5">
      <SectionTitle
        title={`${snapshot.league.key} Pulse`}
        description="Standings and previous results styled more like a serious league hub than a raw odds page."
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="grid gap-3">
          {snapshot.standings.slice(0, 4).map((row) => (
            <div
              key={row.team.id}
              className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-2xl border border-line bg-slate-950/65 px-4 py-3"
            >
              <div className="font-display text-xl text-slate-300">{row.rank}</div>
              <div>
                <div className="font-medium text-white">{row.team.name}</div>
                <div className="text-sm text-slate-400">{row.record}</div>
              </div>
              <div className="text-sm text-slate-400">{row.streak}</div>
              <div className="text-sm font-medium text-emerald-300">
                {row.netRating > 0 ? "+" : ""}
                {row.netRating.toFixed(1)}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-3">
          {snapshot.previousGames.map((game) => (
            <div
              key={game.id}
              className="rounded-2xl border border-line bg-slate-950/65 px-4 py-3"
            >
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {formatLongDate(game.playedAt)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                <div className="text-slate-300">
                  {game.awayTeam.abbreviation} <span className="text-white">{game.awayScore}</span>
                </div>
                <div className="text-slate-300">
                  {game.homeTeam.abbreviation} <span className="text-white">{game.homeScore}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
