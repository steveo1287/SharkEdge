import Link from "next/link";

import { GameCard } from "@/components/board/game-card";
import { BoardHero } from "@/components/board/board-hero";
import { BoardSummaryStrip } from "@/components/board/board-summary-strip";
import { VerifiedBoardGrid } from "@/components/board/verified-board-grid";
import { MarketMoversPanel } from "@/components/board/market-movers-panel";
import { LeagueDeskGrid } from "@/components/board/league-desk-grid";
import { ScoreboardContextGrid } from "@/components/board/scoreboard-context-grid";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatGameDateTime } from "@/lib/formatters/date";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type {
  BoardMarketView,
  BoardSportSectionView,
  GameCardView,
  LeagueKey,
  ScoreboardPreviewView
} from "@/lib/types/domain";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

export const dynamic = "force-dynamic";

type BoardLeagueScope = LeagueKey | "ALL";
type BoardDateScope = "today" | "tomorrow" | "upcoming";
type BoardMarketKey = "spread" | "moneyline" | "total";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUE_ITEMS = [
  "ALL",
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
] as const;

const DATE_ITEMS = ["today", "tomorrow", "upcoming"] as const;
const MARKET_KEYS: BoardMarketKey[] = ["spread", "moneyline", "total"];

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getSelectedLeague(value: string | undefined): BoardLeagueScope {
  const candidate = value?.toUpperCase();
  return (LEAGUE_ITEMS.find((league) => league === candidate) ?? "ALL") as BoardLeagueScope;
}

function getSelectedDate(value: string | undefined): BoardDateScope {
  return DATE_ITEMS.find((item) => item === value) ?? "today";
}

function resolveBoardDate(value: BoardDateScope) {
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
    (game.spread.bestOdds !== 0 || game.moneyline.bestOdds !== 0 || game.total.bestOdds !== 0)
  );
}

function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED" || state === "FALLBACK") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getSectionStatusTone(status: BoardSportSectionView["status"]) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "PARTIAL") {
    return "premium" as const;
  }

  return "muted" as const;
}

function getGameMarketPriority(game: GameCardView, marketKey: BoardMarketKey) {
  const market = game[marketKey];
  const rankScore = market.evProfile?.rankScore ?? 0;
  const confidenceScore = market.confidenceScore ?? 0;
  const movementBonus = Math.min(
    12,
    Math.abs(market.movement) * (marketKey === "moneyline" ? 0.35 : 2.5)
  );
  const qualityBonus = market.marketTruth?.qualityScore ?? 0;
  const bestPriceBonus = market.marketIntelligence?.bestPriceFlag ? 8 : 0;

  return rankScore + confidenceScore * 0.45 + qualityBonus * 0.2 + movementBonus + bestPriceBonus;
}

function getLeadMarket(game: GameCardView): BoardMarketKey {
  return [...MARKET_KEYS].sort(
    (left, right) => getGameMarketPriority(game, right) - getGameMarketPriority(game, left)
  )[0];
}

function getLeadMarketView(game: GameCardView): {
  key: BoardMarketKey;
  market: BoardMarketView;
} {
  const key = getLeadMarket(game);
  return {
    key,
    market: game[key]
  };
}

function getLeadScore(game: GameCardView) {
  return Math.max(
    buildGameMarketOpportunity(game, "spread").opportunityScore,
    buildGameMarketOpportunity(game, "moneyline").opportunityScore,
    buildGameMarketOpportunity(game, "total").opportunityScore
  );
}

function formatMovement(marketKey: BoardMarketKey, movement: number) {
  if (!movement) {
    return "No move";
  }

  const unit = marketKey === "moneyline" ? "c" : "pts";
  return `${movement > 0 ? "+" : ""}${movement.toFixed(1)} ${unit}`;
}

function formatOdds(value: number) {
  return value ? formatAmericanOdds(value) : "-";
}

function formatMarketLabel(value: string) {
  return value.startsWith("No ") ? "-" : value;
}

function formatMarketName(value: BoardMarketKey) {
  if (value === "moneyline") {
    return "Moneyline";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getBoardHref(league: BoardLeagueScope, date: BoardDateScope) {
  return `/board?league=${league}&date=${date}`;
}

function getLeagueHref(section: BoardSportSectionView) {
  return `/leagues/${section.leagueKey}`;
}

function buildScoreboardItems(sections: BoardSportSectionView[]) {
  return sections
    .flatMap((section) =>
      section.scoreboard.slice(0, 3).map((item) => ({
        section,
        item
      }))
    )
    .slice(0, 12);
}

function getScoreboardTone(item: ScoreboardPreviewView["status"]) {
  if (item === "LIVE") {
    return "success" as const;
  }

  if (item === "FINAL") {
    return "neutral" as const;
  }

  if (item === "POSTPONED" || item === "CANCELED") {
    return "danger" as const;
  }

  return "muted" as const;
}

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const selectedLeague = getSelectedLeague(readValue(resolvedSearch, "league"));
  const selectedDate = getSelectedDate(readValue(resolvedSearch, "date"));

  const oddsService = await import("@/services/odds/board-service");
  const filters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });

  const boardData = await oddsService.getBoardPageData(filters);

  const verifiedGames = boardData.games
    .filter(isVerifiedGame)
    .sort((left, right) => getLeadScore(right) - getLeadScore(left));

  const movers = [...verifiedGames]
    .sort((left, right) => {
      const leftLead = getLeadMarketView(left);
      const rightLead = getLeadMarketView(right);

      const leftMovement = Math.abs(leftLead.market.movement);
      const rightMovement = Math.abs(rightLead.market.movement);

      if (rightMovement !== leftMovement) {
        return rightMovement - leftMovement;
      }

      return getLeadScore(right) - getLeadScore(left);
    })
    .slice(0, 6);

  const leagueSections = [...boardData.sportSections].sort((left, right) => {
    const liveRank = left.status === "LIVE" ? 0 : left.status === "PARTIAL" ? 1 : 2;
    const rightRank = right.status === "LIVE" ? 0 : right.status === "PARTIAL" ? 1 : 2;

    if (liveRank !== rightRank) {
      return liveRank - rightRank;
    }

    return right.games.length - left.games.length;
  });

  const scoreboardItems = buildScoreboardItems(leagueSections);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-5">
            <div className="section-kicker">Board command</div>

            <div className="max-w-5xl font-display text-4xl font-semibold tracking-tight text-white xl:text-6xl">
              Open the slate by signal, not by noise.
            </div>

            <div className="max-w-3xl text-base leading-8 text-slate-300">
              Verified books, movement worth reacting to, and direct paths into the matchup hub.
              Thin markets stay visible as context, not fake conviction.
            </div>

            <div className="flex flex-wrap gap-2">
              {LEAGUE_ITEMS.map((league) => (
                <Link
                  key={league}
                  href={getBoardHref(league, selectedDate)}
                  className={
                    selectedLeague === league
                      ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                      : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                  }
                >
                  {league}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {DATE_ITEMS.map((date) => (
                <Link
                  key={date}
                  href={getBoardHref(selectedLeague, date)}
                  className={
                    selectedDate === date
                      ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                      : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                  }
                >
                  {date}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-4 rounded-[1.6rem] border border-white/8 bg-[#09131f]/85 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.24em] text-slate-500">
                Desk state
              </div>
              <Badge tone={getProviderHealthTone(boardData.providerHealth.state)}>
                {boardData.providerHealth.label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/50 p-4">
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Verified rows
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">{verifiedGames.length}</div>
              </div>

              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/50 p-4">
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Games tracked
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {boardData.summary.totalGames}
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/50 p-4">
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Sportsbooks
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {boardData.summary.totalSportsbooks}
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/50 p-4">
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Feed freshness
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {typeof boardData.providerHealth.freshnessMinutes === "number"
                    ? `${boardData.providerHealth.freshnessMinutes}m`
                    : "Live"}
                </div>
              </div>
            </div>

            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
              {boardData.providerHealth.summary}
            </div>

            <div className="flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              <span>{boardData.providerHealth.freshnessLabel}</span>
              {boardData.providerHealth.warnings.length ? (
                <span>
                  {boardData.providerHealth.warnings.length} warning
                  {boardData.providerHealth.warnings.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            <div className="text-sm leading-6 text-slate-400">{boardData.sourceNote}</div>

            {boardData.liveMessage ? (
              <div className="rounded-[1.1rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                {boardData.liveMessage}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="surface-panel p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            What to do first
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">Open verified rows</div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Start with matchups that still have enough book coverage and a real lead market.
          </p>
        </Card>

        <Card className="surface-panel p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Market mover
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">
            {movers[0] ? formatMovement(getLeadMarketView(movers[0]).key, getLeadMarketView(movers[0]).market.movement) : "—"}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {movers[0]
              ? `${movers[0].awayTeam.abbreviation} @ ${movers[0].homeTeam.abbreviation}`
              : "No verified movement leader yet."}
          </p>
        </Card>

        <Card className="surface-panel p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            League coverage
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">
            {leagueSections.filter((section) => section.status === "LIVE").length}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Live-supported league desks are ready for deeper routing into teams and matchups.
          </p>
        </Card>

        <Card className="surface-panel p-5">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            Scoreboard context
          </div>
          <div className="mt-3 text-2xl font-semibold text-white">{scoreboardItems.length}</div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Thin markets stay visible as schedule and score context instead of fake price depth.
          </p>
        </Card>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Verified board"
          title={verifiedGames.length ? "Open these matchups first" : "No verified rows right now"}
          description={
            verifiedGames.length
              ? "The board leads with games that still deserve attention now."
              : "The desk is staying honest until better price coverage comes through."
          }
        />

        <div className="grid gap-4 xl:grid-cols-2">
          {verifiedGames.length ? (
            verifiedGames.map((game) => (
              <GameCard key={game.id} game={game} focusMarket="best" />
            ))
          ) : (
            <div className="xl:col-span-2">
              <EmptyState
                eyebrow="Verified board"
                title="No matchup is strong enough to lead the page yet"
                description="Board support is visible, but SharkEdge is not going to fake conviction. Use the league desks below for scoreboard context and routing."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      href="/games"
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                    >
                      Open games
                    </Link>
                    <Link
                      href="/props"
                      className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                    >
                      Hunt props
                    </Link>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Market movers"
          title="Where the board actually moved"
          description="Movement gets ranked by live board pressure first, not by empty volatility."
        />

        <div className="grid gap-4 xl:grid-cols-3">
          {movers.length ? (
            movers.map((game) => {
              const lead = getLeadMarketView(game);
              const opportunity = buildGameMarketOpportunity(game, lead.key);

              return (
                <Card key={`mover-${game.id}`} className="surface-panel p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                        {game.leagueKey} | {formatGameDateTime(game.startTime)}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                      </div>
                    </div>
                    <Badge tone={getProviderHealthTone(game.status === "LIVE" ? "HEALTHY" : "DEGRADED")}>
                      {game.status}
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-3 rounded-[1.2rem] border border-white/8 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Lead market
                      </div>
                      <div className="text-sm font-medium text-white">
                        {formatMarketName(lead.key)}
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="font-display text-3xl font-semibold text-white">
                          {formatMarketLabel(lead.market.label)}
                        </div>
                        <div className="mt-1 text-sm text-slate-400">
                          {lead.market.bestBook} | {formatOdds(lead.market.bestOdds)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                          Move
                        </div>
                        <div className="mt-1 text-xl font-semibold text-emerald-300">
                          {formatMovement(lead.key, lead.market.movement)}
                        </div>
                      </div>
                    </div>

                    <div className="text-sm leading-6 text-slate-300">
                      {opportunity.reasonSummary ??
                        lead.market.reasons?.[0]?.detail ??
                        lead.market.marketTruth?.note ??
                        "Open the matchup to inspect whether the move still has support."}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-400">
                    <span>{opportunity.actionState.replace(/_/g, " ").toLowerCase()}</span>
                    <span>Score {opportunity.opportunityScore}</span>
                  </div>

                  <div className="mt-5">
                    <Link
                      href={game.detailHref ?? `/game/${game.id}`}
                      className="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
                    >
                      Open matchup
                    </Link>
                  </div>
                </Card>
              );
            })
          ) : (
            <div className="xl:col-span-3">
              <EmptyState
                eyebrow="Market movers"
                title="No verified mover panel yet"
                description="Once the board has stronger coverage, the strongest moving matchups will rank here automatically."
              />
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="League desks"
          title="Open the slate by league"
          description="Each desk shows what is live, what is partial, and where props or matchup depth still need more support."
        />

        <div className="grid gap-4 xl:grid-cols-2">
          {leagueSections.map((section) => (
            <Card key={section.leagueKey} className="surface-panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                    {section.sport}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {section.leagueLabel}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge tone={getSectionStatusTone(section.status)}>{section.status}</Badge>
                  <Badge tone={getSectionStatusTone(section.propsStatus)}>
                    Props {section.propsStatus}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-[1rem] border border-white/8 bg-slate-950/50 p-4">
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                    Verified
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {section.games.filter(isVerifiedGame).length}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/8 bg-slate-950/50 p-4">
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                    Scoreboard
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {section.scoreboard.length}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/8 bg-slate-950/50 p-4">
                  <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                    Odds provider
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {section.currentOddsProvider ?? "Pending"}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-sm leading-6 text-slate-300">{section.note}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">{section.propsNote}</div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={getLeagueHref(section)}
                  className="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
                >
                  Open league desk
                </Link>

                {section.games[0] ? (
                  <Link
                    href={section.games[0].detailHref ?? `/game/${section.games[0].id}`}
                    className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white"
                  >
                    Open lead matchup
                  </Link>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Scoreboard context"
          title="Thin rows still stay readable"
          description="When the board cannot verify enough price depth, you still get clean event context and direct routing."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {scoreboardItems.length ? (
            scoreboardItems.map(({ section, item }) => (
              <Card key={`${section.leagueKey}-${item.id}`} className="surface-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                      {section.leagueLabel}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">{item.label}</div>
                  </div>
                  <Badge tone={getScoreboardTone(item.status)}>{item.status}</Badge>
                </div>

                <div className="mt-4 text-sm text-slate-300">
                  {item.scoreboard ?? item.stateDetail ?? formatGameDateTime(item.startTime)}
                </div>

                <div className="mt-2 text-sm leading-6 text-slate-400">
                  {section.scoreboardDetail}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {item.detailHref ? (
                    <Link
                      href={item.detailHref}
                      className="inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300"
                    >
                      Open matchup
                    </Link>
                  ) : null}

                  <Link
                    href={getLeagueHref(section)}
                    className="inline-flex rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-white"
                  >
                    Open league
                  </Link>
                </div>
              </Card>
            ))
          ) : (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState
                eyebrow="Scoreboard context"
                title="No scoreboard rows are available right now"
                description="As providers populate, this section will surface schedule and score context for every supported league."
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}