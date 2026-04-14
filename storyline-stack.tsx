import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { LeagueSnapshotView } from "@/lib/types/domain";

type StorylineStackProps = {
  snapshots: LeagueSnapshotView[];
  title?: string;
  description?: string;
};

type StoryItem = {
  id: string;
  leagueKey: string;
  title: string;
  href: string | null;
  summary: string | null;
  publishedAt: string | null;
  category: string | null;
  eventHref: string | null;
  eventLabel: string | null;
};

function buildStories(snapshots: LeagueSnapshotView[]): StoryItem[] {
  return snapshots.flatMap((snapshot) =>
    (snapshot.newsItems ?? []).map((story) => ({
      id: story.id,
      leagueKey: snapshot.league.key,
      title: story.title,
      href: story.href,
      summary: story.summary,
      publishedAt: story.publishedAt,
      category: story.category,
      eventHref: story.eventHref ?? null,
      eventLabel: story.eventLabel ?? null
    }))
  );
}

function formatPublished(value: string | null) {
  if (!value) return "Recent";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function StorylineStack({
  snapshots,
  title = "Storylines feeding the slate",
  description = "News should push you into the matchup and board workflow, not sit in a dead content lane."
}: StorylineStackProps) {
  const stories = buildStories(snapshots).slice(0, 8);

  if (!stories.length) {
    return null;
  }

  return (
    <section className="grid gap-4">
      <div>
        <div className="section-kicker">Storyline rail</div>
        <div className="text-2xl font-semibold text-white">{title}</div>
        <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {stories.map((story) => {
          const Wrapper = story.href ? Link : "div";
          const wrapperProps = story.href ? { href: story.href } : {};

          return (
            <Wrapper
              key={`${story.leagueKey}-${story.id}`}
              {...wrapperProps}
              className="rounded-[1.35rem] border border-white/8 bg-[#08111b]/90 p-5 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="premium">{story.leagueKey}</Badge>
                {story.category ? <Badge tone="muted">{story.category}</Badge> : null}
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{formatPublished(story.publishedAt)}</span>
              </div>

              <div className="mt-4 text-xl font-semibold leading-8 text-white">{story.title}</div>
              <div className="mt-2 text-sm leading-7 text-slate-400">
                {story.summary ?? "Open the story and carry the context into the matchup desk."}
              </div>

              {story.eventHref && story.eventLabel ? (
                <div className="mt-4 text-sm text-sky-300">
                  Matchup hook: <span className="font-medium">{story.eventLabel}</span>
                </div>
              ) : null}
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}
