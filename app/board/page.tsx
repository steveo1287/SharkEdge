import Link from "next/link";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";
import { TeamBadge } from "@/components/identity/team-badge";
import type { BoardSportSectionView, LeagueKey, ProviderHealthView } from "@/lib/types/domain";

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

const ESPN_SPORT_PATH: Partial<Record<LeagueKey, string>> = {
  NBA: "nba",
  MLB: "mlb",
  NHL: "nhl",
  NFL: "nfl"
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

function CompactGameRow({ game, leagueKey }: { game: BoardSportSectionView["games"][number]; leagueKey: LeagueKey }) {
  const awayLogo = getTeamLogoUrl(leagueKey, game.awayTeam.abbreviation);
  const homeLogo = getTeamLogoUrl(leagueKey, game.homeTeam.abbreviation);

  return (
    <Link href={game.detailHref ?? `/game/${game.id}`} className="block">
      <div className="group grid grid-cols-[1fr_auto] gap-x-4 gap-y-0 rounded-xl border border-bone/[0.07] bg-surface px-4 py-3 transition-colors hover:border-aqua/25 hover:bg-panel">
        <div className="grid gap-2.5">
          <div className="flex items-center gap-2.5">
            <TeamBadge
              name={game.awayTeam.name}
              abbreviation={game.awayTeam.abbreviation}
              logoUrl={awayLogo}
              size="sm"
              tone="away"
            />
            <span className="truncate font-display text-[14px] font-semibold tracking-[-0.01em] text-text-primary">
              {game.awayTeam.name}
            </span>
            <span className="ml-auto font-mono text-[13px] tabular-nums text-bone/60">
              {formatOdds(game.moneyline.bestOdds)}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <TeamBadge
              name={game.homeTeam.name}
              abbreviation={game.homeTeam.abbreviation}
              logoUrl={homeLogo}
              size="sm"
              tone="home"
            />
            <span className="truncate font-display text-[14px] font-semibold tracking-[-0.01em] text-text-primary">
              {game.homeTeam.name}
            </span>
            <span className="ml-auto font-mono text-[13px] tabular-nums text-bone/60">—</span>
          </div>
        </div>

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

function LeagueSection({ section, providerHealth }: { section: BoardSportSectionView; providerHealth: ProviderHealthView }) {
  const gamesWithOdds = section.games.filter(
    (g) => g.moneyline.bestOdds || g.spread.bestOdds || g.total.bestOdds
  );
  if (gamesWithOdds.length === 0 && section.scoreboard.length === 0) return null;

  const healthColor = {
    HEALTHY: "border-aqua/20 bg-aqua/[0.04] text-aqua",
    DEGRADED: "border-amber-500/20 bg-amber-500/[0.04] text-amber-500",
    FALLBACK: "border-orange-500/20 bg-orange-500/[0.04] text-orange-500",
    OFFLINE: "border-red-500/20 bg-red-500/[0.04] text-red-500"
  }[providerHealth.state] || "border-bone/[0.08] text-bone/55";

  return (
    <section id={section.leagueKey} className="grid gap-3">
      <div className="flex items-center gap-3">
        <span className="text-lg">{LEAGUE_ICONS[section.leagueKey]}</span>
        <h2 className="font-display text-[15px] font-semibold text-text-primary">
          {section.leagueLabel}
        </h2>
        <span className="rounded-full bg-bone/[0.08] px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-bone/55">
          {gamesWithOdds.length}
        </span>
        <div className={`ml-auto rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] ${healthColor}`}>
          {providerHealth.label}
        </div>
      </div>

      {gamesWithOdds.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
          {gamesWithOdds.map((game) => (
            <CompactGameRow key={game.id} game={game} leagueKey={section.leagueKey} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-bone/[0.06] bg-surface px-4 py-3 text-[13px] text-bone/40">
          <p className="mb-1">No live odds available for this window.</p>
          <p className="text-[12px] text-bone/30">{providerHealth.summary}</p>
          {providerHealth.freshnessMinutes !== null && (
            <p className="mt-1 text-[11px] text-bone/25">Last update: {providerHealth.freshnessLabel}</p>
          )}
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
  const filters = parseBoardFilters(resolved);
  const data = await getBoardPageData(filters);

  const activeSections = data.sportSections.filter(
    (s) => s.games.length > 0 || s.scoreboard.length > 0
  );

  const totalGames = data.sportSections.reduce(
    (n, s) => n + s.games.filter((g) => g.moneyline.bestOdds || g.spread.bestOdds || g.total.bestOdds).length,
    0
  );

  return (
    <div className="min-h-screen">
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
                  {count > 0 && <span className="font-mono tabular-nums text-bone/40">{count}</span>}
                </a>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {activeSections.length === 0 ? (
          <div className="rounded-2xl border border-bone/[0.07] bg-surface px-6 py-12 text-center">
            <p className="mb-2 text-[14px] font-semibold text-bone/70">No games in current window</p>
            <p className="mb-4 text-[13px] text-bone/50">{data.sourceNote}</p>
            <div className="mx-auto max-w-md rounded-lg border border-bone/[0.06] bg-ink/30 px-4 py-3 text-left text-[12px]">
              <p className="mb-1 font-semibold text-bone/60">Provider Status: {data.providerHealth.label}</p>
              <p className="mb-2 text-bone/45">{data.providerHealth.summary}</p>
              {data.providerHealth.warnings.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-bone/[0.06] pt-2">
                  {data.providerHealth.warnings.map((warning, i) => (
                    <p key={i} className="text-[11px] text-bone/40">• {warning}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-8">
            {activeSections.map((section) => (
              <LeagueSection key={section.leagueKey} section={section} providerHealth={data.providerHealth} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
