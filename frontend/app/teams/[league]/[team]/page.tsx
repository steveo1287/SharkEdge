import Link from "next/link";
import { notFound } from "next/navigation";

import { LeagueBadge } from "@/components/identity/league-badge";
import { TeamBadge } from "@/components/identity/team-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    league: string;
    team: string;
  }>;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesTeam(teamName: string, slug: string) {
  const a = normalize(teamName);
  const b = normalize(slug);
  return a === b || a.includes(b) || b.includes(a);
}

function deriveAbbreviation(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .slice(0, 3)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getStatusTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  if (status === "POSTPONED" || status === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

function MetricTile({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="surface-panel-muted px-4 py-4">
      <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </Card>
  );
}

export default async function TeamPage({ params }: PageProps) {
  const { league, team } = await params;
  const leagueKey = league.toUpperCase();

  const snapshots = await getLeagueSnapshots(leagueKey as any);
  const snapshot = snapshots[0] ?? null;

  if (!snapshot) {
    notFound();
  }

  const standingEntry = snapshot.standings.find((entry) => matchesTeam(entry.team.name, team)) ?? null;

  const discoveredTeam =
    standingEntry?.team ??
    snapshot.featuredGames
      .flatMap((game) => [game.homeTeam, game.awayTeam])
      .find((entry) => matchesTeam(entry.name, team)) ??
    snapshot.previousGames
      .flatMap((game) => [game.homeTeam, game.awayTeam])
      .find((entry) => matchesTeam(entry.name, team)) ??
    null;

  if (!discoveredTeam) {
    notFound();
  }

  const abbreviation = discoveredTeam.abbreviation || deriveAbbreviation(discoveredTeam.name);

  const recentGames = snapshot.previousGames.filter(
    (game) => game.homeTeam.id === discoveredTeam.id || game.awayTeam.id === discoveredTeam.id
  );

  const upcomingGames = snapshot.featuredGames.filter(
    (game) => game.homeTeam.id === discoveredTeam.id || game.awayTeam.id === discoveredTeam.id
  );

  const newsItems = snapshot.newsItems.filter((item) => {
    const haystack = normalize(
      [item.title, item.summary, item.eventLabel, item.boxscore?.awayTeam, item.boxscore?.homeTeam]
        .filter(Boolean)
        .join(" ")
    );
    return haystack.includes(normalize(discoveredTeam.name)) || haystack.includes(normalize(abbreviation));
  });

  const wins = recentGames.filter((game) => {
    const isHome = game.homeTeam.id === discoveredTeam.id;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    return teamScore > oppScore;
  }).length;

  const losses = recentGames.filter((game) => {
    const isHome = game.homeTeam.id === discoveredTeam.id;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    return teamScore < oppScore;
  }).length;

  const averageFor =
    recentGames.length > 0
      ? (
          recentGames.reduce((total, game) => {
            const isHome = game.homeTeam.id === discoveredTeam.id;
            return total + (isHome ? game.homeScore : game.awayScore);
          }, 0) / recentGames.length
        ).toFixed(1)
      : "--";

  const averageAgainst =
    recentGames.length > 0
      ? (
          recentGames.reduce((total, game) => {
            const isHome = game.homeTeam.id === discoveredTeam.id;
            return total + (isHome ? game.awayScore : game.homeScore);
          }, 0) / recentGames.length
        ).toFixed(1)
      : "--";

  const currentStreak = (() => {
    if (!recentGames.length) {
      return "No recent sample";
    }

    let length = 0;
    let type: "W" | "L" | null = null;

    for (const game of recentGames) {
      const isHome = game.homeTeam.id === discoveredTeam.id;
      const teamScore = isHome ? game.homeScore : game.awayScore;
      const oppScore = isHome ? game.awayScore : game.homeScore;
      const result: "W" | "L" | null = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : null;

      if (!result) {
        break;
      }

      if (!type) {
        type = result;
      }

      if (result !== type) {
        break;
      }

      length += 1;
    }

    return type ? `${type}${length}` : "Even";
  })();

  const nextGame = upcomingGames[0] ?? null;

  return (
    <div className="grid gap-7">
      <Card className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <LeagueBadge league={snapshot.league.key} />
              <Badge tone="muted">{snapshot.league.name}</Badge>
              {standingEntry ? <Badge tone="brand">Rank {standingEntry.rank}</Badge> : null}
            </div>

            <div className="flex items-center gap-4">
              <TeamBadge
                name={discoveredTeam.name}
                abbreviation={abbreviation}
                size="lg"
              />
              <div className="font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
                {discoveredTeam.name}
              </div>
            </div>

            <div className="max-w-3xl text-base leading-8 text-slate-300">
              Team desk for recent results, next games, standings context, and team-specific story flow.
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/leagues/${snapshot.league.key}`}
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Open league desk
              </Link>
              <Link
                href="/board"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
              >
                Open board
              </Link>
              <Link
                href={`/trends?league=${snapshot.league.key}&team=${encodeURIComponent(discoveredTeam.name)}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
              >
                Team trends
              </Link>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Record
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {standingEntry?.record ?? `${wins}-${losses}`}
                </div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Streak
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{currentStreak}</div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Avg points for
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{averageFor}</div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Avg points against
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{averageAgainst}</div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Next game
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {nextGame ? formatDateTime(nextGame.startTime) : "No game loaded"}
                </div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Stories
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{newsItems.length}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Recent sample"
          value={String(recentGames.length)}
          note="Completed games available in this team window."
        />
        <MetricTile
          label="Upcoming"
          value={String(upcomingGames.length)}
          note="Live or scheduled games currently attached to this desk."
        />
        <MetricTile
          label="Standings rank"
          value={standingEntry ? String(standingEntry.rank) : "--"}
          note="Current standing row if provider context is available."
        />
        <MetricTile
          label="News items"
          value={String(newsItems.length)}
          note="Stories with team-level match context."
        />
      </div>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Upcoming"
          title="Next games"
          description="Current scheduled or live matchups for this team."
        />

        {upcomingGames.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcomingGames.map((game) => {
              const isHome = game.homeTeam.id === discoveredTeam.id;
              const opponent = isHome ? game.awayTeam : game.homeTeam;

              return (
                <Link key={game.id} href={game.href} className="block">
                  <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
                        {formatDateTime(game.startTime)}
                      </div>
                      <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <TeamBadge
                        name={opponent.name}
                        abbreviation={opponent.abbreviation || deriveAbbreviation(opponent.name)}
                        size="sm"
                      />
                      <div>
                        <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                          Opponent
                        </div>
                        <div className="text-lg font-semibold text-white">{opponent.name}</div>
                      </div>
                    </div>

                    <div className="mt-4 text-sm leading-6 text-slate-400">
                      {isHome ? "Home game" : "Away game"}
                      {game.stateDetail ? ` | ${game.stateDetail}` : ""}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            eyebrow="Upcoming"
            title="No upcoming games loaded"
            description="This team does not have a live or scheduled game in the current provider window."
          />
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Recent"
          title="Recent results"
          description="Last completed games for this team."
        />

        {recentGames.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentGames.map((game) => {
              const isHome = game.homeTeam.id === discoveredTeam.id;
              const opponent = isHome ? game.awayTeam : game.homeTeam;
              const teamScore = isHome ? game.homeScore : game.awayScore;
              const opponentScore = isHome ? game.awayScore : game.homeScore;
              const won = teamScore > opponentScore;

              return (
                <Card key={game.id} className="surface-panel p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
                      {formatDate(game.playedAt)}
                    </div>
                    <Badge tone={won ? "success" : "danger"}>{won ? "Win" : "Loss"}</Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <TeamBadge
                      name={opponent.name}
                      abbreviation={opponent.abbreviation || deriveAbbreviation(opponent.name)}
                      size="sm"
                    />
                    <div>
                      <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                        Opponent
                      </div>
                      <div className="text-lg font-semibold text-white">{opponent.name}</div>
                    </div>
                  </div>

                  <div className="mt-4 text-2xl font-semibold text-white">
                    {teamScore} - {opponentScore}
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    {isHome ? "Home" : "Away"} game
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            eyebrow="Recent"
            title="No recent games loaded"
            description="No completed team games were found in the current snapshot."
          />
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Standings"
          title="League position"
          description="Where this team currently sits in league context."
        />

        {snapshot.standings.length ? (
          <Card className="surface-panel p-5">
            <div className="grid gap-2">
              {snapshot.standings.map((entry) => {
                const isCurrent = entry.team.id === discoveredTeam.id;

                return (
                  <div
                    key={entry.team.id}
                    className={`flex items-center justify-between rounded-[1rem] px-4 py-3 ${
                      isCurrent
                        ? "border border-sky-400/20 bg-sky-500/10"
                        : "border border-white/6 bg-slate-950/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 text-sm text-slate-400">{entry.rank}</div>
                      <TeamBadge
                        name={entry.team.name}
                        abbreviation={entry.team.abbreviation || deriveAbbreviation(entry.team.name)}
                        size="sm"
                      />
                      <div className="text-white">{entry.team.name}</div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-slate-300">
                      <div>{entry.record}</div>
                      <div className="hidden md:block">{entry.streak}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <EmptyState
            eyebrow="Standings"
            title="No standings available"
            description="League standings are not available in the current provider window."
          />
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Stories"
          title="Team-specific coverage"
          description="Stories matched to this team from the current league feed."
        />

        {newsItems.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {newsItems.map((item) => (
              <a
                key={item.id}
                href={item.href ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
                  <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
                    {item.category ?? `${snapshot.league.key} update`}
                  </div>

                  <div className="mt-3 text-xl font-semibold leading-tight text-white">
                    {item.title}
                  </div>

                  <div className="mt-3 text-sm leading-7 text-slate-400">
                    {item.summary ?? "Open the source story for more context."}
                  </div>
                </Card>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState
            eyebrow="Stories"
            title="No matched stories for this team"
            description="The league feed is live, but no current article matched this team cleanly."
          />
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Next layer"
          title="Where this desk goes next"
          description="This page is now live and useful. The next pass should deepen intelligence, not reroute structure."
        />

        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="surface-panel p-5">
            <div className="text-lg font-semibold text-white">Team trends</div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              Pull trend cards scoped directly to this team and current league context.
            </div>
          </Card>

          <Card className="surface-panel p-5">
            <div className="text-lg font-semibold text-white">Props layer</div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              Add team-relevant props and top player entries when that service is ready to wire in.
            </div>
          </Card>

          <Card className="surface-panel p-5">
            <div className="text-lg font-semibold text-white">Roster + player rail</div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              Add player-level drilldown once a stable roster source is connected.
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}