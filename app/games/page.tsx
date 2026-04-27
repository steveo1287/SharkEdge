import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import type { BoardSportSectionView, LeagueKey, ScoreboardPreviewView } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUE_ICONS: Record<LeagueKey, string> = {
  NBA: "🏀",
  MLB: "⚾",
  NHL: "🏒",
  NFL: "🏈",
  NCAAF: "🏈",
  UFC: "🥊",
  BOXING: "🥊"
};

function getStatusTone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "neutral" as const;
  if (status === "POSTPONED" || status === "CANCELED") return "danger" as const;
  return "muted" as const;
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

function parseMatchup(label: string) {
  const [away, home] = label.split(" @ ").map((part) => part?.trim()).filter(Boolean);
  return {
    away: away ?? "Away",
    home: home ?? "Home"
  };
}

type SlateGame = ScoreboardPreviewView & {
  leagueKey: LeagueKey;
  leagueLabel: string;
  adapterState: BoardSportSectionView["adapterState"];
};

function flattenScoreboardGames(sections: BoardSportSectionView[]) {
  return sections.flatMap((section) =>
    section.scoreboard.map((game) => ({
      ...game,
      leagueKey: section.leagueKey,
      leagueLabel: section.leagueLabel,
      adapterState: section.adapterState
    }))
  );
}

function GameSlateCard({ game }: { game: SlateGame }) {
  const matchup = parseMatchup(game.label);
  const simHref = `/sim?gameId=${encodeURIComponent(game.id)}&league=${encodeURIComponent(game.leagueKey)}`;

  return (
    <Card className="surface-panel h-full p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            <span>{LEAGUE_ICONS[game.leagueKey]}</span>
            <span>{game.leagueKey}</span>
          </div>
          <div className="mt-3 grid gap-1">
            <div className="truncate font-display text-2xl font-semibold text-white">
              {matchup.away}
            </div>
            <div className="truncate font-display text-2xl font-semibold text-white">
              @ {matchup.home}
            </div>
          </div>
        </div>
        <Badge tone={getStatusTone(game.status)}>{game.status}</Badge>
      </div>

      <div className="mt-4 grid gap-2 text-sm leading-6 text-slate-400">
        <div>{formatStartTime(game.startTime)}</div>
        {game.stateDetail ? <div>{game.stateDetail}</div> : null}
        {game.scoreboard ? <div className="text-slate-300">{game.scoreboard}</div> : null}
      </div>

      <div className="mt-5 rounded-[1.1rem] border border-white/8 bg-slate-950/55 px-4 py-3 text-sm leading-6 text-slate-300">
        Scoreboard-first matchup. Odds are optional; this game can still feed the simulator and trends workflow.
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={game.detailHref ?? `/game/${game.id}`}
          className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
        >
          Open game
        </Link>
        <Link
          href={simHref}
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
        >
          Simulate
        </Link>
        <Link
          href={`/trends?league=${encodeURIComponent(game.leagueKey)}`}
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-sky-400/25"
        >
          Trends
        </Link>
      </div>
    </Card>
  );
}

function LeagueLane({ section }: { section: BoardSportSectionView }) {
  const games = flattenScoreboardGames([section]);

  return (
    <section id={section.leagueKey} className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="section-kicker">{section.leagueKey}</div>
          <h2 className="mt-2 font-display text-2xl font-semibold text-white">
            {section.leagueLabel}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={games.length ? "success" : "muted"}>{games.length} games</Badge>
          <Badge tone="muted">{section.adapterState.replaceAll("_", " ")}</Badge>
        </div>
      </div>

      {games.length ? (
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {games.map((game) => (
            <GameSlateCard key={`${game.leagueKey}-${game.id}`} game={game} />
          ))}
        </div>
      ) : (
        <EmptyState
          eyebrow={section.leagueKey}
          title="No games in the current window"
          description={section.scoreboardDetail || section.detail || "This league has no scoreboard events available right now."}
        />
      )}
    </section>
  );
}

export default async function GamesPage() {
  const sections = await buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {} });
  const games = flattenScoreboardGames(sections);
  const liveGames = games.filter((game) => game.status === "LIVE");
  const upcomingGames = games.filter((game) => game.status !== "LIVE" && game.status !== "FINAL");
  const activeSections = sections.filter((section) => section.scoreboard.length > 0);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Games desk</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              A clean slate built around games first, not broken odds feeds.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              Browse the live scoreboard, open a matchup, send it to the simulator, or jump into trends. Odds can be missing and this page still works.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sim"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Open simulator
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
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Slate state</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Total</div>
                <div className="mt-2 text-3xl font-semibold text-white">{games.length}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Live</div>
                <div className="mt-2 text-3xl font-semibold text-white">{liveGames.length}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-slate-500">Next</div>
                <div className="mt-2 text-3xl font-semibold text-white">{upcomingGames.length}</div>
              </div>
            </div>
            <div className="rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
              Source priority: live scoreboard first. Market data is not required for this feature to operate.
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Jump lanes"
          title="Pick a league"
          description="These anchors keep the page fast and useful even when the odds system is offline."
        />
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.leagueKey}
              href={`#${section.leagueKey}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-sky-400/25 hover:text-white"
            >
              {LEAGUE_ICONS[section.leagueKey]} {section.leagueKey} · {section.scoreboard.length}
            </a>
          ))}
        </div>
      </section>

      {games.length ? (
        <div className="grid gap-8">
          {(activeSections.length ? activeSections : sections).map((section) => (
            <LeagueLane key={section.leagueKey} section={section} />
          ))}
        </div>
      ) : (
        <EmptyState
          eyebrow="Games"
          title="No scoreboard games are available right now"
          description="The page is working, but the live score providers did not return current events. Try the simulator or trends while the slate refreshes."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/sim"
                className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-200"
              >
                Open simulator
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
