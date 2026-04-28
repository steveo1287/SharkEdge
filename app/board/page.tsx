import Link from "next/link";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";
import { TeamBadge } from "@/components/identity/team-badge";
import { formatGameDateTime } from "@/lib/formatters/date";
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

function hasOdds(game: BoardSportSectionView["games"][number]) {
  return Boolean(game.moneyline.bestOdds || game.spread.bestOdds || game.total.bestOdds);
}

function metricTone(label: string) {
  if (label === "Elite") return "border-emerald-400/35 bg-emerald-500/10 text-emerald-200";
  if (label === "Strong") return "border-cyan-400/35 bg-cyan-500/10 text-cyan-200";
  if (label === "Watchlist") return "border-sky-400/30 bg-sky-500/10 text-sky-200";
  return "border-white/10 bg-white/[0.035] text-slate-400";
}

function healthTone(state: ProviderHealthView["state"]) {
  if (state === "HEALTHY") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (state === "DEGRADED") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (state === "FALLBACK") return "border-orange-400/30 bg-orange-500/10 text-orange-200";
  return "border-red-400/30 bg-red-500/10 text-red-200";
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function MarketBox({ label, line, odds }: { label: string; line: string; odds?: number | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-white">{line || "—"}</div>
      {typeof odds === "number" ? <div className="mt-0.5 font-mono text-[11px] text-aqua">{formatOdds(odds)}</div> : null}
    </div>
  );
}

function GameCard({ game, leagueKey }: { game: BoardSportSectionView["games"][number]; leagueKey: LeagueKey }) {
  const awayLogo = getTeamLogoUrl(leagueKey, game.awayTeam.abbreviation);
  const homeLogo = getTeamLogoUrl(leagueKey, game.homeTeam.abbreviation);
  const oddsReady = hasOdds(game);
  const href = game.detailHref ?? `/game/${game.id}`;
  const movement = game.spread.movement || game.moneyline.movement || game.total.movement || 0;

  return (
    <Link href={href} className="group block h-full">
      <article className="relative h-full overflow-hidden rounded-2xl border border-white/10 bg-[#07111d] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-aqua/35 hover:bg-[#091827]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aqua/45 to-transparent" />
        <div className="flex items-start justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {LEAGUE_ICONS[leagueKey]} {leagueKey} · {formatGameDateTime(game.startTime)}
          </div>
          <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${oddsReady ? metricTone(game.edgeScore.label) : "border-amber-400/25 bg-amber-500/10 text-amber-200"}`}>
            {oddsReady ? `${game.edgeScore.score} ${game.edgeScore.label}` : "Pending"}
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="flex items-center gap-3">
            <TeamBadge name={game.awayTeam.name} abbreviation={game.awayTeam.abbreviation} logoUrl={awayLogo} size="sm" tone="away" />
            <div className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-white">{game.awayTeam.name}</div>
            <div className="font-mono text-[13px] text-slate-300">{formatOdds(game.moneyline.bestOdds)}</div>
          </div>
          <div className="flex items-center gap-3">
            <TeamBadge name={game.homeTeam.name} abbreviation={game.homeTeam.abbreviation} logoUrl={homeLogo} size="sm" tone="home" />
            <div className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-white">{game.homeTeam.name}</div>
            <div className="font-mono text-[13px] text-slate-500">—</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MarketBox label="Spread" line={game.spread.lineLabel} odds={game.spread.bestOdds} />
          <MarketBox label="ML" line={game.moneyline.label} odds={game.moneyline.bestOdds} />
          <MarketBox label="Total" line={game.total.lineLabel} odds={game.total.bestOdds} />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px]">
          <span className="text-slate-500">Move <span className="font-mono text-slate-300">{movement ? `${movement > 0 ? "+" : ""}${movement.toFixed(1)}` : "Flat"}</span></span>
          <span className="font-semibold uppercase tracking-[0.16em] text-aqua">Open →</span>
        </div>
      </article>
    </Link>
  );
}

function LeagueSection({ section, providerHealth }: { section: BoardSportSectionView; providerHealth: ProviderHealthView }) {
  const displayGames = section.games;
  const gamesWithOdds = displayGames.filter(hasOdds);
  if (displayGames.length === 0 && section.scoreboard.length === 0) return null;

  return (
    <section id={section.leagueKey} className="grid gap-4 scroll-mt-32">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl">{LEAGUE_ICONS[section.leagueKey]}</div>
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-white">{section.leagueLabel}</h2>
          <div className="mt-0.5 text-xs text-slate-500">{displayGames.length} games · {gamesWithOdds.length} priced · {providerHealth.freshnessLabel}</div>
        </div>
        <div className={`ml-auto rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${healthTone(providerHealth.state)}`}>{providerHealth.label}</div>
      </div>

      {displayGames.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {displayGames.map((game) => <GameCard key={game.id} game={game} leagueKey={section.leagueKey} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-sm text-slate-400">
          <p className="font-semibold text-slate-200">No games available for this window.</p>
          <p className="mt-2 text-slate-500">{providerHealth.summary}</p>
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
  const activeSections = data.sportSections.filter((s) => s.games.length > 0 || s.scoreboard.length > 0);
  const totalGames = data.sportSections.reduce((n, s) => n + s.games.length, 0);
  const pricedGames = data.sportSections.reduce((n, s) => n + s.games.filter(hasOdds).length, 0);
  const strongGames = data.sportSections.reduce((n, s) => n + s.games.filter((game) => game.edgeScore.label === "Elite" || game.edgeScore.label === "Strong").length, 0);
  const movementCount = data.sportSections.reduce((n, s) => n + s.games.filter((game) => Boolean(game.spread.movement || game.moneyline.movement || game.total.movement)).length, 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.12),transparent_32rem),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.08),transparent_30rem)]">
      <div className="sticky top-0 z-30 border-b border-white/10 bg-ink/88 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aqua">SharkEdge Board</div>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white">Live market command</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/" className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-aqua/35 hover:text-aqua">Home</Link>
              <Link href="/sim" className="rounded-full border border-aqua/25 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-aqua hover:bg-aqua/15">Sim desk</Link>
              <Link href="/trends" className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-aqua/35 hover:text-aqua">Trends</Link>
            </div>
          </div>

          {activeSections.length ? (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
              {activeSections.map((section) => {
                const count = section.games.length;
                const priced = section.games.filter(hasOdds).length;
                return (
                  <a key={section.leagueKey} href={`#${section.leagueKey}`} className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-aqua/35 hover:text-aqua">
                    <span>{LEAGUE_ICONS[section.leagueKey]}</span>
                    <span>{section.leagueKey}</span>
                    {count > 0 ? <span className="font-mono text-slate-500">{priced}/{count}</span> : null}
                  </a>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <main className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6">
        <section className="rounded-[2rem] border border-white/10 bg-[#07111d]/90 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-aqua">Trading floor</div>
              <h2 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Find the playable number fast.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Odds, edge score, market move, data health, and matchup access are now one scan.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
              <StatTile label="Games" value={totalGames} sub="active board" />
              <StatTile label="Priced" value={pricedGames} sub="with odds" />
              <StatTile label="Strong+" value={strongGames} sub="top labels" />
              <StatTile label="Moving" value={movementCount} sub="line changes" />
            </div>
          </div>
        </section>

        {activeSections.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] px-6 py-12 text-center">
            <p className="mb-2 text-base font-semibold text-white">No games in current window</p>
            <p className="mb-4 text-sm text-slate-400">{data.sourceNote}</p>
            <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-left text-sm">
              <p className="mb-1 font-semibold text-slate-300">Provider Status: {data.providerHealth.label}</p>
              <p className="mb-2 text-slate-500">{data.providerHealth.summary}</p>
              {data.providerHealth.warnings.length > 0 ? (
                <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                  {data.providerHealth.warnings.map((warning, i) => <p key={i} className="text-xs text-slate-500">• {warning}</p>)}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-9">
            {activeSections.map((section) => <LeagueSection key={section.leagueKey} section={section} providerHealth={data.providerHealth} />)}
          </div>
        )}
      </main>
    </div>
  );
}
