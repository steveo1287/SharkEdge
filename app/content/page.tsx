import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import type { LeagueKey, LeagueSnapshotView } from "@/lib/types/domain";
import { buildInternalStoryHref } from "@/lib/utils/stories";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

export const dynamic = "force-dynamic";

type StoryRow = {
  leagueKey: LeagueKey;
  leagueName: string;
  story: NonNullable<LeagueSnapshotView["newsItems"]>[number];
};

function buildStoryHref(
  leagueKey: LeagueKey,
  story: NonNullable<LeagueSnapshotView["newsItems"]>[number]
) {
  return buildInternalStoryHref({
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
  });
}

function flattenStories(snapshots: LeagueSnapshotView[]) {
  return snapshots
    .flatMap((snapshot) =>
      (snapshot.newsItems ?? []).map((story) => ({
        leagueKey: snapshot.league.key,
        leagueName: snapshot.league.name,
        story
      }))
    )
    .sort((left, right) => {
      const leftTime = left.story.publishedAt ? new Date(left.story.publishedAt).getTime() : 0;
      const rightTime = right.story.publishedAt ? new Date(right.story.publishedAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 18);
}

export default async function ContentPage() {
  const snapshots = await getLeagueSnapshots("ALL");
  const stories = flattenStories(snapshots);

  return (
    <div className="grid gap-8">
      <section className="surface-panel-strong px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div className="grid gap-4">
            <div className="section-kicker">Content hub</div>
            <div className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              Coverage that makes the board smarter instead of just repeating headlines.
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              The content layer exists to explain why injuries, lineup shifts, and game results matter to the market and the bettor workflow.
            </div>
          </div>
          <div className="grid gap-3 rounded-[1.55rem] border border-white/8 bg-[#09131f]/85 p-5 text-sm text-slate-300">
            <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">Coverage output</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Stories surfaced</div>
                <div className="mt-2 text-3xl font-semibold text-white">{stories.length}</div>
              </div>
              <div>
                <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">Leagues active</div>
                <div className="mt-2 text-3xl font-semibold text-white">{new Set(stories.map((story) => story.leagueKey)).size}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ResearchStatusNotice
        eyebrow="Page status"
        title="Supporting desk, not a finished editorial moat"
        body="Use this page for synthesis that helps the board, props, and matchup workflow. It is valuable, but it should still support the core product instead of pretending to be the destination on its own."
        meta="Best use: open a story when it changes a number, a role, or a matchup read."
      />

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Original coverage"
          title="News and recaps with betting relevance"
          description="This is where SharkEdge keeps users on-site with synthesis instead of fluff."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stories.map(({ leagueKey, leagueName, story }: StoryRow, index) => (
            <Link key={`${leagueKey}-${story.id}`} href={buildStoryHref(leagueKey, story)} className="h-full">
              <Card className="surface-panel flex h-full flex-col overflow-hidden transition hover:border-sky-400/25 hover:bg-white/[0.03]">
                {story.imageUrl ? (
                  <div className={index % 5 === 0 ? "aspect-[16/10] overflow-hidden" : "aspect-[16/9] overflow-hidden"}>
                    <img
                      src={story.imageUrl}
                      alt={story.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : null}
                <div className="grid gap-3 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">{leagueName}</div>
                    <Badge tone="brand">{story.category ?? "desk"}</Badge>
                  </div>
                  <div className="text-xl font-semibold leading-tight text-white">{story.title}</div>
                  <div className="text-sm leading-6 text-slate-400">
                    {story.summary ?? "Open for the betting angle, market impact, and game context."}
                  </div>
                  {story.eventLabel ? (
                    <div className="text-xs uppercase tracking-[0.18em] text-sky-300">{story.eventLabel}</div>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
