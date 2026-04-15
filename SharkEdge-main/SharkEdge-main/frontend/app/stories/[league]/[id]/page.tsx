import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { LeagueKey } from "@/lib/types/domain";
import { buildLeagueStoryPackage } from "@/services/content/story-writer-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    league: string;
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function readNumber(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = readValue(searchParams, key);
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function StoryPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const leagueKey = resolvedParams.league.toUpperCase();
  const title = readValue(resolvedSearch, "title") ?? "SharkEdge Desk Story";
  const summary = readValue(resolvedSearch, "summary") ?? null;
  const category = readValue(resolvedSearch, "category") ?? "Desk update";
  const imageUrl = readValue(resolvedSearch, "image") ?? null;
  const publishedAt = readValue(resolvedSearch, "publishedAt") ?? null;
  const eventHref = readValue(resolvedSearch, "eventHref") ?? null;
  const eventLabel = readValue(resolvedSearch, "eventLabel") ?? null;
  const awayTeam = readValue(resolvedSearch, "awayTeam") ?? null;
  const homeTeam = readValue(resolvedSearch, "homeTeam") ?? null;
  const awayScore = readNumber(resolvedSearch, "awayScore");
  const homeScore = readNumber(resolvedSearch, "homeScore");
  const storyPackage = await buildLeagueStoryPackage({
    league: leagueKey as LeagueKey,
    title,
    summary,
    category,
    publishedAt,
    eventHref,
    eventLabel,
    boxscore:
      awayTeam || homeTeam
        ? {
            awayTeam,
            homeTeam,
            awayScore,
            homeScore
          }
        : null
  });

  return (
    <div className="page-shell max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/leagues/${leagueKey}`} className="text-sm text-sky-300">
          Back to {leagueKey}
        </Link>
        <div className="rounded-full border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.22em] text-slate-400">
          Story
        </div>
      </div>

      <Card className="overflow-hidden border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_34%),linear-gradient(145deg,_rgba(4,10,19,0.98),_rgba(8,19,32,0.96))] p-0">
        <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em]">
              <div className="text-sky-300">{storyPackage.eyebrow}</div>
              <div className="text-slate-500">{category}</div>
              {publishedAt ? <div className="text-slate-500">{publishedAt.slice(0, 10)}</div> : null}
            </div>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-white md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">{storyPackage.dek}</p>

            <div className="mt-6 grid gap-4">
              {storyPackage.sections.map((section) => (
                <div key={section.title} className="rounded-2xl border border-white/8 bg-slate-950/55 px-5 py-5">
                  <div className="text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                    {section.title}
                  </div>
                  <div className="mt-3 text-sm leading-7 text-slate-300">{section.body}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3">
              {storyPackage.takeaways.map((takeaway, index) => (
                <div
                  key={`${takeaway}-${index}`}
                  className={`rounded-2xl border px-4 py-4 ${
                    index === 0
                      ? "border-emerald-400/25 bg-emerald-400/8 text-emerald-200"
                      : "border-white/8 bg-slate-950/70 text-slate-300"
                  }`}
                >
                  {takeaway}
                </div>
              ))}
            </div>
          </div>

          <div className="border-l border-white/8 bg-slate-950/70">
            {imageUrl ? (
              <div className="aspect-[4/3] overflow-hidden border-b border-white/8">
                <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="aspect-[4/3] border-b border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.25),_transparent_45%),linear-gradient(135deg,#0f172a,#111827_55%,#020617)]" />
            )}

            <div className="grid gap-4 p-6">
              <div className="rounded-2xl border border-white/8 bg-[#121212] p-4">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  Betting context
                </div>
                <div className="mt-3 text-sm leading-7 text-slate-300">
                  {storyPackage.bettingImpact}
                </div>
              </div>

              {storyPackage.boxscoreSummary ? (
                <div className="rounded-2xl border border-white/8 bg-[#121212] p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    Box score recap
                  </div>
                  <div className="mt-3 text-sm leading-7 text-slate-300">{storyPackage.boxscoreSummary}</div>
                </div>
              ) : null}

              {eventLabel ? (
                <div className="text-sm text-slate-400">
                  Story context: <span className="text-slate-200">{eventLabel}</span>
                </div>
              ) : null}

              {eventHref ? (
                <Link href={eventHref} className="inline-flex text-sm text-sky-300">
                  Open matchup page
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
