import Link from "next/link";

import {
  PropsDeskSections,
  getCoverageTone,
  getProviderHealthTone
} from "@/app/_components/props-desk-sections";
import { BetSlipBoundary } from "@/components/bets/bet-slip-boundary";
import {
  DiagnosticMetaStrip,
  ProviderHealthSummaryPanel,
  RawProviderDetailsDisclosure
} from "@/components/intelligence/provider-diagnostic-shells";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { PropsTable } from "@/components/props/props-table";
import { BOARD_SPORTS } from "@/lib/config/board-sports";
import { getPropsCommandData } from "@/services/props/props-command-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PropsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const props = await getPropsCommandData(resolved);

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
                  {props.selectedLeagueLabel} snapshot
                </div>
                <Badge tone={getProviderHealthTone(props.data.providerHealth.state)}>
                  {props.data.providerHealth.label}
                </Badge>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Ranked rows</div>
                <div className="mt-2 text-2xl font-semibold text-white">{props.rankedProps.length}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Books</div>
                <div className="mt-2 text-2xl font-semibold text-white">{props.realBookCount}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Live sports</div>
                <div className="mt-2 text-2xl font-semibold text-white">{props.liveCoverageCount}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Partial / soon</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {props.partialCoverageCount} / {props.comingSoonCoverageCount}
                </div>
              </div>
              <div className="md:col-span-2 rounded-[1.1rem] border border-emerald-400/15 bg-emerald-400/8 px-4 py-3 text-sm leading-6 text-emerald-200">
                The prop page now ranks by actual prop usefulness, not just table order.
              </div>
              <div className="md:col-span-2">
                <ProviderHealthSummaryPanel
                  title="Provider health"
                  state={props.data.providerHealth.state}
                  label={props.data.providerHealth.label}
                  summary={props.summarizedDeskStatus}
                  metaItems={[
                    props.data.providerHealth.freshnessLabel,
                    typeof props.data.providerHealth.freshnessMinutes === "number"
                      ? `${props.data.providerHealth.freshnessMinutes}m old`
                      : null,
                    props.data.providerHealth.warnings.length
                      ? `${props.data.providerHealth.warnings.length} warning${props.data.providerHealth.warnings.length === 1 ? "" : "s"}`
                      : null
                  ]}
                />
              </div>
              <div className="md:col-span-2">
                <RawProviderDetailsDisclosure
                  items={[
                    {
                      label: "Provider summary",
                      value: props.data.providerHealth.summary,
                      breakMode: "words"
                    },
                    {
                      label: "Source note",
                      value: props.data.sourceNote,
                      breakMode: "all"
                    }
                  ]}
                />
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Scope</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">
              {props.selectedLeagueLabel}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Stay broad until you have a reason to narrow the prop hunt.
            </div>
          </Card>
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Open now</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">
              {props.featuredProps.length}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              These are the props that currently deserve first attention.
            </div>
          </Card>
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Watchlist</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">
              {props.watchlistProps.length}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Still worth tracking, but not the first rows you should click.
            </div>
          </Card>
          <Card className="surface-panel p-5">
            <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Books tracked</div>
            <div className="mt-3 font-display text-3xl font-semibold text-white">
              {props.realBookCount}
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Best-price comparison stays visible even when market depth thins out.
            </div>
          </Card>
        </div>

        <PropsDeskSections
          featuredProps={props.featuredProps}
          watchlistProps={props.watchlistProps}
        />

        <Card className="surface-panel p-4">
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <select
              name="league"
              defaultValue={props.filters.league}
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
              defaultValue={props.filters.marketType}
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
              defaultValue={props.filters.team}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="all">All teams / camps</option>
              {props.leagueTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.abbreviation}
                </option>
              ))}
            </select>
            <select
              name="player"
              defaultValue={props.filters.player}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="all">All players / fighters</option>
              {props.leaguePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
            <select
              name="sportsbook"
              defaultValue={props.filters.sportsbook}
              className="rounded-2xl border border-line bg-slate-950 px-4 py-3 text-sm text-white"
            >
              <option value="all">All books</option>
              {props.data.sportsbooks.map((book) => (
                <option key={book.id} value={book.key}>
                  {book.name}
                </option>
              ))}
            </select>
            <select
              name="valueFlag"
              defaultValue={props.filters.valueFlag}
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
                defaultValue={props.filters.sortBy}
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

          {props.rankedProps.length ? (
            <PropsTable props={props.rankedProps} />
          ) : (
            <EmptyState
              title="No real props match this filter set"
              description="That usually means this exact league, player, team, book, or market combination is not available in the live feed or stored rows right now."
            />
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {props.data.coverage.map((entry: any) => (
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