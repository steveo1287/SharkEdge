import Link from "next/link";
import {
  getProviderHealthTone,
  MovementCard,
  ResearchRail
} from "@/app/_components/home-primitives";
import { GameCard } from "@/components/board/game-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameCardView, LeagueKey } from "@/lib/types/domain";

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
  const focusedLeague = chooseFocusedLeague(selectedLeague, boardData.games);
  const verifiedGames = boardData.games.filter(isVerifiedGame).slice(0, 6);
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

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="grid gap-5">
            <div className="section-kicker">SharkEdge command center</div>
            <div className="max-w-5xl font-display text-5xl font-semibold tracking-tight text-white md:text-6xl xl:text-[4.6rem] xl:leading-[0.98]">
              Board first. Matchup second. Props when the number earns it.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              Live prices, market movement, matchup context, and player markets in one research loop.
              The job is not to look busy. The job is to show what matters, why it matters, and what to open next.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/board"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Open board
              </Link>
              <Link
                href="/games"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Open games
              </Link>
              <Link
                href="/props"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Hunt props
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.6rem] border border-white/8 bg-[#09131f]/85 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.28em] text-slate-500">Current desk</div>
              <Badge tone={getProviderHealthTone(boardData.providerHealth.state)}>
                {boardData.providerHealth.label}
              </Badge>
            </div>
            <div className="text-3xl font-semibold text-white">
              {selectedLeague === "ALL" ? "All Sports" : selectedLeague}
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
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Verified games</div>
                <div className="mt-2 text-2xl font-semibold text-white">{verifiedGames.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Move alerts</div>
                <div className="mt-2 text-2xl font-semibold text-white">{movementGames.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Tracked games</div>
                <div className="mt-2 text-2xl font-semibold text-white">{boardData.games.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Desk warnings</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {boardData.providerHealth.warnings.length}
                </div>
              </div>
            </div>
            <div className="text-sm leading-6 text-slate-400">
              {boardData.sourceNote}
            </div>
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
          eyebrow="Line movement"
          title="Numbers worth reacting to"
          description="The market moved. These are the games most worth opening."
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
            {verifiedGames.length
              ? verifiedGames.map((game) => <GameCard key={game.id} game={game} focusMarket="best" />)
              : (
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
            eyebrow="Research stack"
            title="Move deeper without losing the thread"
            description="The front page should hand you into the right workflow instead of trapping you in widgets."
          />
          <ResearchRail focusedLeague={focusedLeague} />
        </section>
      </div>
    </div>
  );
}
