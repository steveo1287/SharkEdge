import Link from "next/link";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";
import { GameCard } from "@/components/board/game-card";
import { TeamBadge } from "@/components/identity/team-badge";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEAGUE_ICONS: Record<LeagueKey, string> = {
  NBA:    "🏀",
  NCAAB:  "🏀",
  MLB:    "⚾",
  NHL:    "🏒",
  NFL:    "🏈",
  NCAAF:  "🏈",
  UFC:    "🥊",
  BOXING: "🥊",
};

const ESPN_SPORT_PATH: Partial<Record<LeagueKey, string>> = {
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  NFL: "nfl",
};

function getTeamLogoUrl(leagueKey: LeagueKey, abbreviation: string): string | null {
  const path = ESPN_SPORT_PATH[leagueKey];
  if (!path) return null;
  return `https://a.espncdn.com/i/teamlogos/${path}/500/${abbreviation.toLowerCase()}.png`;
}

function formatOdds(v: number | null | undefined) {
  if (!v) return "—";
  return v > 0 ? `+${v}` : `${v}`;
}

function hasOdds(section: BoardSportSectionView) {
  return section.games.some(
    (g) => g.moneyline.bestOdds || g.spread.bestOdds || g.total.bestOdds
  );
}

function CompactGameRow({ game, leagueKey }: { game: BoardSportSectionView["games"][number]; leagueKey: LeagueKey }) {
  const awayLogo = getTeamLogoUrl(leagueKey, game.awayTeam.abbreviation);
  const homeLogo = getTeamLogoUrl(leagueKey, game.homeTeam.abbreviation);

  return (
    <Link href={game.detailHref ?? `/game/${game.id}`} className="block">
      <div className="group grid grid-cols-[1fr_auto] gap-x-4 gap-y-0 rounded-xl border border-bone/[0.07] bg-surface px-4 py-3 transition-colors hover:border-aqua/25 hover:bg-panel">

        {/* Teams column */}
        <div className="grid gap-2.5">
          <div className="flex items-center gap-2.5">
            <TeamBadge name={game.awayTeam.name} abbreviation={game.awayTeam.abbreviation} logoUrl={awayLogo} size="sm" tone="away" />
            <span className="truncate font-display text-[14px] font-semibold tracking-[-0.01em] text-text-primary">
              {game.awayTeam.name}
            </span>
            <span className="ml-auto font-mono text-[13px] tabular-nums text-bone/60">
              {formatOdds(game.moneyline.bestOdds)}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <TeamBadge name={game.homeTeam.name} abbreviation={game.homeTeam.abbreviation} logoUrl={homeLogo} size="sm" tone="home" />
            <span className="truncate font-display text-[14px] font-semibold tracking-[-0.01em] text-text-primary">
              {game.homeTeam.name}
            </span>
            <span className="ml-auto font-mono text-[13px] tabular-nums text-bone/60">
              {formatOdds(game.moneyline.bestOdds ? (game.moneyline.bestOdds > 0 ? game.moneyline.bestOdds - 20 : game.moneyline.bestOdds + 20) : null)}
            </span>
          </div>
        </div>

        {/* Markets column */}
        <div className="flex flex-col items-end justify-center gap-1.5 border-l border-bone/[0.06] pl-4">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-bone/40 uppercase tracking-widest">SPR</span>
            <span className="font-mono tabular-nums text-text-primary">{game.spread.lineLabel || "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-bone/40 uppercase tracking-widest">O/U</span>
            <span className="font-mono tabular-nums text-aqua">{game.total.lineLabel || "—"}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function LeagueSection({ section }: { section: BoardSportSectionView }) {
  const gamesWithOdds = section.games.filter(
    (g) => g.moneyline.bestOdds || g.spread.bestOdds || g.total.bestOdds
  );
  if (gamesWithOdds.length === 0 && section.scoreboard.length === 0) return null;

  return (
    <section id={section.leagueKey} className="grid gap-3">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <span className="text-lg">{LEAGUE_ICONS[section.leagueKey]}</span>
        <h2 className="font-display text-[15px] font-semibold text-text-primary">
          {section.leagueLabel}
        </h2>
        <span className="rounded-full bg-bone/[0.08] px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-bone/55">
          {gamesWithOdds.length}
        </span>
        <div className="ml-auto text-[10.5px] font-semibold uppercase tracking-[0.18em] text-bone/30">
          {section.currentOddsProvider ?? "scraper cache"}
        </div>
      </div>

      {/* Games grid — 2-col on md+, 1-col on mobile */}
      {gamesWithOdds.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {gamesWithOdds.map((game) => (
            <CompactGameRow key={game.id} game={game} leagueKey={section.leagueKey} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-bone/[0.06] bg-surface px-4 py-3 text-[13px] text-bone/40">
          Scoreboard only — odds not yet available for this window.
        </div>
      )}
    </section>
  );
}

type BoardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BoardPage({ searchParams }: BoardPageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBoardFilters({ league: "ALL", date: "today", status: "all" });
  const data = await getBoardPageData(filters);

  const activeSections = data.sportSections.filter(
    (s) => s.games.length > 0 || s.scoreboard.length > 0
  );

  const totalGames = data.sportSections.reduce((n, s) => n + s.games.filter(
    (g) => g.moneyline.bestOdds || g.spread.bestOdds || g.total.bestOdds
  ).length, 0);

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="sticky top-0 z-30 border-b border-bone/[0.06] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1400px] px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                Live Odds Board
              </h1>
              <span className="rounded-full border border-aqua/20 bg-aqua/[0.06] px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-aqua">
                {totalGames} games
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="live-dot" />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-bone/50">
                Refreshes every 5 min
              </span>
            </div>
          </div>

          {/* League jump nav */}
          <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
            {activeSections.map((section) => {
              const count = section.games.filter(
                (g) => g.moneyline.bestOdds || g.spread.bestOdds || g.total.bestOdds
              ).length;
              return (
                <a
                  key={section.leagueKey}
                  href={`#${section.leagueKey}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-bone/[0.09] bg-surface px-3 py-1 text-[11px] font-semibold text-bone/65 transition-colors hover:border-aqua/25 hover:text-aqua"
                >
                  <span>{LEAGUE_ICONS[section.leagueKey]}</span>
                  <span>{section.leagueKey}</span>
                  {count > 0 && (
                    <span className="font-mono tabular-nums text-bone/40">{count}</span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {activeSections.length === 0 ? (
          <div className="rounded-2xl border border-bone/[0.07] bg-surface px-6 py-12 text-center">
            <p className="text-[14px] text-bone/50">No games available right now.</p>
          </div>
        ) : (
          <div className="grid gap-8">
            {activeSections.map((section) => (
              <LeagueSection key={section.leagueKey} section={section} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
