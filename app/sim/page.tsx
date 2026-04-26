import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import type { BoardSportSectionView, LeagueKey, ScoreboardPreviewView } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SimGame = ScoreboardPreviewView & {
  leagueKey: LeagueKey;
  leagueLabel: string;
};

type Projection = {
  homeScore: number;
  awayScore: number;
  homeWinPct: number;
  awayWinPct: number;
  total: number;
  spreadHome: number;
  confidence: "A" | "B" | "C";
  lean: string;
};

const LEAGUE_ICONS: Record<LeagueKey, string> = {
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  NFL: "🏈",
  NCAAF: "🏈",
  UFC: "🥊",
  BOXING: "🥊"
};

const BASE_SCORING: Partial<Record<LeagueKey, { home: number; away: number; variance: number }>> = {
  NBA: { home: 113, away: 109, variance: 8 },
  MLB: { home: 5, away: 4, variance: 2 },
  NHL: { home: 3.2, away: 2.9, variance: 1.2 },
  NFL: { home: 24, away: 21, variance: 6 },
  NCAAF: { home: 31, away: 27, variance: 9 },
  UFC: { home: 1, away: 1, variance: 1 },
  BOXING: { home: 1, away: 1, variance: 1 }
};

function normalizeSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededOffset(seed: number, range: number) {
  const normalized = (seed % 1000) / 1000;
  return (normalized - 0.5) * range * 2;
}

function roundScore(value: number, leagueKey: LeagueKey) {
  if (leagueKey === "MLB" || leagueKey === "NHL") return Math.max(0, Number(value.toFixed(1)));
  return Math.max(0, Math.round(value));
}

function parseMatchup(label: string) {
  const [away, home] = label.split(" @ ").map((part) => part?.trim()).filter(Boolean);
  return { away: away ?? "Away", home: home ?? "Home" };
}

function formatStartTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getStatusTone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "neutral" as const;
  if (status === "POSTPONED" || status === "CANCELED") return "danger" as const;
  return "muted" as const;
}

function flattenScoreboardGames(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) =>
    section.scoreboard.map((game) => ({
      ...game,
      leagueKey: section.leagueKey,
      leagueLabel: section.leagueLabel
    }))
  );
}

function buildFallbackProjection(game: SimGame): Projection {
  const matchup = parseMatchup(game.label);
  const base = BASE_SCORING[game.leagueKey] ?? { home: 24, away: 21, variance: 6 };
  const seed = hashString(`${game.id}:${game.leagueKey}:${game.label}:${game.startTime}`);
  const homeRaw = base.home + seededOffset(seed, base.variance);
  const awayRaw = base.away + seededOffset(seed >>> 3, base.variance);
  const homeScore = roundScore(homeRaw, game.leagueKey);
  const awayScore = roundScore(awayRaw, game.leagueKey);
  const diff = Number((homeScore - awayScore).toFixed(1));
  const homeWinPct = Math.max(0.35, Math.min(0.68, 0.52 + diff / Math.max(35, base.home + base.away)));
  const confidence = Math.abs(diff) >= base.variance * 0.75 ? "B" : "C";

  return {
    homeScore,
    awayScore,
    homeWinPct,
    awayWinPct: 1 - homeWinPct,
    total: Number((homeScore + awayScore).toFixed(1)),
    spreadHome: diff,
    confidence,
    lean: diff >= 0 ? matchup.home : matchup.away
  };
}

function ProjectionCard({ game, selected }: { game: SimGame; selected: boolean }) {
  const matchup = parseMatchup(game.label);
  const projection = buildFallbackProjection(game);

  return (
    <Card className={`surface-panel h-full p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03] ${selected ? "border-sky-400/35 bg-sky-500/[0.06]" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            <span>{LEAGUE_ICONS[game.leagueKey]}</span>
            <span>{game.leagueKey}</span>
          </div>
          <div className="mt-3 font-display text-2xl font-semibold text-white">
            {matchup.away} @ {matchup.home}
          </div>
          <div className="mt-2 text-sm text-slate-400">{formatStartTime(game.startTime)}</div>
        </div>
        <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
          <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Away</div>
          <div className="mt-2 text-3xl font-semibold text-white">{projection.awayScore}</div>
          <div className="mt-1 text-sm text-slate-400">{matchup.away}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
          <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Home</div>
          <div className="mt-2 text-3xl font-semibold text-white">{projection.homeScore}</div>
          <div className="mt-1 text-sm text-slate-400">{matchup.home}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/8 bg-slate-950/40 p-3">
          <div className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Lean</div>
          <div className="mt-1 text-sm font-semibold text-white">{projection.lean}</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-slate-950/40 p-3">
          <div className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Total</div>
          <div className="mt-1 text-sm font-semibold text-white">{projection.total}</div>
        </div>
        <div className="rounded-xl border border-white/8 bg-slate-950/40 p-3">
          <div className="text-[0.62rem] uppercase tracking-[0.16em] text-slate-500">Conf</div>
          <div className="mt-1 text-sm font-semibold text-white">{projection.confidence}</div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.1rem] border border-white/8 bg-slate-950/55 px-4 py-3 text-sm leading-6 text-slate-300">
        Home win projection: {(projection.homeWinPct * 100).toFixed(1)}%. This is a fallback simulator result, not an odds-derived edge.
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/game/${game.id}`}
          className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
        >
          Open game
        </Link>
        <Link
          href={`/trends?league=${encodeURIComponent(game.leagueKey)}`}
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
        >
          Trends
        </Link>
      </div>
    </Card>
  );
}

export default async function SimPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const selectedGameId = normalizeSearchParam(resolved.gameId);
  const selectedLeague = normalizeSearchParam(resolved.league);

  const sections = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} });
  const allGames = flattenScoreboardGames(sections);
  const games = selectedLeague
    ? allGames.filter((game) => game.leagueKey === selectedLeague.toUpperCase())
    : allGames;
  const selectedGame = selectedGameId
    ? allGames.find((game) => game.id === selectedGameId) ?? null
    : games[0] ?? null;
  const selectedProjection = selectedGame ? buildFallbackProjection(selectedGame) : null;
  const selectedMatchup = selectedGame ? parseMatchup(selectedGame.label) : null;

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Simulator studio</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Run a matchup projection without waiting on odds.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This simulator uses the live scoreboard slate and deterministic fallback scoring. It stays useful even when markets, projections, or edge signals are unavailable.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/games"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Pick from games
              </Link>
              <Link
                href="/trends"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                View trends
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Current run</div>
            {selectedGame && selectedProjection && selectedMatchup ? (
              <>
                <div className="font-display text-2xl font-semibold text-white">
                  {selectedMatchup.away} @ {selectedMatchup.home}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Lean</div>
                    <div className="mt-2 text-sm font-semibold text-white">{selectedProjection.lean}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Total</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{selectedProjection.total}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Conf</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{selectedProjection.confidence}</div>
                  </div>
                </div>
                <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
                  Projected score: {selectedMatchup.away} {selectedProjection.awayScore}, {selectedMatchup.home} {selectedProjection.homeScore}. Home win probability {(selectedProjection.homeWinPct * 100).toFixed(1)}%.
                </div>
              </>
            ) : (
              <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
                No scoreboard games are available right now. The simulator page is online, but it needs at least one matchup from the games feed.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="League filters"
          title="Choose a simulation lane"
          description="Filter the simulator board by league, or run from the full scoreboard slate."
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/sim"
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-sky-400/25 hover:text-white"
          >
            All · {allGames.length}
          </Link>
          {sections.map((section) => (
            <Link
              key={section.leagueKey}
              href={`/sim?league=${encodeURIComponent(section.leagueKey)}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-sky-400/25 hover:text-white"
            >
              {LEAGUE_ICONS[section.leagueKey]} {section.leagueKey} · {section.scoreboard.length}
            </Link>
          ))}
        </div>
      </section>

      {games.length ? (
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Simulation board"
            title="Run-ready matchups"
            description="Every card below produces a fallback projection without odds, props, or market data."
          />
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {games.map((game) => (
              <ProjectionCard key={`${game.leagueKey}-${game.id}`} game={game} selected={game.id === selectedGame?.id} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          eyebrow="Simulator"
          title="No games are available to simulate"
          description="The simulator is working, but the scoreboard feed did not return current matchups. Return to games or trends while the slate refreshes."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/games"
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
              >
                Open games
              </Link>
              <Link
                href="/trends"
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200"
              >
                View trends
              </Link>
            </div>
          }
        />
      )}
    </div>
  );
}
