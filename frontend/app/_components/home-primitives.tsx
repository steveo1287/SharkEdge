import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { GameCardView, LeagueKey, LeagueSnapshotView, TrendCardView } from "@/lib/types/domain";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import { buildInternalStoryHref } from "@/lib/utils/stories";

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

function getGameHref(game: GameCardView) {
  return game.detailHref || `/game/${game.id}`;
}

function formatSignedNumber(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function getDominantMove(game: GameCardView) {
  const spreadAbs = Math.abs(game.spread.movement);
  const totalAbs = Math.abs(game.total.movement);
  const moneylineAbs = Math.abs(game.moneyline.movement);

  if (moneylineAbs >= spreadAbs * 10 && moneylineAbs >= totalAbs * 10) {
    return {
      market: "Moneyline",
      magnitude: moneylineAbs,
      value: `${formatAmericanOdds(game.moneyline.bestOdds)} | ${formatSignedNumber(
        game.moneyline.movement,
        0
      )}`
    };
  }

  if (spreadAbs >= totalAbs) {
    return {
      market: "Spread",
      magnitude: spreadAbs,
      value: `${game.spread.label} | ${formatSignedNumber(game.spread.movement)}`
    };
  }

  return {
    market: "Total",
    magnitude: totalAbs,
    value: `${game.total.label} | ${formatSignedNumber(game.total.movement)}`
  };
}

function getMovementSeverity(game: GameCardView) {
  const spreadAbs = Math.abs(game.spread.movement);
  const totalAbs = Math.abs(game.total.movement);
  const moneylineAbs = Math.abs(game.moneyline.movement);
  const dominant = getDominantMove(game);

  if (moneylineAbs >= 25 || spreadAbs >= 2 || totalAbs >= 2) {
    return {
      label: "Shock move",
      tone: "danger" as const,
      note: `${dominant.market} is moving hard enough to change the posture of the matchup.`
    };
  }

  if (moneylineAbs >= 15 || spreadAbs >= 1 || totalAbs >= 1) {
    return {
      label: "Strong move",
      tone: "premium" as const,
      note: `${dominant.market} has real movement behind it and deserves context before entry.`
    };
  }

  if (moneylineAbs >= 10 || spreadAbs >= 0.5 || totalAbs >= 0.5) {
    return {
      label: "Watch move",
      tone: "brand" as const,
      note: `${dominant.market} is worth monitoring, but not every move is actionable.`
    };
  }

  return {
    label: "Stable",
    tone: "success" as const,
    note: "Movement is present but not forceful enough to escalate this row on its own."
  };
}

export function getProviderHealthTone(state: string) {
  if (state === "HEALTHY") {
    return "success" as const;
  }

  if (state === "DEGRADED") {
    return "premium" as const;
  }

  if (state === "OFFLINE") {
    return "danger" as const;
  }

  return "muted" as const;
}

export function MovementCard({ game }: { game: GameCardView }) {
  const dominantMove = getDominantMove(game);
  const severity = getMovementSeverity(game);

  return (
    <Link
      href={getGameHref(game)}
      className="group rounded-[1.35rem] border border-white/8 bg-[#0a1422]/90 p-4 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            {game.leagueKey}
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge
            tone={severity.tone}
          >
            {severity.label}
          </Badge>
          <Badge
            tone={
              game.edgeScore.label === "Elite"
                ? "success"
                : game.edgeScore.label === "Strong"
                  ? "premium"
                  : game.edgeScore.label === "Watchlist"
                    ? "brand"
                    : "muted"
            }
          >
            {game.edgeScore.label}
          </Badge>
        </div>
      </div>

      <div className="mt-4 rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.66rem] uppercase tracking-[0.18em] text-slate-500">
            Lead move
          </div>
          <div className="text-sm font-semibold text-white">
            {dominantMove.market}
          </div>
        </div>
        <div className="mt-2 text-sm font-medium text-sky-300">
          {dominantMove.value}
        </div>
        <div className="mt-2 text-sm leading-6 text-slate-400">
          {severity.note}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <span>Spread</span>
          <span>
            {game.spread.label} | {formatSignedNumber(game.spread.movement)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Total</span>
          <span>
            {game.total.label} | {formatSignedNumber(game.total.movement)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>Moneyline</span>
          <span>
            {formatAmericanOdds(game.moneyline.bestOdds)} | {formatSignedNumber(
              game.moneyline.movement,
              0
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function StoryCard({
  story,
  focusedLeague,
  featured = false
}: {
  story: NonNullable<LeagueSnapshotView["newsItems"]>[number];
  focusedLeague: LeagueKey;
  featured?: boolean;
}) {
  return (
    <Link
      href={buildStoryHref(focusedLeague, story)}
      className="group overflow-hidden rounded-[1.45rem] border border-white/8 bg-[#0a1422]/90 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
    >
      {story.imageUrl ? (
        <div
          className={featured ? "aspect-[16/9] overflow-hidden" : "aspect-[16/8] overflow-hidden"}
        >
          <img
            src={story.imageUrl}
            alt={story.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        </div>
      ) : null}
      <div className="grid gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            {story.category ?? `${focusedLeague} desk`}
          </div>
          {story.eventLabel ? (
            <div className="text-[0.66rem] uppercase tracking-[0.18em] text-sky-300">
              {story.eventLabel}
            </div>
          ) : null}
        </div>
        <div className="text-xl font-semibold leading-tight text-white">{story.title}</div>
        <div className="text-sm leading-6 text-slate-400">
          {story.summary ?? "Open the internal story for betting relevance and market context."}
        </div>
      </div>
    </Link>
  );
}

export function TrendSignalCard({ trend }: { trend: TrendCardView }) {
  return (
    <Link
      href={trend.href ?? "/trends"}
      className="rounded-[1.35rem] border border-white/8 bg-[#0a1422]/90 p-4 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
    >
      <div className="flex items-center justify-between gap-3">
        <Badge tone={trend.tone === "success" ? "success" : trend.tone === "premium" ? "premium" : "brand"}>
          {trend.sampleSize} samples
        </Badge>
        <div className="text-sm font-semibold text-emerald-300">{trend.value}</div>
      </div>
      <div className="mt-4 text-lg font-semibold leading-tight text-white">{trend.title}</div>
      <div className="mt-3 text-sm leading-6 text-slate-400">{trend.note}</div>
    </Link>
  );
}

export function ResearchRail({
  focusedLeague,
  genericLeagueContext = false
}: {
  focusedLeague: LeagueKey;
  genericLeagueContext?: boolean;
}) {
  const contextTitle = genericLeagueContext ? "Team context" : `${focusedLeague} context`;
  const contextHref = genericLeagueContext ? "/teams" : `/teams?league=${focusedLeague}`;
  const links = [
    {
      href: "/board",
      title: "Market board",
      detail: "Live books, best price, movement, and stale-line awareness."
    },
    {
      href: "/games",
      title: "Games desk",
      detail: "Orient on the slate, then move from schedule context into the matchup lab."
    },
    {
      href: "/props",
      title: "Prop lab",
      detail: "Player markets, workload context, and fair-price hunting."
    },
    {
      href: contextHref,
      title: contextTitle,
      detail: "Team and player depth stay here when you need more than the core flow."
    }
  ];

  return (
    <div className="grid gap-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-[1.35rem] border border-white/8 bg-[#0a1422]/88 p-4 transition hover:border-sky-400/25 hover:bg-white/[0.03]"
        >
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white">{link.title}</div>
          <div className="mt-2 text-sm leading-6 text-slate-400">{link.detail}</div>
        </Link>
      ))}
    </div>
  );
}