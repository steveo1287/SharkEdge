import Link from "next/link";

import {
  PropsDeskSections,
  getCoverageTone,
  getProviderHealthTone,
  sortPropsByPriority
} from "@/app/_components/props-desk-sections";
import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { PropsTable } from "@/components/props/props-table";
import { BOARD_SPORTS } from "@/lib/config/board-sports";
import type { PropMarketType } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function summarizePropDeskStatus(summary: string, sourceNote: string, warningCount: number) {
  const combined = `${summary} ${sourceNote}`.toLowerCase();

  if (combined.includes("out_of_usage_credits") || combined.includes("usage quota")) {
    return `Upstream quota pressure is reducing live prop coverage depth${warningCount ? ` (${warningCount} warning${warningCount === 1 ? "" : "s"})` : ""}.`;
  }

  if (combined.includes("partially connected") || combined.includes("partial")) {
    return `Live props are partially connected${warningCount ? ` with ${warningCount} active warning${warningCount === 1 ? "" : "s"}` : ""}.`;
  }

  if (warningCount > 0) {
    return `${warningCount} provider warning${warningCount === 1 ? "" : "s"} are affecting live prop coverage depth.`;
  }

  return summary;
}

export default async function PropsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const propsService = await import("@/services/odds/props-service");
  const filters = propsService.parsePropsFilters(resolved);
  const data = await propsService.getPropsExplorerData(filters);
  const selectedLeague =
    filters.league === "ALL"
      ? null
      : data.leagues.find((league) => league.key === filters.league) ?? null;
  const leagueTeams = selectedLeague
    ? data.teams.filter((team) => team.leagueId === selectedLeague.id)
    : data.teams;
  const leaguePlayers = selectedLeague
    ? data.players.filter((player) => player.leagueId === selectedLeague.id)
    : data.players;
  const liveCoverageCount = data.coverage.filter((entry: any) => entry.status === "LIVE").length;
  const partialCoverageCount = data.coverage.filter((entry: any) => entry.status === "PARTIAL").length;
  const comingSoonCoverageCount = data.coverage.filter((entry: any) => entry.status === "COMING_SOON").length;
  const realBookCount = data.sportsbooks.length;
  const selectedLeagueLabel = selectedLeague?.name ?? "All sports";
  const rankedProps = sortPropsByPriority(data.props);
  const featuredProps = rankedProps.slice(0, 3);
  const watchlistProps = rankedProps.slice(3, 9);
  const summarizedDeskStatus = summarizePropDeskStatus(
    data.providerHealth.summary,
    data.sourceNote,
    data.providerHealth.warnings.length
  );

  return (
    <BetSlipBoundary>
      <div className="grid gap-6">
        <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_34%),linear-gradient(145deg,_rgba(4,10,19,0.98),_rgba(8,19,32,0.96))] p-6 xl:p-8">
          <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-sky-300">Prop lab</div>
              <div className="mt-4 font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
                Price first. Confidence second. Everything else after that.
              </div>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
                The prop desk should feel like a hunt, not a spreadsheet accident. Best-supported entries rise first. Lower-conviction rows stay visible, but they do not get to masquerade as top plays.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#open-now"
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200"
                >
                  Open now
                </a>
                <a
                  href="#watchlist"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200"
                >
                  Watchlist desk
                </a>
                <a
                  href="#prop-board"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-200"
                >
                  Full board
                </a>
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.7rem] border border-white/10 bg-slate-950/65 p-4 text-sm text-slate-300 md:grid-cols-2">
              <div className="md:col-span-2 flex items-center justify-between gap-3">
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  {selectedLeagueLabel} snapshot
                </div>
                <Badge tone={getProviderHealthTone(data.providerHealth.state)}>
                  {data.providerHealth.label}
                </Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Ranked rows</div>
                <div className="mt-2 text-2xl font-semibold text-white">{rankedProps.length}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Books</div>
                <div className="mt-2 text-2xl font-semibold text-white">{realBookCount}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Live sports</div>
                <div className="mt-2 text-2xl font-semibold text-white">{liveCoverageCount}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Partial / soon</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {partialCoverageCount} / {comingSoonCoverageCount}
                </div>
              </div>
              <div className="md:col-span-2 rounded-[1.1rem] border border-emerald-400/15 bg-emerald-400/8 px-4 py-3 text-sm leading-6 text-emerald-200">
                The prop page now ranks by actual prop usefulness, not just table order.
              </div>
              <div className="md:col-span-2 rounded-[1.1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300 break-words overflow-hidden">
                {summarizedDeskStatus}
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
                <span>{data.providerHealth.freshnessLabel}</span>
                {typeof data.providerHealth.freshnessMinutes === "number" ? (
                  <span>{data.providerHealth.freshnessMinutes}m old</span>
                ) : null}
                {data.providerHealth.warnings.length ? (
                  <span>
                    {data.providerHealth.warnings.length} warning
                    {data.providerHealth.warnings.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <details className="md:col-span-2 rounded-[1.1rem] border border-white/8 bg-slate-950/50 px-4 py-3">
                <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-slate-500">
                  Raw provider details
                </summary>
                <div className="mt-3 grid gap-3 text-xs leading-6 text-slate-400">
                  <div className="break-words overflow-hidden whitespace-pre-wrap">
                    {data.providerHealth.summary}
                  </div>
                  <div className="break-all overflow-hidden whitespace-pre-wrap">
                    {data.sourceNote}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Scope</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">{selectedLeagueLabel}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Stay broad until you have a reason to narrow the prop hunt.
            </div>
          </Card>
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Open now</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">{featuredProps.length}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              These are the props that currently deserve first attention.
            </div>
          </Card>
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Watchlist</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">{watchlistProps.length}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Still worth tracking, but not the first rows you should click.
            </div>
          </Card>
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Books tracked</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">{realBookCount}</div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Best-price comparison stays visible even when market depth thins out.
            </div>
          </Card>
        </div>

        <PropsDeskSections featuredProps={featuredProps} watchlistProps={watchlistProps} />

        <Card className="surface-panel p-4">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <select
              name="league"
              defaultValue={filters.league}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="ALL">All sports</option>
              {BOARD_SPORTS.map((sport) => (
                <option key={sport.leagueKey} value={sport.leagueKey}>
                  {sport.leagueLabel}
                </option>
              ))}
            </select>
            <select
              name="marketType"
              defaultValue={filters.marketType}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="ALL">All supported markets</option>
              <option value="player_points">Player Points</option>
              <option value="player_rebounds">Player Rebounds</option>
              <option value="player_assists">Player Assists</option>
              <option value="player_threes">Player Threes</option>
              <option value="fight_winner">Fight Winner</option>
              <option value="method_of_victory">Method of Victory</option>
              <option value="round_total">Round Total</option>
              <option value="round_winner">Round Winner</option>
            </select>
            <select
              name="team"
              defaultValue={filters.team}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="all">All teams / camps</option>
              {leagueTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.abbreviation}
                </option>
              ))}
            </select>
            <select
              name="player"
              defaultValue={filters.player}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="all">All players / fighters</option>
              {leaguePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
            <select
              name="sportsbook"
              defaultValue={filters.sportsbook}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="all">All books</option>
              {data.sportsbooks.map((book) => (
                <option key={book.id} value={book.key}>
                  {book.name}
                </option>
              ))}
            </select>
            <select
              name="valueFlag"
              defaultValue={filters.valueFlag}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="all">All value states</option>
              <option value="BEST_PRICE">Best Price</option>
              <option value="MARKET_PLUS">Market Plus</option>
              <option value="STEAM">Steam</option>
            </select>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <select
                name="sortBy"
                defaultValue={filters.sortBy}
                className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
              >
                <option value="best_price">Best Price</option>
                <option value="market_ev">Market EV</option>
                <option value="edge_score">Edge Score</option>
                <option value="line_movement">Line Movement</option>
                <option value="league">League</option>
                <option value="start_time">Event</option>
              </select>
              <button
                type="submit"
                className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-300"
              >
                Apply
              </button>
            </div>
          </form>
        </Card>

        <section id="prop-board" className="grid gap-4">
          <SectionTitle
            eyebrow="Full board"
            title="Everything still on the desk"
            description="Full comparison still lives here after the priority desks do the sorting work."
          />

          {rankedProps.length ? (
            <PropsTable props={rankedProps} />
          ) : (
            <EmptyState
              title="No real props match this filter set"
              description="That usually means this exact league, player, team, book, or market combination is not available in the live feed or stored rows right now."
            />
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.coverage.map((entry: any) => (
            <Card key={entry.leagueKey} className="surface-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    {entry.leagueKey}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">{entry.supportLabel}</div>
                </div>
                <Badge tone={getCoverageTone(entry.status)}>{entry.status}</Badge>
              </div>
              <div className="mt-4 text-sm leading-6 text-slate-400 break-words overflow-hidden">
                {entry.note}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </BetSlipBoundary>
  );
}