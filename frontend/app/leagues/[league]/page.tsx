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
  const liveGames =
    snapshot?.featuredGames?.filter((game) => game.status === "LIVE").length ?? 0;
  const standingRows = snapshot?.standings?.length ?? 0;

  return (
    <div className="grid gap-7">
      <Card className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4">
            <div className="section-kicker">{leagueKey} desk</div>
            <div className="font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Scores, standings, verified board, and internal stories for one league.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              This page stays league-clean. If verified odds are live, betting tools stay up.
              If not, SharkEdge falls back to score and story context instead of faking a desk.
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/?league=${leagueKey}`}
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Open home desk
              </Link>
              <Link
                href={`/bets?league=${leagueKey}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
              >
                League bets
              </Link>
              <Link
                href={`/trends?league=${leagueKey}&sample=5`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
              >
                League trends
              </Link>
            </div>
          </div>

          <div className="grid gap-3 rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4 md:grid-cols-2">
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Live games</div>
              <div className="mt-2 text-2xl font-semibold text-white">{liveGames}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Standings rows</div>
              <div className="mt-2 text-2xl font-semibold text-white">{standingRows}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Stories</div>
              <div className="mt-2 text-2xl font-semibold text-white">{stories.length}</div>
            </div>
            <div>
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">Props</div>
              <div className="mt-2 text-2xl font-semibold text-white">{leagueProps.length}</div>
            </div>
          </div>
        </div>
      </Card>

      {snapshot ? (
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Snapshot"
            title={`${leagueKey} standings and score pulse`}
            description="Standings, featured games, and honest league context."
          />
          <LeagueSnapshot snapshot={snapshot} />
        </section>
      ) : null}

      {section ? (
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Board"
            title="Verified league board"
            description="Schedule and odds for this league only. Scores stay visible even when odds are not verified."
          />
          <SportSection section={section} focusMarket={boardFilters.market} />
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Best bets"
            title={`${leagueKey} prop leaders`}
            description="Top current prop entries for this league."
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

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Trends"
          title={`${leagueKey} trend support`}
          description="Qualified historical angles for this league only."
        />
        <div className="grid gap-4 xl:grid-cols-3">
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
            <Card className="surface-panel xl:col-span-3 p-6 text-sm leading-7 text-slate-400">
              No league trend clears the publish threshold in this window yet.
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
