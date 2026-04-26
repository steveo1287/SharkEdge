import Link from "next/link";

import { SimulationIntelligencePanel } from "@/components/event/simulation-intelligence-panel";
import { SimulationWorkbench } from "@/components/event/simulation-workbench";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { withTimeoutFallback } from "@/lib/utils/async";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { loadPersistedSimCalibrationProfiles } from "@/services/simulation/sim-calibration-report-service";
import { buildEventSimulationView } from "@/services/simulation/simulation-view-service";
import type { BoardSportSectionView, GameCardView, LeagueKey, ScoreboardPreviewView } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string }>;
};

type ScoreboardGame = ScoreboardPreviewView & {
  leagueKey: LeagueKey;
  leagueLabel: string;
  adapterState: BoardSportSectionView["adapterState"];
};

type GameDetail = {
  id: string;
  leagueKey: LeagueKey | string;
  leagueLabel: string;
  awayTeam: string;
  homeTeam: string;
  startTime: string;
  status: string;
  stateDetail: string | null;
  scoreboard: string | null;
  source: "scoreboard" | "board" | "fallback";
  boardGame: GameCardView | null;
};

const LEAGUE_ICONS: Partial<Record<string, string>> = {
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  NFL: "🏈",
  NCAAF: "🏈",
  UFC: "🥊",
  BOXING: "🥊"
};

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getStatusBadgeTone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "neutral" as const;
  if (status === "POSTPONED" || status === "CANCELED") return "danger" as const;
  return "premium" as const;
}

function parseMatchup(label: string) {
  const [away, home] = label.split(" @ ").map((part) => part?.trim()).filter(Boolean);
  return {
    away: away ?? "Away",
    home: home ?? "Home"
  };
}

function flattenScoreboardGames(sections: BoardSportSectionView[]): ScoreboardGame[] {
  return sections.flatMap((section) =>
    section.scoreboard.map((game) => ({
      ...game,
      leagueKey: section.leagueKey,
      leagueLabel: section.leagueLabel,
      adapterState: section.adapterState
    }))
  );
}

function toDetailFromScoreboard(game: ScoreboardGame): GameDetail {
  const matchup = parseMatchup(game.label);
  return {
    id: game.id,
    leagueKey: game.leagueKey,
    leagueLabel: game.leagueLabel,
    awayTeam: matchup.away,
    homeTeam: matchup.home,
    startTime: game.startTime,
    status: game.status,
    stateDetail: game.stateDetail,
    scoreboard: game.scoreboard,
    source: "scoreboard",
    boardGame: null
  };
}

function toDetailFromBoard(game: GameCardView): GameDetail {
  return {
    id: game.id,
    leagueKey: game.leagueKey,
    leagueLabel: String(game.leagueKey),
    awayTeam: game.awayTeam.name,
    homeTeam: game.homeTeam.name,
    startTime: game.startTime,
    status: game.status,
    stateDetail: game.venue ?? null,
    scoreboard: null,
    source: "board",
    boardGame: game
  };
}

async function getGameDetails(gameId: string): Promise<GameDetail> {
  const [scoreboardSections, boardData] = await Promise.all([
    withTimeoutFallback(buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} }), {
      timeoutMs: 4500,
      fallback: []
    }),
    withTimeoutFallback(
      (async () => {
        const data = await getBoardPageData(
          parseBoardFilters({ league: "ALL", date: "today", sportsbook: "best", market: "all", status: "all" })
        );
        return data;
      })(),
      { timeoutMs: 4500, fallback: null }
    )
  ]);

  const scoreboardGame = flattenScoreboardGames(scoreboardSections).find((game) => game.id === gameId);
  if (scoreboardGame) return toDetailFromScoreboard(scoreboardGame);

  const boardGame = boardData?.games.find((game) => game.id === gameId || game.externalEventId === gameId) ?? null;
  if (boardGame) return toDetailFromBoard(boardGame);

  return {
    id: gameId,
    leagueKey: "UNKNOWN",
    leagueLabel: "Game",
    awayTeam: "Away Team",
    homeTeam: "Home Team",
    startTime: new Date().toISOString(),
    status: "PREGAME",
    stateDetail: "This matchup is not in the active scoreboard window, but the page remains available.",
    scoreboard: null,
    source: "fallback",
    boardGame: null
  };
}

async function getSimulation(gameId: string) {
  try {
    await loadPersistedSimCalibrationProfiles();
    return await withTimeoutFallback(buildEventSimulationView(gameId), {
      timeoutMs: 3000,
      fallback: null
    });
  } catch {
    return null;
  }
}

function MarketCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="surface-panel p-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/60">
        {label}
      </div>
      <div className="mt-3 text-[11px] text-bone/50">{sub}</div>
      <div className="mt-1 font-mono text-[20px] font-semibold text-text-primary">{value}</div>
    </Card>
  );
}

export default async function GameDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [game, simulation] = await Promise.all([getGameDetails(id), getSimulation(id)]);

  const hasBoardOdds = Boolean(
    game.boardGame &&
      (game.boardGame.moneyline.bestOdds || game.boardGame.spread.bestOdds || game.boardGame.total.bestOdds)
  );
  const simHref = `/sim?gameId=${encodeURIComponent(game.id)}&league=${encodeURIComponent(String(game.leagueKey))}`;
  const trendsHref = `/trends?league=${encodeURIComponent(String(game.leagueKey))}`;

  return (
    <div className="grid gap-7">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <div className="section-kicker">
              {LEAGUE_ICONS[String(game.leagueKey)] ?? "🎯"} {game.leagueLabel} matchup
            </div>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              {game.awayTeam} @ {game.homeTeam}
            </h1>
            <div className="mt-3 text-base leading-8 text-slate-300">
              {formatTime(game.startTime)}
              {game.stateDetail ? <span className="block text-slate-400">{game.stateDetail}</span> : null}
              {game.scoreboard ? <span className="block text-white">{game.scoreboard}</span> : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={simHref}
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Simulate game
              </Link>
              <Link
                href={trendsHref}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                View trends
              </Link>
              <Link
                href="/games"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-sky-400/25"
              >
                Back to games
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Game state</div>
              <Badge tone={getStatusBadgeTone(game.status)}>{game.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Source</div>
                <div className="mt-2 text-lg font-semibold capitalize text-white">{game.source}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Odds</div>
                <div className="mt-2 text-lg font-semibold text-white">{hasBoardOdds ? "Available" : "Optional"}</div>
              </div>
            </div>
            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
              This page is scoreboard-first. Odds improve the context, but they are not required for the matchup page, simulator link, or trends workflow to work.
            </div>
          </div>
        </div>
      </section>

      {simulation ? (
        <>
          <SimulationIntelligencePanel simulation={simulation} />
          <SimulationWorkbench simulation={simulation} />
        </>
      ) : (
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Simulation"
            title="Simulation is ready from the studio"
            description="This game did not return a full embedded sim payload here. Use the simulator CTA to run the matchup workflow without requiring odds."
          />
          <EmptyState
            eyebrow="Sim fallback"
            title="Open this game in the simulator"
            description="The detail page stayed online. The next step is to run the game through the simulator feature."
            action={
              <Link
                href={simHref}
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
              >
                Simulate game
              </Link>
            }
          />
        </section>
      )}

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Game context"
          title={hasBoardOdds ? "Market context" : "Odds are not blocking this matchup"}
          description={
            hasBoardOdds
              ? "Live market fields are available for this game."
              : "This page intentionally remains useful when the odds system is offline or thin."
          }
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <MarketCard
            label="Moneyline"
            sub={game.boardGame?.moneyline.bestBook ?? "Not required"}
            value={
              game.boardGame?.moneyline.bestOdds
                ? `${game.boardGame.moneyline.bestOdds > 0 ? "+" : ""}${game.boardGame.moneyline.bestOdds}`
                : "—"
            }
          />
          <MarketCard
            label="Spread"
            sub={game.boardGame?.spread.bestBook ?? "Not required"}
            value={game.boardGame?.spread.lineLabel || "—"}
          />
          <MarketCard
            label="Total"
            sub={game.boardGame?.total.bestBook ?? "Not required"}
            value={game.boardGame?.total.lineLabel || "—"}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Next actions"
          title="Keep the feature loop moving"
          description="Open the simulator, check league trends, or return to the slate."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href={simHref} className="surface-panel p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Run</div>
            <div className="mt-2 font-display text-2xl font-semibold text-white">Simulator</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">Create a projected outcome from the matchup page.</div>
          </Link>
          <Link href={trendsHref} className="surface-panel p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Research</div>
            <div className="mt-2 font-display text-2xl font-semibold text-white">Trends</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">Review league systems and matchup angles.</div>
          </Link>
          <Link href="/games" className="surface-panel p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Slate</div>
            <div className="mt-2 font-display text-2xl font-semibold text-white">Games</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">Return to the scoreboard-first games desk.</div>
          </Link>
        </div>
      </section>
    </div>
  );
}
