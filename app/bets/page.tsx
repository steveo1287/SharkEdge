import Link from "next/link";

import { BetsWorkspace } from "@/components/bets/bets-workspace";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { getPublishedTrendCards } from "@/lib/trends/publisher";
import type { LeagueKey, PropCardView, TrendFilters } from "@/lib/types/domain";
import { resolveMatchupHref } from "@/lib/utils/entity-routing";
import { getBetTrackerData, parseBetFilters } from "@/services/bets/bets-service";
import { getArbitrageOpportunities } from "@/services/odds/arbitrage-service";
import { getBoardPageData } from "@/services/odds/board-service";
import { getPropsExplorerData } from "@/services/odds/props-service";
import { getPerformanceDashboard } from "@/services/bets/bets-service";
import { LEAGUE_SPORT_MAP, SPORT_LABELS } from "@/lib/utils/ledger";

export const dynamic = "force-dynamic";

const FEATURED_LEAGUE_PRIORITY: LeagueKey[] = ["NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"];

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item] as const)).values());
}

function hasVerifiedBoardGame(
  game: Awaited<ReturnType<typeof getBoardPageData>>["games"][number]
) {
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 ||
      game.moneyline.bestOdds !== 0 ||
      game.total.bestOdds !== 0)
  );
}

function getFeaturedLeagues(
  filters: Awaited<ReturnType<typeof parseBetFilters>>,
  availableLeagues: LeagueKey[]
) {
  const ordered = FEATURED_LEAGUE_PRIORITY.filter((league) => availableLeagues.includes(league));

  if (filters.league !== "ALL") {
    return availableLeagues.includes(filters.league as LeagueKey) ? [filters.league as LeagueKey] : [];
  }

  if (filters.sport !== "ALL") {
    return ordered.filter((league) => LEAGUE_SPORT_MAP[league] === filters.sport);
  }

  return ordered.slice(0, 4);
}

function getFeaturedScopeLabel(
  filters: Awaited<ReturnType<typeof parseBetFilters>>,
  featuredLeagues: LeagueKey[]
) {
  if (filters.league !== "ALL") {
    return filters.league;
  }

  if (filters.sport !== "ALL") {
    return featuredLeagues.length ? `${SPORT_LABELS[filters.sport]} desk` : `${SPORT_LABELS[filters.sport]} pending`;
  }

  return featuredLeagues.length ? "All sports desk" : "Board loading";
}

function ConfidenceMeter({ value }: { value: number }) {
  const tone =
    value >= 80 ? "from-emerald-400 to-lime-300" : value >= 65 ? "from-sky-400 to-cyan-300" : "from-amber-400 to-orange-300";

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
        <span>Confidence</span>
        <span className="text-white">{Math.round(value)}/100</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-900">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${Math.max(8, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function BestBetCard({ play }: { play: PropCardView }) {
  return (
    <Card className="h-full overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <Badge tone="brand">{play.leagueKey}</Badge>
        <div className="text-[0.65rem] uppercase tracking-[0.18em] text-slate-500">
          {play.bestAvailableSportsbookName ?? play.sportsbook.name}
        </div>
      </div>
      <div className="mt-4 line-clamp-2 break-words font-display text-2xl font-semibold text-white">{play.player.name}</div>
      <div className="mt-2 text-sm text-slate-400">
        {formatMarketType(play.marketType)} {play.side} {play.line}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-slate-500">Odds</div>
          <div className="mt-1 font-semibold text-white">{formatAmericanOdds(play.bestAvailableOddsAmerican ?? play.oddsAmerican)}</div>
        </div>
        <div>
          <div className="text-slate-500">EV</div>
          <div className="mt-1 font-semibold text-emerald-300">
            {typeof play.expectedValuePct === "number" ? `${play.expectedValuePct > 0 ? "+" : ""}${play.expectedValuePct.toFixed(1)}%` : "--"}
          </div>
        </div>
        <div>
          <div className="text-slate-500">Edge</div>
          <div className="mt-1 font-semibold text-white">{play.edgeScore.label}</div>
        </div>
      </div>
      <div className="mt-4 line-clamp-4 break-words text-sm leading-6 text-slate-300">
        {play.analyticsSummary?.reason ?? "Cross-book price and stored market context still support the current number."}
      </div>
      <div className="mt-4">
        <ConfidenceMeter value={play.edgeScore.score} />
      </div>
    </Card>
  );
}

export default async function BetsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = parseBetFilters(resolved);
  const selection = Array.isArray(resolved.selection) ? resolved.selection[0] : resolved.selection;
  const prefill = Array.isArray(resolved.prefill) ? resolved.prefill[0] : resolved.prefill;
  const [data, performance] = await Promise.all([
    getBetTrackerData(filters, selection, prefill),
    getPerformanceDashboard()
  ]);
  const availableLeagues = data.leagues.map((league) => league.key as LeagueKey);
  const featuredLeagues = getFeaturedLeagues(filters, availableLeagues);
  const featuredScopeLabel = getFeaturedScopeLabel(filters, featuredLeagues);

  const [boards, propsGroups, trendGroups, arbitrageGroups] = await Promise.all([
    Promise.all(
      featuredLeagues.map((league) =>
        getBoardPageData({
          league,
          date: "today",
          sportsbook: "all",
          market: "all",
          status: "pregame"
        })
      )
    ),
    Promise.all(
      featuredLeagues.map((league) =>
        getPropsExplorerData({
          league,
          marketType: "ALL",
          team: "all",
          player: "all",
          sportsbook: "all",
          valueFlag: "all",
          sortBy: "edge_score"
        })
      )
    ),
    Promise.all(
      featuredLeagues.map((league) =>
        getPublishedTrendCards(
          {
            league,
            window: "365d",
            sample: 5
          } satisfies Partial<TrendFilters>,
          { limit: 4 }
        )
      )
    ),
    Promise.all(
      featuredLeagues.map((league) =>
        getArbitrageOpportunities({ league, date: "today", limit: 4 })
      )
    )
  ]);

  const boardGames = dedupeById(boards.flatMap((board) => board.games)).sort(
    (left, right) => right.edgeScore.score - left.edgeScore.score
  );
  const verifiedBoardGames = boardGames.filter(hasVerifiedBoardGame);
  const bestEvProps = dedupeById(propsGroups.flatMap((group) => group.props))
    .sort((left, right) => right.edgeScore.score - left.edgeScore.score)
    .slice(0, 4);
  const trends = dedupeById(trendGroups.flat())
    .sort((left, right) => right.rankingScore - left.rankingScore)
    .slice(0, 4);
  const arbitrage = dedupeById(arbitrageGroups.flat())
    .sort((left, right) => right.profitPct - left.profitPct)
    .slice(0, 4);
  const upsetLooks = verifiedBoardGames
    .filter((game) => game.moneyline.bestOdds > 0)
    .sort((left, right) => right.edgeScore.score - left.edgeScore.score)
    .slice(0, 4);
  const opportunityCards = [
    arbitrage.length ? "arb" : null,
    upsetLooks.length ? "dogs" : null,
    trends.length ? "trends" : null
  ].filter(Boolean).length;

  return (
    <div className="grid gap-6">
      <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_34%),linear-gradient(145deg,_rgba(4,10,19,0.98),_rgba(8,19,32,0.96))] p-6 xl:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="text-[0.72rem] uppercase tracking-[0.28em] text-sky-300">Best bets desk</div>
            <div className="mt-4 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              One desk for the bets that matter.
            </div>
            <div className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
              Verified EV props, real arbitrage, real underdog prices, and trend-backed looks first.
              The ledger stays lower where tracking belongs.
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#opportunity-board" className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Opportunity board</a>
              <a href="#ev-board" className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200">EV desk</a>
              <a href="#ledger" className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200">Ledger</a>
            </div>
          </div>
          <div className="grid gap-3 rounded-[1.7rem] border border-white/10 bg-slate-950/65 p-4 md:grid-cols-2">
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Scope</div>
              <div className="mt-2 text-2xl font-semibold text-white">{featuredScopeLabel}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Open bets</div>
              <div className="mt-2 text-2xl font-semibold text-white">{data.summary.openBets}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">CLV rate</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-300">
                {performance.summary.positiveClvRate === null ? "--" : `${performance.summary.positiveClvRate.toFixed(0)}%`}
              </div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Record</div>
              <div className="mt-2 text-2xl font-semibold text-white">{performance.summary.record}</div>
            </div>
            <div className="md:col-span-2 text-sm leading-6 text-slate-400">
              {featuredLeagues.length
                ? filters.league !== "ALL"
                  ? `Locked to ${featuredLeagues[0]} so the page stays league-clean.`
                  : filters.sport !== "ALL"
                    ? `Locked to ${SPORT_LABELS[filters.sport]} so the page stays sport-clean.`
                  : "Running across the verified all-sports board by default."
                : "Waiting on qualified board rows in this scope."}
            </div>
          </div>
        </div>
      </Card>

      {opportunityCards ? (
      <section id="opportunity-board" className="grid gap-4">
        <SectionTitle
          title="Opportunity board"
          description="Only sections with real signal survive the page."
        />
        <div className={`grid gap-6 ${opportunityCards === 1 ? "" : opportunityCards === 2 ? "xl:grid-cols-2" : "xl:grid-cols-3"}`}>
        {arbitrage.length ? <Card className="surface-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.7rem] uppercase tracking-[0.24em] text-emerald-300">Arbitrage opportunities</div>
              <div className="mt-2 text-sm text-slate-400">True split-book moneyline spots only.</div>
            </div>
            <Badge tone="premium">{featuredScopeLabel}</Badge>
          </div>
          <div className="mt-4 grid gap-3">
            {arbitrage.map((spot) => (
              <Link key={spot.id} href={spot.detailHref} className="rounded-[1.3rem] border border-white/8 bg-slate-950/70 px-4 py-4 transition hover:border-emerald-400/20">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-white">{spot.eventLabel}</div>
                  <div className="text-emerald-300">+{spot.profitPct.toFixed(2)}%</div>
                </div>
                <div className="mt-2 text-sm text-slate-400">{spot.note}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>{spot.awayBook} {formatAmericanOdds(spot.awayOddsAmerican)}</div>
                  <div>{spot.homeBook} {formatAmericanOdds(spot.homeOddsAmerican)}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card> : null}

        {upsetLooks.length ? <Card className="surface-panel p-5">
          <div className="text-[0.7rem] uppercase tracking-[0.24em] text-orange-300">Best underdog looks</div>
          <div className="mt-2 text-sm text-slate-400">Positive-price upset shots in the active scope.</div>
          <div className="mt-4 grid gap-3">
            {upsetLooks.map((game) => (
              <Link
                key={game.id}
                href={
                  resolveMatchupHref({
                    leagueKey: game.leagueKey,
                    externalEventId: game.externalEventId,
                    fallbackHref: game.detailHref ?? null
                  }) ?? "/board"
                }
                className="rounded-[1.3rem] border border-white/8 bg-slate-950/70 px-4 py-4 transition hover:border-orange-400/20"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-white">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div>
                  <Badge tone="brand">{game.edgeScore.label}</Badge>
                </div>
                <div className="mt-2 text-sm text-slate-400">{game.moneyline.label} | {game.moneyline.bestBook}</div>
                <div className="mt-4">
                  <ConfidenceMeter value={game.edgeScore.score} />
                </div>
              </Link>
            ))}
          </div>
        </Card> : null}
        {trends.length ? <Card className="surface-panel p-5">
          <div className="text-[0.7rem] uppercase tracking-[0.24em] text-sky-300">Best trends of the day</div>
          <div className="mt-2 text-sm text-slate-400">High-signal trend reads tied to the active scope.</div>
          <div className="mt-4 grid gap-3">
            {trends.map((trend) => (
              <Link key={trend.id} href={trend.href} className="rounded-[1.3rem] border border-white/8 bg-slate-950/70 px-4 py-4 transition hover:border-sky-400/20">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="brand">{trend.marketLabel}</Badge>
                  <div className="text-sm font-semibold text-emerald-300">{trend.primaryMetricValue}</div>
                </div>
                <div className="mt-3 line-clamp-2 font-semibold text-white">{trend.title}</div>
                <div className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">{trend.description}</div>
                <div className="mt-3">
                  <ConfidenceMeter value={Math.min(100, trend.rankingScore / 10)} />
                </div>
              </Link>
            ))}
          </div>
        </Card> : null}
        </div>
      </section>
      ) : null}

      {bestEvProps.length ? <section id="ev-board" className="grid gap-4">
        <SectionTitle title="Best EV values" description="Sharper prop entries with visible confidence and cleaner market context." />
        <div className="grid gap-4 xl:grid-cols-2">
          {bestEvProps.map((play) => (
            <BestBetCard key={play.id} play={play} />
          ))}
        </div>
      </section> : null}

      <Card className="surface-panel p-4">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <select name="status" defaultValue={filters.status} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All bets</option>
            <option value="OPEN">Open</option>
            <option value="SETTLED">Settled</option>
            <option value="WIN">Wins</option>
            <option value="LOSS">Losses</option>
            <option value="PUSH">Pushes</option>
            <option value="VOID">Void</option>
            <option value="CASHED_OUT">Cashed Out</option>
          </select>

          <select name="sport" defaultValue={filters.sport} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All sports</option>
            {data.sports.map((sport) => (
              <option key={sport.code} value={sport.code}>
                {sport.label}
              </option>
            ))}
          </select>

          <select name="league" defaultValue={filters.league} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All leagues</option>
            {data.leagues.map((league) => (
              <option key={league.key} value={league.key}>
                {league.label}
              </option>
            ))}
          </select>

          <select name="market" defaultValue={filters.market} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="ALL">All markets</option>
            {data.marketOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select name="sportsbook" defaultValue={filters.sportsbook} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All books</option>
            {data.sportsbooks.map((book) => (
              <option key={book.id} value={book.key}>
                {book.name}
              </option>
            ))}
          </select>

          <select name="window" defaultValue={filters.window} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>

          <select name="sort" defaultValue={filters.sort} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
            <option value="placedAt">Placed Time</option>
            <option value="stake">Stake</option>
            <option value="result">Result</option>
            <option value="clv">CLV</option>
          </select>

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <select name="direction" defaultValue={filters.direction} className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white">
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
            <button type="submit" className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300">
              Apply
            </button>
          </div>
        </form>
      </Card>

      <div id="ledger">
      <BetsWorkspace
        summary={data.summary}
        bets={data.bets}
        openBets={data.openBets}
        settledBets={data.settledBets}
        sweatBoard={data.sweatBoard}
        sportsbooks={data.sportsbooks}
        events={data.events}
        marketOptions={data.marketOptions}
        setup={data.setup}
        prefill={data.prefill}
        liveNotes={data.liveNotes}
      />
      </div>
    </div>
  );
}
