import Link from "next/link";
import { notFound } from "next/navigation";

import { LeagueSnapshot } from "@/components/board/league-snapshot";
import { SportSection } from "@/components/board/sport-section";
import { TopPlaysPanel } from "@/components/board/top-plays-panel";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { getPublishedTrendCards } from "@/lib/trends/publisher";
import type { LeagueKey, PropFilters } from "@/lib/types/domain";
import { buildInternalStoryHref } from "@/lib/utils/stories";
import {
  getBoardPageData,
  parseBoardFilters
} from "@/services/odds/board-service";
import { getPropsExplorerData } from "@/services/odds/props-service";
import { buildLeagueHubQuickLinks, summarizeLeagueHub } from "@/services/leagues/league-ui-adapter";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

const SUPPORTED_LEAGUES: LeagueKey[] = [
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
];

type PageProps = {
  params: Promise<{
    league: string;
  }>;
};

export const dynamic = "force-dynamic";

function isLeagueKey(value: string): value is LeagueKey {
  return SUPPORTED_LEAGUES.includes(value as LeagueKey);
}

function buildLeaguePropFilters(league: LeagueKey): PropFilters {
  return {
    league,
    marketType: "ALL",
    team: "all",
    player: "all",
    sportsbook: "all",
    valueFlag: "all",
    sortBy: "edge_score"
  };
}

export default async function LeagueCenterPage({ params }: PageProps) {
  const { league } = await params;
  const leagueKey = league.toUpperCase();

  if (!isLeagueKey(leagueKey)) {
    notFound();
  }

  const boardFilters = parseBoardFilters({
    league: leagueKey,
    date: "today",
    sportsbook: "best",
    market: "all",
    status: "pregame"
  });

  const [boardData, propsData, trendCards, snapshots] = await Promise.all([
    getBoardPageData(boardFilters),
    getPropsExplorerData(buildLeaguePropFilters(leagueKey)),
    getPublishedTrendCards({ league: leagueKey, window: "365d", sample: 5 }, { limit: 6 }),
    getLeagueSnapshots(leagueKey)
  ]);

  const snapshot = snapshots[0] ?? null;
  const section =
    boardData.sportSections.find((entry) => entry.leagueKey === leagueKey) ?? null;
  const stories = (snapshot?.newsItems ?? []).filter((story) => story.leagueKey === leagueKey);
  const leagueProps = propsData.props.filter((prop) => prop.leagueKey === leagueKey);
  const quickLinks = buildLeagueHubQuickLinks(leagueKey);
  const hubSummary = summarizeLeagueHub({
    leagueKey,
    snapshot,
    hasVerifiedBoard: Boolean(section),
    propsCount: leagueProps.length,
    storiesCount: stories.length,
    trendCount: trendCards.length
  });

  return (
    <div className="grid gap-7">
      <Card className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-5">
            <div className="section-kicker">{leagueKey} league desk</div>
            <div className="font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              One league. One clean desk. Scoreboard, featured edges, standings, and routing into every matchup.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This is the league-first shell. The scoreboard stays honest, the board stays verified when pricing is live,
              and the desk routes straight into props, trends, teams, and game intelligence without dropping context.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/board?league=${leagueKey}`}
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Open verified board
              </Link>
              <Link
                href={`/props?league=${leagueKey}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
              >
                League props
              </Link>
              <Link
                href={`/trends?league=${leagueKey}&sample=5`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
              >
                Trend engine
              </Link>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="rounded-[1.35rem] border border-white/8 bg-slate-950/55 px-4 py-4 transition hover:border-sky-400/20 hover:bg-white/[0.03]"
                >
                  <div className="text-sm font-semibold text-white">{link.label}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">{link.description}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4 md:grid-cols-2">
            {hubSummary.metrics.map((metric) => (
              <div key={metric.label}>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  {metric.label}
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{metric.value}</div>
              </div>
            ))}
            <div className="md:col-span-2 rounded-[1.15rem] border border-white/8 bg-white/[0.03] px-4 py-4">
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Desk status</div>
              <div className="mt-2 text-base font-semibold text-white">{hubSummary.verifiedBoardLabel}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                League hubs stay usable even when pricing drops out. SharkEdge falls back to standings, stories, and game context instead of faking verified odds.
              </div>
            </div>
          </div>
        </div>
      </Card>

      <section id="standings" className="grid gap-4">
        <SectionTitle
          eyebrow="Scoreboard + standings"
          title={`${leagueKey} scoreboard rail`}
          description="Featured games, standings, and league pulse in one place."
        />
        {snapshot ? (
          <LeagueSnapshot snapshot={snapshot} />
        ) : (
          <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
            League snapshot data is not available right now.
          </Card>
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Verified board"
          title="League board and matchup routing"
          description="Schedule and odds for this league only. Scores stay visible even when odds are not verified."
        />
        {section ? (
          <SportSection section={section} focusMarket={boardFilters.market} />
        ) : (
          <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
            Verified board data is not available for this league window right now.
          </Card>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Featured edges"
            title={`${leagueKey} best bets`}
            description="Top current prop and market entries for this league."
          />
          {leagueProps.length ? (
            <TopPlaysPanel plays={leagueProps.slice(0, 3)} />
          ) : (
            <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
              No qualifying props are loaded for this league window right now.
            </Card>
          )}
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Market movers"
            title="League pressure and routing"
            description="Use the league desk to move fast between board, props, and trends without losing context."
          />
          <Card className="surface-panel overflow-hidden px-5 py-5">
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.02] p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Board access</div>
                  <div className="mt-2 text-lg font-semibold text-white">{section ? "Live" : "Fallback"}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    Verified board routes are {section ? "active for this league." : "currently in scoreboard-only mode."}
                  </div>
                </div>
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.02] p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Story pressure</div>
                  <div className="mt-2 text-lg font-semibold text-white">{stories.length}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    League-specific headlines rewritten into SharkEdge betting context.
                  </div>
                </div>
                <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.02] p-4">
                  <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">Trend support</div>
                  <div className="mt-2 text-lg font-semibold text-white">{trendCards.length}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">
                    Qualified historical systems currently published for this league.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/board?league=${leagueKey}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-400/20"
                >
                  Open league board
                </Link>
                <Link
                  href={`/games?league=${leagueKey}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-400/20"
                >
                  Open slate
                </Link>
                <Link
                  href={`/content?league=${leagueKey}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-400/20"
                >
                  League stories
                </Link>
              </div>
            </div>
          </Card>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Trends firing today"
            title={`${leagueKey} trend support`}
            description="Qualified historical angles for this league only."
          />
          <div className="grid gap-4">
            {trendCards.length ? (
              trendCards.map((card) => (
                <Link
                  key={card.id}
                  href={card.href}
                  className="rounded-[1.45rem] border border-white/8 bg-[#0a1523]/85 px-4 py-4 transition hover:border-sky-400/20 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center justify-between gap-3 text-[0.68rem] uppercase tracking-[0.22em]">
                    <div className="text-slate-500">{card.marketLabel}</div>
                    <div className="text-sky-300">{card.category}</div>
                  </div>
                  <div className="mt-3 line-clamp-2 text-lg font-semibold leading-tight text-white">
                    {card.title}
                  </div>
                  <div className="mt-3 text-sm text-slate-400">
                    {card.record}
                    {typeof card.hitRate === "number" ? ` | ${card.hitRate.toFixed(0)}% hit` : ""}
                    {typeof card.roi === "number"
                      ? ` | ${card.roi > 0 ? "+" : ""}${card.roi.toFixed(1)}% ROI`
                      : ""}
                  </div>
                  <div className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
                    {card.description}
                  </div>
                </Link>
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                No league trend clears the publish threshold in this window yet.
              </Card>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Stories"
            title="Internal league coverage"
            description="League-specific headlines rewritten into SharkEdge context."
          />
          <div className="grid gap-4">
            {stories.length ? (
              stories.slice(0, 3).map((story) => (
                <Link
                  key={story.id}
                  href={buildInternalStoryHref({
                    leagueKey,
                    id: story.id,
                    title: story.title,
                    summary: story.summary,
                    category: story.category,
                    imageUrl: story.imageUrl,
                    publishedAt: story.publishedAt,
                    sourceUrl: story.href,
                    eventId: story.eventId,
                    eventHref: story.eventHref,
                    eventLabel: story.eventLabel,
                    awayTeam: story.boxscore?.awayTeam,
                    homeTeam: story.boxscore?.homeTeam,
                    awayScore: story.boxscore?.awayScore ?? null,
                    homeScore: story.boxscore?.homeScore ?? null
                  })}
                  className="group overflow-hidden rounded-[1.6rem] border border-white/8 bg-[#0a1523]/90 transition hover:border-sky-400/20 hover:bg-white/[0.03]"
                >
                  {story.imageUrl ? (
                    <div className="aspect-[16/8] overflow-hidden border-b border-white/8 bg-[#06111d]">
                      <img
                        src={story.imageUrl}
                        alt={story.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-3 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                        {story.category ?? `${leagueKey} update`}
                      </div>
                      {story.publishedAt ? (
                        <div className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
                          {story.publishedAt.slice(0, 10)}
                        </div>
                      ) : null}
                    </div>
                    <div className="line-clamp-2 text-xl font-semibold leading-tight text-white">
                      {story.title}
                    </div>
                    <div className="line-clamp-4 text-sm leading-6 text-slate-400">
                      {story.summary ?? "Open the internal story for the latest league update."}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <Card className="surface-panel p-6 text-sm leading-7 text-slate-400">
                This league does not have story cards from the current feed right now.
              </Card>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}