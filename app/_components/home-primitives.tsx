import Link from "next/link";

import { EdgeScoreBadge } from "@/components/intelligence/edge-score-badges";
import { TrendSignalPanel } from "@/components/intelligence/trend-signal-panel";
import { Badge } from "@/components/ui/badge";
import { getProviderHealthTone } from "@/components/intelligence/provider-status-badges";
import type { GameCardView, LeagueKey, LeagueSnapshotView, TrendCardView } from "@/lib/types/domain";
import { formatAmericanOdds } from "@/lib/formatters/odds";
import { resolveMatchupHref } from "@/lib/utils/entity-routing";
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
  return (
    resolveMatchupHref({
      leagueKey: game.leagueKey,
      externalEventId: game.externalEventId,
      fallbackHref: game.detailHref ?? null
    }) ?? "/board"
  );
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

export { getProviderHealthTone };

export function MovementCard({ game }: { game: GameCardView }) {
  const dominantMove = getDominantMove(game);
  const severity = getMovementSeverity(game);

  return (
    <Link
      href={getGameHref(game)}
      className="focusable group block rounded-lg border border-bone/[0.08] bg-surface p-4 transition-colors hover:border-aqua/25 hover:bg-panel"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            {game.leagueKey}
          </div>
          <div className="mt-2 font-display text-[18px] font-semibold tracking-[-0.01em] text-text-primary">
            {game.awayTeam.abbreviation} <span className="text-bone/40">@</span> {game.homeTeam.abbreviation}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge tone={severity.tone}>{severity.label}</Badge>
          <EdgeScoreBadge label={game.edgeScore.label} />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-bone/[0.06] bg-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            Lead Move
          </div>
          <div className="text-[12.5px] font-semibold text-text-primary">
            {dominantMove.market}
          </div>
        </div>
        <div className="mt-1.5 font-mono text-[13px] font-medium tabular-nums text-aqua">
          {dominantMove.value}
        </div>
        <div className="mt-2 text-[12px] leading-[1.5] text-bone/55">
          {severity.note}
        </div>
      </div>

      <div className="mt-3 grid gap-1.5 font-mono text-[12.5px] tabular-nums text-bone/75">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] not-italic text-bone/50">Spread</span>
          <span>{game.spread.label} <span className="text-bone/30">·</span> {formatSignedNumber(game.spread.movement)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] not-italic text-bone/50">Total</span>
          <span>{game.total.label} <span className="text-bone/30">·</span> {formatSignedNumber(game.total.movement)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] not-italic text-bone/50">Moneyline</span>
          <span>{formatAmericanOdds(game.moneyline.bestOdds)} <span className="text-bone/30">·</span> {formatSignedNumber(game.moneyline.movement, 0)}</span>
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
      className="focusable group block overflow-hidden rounded-lg border border-bone/[0.08] bg-surface transition-colors hover:border-aqua/25"
    >
      {story.imageUrl ? (
        <div
          className={`relative ${featured ? "aspect-[16/9]" : "aspect-[16/8]"} overflow-hidden`}
        >
          <img
            src={story.imageUrl}
            alt={story.title}
            className="h-full w-full object-cover grayscale-[15%] transition duration-300 group-hover:grayscale-0 group-hover:scale-[1.02]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
        </div>
      ) : null}
      <div className="grid gap-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">
            {story.category ?? `${focusedLeague} desk`}
          </div>
          {story.eventLabel ? (
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">
              {story.eventLabel}
            </div>
          ) : null}
        </div>
        <div className="font-display text-[19px] font-semibold leading-[1.2] tracking-[-0.01em] text-text-primary">
          {story.title}
        </div>
        <div className="text-[13px] leading-[1.55] text-bone/60">
          {story.summary ?? "Open the internal story for betting relevance and market context."}
        </div>
      </div>
    </Link>
  );
}

export function TrendSignalCard({ trend }: { trend: TrendCardView }) {
  return <TrendSignalPanel trend={trend} />;
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
    <div className="grid gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="focusable group rounded-lg border border-bone/[0.08] bg-surface p-4 transition-colors hover:border-aqua/25 hover:bg-panel"
        >
          <div className="flex items-center justify-between">
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.10em] text-text-primary">{link.title}</div>
            <div className="text-bone/30 transition-colors group-hover:text-aqua">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="mt-1.5 text-[12.5px] leading-[1.5] text-bone/55">{link.detail}</div>
        </Link>
      ))}
    </div>
  );
}