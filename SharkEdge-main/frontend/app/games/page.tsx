import Link from "next/link";

import { GameCard } from "@/components/board/game-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { withTimeoutFallback } from "@/lib/utils/async";
import type { GameCardView, LeagueSnapshotView } from "@/lib/types/domain";

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
    (game.spread.bestOdds !== 0 ||
      game.moneyline.bestOdds !== 0 ||
      game.total.bestOdds !== 0)
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

    return Math.max(
      best,
      rankScore + confidenceScore * 0.4 + qualityScore * 0.2 + movementScore + bestPriceBonus
    );
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

export default async function GamesPage() {
  const [oddsService, statsService] = await Promise.all([
    import("@/services/odds/board-service"),
    import("@/services/stats/stats-service")
  ]);

  const [boardData, snapshots] = await Promise.all([
    (async () => {
      try {
        return await oddsService.getBoardPageData(
          oddsService.parseBoardFilters({
            league: "ALL",
            date: "today",
            sportsbook: "best",
            market: "all",
            status: "all"
          })
        );
      } catch {
        return null;
      }
    })(),
    withTimeoutFallback(statsService.getLeagueSnapshots("ALL"), {
      timeoutMs: GAMES_SNAPSHOT_TIMEOUT_MS,
      fallback: []
    })
  ]);

  const slate = flattenFeaturedGames(snapshots).slice(0, 16);

  const verifiedGames = boardData
    ? boardData.games
        .filter(isVerifiedGame)
        .sort((left, right) => getGamePriorityScore(right) - getGamePriorityScore(left))
    : [];

  const openNowGames = verifiedGames.slice(0, 8);

  const scoreboardContext = slate
    .filter((game) => !verifiedGames.some((entry) => entry.id === game.id))
    .slice(0, 8);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Games desk</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Start with the matchups that have both market truth and a reason to care.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This is the entry desk for the slate. Verified games rise to the top.
              Thin games stay visible as scoreboard context, not fake conviction.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/board"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Open board
              </Link>
              <Link
                href="/props"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Hunt props
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                Desk state
              </div>
              <Badge tone={getProviderHealthTone(boardData?.providerHealth.state ?? "OFFLINE")}>
                {boardData?.providerHealth.label ?? "Unavailable"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Open now
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {openNowGames.length}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                  Scoreboard only
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {scoreboardContext.length}
                </div>
              </div>
            </div>

            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
              {boardData?.providerHealth.summary ??
                "Live board service is temporarily unavailable. Scoreboard context remains visible while verified market support repopulates."}
            </div>

            <div className="flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              <span>{boardData?.providerHealth.freshnessLabel ?? "Freshness unknown"}</span>
              {typeof boardData?.providerHealth.freshnessMinutes === "number" ? (
                <span>{boardData.providerHealth.freshnessMinutes}m old</span>
              ) : null}
              {boardData?.providerHealth.warnings.length ? (
                <span>
                  {boardData.providerHealth.warnings.length} warning
                  {boardData.providerHealth.warnings.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            <div className="text-sm leading-6 text-slate-400">
              {boardData?.sourceNote ??
                "The verified board is offline right now, so this page falls back to scoreboard-first context instead of faking market conviction."}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Open now"
          title={
            openNowGames.length
              ? "Best matchup entry points on the slate"
              : "No verified matchup entries yet"
          }
          description={
            openNowGames.length
              ? "These are the games with the strongest current path into the board, the game page, and the prop lab."
              : "When the board is thin, SharkEdge stays honest instead of pretending every matchup is ready."
          }
        />

        <div className="grid gap-4 xl:grid-cols-2">
          {openNowGames.length ? (
            openNowGames.map((game) => (
              <GameCard key={game.id} game={game} focusMarket="best" />
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

        <div className="grid gap-4 xl:grid-cols-2">
          {scoreboardContext.length ? (
            scoreboardContext.map((game) => (
              <Link key={`${game.leagueKey}-${game.id}`} href={game.href}>
                <Card className="surface-panel h-full p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                        {game.leagueKey}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-white">
                        {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
                      </div>
                    </div>
                    <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
                  </div>

                  <div className="mt-4 text-sm leading-6 text-slate-400">
                    {game.stateDetail ?? game.leagueName}
                  </div>

                  <div className="mt-5 rounded-[1.1rem] border border-white/8 bg-slate-950/55 px-4 py-3 text-sm leading-6 text-slate-300">
                    Open this matchup for score, team context, and any emerging prop
                    support. Market verification has not earned front-row placement yet.
                  </div>
                </Card>
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

      {!boardData ? (
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Board service"
            title="Verified market data is temporarily unavailable"
            description="The games page remains online with scoreboard context while the board service recovers."
          />
        </section>
      ) : null}
    </div>
  );
}