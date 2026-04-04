import Link from "next/link";
import type { ReactNode } from "react";

import { GameCard } from "@/components/board/game-card";
import { MarketSparkline } from "@/components/charts/market-sparkline";
import {
  ChangeSummaryBadge,
  getChangeSummaryExplanation
} from "@/components/intelligence/change-intelligence";
import {
  PrioritizationBadge,
  getPrioritizationExplanation
} from "@/components/intelligence/prioritization";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameCardView, LeagueKey } from "@/lib/types/domain";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import { resolveMatchupHref } from "@/lib/utils/entity-routing";
import {
  getBoardFocusMarket,
  getBoardGameIdentityKey,
  getBoardGameIntelligenceMap
} from "@/services/decision/board-memory-summary";
import { buildAttentionQueue } from "@/services/decision/attention-queue";
import { buildDecisionFromOpportunitySnapshot } from "@/services/decision/decision-engine";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

export const dynamic = "force-dynamic";

type BoardLeagueScope = LeagueKey | "ALL";

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LEAGUE_ITEMS = ["ALL", "NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"] as const;
const DATE_ITEMS = ["today", "tomorrow", "upcoming"] as const;

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

function getSelectedDate(value: string | undefined) {
  return DATE_ITEMS.find((item) => item === value) ?? "today";
}

function resolveBoardDate(value: (typeof DATE_ITEMS)[number]) {
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

  if (state === "DEGRADED") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

function getMovementScore(game: GameCardView) {
  const focusMarket = getBoardFocusMarket(game);
  const market = game[focusMarket];
  const lineMovement = market.marketIntelligence?.lineMovement;

  if (typeof lineMovement?.lineDelta === "number") {
    return Math.abs(lineMovement.lineDelta);
  }

  if (typeof lineMovement?.priceDelta === "number") {
    return Math.abs(lineMovement.priceDelta);
  }

  return Math.abs(market.movement ?? 0);
}

function buildSparklineValues(game: GameCardView, focusMarket: "spread" | "moneyline" | "total") {
  const market = game[focusMarket];
  const lineMovement = market.marketIntelligence?.lineMovement;
  const values = [
    lineMovement?.openLine,
    lineMovement?.currentLine,
    lineMovement?.openPrice,
    lineMovement?.currentPrice,
    market.movement
  ];

  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function FilterChip({
  href,
  active,
  children
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={active ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}>
      {children}
    </Link>
  );
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
  const verifiedGames = boardData.games.filter(isVerifiedGame);
  const boardIntelligence = await getBoardGameIntelligenceMap(verifiedGames);
  const prioritizedBoardItems = buildAttentionQueue(
    verifiedGames.map((game) => {
      const intelligence = boardIntelligence.get(getBoardGameIdentityKey(game)) ?? null;
      const focusMarket = intelligence?.focusMarket ?? getBoardFocusMarket(game);
      const focusOpportunity = buildGameMarketOpportunity(game, focusMarket, boardData.providerHealth);
      const focusSnapshot = buildOpportunitySnapshot(focusOpportunity);
      const decision = focusSnapshot ? buildDecisionFromOpportunitySnapshot(focusSnapshot) : null;

      return {
        game,
        focusMarket,
        decision,
        summary: intelligence?.summary ?? null
      };
    }),
    {
      getSecondarySortValue: (item) => Date.parse(item.game.startTime ?? "") || 0
    }
  );
  const attentionRail = prioritizedBoardItems.filter((entry) => entry.prioritization.surfaced).slice(0, 5);
  const moverLead = [...verifiedGames]
    .sort((left, right) => getMovementScore(right) - getMovementScore(left))
    .slice(0, 4);

  return (
    <div className="grid gap-6">
      <section className="concept-panel concept-panel-accent grid gap-5 px-5 py-5 md:px-7 md:py-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
        <div className="grid gap-4">
          <div className="section-kicker">Market terminal</div>
          <div className="max-w-3xl font-display text-[2.35rem] font-semibold leading-[0.94] tracking-[-0.045em] text-white md:text-[3.2rem]">
            Verified numbers first. Fast scan, hard hierarchy, no dashboard theater.
          </div>
          <div className="max-w-3xl text-sm leading-7 text-slate-300 md:text-[0.98rem]">
            The board is the working surface: attention, movement, and trust all visible without making the user dig through padded cards.
          </div>
          <div className="flex flex-wrap gap-2">
            {LEAGUE_ITEMS.map((league) => (
              <FilterChip key={league} href={`/board?league=${league}&date=${selectedDate}`} active={selectedLeague === league}>
                {league}
              </FilterChip>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-[1.45rem] border border-white/10 bg-[#07111c]/86 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="concept-meta">Desk state</div>
            <Badge tone={getProviderHealthTone(boardData.providerHealth.state)}>{boardData.providerHealth.label}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="concept-metric">
              <div className="concept-meta">Verified rows</div>
              <div className="concept-metric-value">{`${verifiedGames.length}`}</div>
              <div className="concept-metric-note">Rows with enough real market support to lead.</div>
            </div>
            <div className="concept-metric">
              <div className="concept-meta">Books tracked</div>
              <div className="concept-metric-value">{`${boardData.summary.totalSportsbooks}`}</div>
              <div className="concept-metric-note">Active provider mesh behind this board state.</div>
            </div>
          </div>
          <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
            {boardData.providerHealth.summary}
          </div>
          <div className="flex flex-wrap gap-2">
            {DATE_ITEMS.map((date) => (
              <FilterChip key={date} href={`/board?league=${selectedLeague}&date=${date}`} active={selectedDate === date}>
                {date}
              </FilterChip>
            ))}
          </div>
          {boardData.liveMessage ? (
            <div className="rounded-[1.1rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
              {boardData.liveMessage}
            </div>
          ) : null}
        </div>
      </section>

      {attentionRail.length ? (
        <section className="concept-panel grid gap-4 p-5 md:p-6">
          <SectionTitle
            eyebrow="Attention now"
            title="The first things worth your eyes"
            description="Same typed priority layer, compressed into a market strip instead of a billboard hero."
          />
          <div className="grid gap-3 xl:grid-cols-5">
            {attentionRail.map(({ game, focusMarket, prioritization, summary }) => (
              <Link
                key={`${game.id}:${focusMarket}`}
                href={
                  resolveMatchupHref({
                    leagueKey: game.leagueKey,
                    externalEventId: game.externalEventId,
                    fallbackHref: game.detailHref ?? null
                  }) ?? "/board"
                }
                className="concept-terminal-tile"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="concept-meta">{game.leagueKey} | {focusMarket}</div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                    </div>
                  </div>
                  <PrioritizationBadge prioritization={prioritization} />
                </div>
                <div className="mt-3 text-sm text-slate-300">
                  {game[focusMarket].lineLabel} | {formatAmericanOdds(game[focusMarket].bestOdds)}
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-400">
                  {getPrioritizationExplanation(prioritization) ?? getChangeSummaryExplanation(summary)}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <ChangeSummaryBadge summary={summary} />
                  <MarketSparkline
                    values={buildSparklineValues(game, focusMarket)}
                    compact
                    accent={summary?.lastChangeDirection === "downgraded" ? "rose" : "cyan"}
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.72fr)]">
        <div className="grid gap-5">
          <section className="concept-panel p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {boardData.sportSections.slice(0, 6).map((section) => (
                  <span
                    key={section.leagueKey}
                    className={section.status === "LIVE" ? "concept-chip concept-chip-accent" : "concept-chip concept-chip-muted"}
                  >
                    {section.leagueKey}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="concept-chip concept-chip-muted">All markets</span>
                <span className="concept-chip concept-chip-muted">{boardData.providerHealth.freshnessLabel}</span>
              </div>
            </div>
          </section>

          <section className="concept-panel grid gap-4 px-3 py-3 md:px-4 md:py-4">
            <SectionTitle
              eyebrow="Live market board"
              title={verifiedGames.length ? "Priority comes from structure, not oversized color blocks" : "Scoreboard context only"}
              description={
                verifiedGames.length
                  ? "Identity, focus market, what changed, trap state, and movement all live in one scanning row."
                  : "When the market mesh is thin, the page says so instead of role-playing a strong board."
              }
            />

            {verifiedGames.length ? (
              <div className="grid gap-2">
                {prioritizedBoardItems.map(({ game, focusMarket, prioritization }) => (
                  <GameCard
                    key={`${game.id}:${focusMarket}`}
                    game={game}
                    focusMarket={focusMarket}
                    intelligence={boardIntelligence.get(getBoardGameIdentityKey(game)) ?? null}
                    prioritization={prioritization}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                eyebrow="Verified board"
                title="No board rows are ready to lead right now"
                description="SharkEdge is keeping the screen honest instead of inflating thin coverage into fake conviction."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link href="/games" className="concept-chip concept-chip-accent">
                      Open games
                    </Link>
                    <Link href="/props" className="concept-chip concept-chip-muted">
                      Hunt props
                    </Link>
                  </div>
                }
              />
            )}
          </section>
        </div>

        <aside className="grid gap-5 content-start">
          <section className="concept-panel grid gap-4 p-5">
            <SectionTitle
              eyebrow="Coverage"
              title="Provider truth"
              description="The board should tell you what it can actually support before it tells you what to bet."
            />
            <div className="grid gap-3">
              <div className="concept-metric">
                <div className="concept-meta">State</div>
                <div className="concept-metric-value">{boardData.providerHealth.label}</div>
                <div className="concept-metric-note">{boardData.providerHealth.summary}</div>
              </div>
              <div className="concept-metric">
                <div className="concept-meta">Freshness</div>
                <div className="concept-metric-value">{boardData.providerHealth.freshnessLabel}</div>
                <div className="concept-metric-note">{boardData.sourceNote}</div>
              </div>
            </div>
          </section>

          <section className="concept-panel grid gap-4 p-5">
            <SectionTitle
              eyebrow="Numbers worth reacting to"
              title="Top movers"
              description="Fastest-moving verified rows, kept compact so they support the board instead of competing with it."
            />
            <div className="grid gap-2">
              {moverLead.map((game) => {
                const focusMarket = getBoardFocusMarket(game);
                const market = game[focusMarket];
                return (
                  <div key={`${game.id}-mover`} className="concept-list-row">
                    <div className="min-w-0">
                      <div className="concept-meta">{game.leagueKey} | mover</div>
                      <div className="mt-2 text-base font-semibold text-white">
                        {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-400">
                        {market.lineLabel} | {market.bestBook} | {formatAmericanOdds(market.bestOdds)}
                      </div>
                    </div>
                    <MarketSparkline values={buildSparklineValues(game, focusMarket)} accent="green" />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="concept-panel grid gap-4 p-5">
            <SectionTitle
              eyebrow="Coverage map"
              title="Where the workflow is strongest"
              description="Support stays explicit so you know which leagues are in full market mode and which are still context-first."
            />
            <div className="grid gap-2">
              {boardData.sportSections.map((section) => (
                <Link key={section.leagueKey} href={`/leagues/${section.leagueKey}`} className="concept-list-row">
                  <div className="min-w-0">
                    <div className="concept-meta">{section.sport}</div>
                    <div className="mt-2 text-base font-semibold text-white">{section.leagueLabel}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">{section.note}</div>
                  </div>
                  <Badge tone={section.status === "LIVE" ? "success" : section.status === "PARTIAL" ? "premium" : "muted"}>
                    {section.status}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
