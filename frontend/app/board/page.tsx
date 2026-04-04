import Link from "next/link";

import { GameCard } from "@/components/board/game-card";
import {
  PrioritizationBadge,
  getPrioritizationExplanation
} from "@/components/intelligence/prioritization";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import type { GameCardView, LeagueKey } from "@/lib/types/domain";
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
    .sort((left, right) => {
      const leftScore = Math.max(
        buildGameMarketOpportunity(left, "spread", boardData.providerHealth).opportunityScore,
        buildGameMarketOpportunity(left, "moneyline", boardData.providerHealth).opportunityScore,
        buildGameMarketOpportunity(left, "total", boardData.providerHealth).opportunityScore
      );
      const rightScore = Math.max(
        buildGameMarketOpportunity(right, "spread", boardData.providerHealth).opportunityScore,
        buildGameMarketOpportunity(right, "moneyline", boardData.providerHealth).opportunityScore,
        buildGameMarketOpportunity(right, "total", boardData.providerHealth).opportunityScore
      );
      return rightScore - leftScore;
    });
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
  )
    .filter((entry) => entry.prioritization.surfaced)
    .slice(0, 3);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Market board</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Verified numbers first. Weak rows do not get dressed up.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              Best book, price pressure, and direct routes into matchup detail. One board, one decision system.
            </div>
            <div className="flex flex-wrap gap-2">
              {LEAGUE_ITEMS.map((league) => (
                <Link
                  key={league}
                  href={`/board?league=${league}&date=today`}
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
          </div>

          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.24em] text-slate-500">Desk state</div>
              <Badge tone={getProviderHealthTone(boardData.providerHealth.state)}>
                {boardData.providerHealth.label}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Verified rows</div>
                <div className="mt-2 text-3xl font-semibold text-white">{verifiedGames.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Books tracked</div>
                <div className="mt-2 text-3xl font-semibold text-white">{boardData.summary.totalSportsbooks}</div>
              </div>
            </div>
            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
              {boardData.providerHealth.summary}
            </div>
            <div className="flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              <span>{boardData.providerHealth.freshnessLabel}</span>
              {typeof boardData.providerHealth.freshnessMinutes === "number" ? (
                <span>{boardData.providerHealth.freshnessMinutes}m old</span>
              ) : null}
              {boardData.providerHealth.warnings.length ? (
                <span>{boardData.providerHealth.warnings.length} warning{boardData.providerHealth.warnings.length === 1 ? "" : "s"}</span>
              ) : null}
            </div>
            <div className="text-sm leading-6 text-slate-400">{boardData.sourceNote}</div>
            {boardData.liveMessage ? (
              <div className="rounded-[1.1rem] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                {boardData.liveMessage}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {DATE_ITEMS.map((date) => (
                <Link
                  key={date}
                  href={`/board?league=${selectedLeague}&date=${date}`}
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
        </div>
      </section>

      {prioritizedBoardItems.length ? (
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Attention now"
            title="What deserves the first look"
            description="One compact queue driven by the same typed decision and change system behind the rest of SharkEdge."
          />
          <div className="grid gap-4 xl:grid-cols-3">
            {prioritizedBoardItems.map(({ game, focusMarket, prioritization }) => {
              const explanation = getPrioritizationExplanation(prioritization);

              return (
                <Card key={`${game.id}:${focusMarket}`} className="surface-panel p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                        {game.leagueKey} | {focusMarket}
                      </div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                      </div>
                    </div>
                    <PrioritizationBadge prioritization={prioritization} />
                  </div>
                  {explanation ? (
                    <div className="mt-3 text-sm leading-6 text-slate-300">{explanation}</div>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <span>{prioritization.attentionTier}</span>
                    <span>{prioritization.attentionDirection}</span>
                  </div>
                  <Link
                    href={
                      resolveMatchupHref({
                        leagueKey: game.leagueKey,
                        externalEventId: game.externalEventId,
                        fallbackHref: game.detailHref ?? null
                      }) ?? "/board"
                    }
                    className="mt-4 inline-flex rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                  >
                    Open matchup
                  </Link>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Verified board"
          title={verifiedGames.length ? "Open these matchups first" : "Scoreboard context only"}
          description={
            verifiedGames.length
              ? "Verified rows stay up top. Everything else waits."
              : "When prices are thin, SharkEdge tells the truth and shows score context instead of cosplay depth."
          }
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {verifiedGames.length
            ? verifiedGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  focusMarket="best"
                  intelligence={boardIntelligence.get(getBoardGameIdentityKey(game)) ?? null}
                />
              ))
            : (
                <div className="xl:col-span-2">
                  <EmptyState
                    eyebrow="Verified board"
                    title="No board rows are ready to lead right now"
                    description="The board is staying honest instead of filling the page with fake verified games. Jump into the Games desk for scoreboard context or Props for the best remaining market entries."
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
          eyebrow="Coverage map"
          title="Where the workflow is strongest"
          description="Coverage stays explicit so you know where to trust the board and where to treat it as context only."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {boardData.sportSections.map((section) => (
            <Card key={section.leagueKey} className="surface-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">{section.sport}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{section.leagueLabel}</div>
                </div>
                <Badge tone={section.status === "LIVE" ? "success" : section.status === "PARTIAL" ? "premium" : "muted"}>
                  {section.status}
                </Badge>
              </div>
              <div className="mt-3 text-sm leading-6 text-slate-400">{section.note}</div>
              <div className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-500">
                {section.currentOddsProvider ?? "Provider pending"}
              </div>
              <Link
                href={`/leagues/${section.leagueKey}`}
                className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white"
              >
                Open desk
              </Link>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
