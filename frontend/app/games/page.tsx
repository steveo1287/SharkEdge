import Link from "next/link";

import { GameCard } from "@/components/board/game-card";
import { MarketSparkline } from "@/components/charts/market-sparkline";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { withTimeoutFallback } from "@/lib/utils/async";
import type { GameCardView, LeagueSnapshotView } from "@/lib/types/domain";
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

const GAMES_SNAPSHOT_TIMEOUT_MS = 2_200;

function flattenFeaturedGames(snapshots: LeagueSnapshotView[]) {
  return snapshots.flatMap((snapshot) =>
    (snapshot.featuredGames ?? []).map((game) => ({
      ...game,
      leagueKey: snapshot.league.key,
      leagueName: snapshot.league.name
    }))
  );
}

function isVerifiedGame(game: GameCardView) {
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 || game.moneyline.bestOdds !== 0 || game.total.bestOdds !== 0)
  );
}

function getGamePriorityScore(game: GameCardView) {
  const markets = [game.spread, game.moneyline, game.total];

  return markets.reduce((best, market) => {
    const rankScore = market.evProfile?.rankScore ?? 0;
    const confidenceScore = market.confidenceScore ?? 0;
    const qualityScore = market.marketTruth?.qualityScore ?? 0;
    const movementScore = Math.min(14, Math.abs(market.movement) * 2.5);
    const bestPriceBonus = market.marketIntelligence?.bestPriceFlag ? 10 : 0;

    return Math.max(best, rankScore + confidenceScore * 0.4 + qualityScore * 0.2 + movementScore + bestPriceBonus);
  }, 0);
}

function getStatusTone(status: string) {
  if (status === "LIVE") {
    return "success" as const;
  }

  if (status === "FINAL") {
    return "neutral" as const;
  }

  return "muted" as const;
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

export default async function GamesPage() {
  const [oddsService, statsService] = await Promise.all([
    import("@/services/odds/board-service"),
    import("@/services/stats/stats-service")
  ]);
  const [boardData, snapshots] = await Promise.all([
    oddsService.getBoardPageData(
      oddsService.parseBoardFilters({
        league: "ALL",
        date: "today",
        sportsbook: "best",
        market: "all",
        status: "pregame"
      })
    ),
    withTimeoutFallback(statsService.getLeagueSnapshots("ALL"), {
      timeoutMs: GAMES_SNAPSHOT_TIMEOUT_MS,
      fallback: []
    })
  ]);

  const slate = flattenFeaturedGames(snapshots).slice(0, 16);
  const verifiedGames = boardData.games
    .filter(isVerifiedGame)
    .sort((left, right) => getGamePriorityScore(right) - getGamePriorityScore(left));
  const boardIntelligence = await getBoardGameIntelligenceMap(verifiedGames);
  const prioritizedGames = buildAttentionQueue(
    verifiedGames.map((game) => {
      const intelligence = boardIntelligence.get(getBoardGameIdentityKey(game)) ?? null;
      const focusMarket = intelligence?.focusMarket ?? getBoardFocusMarket(game);
      const opportunity = buildGameMarketOpportunity(game, focusMarket, boardData.providerHealth);
      const snapshot = buildOpportunitySnapshot(opportunity);
      const decision = snapshot ? buildDecisionFromOpportunitySnapshot(snapshot) : null;

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
  const openNowGames = verifiedGames.slice(0, 8);
  const scoreboardContext = slate
    .filter((game) => !verifiedGames.some((entry) => entry.id === game.id))
    .slice(0, 8);

  return (
    <div className="grid gap-6">
      <section className="concept-panel concept-panel-accent grid gap-5 px-5 py-5 md:px-7 md:py-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
        <div className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Games desk</div>
            <div className="max-w-4xl font-display text-[2.3rem] font-semibold leading-[0.94] tracking-[-0.045em] text-white md:text-[3.1rem]">
              Start with the matchups that have both market truth and a reason to care.
            </div>
            <div className="max-w-3xl text-sm leading-7 text-slate-300 md:text-[0.98rem]">
              This is the entry desk for the slate. Verified games rise to the top. Thin games stay visible as scoreboard context, not fake conviction.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/board" className="concept-chip concept-chip-accent">
                Open board
              </Link>
              <Link href="/props" className="concept-chip concept-chip-muted">
                Hunt props
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.45rem] border border-white/10 bg-[#07111c]/86 p-5 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <div className="concept-meta">Desk state</div>
              <Badge tone={getProviderHealthTone(boardData.providerHealth.state)}>
                {boardData.providerHealth.label}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="concept-metric">
                <div className="concept-meta">Open now</div>
                <div className="concept-metric-value">{`${openNowGames.length}`}</div>
                <div className="concept-metric-note">Verified matchup entries with real market support.</div>
              </div>
              <div className="concept-metric">
                <div className="concept-meta">Scoreboard only</div>
                <div className="concept-metric-value">{`${scoreboardContext.length}`}</div>
                <div className="concept-metric-note">Still relevant, but not front-row betting entries.</div>
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
          </div>
        </div>
      </section>

      {prioritizedGames.length ? (
        <section className="concept-panel grid gap-4 p-5 md:p-6">
          <SectionTitle
            eyebrow="Attention now"
            title="First matchup entries on the slate"
            description="Same priority system as the board, filtered down to the games desk so the page opens with the strongest routes into detail."
          />
          <div className="grid gap-3 xl:grid-cols-4">
            {prioritizedGames.slice(0, 4).map(({ game, focusMarket, prioritization, summary }) => (
              <Link
                key={`${game.id}:${focusMarket}`}
                href={game.detailHref ?? "/games"}
                className="concept-terminal-tile"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="concept-meta">{game.leagueKey} | {focusMarket}</div>
                    <div className="mt-2 text-base font-semibold text-white">
                      {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                    </div>
                  </div>
                  <Badge tone="brand">{prioritization.shortAttentionLabel}</Badge>
                </div>
                <div className="mt-3 text-sm leading-6 text-slate-400">
                  {summary?.shortExplanation ?? `${game[focusMarket].lineLabel} | ${game[focusMarket].bestBook}`}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="concept-meta">{game[focusMarket].label}</span>
                  <MarketSparkline values={buildSparklineValues(game, focusMarket)} compact />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Open now"
          title={openNowGames.length ? "Best matchup entry points on the slate" : "No verified matchup entries yet"}
          description={
            openNowGames.length
              ? "These are the games with the strongest current path into the board, the game page, and the prop lab."
              : "When the board is thin, SharkEdge stays honest instead of pretending every matchup is ready."
          }
        />
        <div className="grid gap-2">
          {openNowGames.length ? (
            prioritizedGames.slice(0, 8).map(({ game, focusMarket, prioritization }) => (
              <GameCard
                key={game.id}
                game={game}
                focusMarket={focusMarket}
                intelligence={boardIntelligence.get(getBoardGameIdentityKey(game)) ?? null}
                prioritization={prioritization}
              />
            ))
          ) : (
            <div className="xl:col-span-2">
              <EmptyState
                eyebrow="Open now"
                title="No matchup deserves top billing yet"
                description="The slate is still worth tracking, but verified market support has not earned a front row. Use scoreboard context below or jump back to the board for the broader market view."
                action={
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      href="/board"
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
                    >
                      Open board
                    </Link>
                    <Link
                      href="/props"
                      className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
                    >
                      Check props
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
          eyebrow="Scoreboard context"
          title="Everything still worth watching"
          description="These games still matter. They just do not yet deserve top billing as betting-entry pages."
        />
        <div className="grid gap-2 xl:grid-cols-2">
          {scoreboardContext.length ? (
            scoreboardContext.map((game) => (
              <Link key={`${game.leagueKey}-${game.id}`} href={game.href}>
                <div className="concept-list-row h-full transition hover:border-sky-400/25 hover:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="concept-meta">{game.leagueKey}</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                      </div>
                    </div>
                    <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
                  </div>
                  <div className="mt-4 text-sm leading-6 text-slate-400">
                    {game.stateDetail ?? game.leagueName}
                  </div>
                  <div className="mt-5 rounded-[1.1rem] border border-white/8 bg-slate-950/55 px-4 py-3 text-sm leading-6 text-slate-300">
                    Open this matchup for score, team context, and any emerging prop support. Market verification has not earned front-row placement yet.
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="xl:col-span-2">
              <EmptyState
                eyebrow="Scoreboard context"
                title="The slate is already concentrated up top"
                description="Right now the strongest matchup entries are already sitting in the verified desk above, so this lower-priority lane stays quiet."
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
