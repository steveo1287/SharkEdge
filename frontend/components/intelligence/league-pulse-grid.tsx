import Link from "next/link";

import { LeagueBadge } from "@/components/identity/league-badge";
import { TeamBadge } from "@/components/identity/team-badge";
import { MetricBarChart } from "@/components/charts/metric-bar-chart";
import { MiniHistoryChart } from "@/components/charts/mini-history-chart";
import type { LeagueSnapshotView } from "@/lib/types/domain";
import { getLeagueLogoUrl, getTeamLogoUrl } from "@/lib/utils/team-branding";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "TBD";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatGameResult(snapshot: LeagueSnapshotView["previousGames"][number]) {
  return `${snapshot.awayTeam.abbreviation} ${snapshot.awayScore} - ${snapshot.homeScore} ${snapshot.homeTeam.abbreviation}`;
}

type LeaguePulseGridProps = {
  snapshots: LeagueSnapshotView[];
  title?: string;
  subtitle?: string;
};

export function LeaguePulseGrid({
  snapshots,
  title = "League pulse",
  subtitle = "Standings, scores, recent history, and live context"
}: LeaguePulseGridProps) {
  if (!snapshots.length) {
    return null;
  }

  return (
    <section className="surface-panel-strong overflow-hidden px-5 py-5 lg:px-6 lg:py-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="section-kicker">{title}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-white">Deep slate context</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {snapshots.length} leagues loaded
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {snapshots.map((snapshot) => {
          const standings = snapshot.standings.slice(0, 5);
          const featured = snapshot.featuredGames?.slice(0, 4) ?? [];
          const previousGames = snapshot.previousGames.slice(0, 5);
          const news = snapshot.newsItems?.slice(0, 3) ?? [];
          const recentMargins = previousGames.map((game) => Math.abs(game.homeScore - game.awayScore));

          return (
            <article key={snapshot.league.key} className="overflow-hidden rounded-[1.5rem] border border-white/8 bg-[linear-gradient(180deg,rgba(11,20,33,.96),rgba(8,14,24,.92))]">
              <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <LeagueBadge league={snapshot.league.key} logoUrl={getLeagueLogoUrl(snapshot.league.key)} size="lg" />
                  <div>
                    <div className="text-lg font-semibold tracking-tight text-white">{snapshot.league.name}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {snapshot.note ?? snapshot.sourceLabel ?? "Live context"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  <div className="rounded-full border border-white/8 px-3 py-1.5">
                    {snapshot.seasonState === "OFFSEASON" ? "Offseason" : "Active"}
                  </div>
                  <div className="rounded-full border border-white/8 px-3 py-1.5">
                    {featured.length} live / upcoming
                  </div>
                  <div className="rounded-full border border-white/8 px-3 py-1.5">
                    {previousGames.length} recent finals
                  </div>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.08fr,.92fr]">
                <div className="grid gap-4">
                  <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Standings</div>
                        <div className="mt-1 text-base font-semibold text-white">Top teams right now</div>
                      </div>
                      <div className="text-xs text-slate-500">Net rating graph</div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr,1.05fr]">
                      <div className="grid gap-2">
                        {standings.map((row) => (
                          <div key={`${snapshot.league.key}-${row.team.id}`} className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-slate-950/40 px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-xs font-semibold text-slate-300">
                                {row.rank}
                              </div>
                              <TeamBadge
                                name={row.team.name}
                                abbreviation={row.team.abbreviation}
                                logoUrl={getTeamLogoUrl(row.team, snapshot.league.key)}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-white">{row.team.name}</div>
                                <div className="text-xs text-slate-500">{row.record} · {row.streak}</div>
                              </div>
                            </div>
                            <div className="text-sm font-semibold text-emerald-300">{row.netRating >= 0 ? "+" : ""}{row.netRating.toFixed(1)}</div>
                          </div>
                        ))}
                      </div>

                      <MetricBarChart
                        items={standings.map((row) => ({
                          label: row.team.abbreviation,
                          value: row.netRating,
                          hint: `${row.record} · ${row.streak}`
                        }))}
                        valueFormatter={(value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`}
                      />
                    </div>
                  </div>

                  <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Recent game history</div>
                        <div className="mt-1 text-base font-semibold text-white">Scoring margin tape</div>
                      </div>
                      <div className="text-xs text-slate-500">Last {previousGames.length || 0} finals</div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[1.05fr,.95fr]">
                      <div className="grid gap-2">
                        {previousGames.length ? previousGames.map((game) => (
                          <div key={game.id} className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3 text-sm text-white">
                              <span>{formatGameResult(game)}</span>
                              <span className="text-xs text-slate-500">{formatDateTime(game.playedAt)}</span>
                            </div>
                          </div>
                        )) : (
                          <div className="rounded-[1rem] border border-dashed border-white/10 bg-slate-950/25 px-4 py-4 text-sm text-slate-500">
                            Recent completed-game history is not available for this league right now.
                          </div>
                        )}
                      </div>

                      <div className="rounded-[1rem] border border-white/8 bg-slate-950/30 p-3">
                        <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Margin graph</div>
                        <div className="h-20 w-full">
                          <MiniHistoryChart values={recentMargins} height={78} />
                        </div>
                        <div className="mt-2 text-xs leading-5 text-slate-500">
                          Higher peaks indicate wider scoring margins in the recent completed sample.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Featured games</div>
                    <div className="mt-1 text-base font-semibold text-white">Live and upcoming scoreboard</div>
                    <div className="mt-4 grid gap-2">
                      {featured.length ? featured.map((game) => (
                        <Link key={game.id} href={game.href} className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]">
                          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            <span>{game.status}</span>
                            <span>{formatDateTime(game.startTime)}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-3 text-sm text-white">
                            <span>{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</span>
                            <span className="text-slate-400">
                              {game.awayScore ?? "-"} : {game.homeScore ?? "-"}
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">{game.stateDetail ?? "Game detail and odds desk"}</div>
                        </Link>
                      )) : (
                        <div className="rounded-[1rem] border border-dashed border-white/10 bg-slate-950/25 px-4 py-4 text-sm text-slate-500">
                          No featured games are available for this league window.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">News and storylines</div>
                    <div className="mt-1 text-base font-semibold text-white">What is moving the league</div>
                    <div className="mt-4 grid gap-2">
                      {news.length ? news.map((item) => (
                        <Link
                          key={item.id}
                          href={item.eventHref ?? item.href ?? "#"}
                          className="rounded-[1rem] border border-white/8 bg-slate-950/35 px-3 py-3 transition hover:border-sky-400/25 hover:bg-sky-500/[0.04]"
                        >
                          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            {item.category ?? snapshot.league.key} · {formatDateTime(item.publishedAt)}
                          </div>
                          <div className="mt-2 text-sm font-semibold text-white">{item.title}</div>
                          <div className="mt-2 text-xs leading-5 text-slate-400">{item.summary ?? "Open the story for the latest league context."}</div>
                        </Link>
                      )) : (
                        <div className="rounded-[1rem] border border-dashed border-white/10 bg-slate-950/25 px-4 py-4 text-sm text-slate-500">
                          No provider-backed league news was returned for this league right now.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
