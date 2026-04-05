import Link from "next/link";

import {
  getProviderHealthTone,
  MovementCard,
  ResearchRail
} from "@/app/_components/home-primitives";
import { GameCard } from "@/components/board/game-card";
import { LeagueBadge } from "@/components/identity/league-badge";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameCardView, LeagueKey } from "@/lib/types/domain";
import { withTimeoutFallback } from "@/lib/utils/async";
import { buildHomeOpportunitySnapshot } from "@/services/opportunities/opportunity-service";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

export const dynamic = "force-dynamic";

type HomeLeagueScope = LeagueKey | "ALL";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUE_ITEMS = [
  { key: "ALL", label: "All Sports" },
  { key: "NBA", label: "NBA" },
  { key: "NCAAB", label: "NCAAB" },
  { key: "MLB", label: "MLB" },
  { key: "NHL", label: "NHL" },
  { key: "NFL", label: "NFL" },
  { key: "NCAAF", label: "NCAAF" },
  { key: "UFC", label: "UFC" },
  { key: "BOXING", label: "Boxing" }
] as const;

const DESK_DATES = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "upcoming", label: "Upcoming" }
] as const;

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getSelectedLeague(value: string | undefined): HomeLeagueScope {
  const candidate = value?.toUpperCase();
  return (
    LEAGUE_ITEMS.find((league) => league.key === candidate)?.key ?? "ALL"
  ) as HomeLeagueScope;
}

function getSelectedDate(value: string | undefined) {
  return DESK_DATES.find((item) => item.key === value)?.key ?? "today";
}

function resolveBoardDate(value: (typeof DESK_DATES)[number]["key"]) {
  if (value === "today") {
    return "today";
  }

  if (value === "upcoming") {
    return "all";
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
  const day = `${tomorrow.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function isVerifiedGame(game: GameCardView) {
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 ||
      game.moneyline.bestOdds !== 0 ||
      game.total.bestOdds !== 0)
  );
}

function chooseFocusedLeague(
  selectedLeague: HomeLeagueScope,
  boardGames: GameCardView[]
): LeagueKey {
  if (selectedLeague !== "ALL") {
    return selectedLeague;
  }

  const boardLeague = boardGames.find((game) => isVerifiedGame(game))?.leagueKey;
  if (boardLeague) {
    return boardLeague;
  }

  return boardGames[0]?.leagueKey ?? "NBA";
}

function formatDateLabel(value: (typeof DESK_DATES)[number]["key"]) {
  return value === "today" ? "Today" : value === "tomorrow" ? "Tomorrow" : "Upcoming";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function slugifyTeam(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function dedupeLeagueGames(games: GameCardView[]) {
  return Array.from(new Map(games.map((game) => [game.id, game] as const)).values());
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const selectedLeague = getSelectedLeague(readValue(resolvedSearch, "league"));
  const selectedDate = getSelectedDate(readValue(resolvedSearch, "date"));

  const oddsService = await import("@/services/odds/board-service");
  const boardFilters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });

  const boardData = await oddsService.getBoardPageData(boardFilters);

  const [topProps, leagueSnapshots] = await Promise.all([
    withTimeoutFallback(
      import("@/services/odds/props-service").then((module) => module.getTopPlayCards(4)),
      {
        timeoutMs: 1_800,
        fallback: []
      }
    ),
    withTimeoutFallback(getLeagueSnapshots(selectedLeague === "ALL" ? "ALL" : selectedLeague), {
      timeoutMs: 2_400,
      fallback: []
    })
  ]);

  const opportunitySnapshot = buildHomeOpportunitySnapshot({
    games: boardData.games,
    props: topProps,
    providerHealth: boardData.providerHealth
  });

  const focusedLeague = chooseFocusedLeague(selectedLeague, boardData.games);

  const rankedGames = Array.from(
    new Map(
      opportunitySnapshot.boardTop
        .map((opportunity) =>
          boardData.games.find((game) => opportunity.id.startsWith(`${game.id}:`))
        )
        .filter((game): game is GameCardView => Boolean(game))
        .map((game) => [game.id, game] as const)
    ).values()
  );

  const verifiedGames = (rankedGames.length
    ? rankedGames
    : boardData.games.filter(isVerifiedGame)
  ).slice(0, 6);

  const movementGames = boardData.games
    .filter(isVerifiedGame)
    .filter(
      (game) =>
        Math.abs(game.spread.movement) >= 0.5 ||
        Math.abs(game.total.movement) >= 0.5 ||
        Math.abs(game.moneyline.movement) >= 10
    )
    .sort((left, right) => {
      const leftMove = Math.max(
        Math.abs(left.spread.movement),
        Math.abs(left.total.movement),
        Math.abs(left.moneyline.movement)
      );
      const rightMove = Math.max(
        Math.abs(right.spread.movement),
        Math.abs(right.total.movement),
        Math.abs(right.moneyline.movement)
      );
      return rightMove - leftMove;
    })
    .slice(0, 4);

  const featuredLeagueSnapshots = leagueSnapshots.slice(0, 4);
  const leaguePreviewGames = dedupeLeagueGames(
    featuredLeagueSnapshots.flatMap((snapshot) =>
      snapshot.featuredGames
        .map((featured) =>
          boardData.games.find(
            (game) =>
              normalize(game.awayTeam.name) === normalize(featured.awayTeam.name) &&
              normalize(game.homeTeam.name) === normalize(featured.homeTeam.name)
          )
        )
        .filter((game): game is GameCardView => Boolean(game))
    )
  ).slice(0, 3);

  const featuredTeams = Array.from(
    new Map(
      featuredLeagueSnapshots
        .flatMap((snapshot) => snapshot.standings.slice(0, 2).map((entry) => ({
          leagueKey: snapshot.league.key,
          team: entry.team,
          rank: entry.rank,
          record: entry.record
        })))
        .map((entry) => [`${entry.leagueKey}:${entry.team.id}`, entry] as const)
    ).values()
  ).slice(0, 6);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="grid gap-5">
            <div className="section-kicker">SharkEdge command center</div>
            <div className="max-w-5xl font-display text-5xl font-semibold tracking-tight text-white md:text-6xl xl:text-[4.6rem] xl:leading-[0.98]">
              Open the edge from one command surface.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              The homepage is not a dead marketing layer. It routes you into the board, league desks,
              matchup hubs, trends, and team pages without losing the thread.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/board"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Open board
              </Link>
              <Link
                href={`/leagues/${focusedLeague}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Open {focusedLeague} desk
              </Link>
              <Link
                href="/trends"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Open trends
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.6rem] border border-white/8 bg-[#09131f]/85 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.28em] text-slate-500">
                Current desk
              </div>
              <Badge tone={getProviderHealthTone(boardData.providerHealth.state)}>
                {boardData.providerHealth.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <LeagueBadge league={selectedLeague === "ALL" ? focusedLeague : selectedLeague} />
              <div className="text-3xl font-semibold text-white">
                {selectedLeague === "ALL" ? "All Sports" : selectedLeague}
              </div>
            </div>
            <div className="text-sm leading-6 text-slate-300">
              {boardData.providerHealth.summary}
            </div>
            <div className="flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              <span>Focus league: {focusedLeague}</span>
              <span>Slate: {formatDateLabel(selectedDate)}</span>
              <span>{boardData.providerHealth.freshnessLabel}</span>
              {typeof boardData.providerHealth.freshnessMinutes === "number" ? (
                <span>{boardData.providerHealth.freshnessMinutes}m old</span>
              ) : null}
            </div>
            <div className="terminal-rule mt-2" />
            <div className="data-grid">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Verified games
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{verifiedGames.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Move alerts
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{movementGames.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Tracked games
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{boardData.games.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Desk warnings
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {boardData.providerHealth.warnings.length}
                </div>
              </div>
            </div>
            <div className="text-sm leading-6 text-slate-400">{boardData.sourceNote}</div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex flex-wrap gap-2">
            {LEAGUE_ITEMS.map((league) => (
              <Link
                key={league.key}
                href={league.key === "ALL" ? "/?league=ALL&date=today" : `/?league=${league.key}&date=today`}
                className={
                  selectedLeague === league.key
                    ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                    : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                }
              >
                {league.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {DESK_DATES.map((date) => (
              <Link
                key={date.key}
                href={`/?league=${selectedLeague}&date=${date.key}`}
                className={
                  selectedDate === date.key
                    ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                    : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                }
              >
                {date.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Fast entry"
          title="Go where the edge is forming"
          description="This front page should hand you into the correct desk immediately."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link href="/board" className="block">
            <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Board</div>
              <div className="mt-3 text-2xl font-semibold text-white">Verified matchups</div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                Open the strongest current board rows first.
              </div>
            </Card>
          </Link>

          <Link href={`/leagues/${focusedLeague}`} className="block">
            <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <LeagueBadge league={focusedLeague} />
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  League desk
                </div>
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">{focusedLeague}</div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                Scores, movers, standings, props, and stories for one league.
              </div>
            </Card>
          </Link>

          <Link href="/trends" className="block">
            <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Trend desk</div>
              <div className="mt-3 text-2xl font-semibold text-white">Historical support</div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                Validate whether the edge is real, stable, and still active now.
              </div>
            </Card>
          </Link>

          <Link href="/props" className="block">
            <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Props</div>
              <div className="mt-3 text-2xl font-semibold text-white">Number hunting</div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                Open player numbers only when the price and timing earn it.
              </div>
            </Card>
          </Link>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Line movement"
          title="Numbers worth reacting to"
          description="The move is real. Open these first."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {movementGames.length ? (
            movementGames.map((game) => <MovementCard key={game.id} game={game} />)
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              No verified movement rows cleared the desk right now.
            </Card>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Prop desk"
            title="Best prop entries"
            description="Only props with real posture belong here."
          />
          <div className="grid gap-4">
            {opportunitySnapshot.propsTop.length ? (
              opportunitySnapshot.propsTop.slice(0, 2).map((opportunity) => (
                <OpportunitySpotlightCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  href={`/game/${opportunity.eventId}`}
                  ctaLabel="Open prop context"
                />
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                The prop desk is quiet right now. Open the full Props workflow instead of forcing homepage filler.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Action desk"
            title="Best windows and trap lines"
            description="What is playable now, and what should not lead you."
          />
          <div className="grid gap-4">
            {opportunitySnapshot.timingWindows.slice(0, 2).map((opportunity) => (
              <OpportunitySpotlightCard
                key={opportunity.id}
                opportunity={opportunity}
                href={`/game/${opportunity.eventId}`}
                ctaLabel="Open timing"
              />
            ))}
            {opportunitySnapshot.traps.length ? (
              <Card className="surface-panel p-5">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-rose-300">
                  Do not chase
                </div>
                <div className="mt-3 grid gap-3">
                  {opportunitySnapshot.traps.map((opportunity) => (
                    <div
                      key={`${opportunity.id}-trap`}
                      className="rounded-[1rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3"
                    >
                      <div className="text-sm font-medium text-white">{opportunity.selectionLabel}</div>
                      <div className="mt-1 text-sm text-rose-100">
                        {opportunity.whatCouldKillIt[0] ?? opportunity.reasonSummary}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Board"
            title="Verified matchups to open now"
            description={
              verifiedGames.length
                ? "Game detail should be one click away from the command center."
                : "If verified market rows are thin, move straight into the Games desk and let the matchup page do the work."
            }
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {verifiedGames.length ? (
              verifiedGames.map((game) => <GameCard key={game.id} game={game} focusMarket="best" />)
            ) : (
              <Card className="surface-panel p-6">
                <div className="grid gap-3">
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                    Verified rows are thin
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    The board is staying honest instead of inventing a slate.
                  </div>
                  <div className="text-sm leading-7 text-slate-400">
                    Open the Games desk for broader matchup context or move into Props if you already know the league you want to hunt.
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <Link
                      href="/games"
                      className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
                    >
                      Open games
                    </Link>
                    <Link
                      href={`/props?league=${focusedLeague}`}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                    >
                      Hunt props
                    </Link>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Next move"
            title="Go deeper without losing the thread"
            description="The front page should hand you into the next desk, not trap you in widgets."
          />
          <ResearchRail focusedLeague={focusedLeague} />
        </section>
      </div>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="League desks"
          title="Open the sport by league"
          description="Homepage should also be a clean gateway into the strongest league surfaces."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {featuredLeagueSnapshots.length ? (
            featuredLeagueSnapshots.map((snapshot) => (
              <Link key={snapshot.league.key} href={`/leagues/${snapshot.league.key}`} className="block">
                <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <LeagueBadge league={snapshot.league.key} />
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                          League desk
                        </div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                          {snapshot.league.name}
                        </div>
                      </div>
                    </div>

                    <Badge tone={snapshot.seasonState === "OFFSEASON" ? "muted" : "brand"}>
                      {snapshot.seasonState}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-3 py-3">
                      <div className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">Games</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {snapshot.featuredGames.length}
                      </div>
                    </div>
                    <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-3 py-3">
                      <div className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">Standings</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {snapshot.standings.length}
                      </div>
                    </div>
                    <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-3 py-3">
                      <div className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">Stories</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {snapshot.newsItems.length}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-sm leading-7 text-slate-400">
                    {snapshot.note ?? "Open the league desk for scores, movers, standings, and story context."}
                  </div>
                </Card>
              </Link>
            ))
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
              No league desk snapshots are available right now.
            </Card>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Featured teams"
            title="Jump straight into team desks"
            description="Repeat users should be able to move from the command center into team context fast."
          />
          {featuredTeams.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {featuredTeams.map((entry) => (
                <Link
                  key={`${entry.leagueKey}-${entry.team.id}`}
                  href={`/teams/${entry.leagueKey}/${slugifyTeam(entry.team.name)}`}
                  className="block"
                >
                  <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <LeagueBadge league={entry.leagueKey} />
                      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                        Rank {entry.rank}
                      </div>
                    </div>

                    <div className="mt-4 text-xl font-semibold text-white">{entry.team.name}</div>
                    <div className="mt-2 text-sm text-slate-400">{entry.record}</div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              Team jump cards are not available right now.
            </Card>
          )}
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Live matchups"
            title="Quick game-entry rail"
            description="If you already know you want the matchup layer, jump there directly."
          />
          {leaguePreviewGames.length ? (
            <div className="grid gap-4">
              {leaguePreviewGames.map((game) => (
                <Link key={game.id} href={game.detailHref ?? `/game/${game.id}`} className="block">
                  <Card className="surface-panel p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <LeagueBadge league={game.leagueKey} />
                        <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                          Matchup hub
                        </div>
                      </div>
                      <Badge tone="brand">{game.status}</Badge>
                    </div>

                    <div className="mt-4 text-xl font-semibold text-white">
                      {game.awayTeam.name} @ {game.homeTeam.name}
                    </div>

                    <div className="mt-2 text-sm leading-7 text-slate-400">
                      Open the game hub for markets, movement, props, trends, and feed context.
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              No direct matchup preview cards are available right now.
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}