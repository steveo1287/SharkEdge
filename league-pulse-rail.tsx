import Link from "next/link";

import type { LeagueSnapshotView } from "@/lib/types/domain";
import { formatCompactDate, formatCompactTime, getLeagueGradient, getTeamInitials, getTeamLogoUrl } from "@/lib/utils/team-branding";

type LeaguePulseRailProps = {
  snapshots: LeagueSnapshotView[];
};

function TeamAvatar({ team, leagueKey }: { team: LeagueSnapshotView["standings"][number]["team"]; leagueKey: LeagueSnapshotView["league"]["key"] }) {
  const logo = getTeamLogoUrl(team, leagueKey);
  if (logo) {
    return <img src={logo} alt={team.abbreviation} className="h-8 w-8 rounded-full object-contain" />;
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[0.62rem] font-semibold text-slate-200">
      {getTeamInitials(team)}
    </div>
  );
}

export function LeaguePulseRail({ snapshots }: LeaguePulseRailProps) {
  if (!snapshots.length) return null;

  return (
    <section className="grid gap-4 xl:grid-cols-3">
      {snapshots.slice(0, 3).map((snapshot) => (
        <article key={snapshot.league.key} className={`surface-panel overflow-hidden p-4 bg-gradient-to-br ${getLeagueGradient(snapshot.league.key)}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">League pulse</div>
              <h2 className="mt-1 text-xl font-semibold text-white">{snapshot.league.key}</h2>
            </div>
            <Link href={`/leagues/${snapshot.league.key.toLowerCase()}`} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-sky-400/25">
              Open desk
            </Link>
          </div>

          <div className="mt-4 grid gap-4">
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Top of table</div>
              <div className="mt-3 grid gap-2">
                {snapshot.standings.slice(0, 4).map((row) => (
                  <div key={row.team.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-slate-950/35 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="text-sm font-semibold text-slate-500">#{row.rank}</div>
                      <TeamAvatar team={row.team} leagueKey={snapshot.league.key} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{row.team.name}</div>
                        <div className="text-xs text-slate-400">{row.record} · {row.streak}</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-sky-200">{row.netRating > 0 ? "+" : ""}{row.netRating.toFixed(1)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Recent results</div>
              <div className="mt-3 grid gap-2">
                {snapshot.previousGames.slice(0, 3).map((game) => (
                  <Link key={game.id} href={`/game/${game.id}`} className="rounded-2xl border border-white/8 bg-slate-950/35 px-3 py-3 transition hover:border-sky-400/20 hover:bg-slate-950/50">
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                      <span>{formatCompactDate(game.playedAt)}</span>
                      <span>{formatCompactTime(game.playedAt)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
                      <span>{game.awayTeam.abbreviation} {game.awayScore}</span>
                      <span className="text-slate-500">@</span>
                      <span>{game.homeTeam.abbreviation} {game.homeScore}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {snapshot.newsItems?.length ? (
              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Storyline</div>
                <div className="mt-3 rounded-2xl border border-white/8 bg-slate-950/35 p-3">
                  <div className="text-sm font-semibold text-white">{snapshot.newsItems[0]?.title}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">{snapshot.newsItems[0]?.summary ?? snapshot.note ?? "League context is loading."}</div>
                </div>
              </div>
            ) : snapshot.note ? (
              <div className="rounded-2xl border border-white/8 bg-slate-950/35 p-3 text-sm leading-6 text-slate-300">
                {snapshot.note}
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}
