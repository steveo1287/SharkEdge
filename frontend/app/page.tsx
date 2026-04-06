import Link from "next/link";

import {
  getProviderHealthTone,
  MovementCard,
  ResearchRail
} from "@/app/_components/home-primitives";
import { GameCard } from "@/components/board/game-card";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  HOME_DESK_DATES,
  HOME_LEAGUE_ITEMS,
  formatHomeDateLabel,
  getHomeCommandData
} from "@/services/home/home-command-service";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getHomeCommandData(resolvedSearch);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.18fr_0.82fr] xl:items-end">
          <div className="grid gap-5">
            <div className="section-kicker">SharkEdge command center</div>
            <div className="max-w-5xl font-display text-5xl font-semibold tracking-tight text-white md:text-6xl xl:text-[4.6rem] xl:leading-[0.98]">
              What matters now. What changed. What to open next.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              Verified market context first, matchup detail second, props only when the number earns the screen.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/board"
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Open board
              </Link>
              <Link
                href="/games"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Open games
              </Link>
              <Link
                href={`/props?league=${home.focusedLeague}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Hunt props
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.6rem] border border-white/8 bg-[#09131f]/85 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.28em] text-slate-500">Current desk</div>
              <Badge tone={getProviderHealthTone(home.boardData.providerHealth.state)}>
                {home.liveDeskAvailable ? home.boardData.providerHealth.label : "Live desk unavailable"}
              </Badge>
            </div>
            <div className="text-3xl font-semibold text-white">
              {home.selectedLeague === "ALL" ? "All Sports" : home.selectedLeague}
            </div>
            <div className="text-sm leading-6 text-slate-300">
              {home.liveDeskAvailable
                ? home.boardData.providerHealth.summary
                : home.liveDeskMessage ?? home.boardData.sourceNote}
            </div>
            <div className="flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              <span>Focus league: {home.focusedLeague}</span>
              <span>Slate: {formatHomeDateLabel(home.selectedDate)}</span>
              {home.liveDeskAvailable ? (
                <>
                  <span>{home.boardData.providerHealth.freshnessLabel}</span>
                  {typeof home.boardData.providerHealth.freshnessMinutes === "number" ? (
                    <span>{home.boardData.providerHealth.freshnessMinutes}m old</span>
                  ) : null}
                </>
              ) : (
                <span>Support-aware fallback</span>
              )}
            </div>
            <div className="terminal-rule mt-2" />
            <div className="data-grid">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Actionables</div>
                <div className="mt-2 text-2xl font-semibold text-white">{home.topActionables.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Verified games</div>
                <div className="mt-2 text-2xl font-semibold text-white">{home.verifiedGames.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Live watch</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {home.liveDeskAvailable ? home.movementGames.length : 0}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">Desk warnings</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {home.boardData.providerHealth.warnings.length}
                </div>
              </div>
            </div>
            <div className="text-sm leading-6 text-slate-400">{home.boardData.sourceNote}</div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex flex-wrap gap-2">
            {HOME_LEAGUE_ITEMS.map((league) => (
              <Link
                key={league.key}
                href={`/?league=${league.key}&date=${home.selectedDate}`}
                className={
                  home.selectedLeague === league.key
                    ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                    : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                }
              >
                {league.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {HOME_DESK_DATES.map((date) => (
              <Link
                key={date.key}
                href={`/?league=${home.selectedLeague}&date=${date.key}`}
                className={
                  home.selectedDate === date.key
                    ? "rounded-full border border-sky-400/35 bg-sky-500/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                    : "rounded-full border border-white/8 bg-white/[0.02] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 transition hover:border-white/12 hover:text-white"
                }
              >
                {date.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Best actionable edges"
          title="Open these first"
          description="One ranked view across board edges and prop opportunities, without splitting the homepage into redundant desks."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {home.topActionables.length ? (
            home.topActionables.map((opportunity) => (
              <OpportunitySpotlightCard
                key={opportunity.id}
                opportunity={opportunity}
                href={`/game/${opportunity.eventId}`}
                ctaLabel={opportunity.kind === "prop" ? "Open prop context" : "Open matchup"}
              />
            ))
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              No qualifying opportunities cleared the command center right now.
            </Card>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Decision support"
            title="What changed and what to avoid"
            description="Timing windows and trap context in one compact read."
          />
          <Card className="surface-panel p-5">
            <div className="grid gap-5">
              <div className="grid gap-3">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Bet now windows</div>
                {home.decisionWindows.length ? (
                  home.decisionWindows.map((opportunity) => (
                    <div
                      key={`${opportunity.id}-window`}
                      className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white">{opportunity.selectionLabel}</div>
                        <div className="text-[0.68rem] uppercase tracking-[0.18em] text-sky-300">
                          {opportunity.league}
                        </div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">{opportunity.reasonSummary}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
                    No edge has earned an immediate bet-now posture right now.
                  </div>
                )}
              </div>

              <div className="grid gap-3">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-rose-300">Trap desk</div>
                {home.traps.length ? (
                  home.traps.map((opportunity) => (
                    <div
                      key={`${opportunity.id}-trap`}
                      className="rounded-[1rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3"
                    >
                      <div className="text-sm font-medium text-white">{opportunity.selectionLabel}</div>
                      <div className="mt-2 text-sm leading-6 text-rose-100">
                        {opportunity.whatCouldKillIt[0] ?? opportunity.reasonSummary}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
                    No major trap flags are dominating the desk right now.
                  </div>
                )}
              </div>
            </div>
          </Card>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Live watch"
            title={home.liveDeskAvailable ? "Numbers worth reacting to" : "Live desk status"}
            description={
              home.liveDeskAvailable
                ? "Movement stays visible only when the live desk is actually connected."
                : "The command center stays honest when the live board is unavailable."
            }
          />
          {home.liveDeskAvailable && home.movementGames.length ? (
            <div className="grid gap-4">
              {home.movementGames.map((game) => (
                <MovementCard key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              {home.liveDeskMessage ??
                "No qualified movement rows cleared the live watch right now."}
            </Card>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Verified matchups"
            title="Open a real board row next"
            description={
              home.verifiedGames.length
                ? "Game detail should stay one click away from the command center."
                : "If verified rows are thin, the homepage stays honest instead of inventing fake depth."
            }
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {home.verifiedGames.length ? (
              home.verifiedGames.map((game) => (
                <GameCard key={game.id} game={game} focusMarket="best" />
              ))
            ) : (
              <Card className="surface-panel p-6">
                <div className="grid gap-3">
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                    Verified rows are thin
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    The homepage is refusing to fake a slate.
                  </div>
                  <div className="text-sm leading-7 text-slate-400">
                    Open the Games desk for broader matchup context or move into Props if you already know the league you want to hunt.
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <Link
                      href="/games"
                      className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
                    >
                      Open games
                    </Link>
                    <Link
                      href={`/props?league=${home.focusedLeague}`}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
                    >
                      Hunt props
                    </Link>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Next move"
            title="Go deeper without losing the thread"
            description="The homepage should hand you into the next desk, not trap you inside redundant panels."
          />
          <ResearchRail
            focusedLeague={home.focusedLeague}
            genericLeagueContext={home.selectedLeague === "ALL"}
          />
        </section>
      </div>
    </div>
  );
}