import Link from "next/link";

import {
  getProviderHealthTone,
  MovementCard,
  ResearchRail
} from "@/app/_components/home-primitives";
import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
import { LiveBoardFeedClient } from "@/components/board/live-board-feed-client";
import { SharkLogoLockup } from "@/components/branding/shark-logo-lockup";
import { MobileTrendCard } from "@/components/home/mobile-trend-card";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { DiagnosticMetaStrip } from "@/components/intelligence/provider-diagnostic-shells";
import { ModelHealthPanel } from "@/components/intelligence/model-health-panel";
import { AdvancedStatDriverList } from "@/components/intelligence/advanced-stat-driver-list";
import { MlbEliteSnapshotPanel } from "@/components/intelligence/mlb-elite-snapshot-panel";
import { MlbEliteExplainer } from "@/components/intelligence/mlb-elite-explainer";
import { HorizontalEventRail } from "@/components/mobile/horizontal-event-rail";
import { SectionTabs } from "@/components/mobile/section-tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard,
  type PublishedTrendSection
} from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
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

type SafeTrendFeed = {
  featured: PublishedTrendCard[];
  sections: PublishedTrendSection[];
};

const VALID_TREND_LEAGUES: Array<NonNullable<TrendFilters["league"]>> = [
  "ALL",
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "BOXING",
  "UFC"
];

function normalizeTrendLeague(
  value: string | null | undefined
): NonNullable<TrendFilters["league"]> {
  if (!value) {
    return "ALL";
  }

  return VALID_TREND_LEAGUES.includes(value as NonNullable<TrendFilters["league"]>)
    ? (value as NonNullable<TrendFilters["league"]>)
    : "ALL";
}

function isValidTrendCard(card: unknown): card is PublishedTrendCard {
  if (!card || typeof card !== "object") {
    return false;
  }

  const value = card as Partial<PublishedTrendCard>;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.href === "string" &&
    typeof value.leagueLabel === "string" &&
    typeof value.marketLabel === "string" &&
    typeof value.confidence === "string" &&
    typeof value.record === "string" &&
    Array.isArray(value.todayMatches)
  );
}

function isValidTrendSection(section: unknown): section is PublishedTrendSection {
  if (!section || typeof section !== "object") {
    return false;
  }

  const value = section as Partial<PublishedTrendSection>;
  return typeof value.category === "string" && Array.isArray(value.cards);
}


async function getModelHealthSurface() {
  try {
    const [dailyResponse, alertsResponse] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/v1/calibration/daily`, { cache: "no-store" }).then((response) => response.json()).catch(() => null),
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/v1/calibration/alerts`, { cache: "no-store" }).then((response) => response.json()).catch(() => null)
    ]);

    return {
      overall: dailyResponse?.summary?.report?.overall ?? null,
      alerts: Array.isArray(alertsResponse?.data) ? alertsResponse.data : []
    };
  } catch {
    return {
      overall: null,
      alerts: []
    };
  }
}

async function getSafeTrendFeed(league: string): Promise<SafeTrendFeed> {
  try {
    const safeLeague = normalizeTrendLeague(league);

    const feed = await getPublishedTrendFeed({
      league: safeLeague,
      window: "365d",
      sample: 5
    });

    const featured = Array.isArray(feed?.featured)
      ? feed.featured.filter(isValidTrendCard).slice(0, 3)
      : [];

    const sections = Array.isArray(feed?.sections)
      ? feed.sections
          .filter(isValidTrendSection)
          .map((section) => ({
            ...section,
            cards: section.cards.filter(isValidTrendCard).slice(0, 5)
          }))
          .filter((section) => section.cards.length > 0)
          .slice(0, 3)
      : [];

    return { featured, sections };
  } catch {
    return { featured: [], sections: [] };
  }
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getHomeCommandData(resolvedSearch);
  const trendFeed = await getSafeTrendFeed(home.focusedLeague);
  const modelHealth = await getModelHealthSurface();

  const railItems = home.verifiedGames.slice(0, 8).map((game, index) => ({
    id: game.id,
    label: `${game.awayTeam.abbreviation} ${game.homeTeam.abbreviation}`,
    note: new Date(game.startTime).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }),
    href: game.detailHref ?? `/game/${game.id}`,
    active: index === 0
  }));

  return (
    <div className="grid gap-6 xl:gap-8">
      <section className="mobile-surface overflow-hidden xl:surface-panel-strong xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr] xl:items-end xl:gap-8">
          <div className="grid gap-5">
            <div className="flex items-start justify-between gap-4 xl:block">
              <div>
                <SharkLogoLockup subtitle="Premium market intelligence" />
                <div className="mt-4 text-sm text-slate-400">Welcome back</div>
                <h1 className="mt-1 text-[2.15rem] font-black tracking-tight text-white xl:max-w-5xl xl:font-display xl:text-[4.6rem] xl:font-semibold xl:leading-[0.98]">
                  Find the sharpest edge.
                </h1>
                <p className="mt-2 max-w-[28ch] text-sm leading-6 text-slate-400 xl:max-w-3xl xl:text-base xl:leading-8 xl:text-slate-300">
                  Verified market context first, matchup detail second, props only
                  when the number earns the screen.
                </p>
              </div>

              <Link
                href="/alerts"
                className="mobile-icon-button xl:hidden"
                aria-label="Open alerts"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <path
                    d="M12 4a4 4 0 00-4 4v2.4c0 .7-.2 1.38-.56 1.97L6 15h12l-1.44-2.63A3.97 3.97 0 0116 10.4V8a4 4 0 00-4-4z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 18a2 2 0 004 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </Link>
            </div>

            <div className="mt-1 xl:hidden">
              <SectionTabs
                items={[
                  { label: "For You", active: true },
                  {
                    label:
                      home.selectedLeague === "ALL"
                        ? "All Sports"
                        : home.selectedLeague
                  }
                ]}
              />
            </div>

            {railItems.length ? (
              <div className="xl:hidden">
                <HorizontalEventRail items={railItems} />
              </div>
            ) : null}

            <div className="hidden xl:flex xl:flex-wrap xl:gap-3">
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
              <div className="text-[0.66rem] uppercase tracking-[0.28em] text-slate-500">
                Current desk
              </div>
              <Badge tone={getProviderHealthTone(home.deskStatusState)}>
                {home.deskStatusLabel}
              </Badge>
            </div>

            <div className="text-3xl font-semibold text-white">
              {home.selectedLeague === "ALL" ? "All Sports" : home.selectedLeague}
            </div>

            <div className="text-sm leading-6 text-slate-300">
              {home.liveDeskAvailable
                ? home.liveDeskMessage ?? home.liveBoardData?.providerHealth.summary
                : home.liveDeskMessage ?? home.boardData.sourceNote}
            </div>

            <DiagnosticMetaStrip
              items={[
                `Focus league: ${home.focusedLeague}`,
                `Slate: ${formatHomeDateLabel(home.selectedDate)}`,
                home.liveDeskFreshnessLabel,
                typeof home.liveDeskFreshnessMinutes === "number"
                  ? `${home.liveDeskFreshnessMinutes}m old`
                  : null
              ]}
            />

            <div className="terminal-rule mt-2" />

            <div className="data-grid">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Actionables
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {home.topActionables.length}
                </div>
              </div>

              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Verified games
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {home.verifiedGames.length}
                </div>
              </div>

              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Live watch
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {home.liveDeskAvailable ? home.movementGames.length : 0}
                </div>
              </div>

              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.2em] text-slate-500">
                  Desk warnings
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {home.liveDeskAvailable
                    ? home.liveBoardData?.providerHealth.warnings.length ?? 0
                    : home.boardData.providerHealth.warnings.length}
                </div>
              </div>
            </div>

            <div className="text-sm leading-6 text-slate-400">
              {home.deskSourceNote}
            </div>
          </div>
        </div>

        <div className="mt-6 hidden xl:grid xl:grid-cols-[1fr_auto] xl:items-center xl:gap-3">
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

      <ModelHealthPanel overall={modelHealth.overall} alerts={modelHealth.alerts} qualifiedWinnerTarget={0.7} />

      <AdvancedStatDriverList drivers={(home.verifiedGames[0] as never)?.topAdvancedStatDrivers ?? []} />

      <MlbEliteSnapshotPanel snapshot={(home.verifiedGames[0] as never)?.mlbEliteSnapshot ?? null} />

      <MlbEliteExplainer snapshot={(home.verifiedGames[0] as never)?.mlbEliteSnapshot ?? null} />

      {trendFeed.featured.length ? (
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Signals"
            title="Featured signals"
            description="Trend intelligence adds depth when it is available. If the feed is weak or fails, the homepage still loads cleanly."
          />
          <div className="mobile-scroll-row hide-scrollbar">
            {trendFeed.featured.map((card, index) => (
              <MobileTrendCard
                key={card.id}
                card={card}
                featured={index === 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      {trendFeed.sections.map((section) => (
        <section key={section.category} className="grid gap-4">
          <SectionTitle
            eyebrow="Trend rail"
            title={section.category}
            description="Rendered only when valid signal cards survive the server-side safety filter."
          />
          <div className="mobile-scroll-row hide-scrollbar">
            {section.cards.map((card) => (
              <MobileTrendCard key={card.id} card={card} />
            ))}
          </div>
        </section>
      ))}

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
                ctaLabel={
                  opportunity.kind === "prop"
                    ? "Open prop context"
                    : "Open matchup"
                }
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
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
                  Bet now windows
                </div>

                {home.decisionWindows.length ? (
                  home.decisionWindows.map((opportunity) => (
                    <div
                      key={`${opportunity.id}-window`}
                      className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-white">
                          {opportunity.selectionLabel}
                        </div>
                        <div className="text-[0.68rem] uppercase tracking-[0.18em] text-sky-300">
                          {opportunity.league}
                        </div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {opportunity.reasonSummary}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
                    No edge has earned an immediate bet-now posture right now.
                  </div>
                )}
              </div>

              <div className="grid gap-3">
                <div className="text-[0.66rem] uppercase tracking-[0.22em] text-rose-300">
                  Trap desk
                </div>

                {home.traps.length ? (
                  home.traps.map((opportunity) => (
                    <div
                      key={`${opportunity.id}-trap`}
                      className="rounded-[1rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3"
                    >
                      <div className="text-sm font-medium text-white">
                        {opportunity.selectionLabel}
                      </div>
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

          {home.verifiedGames.length ? (
            <div className="grid gap-3 xl:grid-cols-2 xl:gap-4">
              {home.verifiedGames.slice(0, 4).map((game) => (
                <LiveEdgeBoardCard key={game.id} game={game} />
              ))}
            </div>
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
                  Open the Games desk for broader matchup context or move into Props
                  if you already know the league you want to hunt.
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