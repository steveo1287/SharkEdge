import Link from "next/link";

import {
  getProviderHealthTone,
  MovementCard,
  ResearchRail
} from "@/app/_components/home-primitives";
import { GameCard } from "@/components/board/game-card";
import { HomePerformanceRail } from "@/components/home/home-performance-rail";
import { HomeWorkflowPanel } from "@/components/home/home-workflow-panel";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  getHomeCommandData,
  HOME_DESK_DATES,
  HOME_LEAGUE_ITEMS
} from "@/services/home/home-command-service";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatDateLabel(value: (typeof HOME_DESK_DATES)[number]["key"]) {
  return value === "today"
    ? "Today"
    : value === "tomorrow"
      ? "Tomorrow"
      : "Upcoming";
}

function formatFreshness(minutes: number | null | undefined) {
  if (typeof minutes !== "number") {
    return "Freshness unknown";
  }

  return `${minutes}m old`;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const {
    selectedLeague,
    selectedDate,
    focusedLeague,
    pregameBoardData,
    liveBoardData,
    performanceData,
    opportunitySnapshot,
    bestEdges,
    propDesk,
    verifiedGames,
    movementGames,
    liveWatchGames,
    combinedWarnings,
    deskActionableCount
  } = await getHomeCommandData(searchParams);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="grid gap-5">
            <div className="section-kicker">SharkEdge command center</div>
            <div className="max-w-5xl font-display text-5xl font-semibold tracking-tight text-white md:text-6xl xl:text-[4.5rem] xl:leading-[0.98]">
              What matters now. What changed. What deserves a click.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
              The homepage is no longer a billboard. It is the operating screen:
              best edges, live watch spots, real movers, and your actual workflow
              posture without fake urgency.
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
                href="/props"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Hunt props
              </Link>
              <Link
                href="/performance"
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:border-sky-400/25"
              >
                Performance
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.6rem] border border-white/8 bg-[#09131f]/85 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[0.66rem] uppercase tracking-[0.28em] text-slate-500">
                Current desk
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={getProviderHealthTone(pregameBoardData.providerHealth.state)}>
                  Pregame {pregameBoardData.providerHealth.label}
                </Badge>
                <Badge tone={getProviderHealthTone(liveBoardData.providerHealth.state)}>
                  Live {liveBoardData.providerHealth.label}
                </Badge>
              </div>
            </div>

            <div className="text-3xl font-semibold text-white">
              {selectedLeague === "ALL" ? "All Sports" : selectedLeague}
            </div>

            <div className="text-sm leading-6 text-slate-300">
              {pregameBoardData.providerHealth.summary}
            </div>

            <div className="flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
              <span>Focus league: {focusedLeague}</span>
              <span>Slate: {formatDateLabel(selectedDate)}</span>
              <span>Pregame {formatFreshness(pregameBoardData.providerHealth.freshnessMinutes)}</span>
              <span>Live {formatFreshness(liveBoardData.providerHealth.freshnessMinutes)}</span>
            </div>

            <div className="terminal-rule mt-2" />

            <div className="data-grid">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Bet now
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {deskActionableCount}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Live watch
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {liveWatchGames.length}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Movers
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {movementGames.length}
                </div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Warnings
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {combinedWarnings.length}
                </div>
              </div>
            </div>

            <div className="text-sm leading-6 text-slate-400">
              {pregameBoardData.sourceNote}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
          <div className="flex flex-wrap gap-2">
            {HOME_LEAGUE_ITEMS.map((league) => (
              <Link
                key={league.key}
                href={`/?league=${league.key}&date=${selectedDate}`}
                className={
                  selectedLeague === league.key
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
                href={`/?league=${selectedLeague}&date=${date.key}`}
                className={
                  selectedDate === date.key
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Best edges now"
            title="Open these first"
            description="This is the short list. Best price posture, best timing posture, and the cleanest current windows."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {bestEdges.length ? (
              bestEdges.map((opportunity) => (
                <OpportunitySpotlightCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  href={`/game/${opportunity.eventId}`}
                  ctaLabel="Open context"
                />
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
                No opportunities cleared the homepage threshold on this pass. That is the correct output when the desk does not have enough clean price posture.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Your workflow"
            title="Personal posture"
            description="Your betting workflow should live on the homepage too, not just raw markets."
          />
          <HomeWorkflowPanel performanceData={performanceData} />
        </section>
      </div>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Form and process"
          title="How your edge is actually behaving"
          description="Compact read on recent units, CLV posture, and the process mistakes that keep showing up."
        />
        <HomePerformanceRail performanceData={performanceData} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Line movement"
            title="Numbers worth reacting to"
            description="These are the real movers on the pregame desk. Open the matchup instead of staring at the homepage."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {movementGames.length ? (
              movementGames.map((game) => <MovementCard key={game.id} game={game} />)
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
                No verified movement rows cleared the desk right now.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Live watchlist"
            title="Games that deserve live attention"
            description="Not every live game belongs here. Only the ones worth opening."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {liveWatchGames.length ? (
              liveWatchGames.map((game) => (
                <GameCard key={game.id} game={game} focusMarket="best" />
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400 xl:col-span-2">
                The live desk has nothing verified enough to lead with on this render.
              </Card>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Prop desk"
            title="Props with enough posture to matter"
            description="This stays selective. Props do not earn homepage space just because they exist."
          />
          <div className="grid gap-4">
            {propDesk.length ? (
              propDesk.map((opportunity) => (
                <OpportunitySpotlightCard
                  key={opportunity.id}
                  opportunity={opportunity}
                  href={`/game/${opportunity.eventId}`}
                  ctaLabel="Open prop context"
                />
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                The prop desk is quiet right now. That is better than homepage filler.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Trap desk"
            title="What should not lead you"
            description="Good command centers tell you what to avoid too."
          />
          <div className="grid gap-4">
            {opportunitySnapshot.traps.length ? (
              <Card className="surface-panel p-5">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-rose-300">
                  Do not chase
                </div>
                <div className="mt-3 grid gap-3">
                  {opportunitySnapshot.traps.map((opportunity) => (
                    <div
                      key={`${opportunity.id}-trap`}
                      className="rounded-[1rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3"
                    >
                      <div className="text-sm font-medium text-white">
                        {opportunity.selectionLabel}
                      </div>
                      <div className="mt-1 text-sm text-rose-100">
                        {opportunity.whatCouldKillIt[0] ?? opportunity.reasonSummary}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                No major trap lines are surfacing above threshold on this pass.
              </Card>
            )}

            <Card className="surface-panel p-5">
              <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                Coverage / trust summary
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Pregame desk: </span>
                  {pregameBoardData.providerHealth.summary}
                </div>
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Live desk: </span>
                  {liveBoardData.providerHealth.summary}
                </div>
                <div className="rounded-[1rem] border border-line bg-slate-950/65 px-4 py-3 text-sm text-slate-300">
                  <span className="font-medium text-white">Warnings: </span>
                  {combinedWarnings.length
                    ? combinedWarnings.join(" • ")
                    : "No active desk warnings right now."}
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Board"
            title="Verified matchups to open now"
            description={
              verifiedGames.length
                ? "Game detail should be one click away from the command center."
                : "If verified market rows are thin, move straight into the Games desk and let the matchup page do the work."
            }
          />
          <div className="grid gap-4 xl:grid-cols-2">
            {verifiedGames.length ? (
              verifiedGames.map((game) => (
                <GameCard key={game.id} game={game} focusMarket="best" />
              ))
            ) : (
              <Card className="surface-panel p-6">
                <div className="grid gap-3">
                  <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                    Verified rows are thin
                  </div>
                  <div className="text-2xl font-semibold text-white">
                    The board is staying honest instead of inventing a slate.
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
                      href={`/props?league=${focusedLeague}`}
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
            description="The homepage should hand you into the next desk, not trap you in widget hell."
          />
          <ResearchRail focusedLeague={focusedLeague} />
        </section>
      </div>
    </div>
  );
}