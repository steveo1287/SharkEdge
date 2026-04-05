import Link from "next/link";

import {
  getProviderHealthTone,
  MovementCard,
  ResearchRail
} from "@/app/_components/home-primitives";
import { GameCard } from "@/components/board/game-card";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameCardView, LeagueKey } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import { withTimeoutFallback } from "@/lib/utils/async";
import { buildHomeOpportunitySnapshot } from "@/services/opportunities/opportunity-service";

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

function formatDateLabel(value: (typeof DESK_DATES)[number]["key"]) {
  return value === "today"
    ? "Today"
    : value === "tomorrow"
      ? "Tomorrow"
      : "Upcoming";
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

function getMovementMagnitude(game: GameCardView) {
  return Math.max(
    Math.abs(game.spread.movement),
    Math.abs(game.total.movement),
    Math.abs(game.moneyline.movement)
  );
}

function dedupeOpportunities(opportunities: OpportunityView[]) {
  return Array.from(
    new Map(opportunities.map((opportunity) => [opportunity.id, opportunity])).values()
  );
}

function formatSignedPercent(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatSignedUnits(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}u`;
}

function formatFreshness(minutes: number | null | undefined) {
  if (typeof minutes !== "number") {
    return "Freshness unknown";
  }

  return `${minutes}m old`;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const selectedLeague = getSelectedLeague(readValue(resolvedSearch, "league"));
  const selectedDate = getSelectedDate(readValue(resolvedSearch, "date"));

  const oddsService = await import("@/services/odds/board-service");

  const pregameFilters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });

  const liveFilters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "live"
  });

  const [pregameResult, liveResult, propsResult, performanceResult] =
    await Promise.allSettled([
      oddsService.getBoardPageData(pregameFilters),
      oddsService.getBoardPageData(liveFilters),
      withTimeoutFallback(
        import("@/services/odds/props-service").then((module) =>
          module.getTopPlayCards(6)
        ),
        {
          timeoutMs: 1_800,
          fallback: []
        }
      ),
      withTimeoutFallback(
        import("@/services/bets/bets-service").then((module) =>
          module.getPerformanceDashboard()
        ),
        {
          timeoutMs: 1_800,
          fallback: null
        }
      )
    ]);

  if (pregameResult.status !== "fulfilled") {
    throw pregameResult.reason;
  }

  const pregameBoardData = pregameResult.value;
  const liveBoardData =
    liveResult.status === "fulfilled"
      ? liveResult.value
      : {
          ...pregameBoardData,
          filters: liveFilters,
          games: [],
          liveMessage: "Live board unavailable on this render.",
          sourceNote:
            "Live desk did not render cleanly, so the command center is staying honest and using pregame-only data for this pass.",
          providerHealth: {
            ...pregameBoardData.providerHealth,
            state:
              pregameBoardData.providerHealth.state === "HEALTHY"
                ? "DEGRADED"
                : pregameBoardData.providerHealth.state,
            label: "Live desk unavailable",
            summary:
              "Live board could not render on this request. SharkEdge is falling back to pregame-only command center data instead of faking a live feed.",
            warnings: Array.from(
              new Set([
                ...pregameBoardData.providerHealth.warnings,
                "Live board unavailable on this render."
              ])
            )
          }
        };

  const topProps = propsResult.status === "fulfilled" ? propsResult.value : [];
  const performanceData =
    performanceResult.status === "fulfilled" ? performanceResult.value : null;

  const opportunitySnapshot = buildHomeOpportunitySnapshot({
    games: pregameBoardData.games,
    props: topProps,
    providerHealth: pregameBoardData.providerHealth,
    performance: performanceData
  });

  const focusedLeague = chooseFocusedLeague(selectedLeague, pregameBoardData.games);

  const bestEdges = dedupeOpportunities([
    ...opportunitySnapshot.timingWindows,
    ...opportunitySnapshot.boardTop,
    ...opportunitySnapshot.propsTop
  ]).slice(0, 4);

  const propDesk = opportunitySnapshot.propsTop.slice(0, 2);

  const rankedGames = Array.from(
    new Map(
      opportunitySnapshot.boardTop
        .map((opportunity) =>
          pregameBoardData.games.find((game) =>
            opportunity.id.startsWith(`${game.id}:`)
          )
        )
        .filter((game): game is GameCardView => Boolean(game))
        .map((game) => [game.id, game] as const)
    ).values()
  );

  const verifiedGames = (
    rankedGames.length ? rankedGames : pregameBoardData.games.filter(isVerifiedGame)
  ).slice(0, 4);

  const movementGames = pregameBoardData.games
    .filter(isVerifiedGame)
    .filter(
      (game) =>
        Math.abs(game.spread.movement) >= 0.5 ||
        Math.abs(game.total.movement) >= 0.5 ||
        Math.abs(game.moneyline.movement) >= 10
    )
    .sort((left, right) => getMovementMagnitude(right) - getMovementMagnitude(left))
    .slice(0, 4);

  const liveWatchGames = liveBoardData.games
    .filter(isVerifiedGame)
    .sort((left, right) => getMovementMagnitude(right) - getMovementMagnitude(left))
    .slice(0, 4);

  const combinedWarnings = Array.from(
    new Set([
      ...pregameBoardData.providerHealth.warnings,
      ...liveBoardData.providerHealth.warnings
    ])
  );

  const deskActionableCount = bestEdges.filter(
    (opportunity) => opportunity.actionState === "BET_NOW"
  ).length;

  const workflowBlocked = Boolean(performanceData?.setup);
  const workflowSummary = performanceData?.summary ?? null;

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="grid gap-5">
            <div className="section-kicker">SharkEdge command center</div>
            <div className="max-w-5xl font-display text-5xl font-semibold tracking-tight text-white md:text-6xl xl:text-[4.5rem] xl:leading-[0.98]">
              What matters now. What changed. What deserves a click.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              The homepage is no longer a billboard. It is the operating screen:
              best edges, live watch spots, real movers, and your actual workflow
              posture without fake urgency.
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
              <Link
                href="/performance"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Performance
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.6rem] border border-white/8 bg-[#09131f]/85 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.28em] text-slate-500">
                Current desk
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={getProviderHealthTone(pregameBoardData.providerHealth.state)}>
                  Pregame {pregameBoardData.providerHealth.label}
                </Badge>
                <Badge tone={getProviderHealthTone(liveBoardData.providerHealth.state)}>
                  Live {liveBoardData.providerHealth.label}
                </Badge>
              </div>
            </div>

            <div className="text-3xl font-semibold text-white">
              {selectedLeague === "ALL" ? "All Sports" : selectedLeague}
            </div>

            <div className="text-sm leading-6 text-slate-300">
              {pregameBoardData.providerHealth.summary}
            </div>

            <div className="flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              <span>Focus league: {focusedLeague}</span>
              <span>Slate: {formatDateLabel(selectedDate)}</span>
              <span>Pregame {formatFreshness(pregameBoardData.providerHealth.freshnessMinutes)}</span>
              <span>Live {formatFreshness(liveBoardData.providerHealth.freshnessMinutes)}</span>
            </div>

            <div className="terminal-rule mt-2" />

            <div className="data-grid">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Bet now
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {deskActionableCount}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Live watch
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {liveWatchGames.length}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Movers
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {movementGames.length}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Warnings
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {combinedWarnings.length}
                </div>
              </div>
            </div>

            <div className="text-sm leading-6 text-slate-400">
              {pregameBoardData.sourceNote}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex flex-wrap gap-2">
            {LEAGUE_ITEMS.map((league) => (
              <Link
                key={league.key}
                href={`/?league=${league.key}&date=${selectedDate}`}
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Best edges now"
            title="Open these first"
            description="This is the short list. Best price posture, best timing posture, and the cleanest current windows."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {bestEdges.length ? (
              bestEdges.map((opportunity) => (
                <OpportunitySpotlightCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  href={`/game/${opportunity.eventId}`}
                  ctaLabel="Open context"
                />
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
                No opportunities cleared the homepage threshold on this pass. That is the correct output when the desk does not have enough clean price posture.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Your workflow"
            title="Personal posture"
            description="Your betting workflow should live on the homepage too, not just raw markets."
          />

          {performanceData === null ? (
            <Card className="surface-panel p-6">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                Performance feed
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                Workflow summary unavailable
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                The homepage could not pull the performance dashboard fast enough on this render. The market desk stays live instead of blocking the whole page.
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/performance"
                  className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
                >
                  Open performance
                </Link>
                <Link
                  href="/bets"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open bets
                </Link>
              </div>
            </Card>
          ) : workflowBlocked ? (
            <Card className="surface-panel p-6">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-rose-300">
                Ledger blocked
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                Performance is not wired cleanly yet
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-400">
                {performanceData.setup?.detail ??
                  "The ledger stack is still blocked, so the homepage is staying honest instead of inventing win rates or fake CLV."}
              </div>
              <div className="mt-4 grid gap-2">
                {(performanceData.setup?.steps ?? []).slice(0, 3).map((step) => (
                  <div
                    key={step}
                    className="rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3 text-sm text-slate-300"
                  >
                    {step}
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <Link
                  href="/performance"
                  className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
                >
                  Open performance
                </Link>
              </div>
            </Card>
          ) : (
            <Card className="surface-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  Tracked ledger
                </div>
                <Badge tone="success">{workflowSummary?.record ?? "0-0-0"}</Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Open bets
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {workflowSummary?.openBets ?? 0}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Net units
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {formatSignedUnits(workflowSummary?.netUnits)}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    ROI
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {formatSignedPercent(workflowSummary?.roi)}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Avg CLV
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {formatSignedPercent(workflowSummary?.averageClv)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Best segment: </span>
                  {performanceData.bestSegments[0] ??
                    "Not enough settled history yet to separate a real strength."}
                </div>
                <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Weak spot: </span>
                  {performanceData.worstSegments[0] ??
                    "Weak spots stay blank until the ledger has enough truth."}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/bets"
                  className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
                >
                  Open bets
                </Link>
                <Link
                  href="/performance"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                >
                  Open performance
                </Link>
              </div>
            </Card>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Line movement"
            title="Numbers worth reacting to"
            description="These are the real movers on the pregame desk. Open the matchup instead of staring at the homepage."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {movementGames.length ? (
              movementGames.map((game) => <MovementCard key={game.id} game={game} />)
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
                No verified movement rows cleared the desk right now.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Live watchlist"
            title="Games that deserve live attention"
            description="Not every live game belongs here. Only the ones worth opening."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {liveWatchGames.length ? (
              liveWatchGames.map((game) => (
                <GameCard key={game.id} game={game} focusMarket="best" />
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
                The live desk has nothing verified enough to lead with on this render.
              </Card>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Prop desk"
            title="Props with enough posture to matter"
            description="This stays selective. Props do not earn homepage space just because they exist."
          />
          <div className="grid gap-4">
            {propDesk.length ? (
              propDesk.map((opportunity) => (
                <OpportunitySpotlightCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  href={`/game/${opportunity.eventId}`}
                  ctaLabel="Open prop context"
                />
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                The prop desk is quiet right now. That is better than homepage filler.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Trap desk"
            title="What should not lead you"
            description="Good command centers tell you what to avoid too."
          />
          <div className="grid gap-4">
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
                      <div className="text-sm font-medium text-white">
                        {opportunity.selectionLabel}
                      </div>
                      <div className="mt-1 text-sm text-rose-100">
                        {opportunity.whatCouldKillIt[0] ?? opportunity.reasonSummary}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                No major trap lines are surfacing above threshold on this pass.
              </Card>
            )}

            <Card className="surface-panel p-5">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                Coverage / trust summary
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Pregame desk: </span>
                  {pregameBoardData.providerHealth.summary}
                </div>
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Live desk: </span>
                  {liveBoardData.providerHealth.summary}
                </div>
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Warnings: </span>
                  {combinedWarnings.length
                    ? combinedWarnings.join(" • ")
                    : "No active desk warnings right now."}
                </div>
              </div>
            </Card>
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
              verifiedGames.map((game) => (
                <GameCard key={game.id} game={game} focusMarket="best" />
              ))
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
            description="The homepage should hand you into the next desk, not trap you in widget hell."
          />
          <ResearchRail focusedLeague={focusedLeague} />
        </section>
      </div>
    </div>
  );
}