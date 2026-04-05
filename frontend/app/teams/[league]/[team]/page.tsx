import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamBadge } from "@/components/identity/team-badge";
import { LeagueBadge } from "@/components/identity/league-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { EmptyState } from "@/components/ui/empty-state";

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

function isMatch(teamName: string, slug: string) {
  return normalize(teamName).includes(normalize(slug));
}

export default async function TeamPage({ params }: PageProps) {
  const { league, team } = await params;

  const snapshots = await getLeagueSnapshots(league.toUpperCase() as any);

  if (!snapshots.length) {
    notFound();
  }

  const snapshot = snapshots[0];

  // Find team from standings or games
  const teamRecord =
    snapshot.standings.find((t) => isMatch(t.team.name, team))?.team ||
    snapshot.featuredGames
      ?.flatMap((g) => [g.homeTeam, g.awayTeam])
      .find((t) => isMatch(t.name, team));

  if (!teamRecord) {
    notFound();
  }

  const recentGames = snapshot.previousGames.filter(
    (g) =>
      g.homeTeam.id === teamRecord.id ||
      g.awayTeam.id === teamRecord.id
  );

  const upcomingGames = snapshot.featuredGames?.filter(
    (g) =>
      g.homeTeam.id === teamRecord.id ||
      g.awayTeam.id === teamRecord.id
  );

  return (
    <div className="grid gap-7">

      {/* HERO */}
      <Card className="surface-panel-strong p-6 xl:p-8">
        <div className="grid gap-4">

          <div className="flex items-center gap-3">
            <LeagueBadge league={snapshot.league.key} />
            <Badge tone="muted">{snapshot.league.name}</Badge>
          </div>

          <div className="flex items-center gap-4">
            <TeamBadge team={teamRecord.name} />
            <div className="text-4xl font-semibold text-white">
              {teamRecord.name}
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/leagues/${snapshot.league.key}`}
              className="btn-secondary"
            >
              League desk
            </Link>

            <Link href="/board" className="btn-secondary">
              Board
            </Link>
          </div>
        </div>
      </Card>

      {/* UPCOMING */}
      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Upcoming"
          title="Next games"
          description="Current scheduled or live games"
        />

        {upcomingGames?.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcomingGames.map((game) => {
              const isHome = game.homeTeam.id === teamRecord.id;

              return (
                <Link key={game.id} href={game.href}>
                  <Card className="surface-panel p-5 hover:border-sky-400/20">

                    <div className="text-sm text-slate-400">
                      {new Date(game.startTime).toLocaleString()}
                    </div>

                    <div className="mt-3 text-xl text-white font-semibold">
                      {game.awayTeam.name} @ {game.homeTeam.name}
                    </div>

                    <div className="mt-2 text-sm text-slate-400">
                      {isHome ? "Home" : "Away"}
                    </div>

                    <div className="mt-3">
                      <Badge tone="brand">{game.status}</Badge>
                    </div>

                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No upcoming games"
            description="No scheduled games available"
          />
        )}
      </section>

      {/* RECENT */}
      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Recent"
          title="Recent results"
          description="Last completed games"
        />

        {recentGames.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentGames.map((game) => {
              const isHome = game.homeTeam.id === teamRecord.id;
              const teamScore = isHome ? game.homeScore : game.awayScore;
              const oppScore = isHome ? game.awayScore : game.homeScore;

              return (
                <Card key={game.id} className="surface-panel p-5">

                  <div className="text-sm text-slate-400">
                    {new Date(game.playedAt).toLocaleDateString()}
                  </div>

                  <div className="mt-3 text-white font-semibold">
                    {game.awayTeam.name} @ {game.homeTeam.name}
                  </div>

                  <div className="mt-2 text-lg text-white">
                    {teamScore} - {oppScore}
                  </div>

                  <div className="mt-2">
                    <Badge tone={teamScore > oppScore ? "success" : "danger"}>
                      {teamScore > oppScore ? "Win" : "Loss"}
                    </Badge>
                  </div>

                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No recent games"
            description="No completed games found"
          />
        )}
      </section>

      {/* STANDINGS */}
      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Context"
          title="League standings"
          description="Where this team sits"
        />

        <Card className="surface-panel p-5">

          <div className="grid gap-2">
            {snapshot.standings.map((entry) => {
              const isCurrent = entry.team.id === teamRecord.id;

              return (
                <div
                  key={entry.team.id}
                  className={`flex justify-between px-3 py-2 rounded ${
                    isCurrent ? "bg-sky-500/10 border border-sky-500/20" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="text-slate-400">{entry.rank}</div>
                    <div className="text-white">{entry.team.name}</div>
                  </div>

                  <div className="text-slate-300">{entry.record}</div>
                </div>
              );
            })}
          </div>

        </Card>
      </section>

      {/* NEWS */}
      <section className="grid gap-4">
        <SectionTitle
          eyebrow="News"
          title="Latest stories"
          description="Context around this team"
        />

        {snapshot.newsItems.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {snapshot.newsItems.map((item) => (
              <a key={item.id} href={item.href ?? "#"} target="_blank">
                <Card className="surface-panel p-5">

                  <div className="text-white font-semibold">
                    {item.title}
                  </div>

                  <div className="mt-2 text-sm text-slate-400">
                    {item.summary}
                  </div>

                </Card>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No news"
            description="No current articles available"
          />
        )}
      </section>

    </div>
  );
}