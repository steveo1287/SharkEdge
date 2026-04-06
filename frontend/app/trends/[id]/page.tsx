import Link from "next/link";
import { notFound } from "next/navigation";

import { LeagueBadge } from "@/components/identity/league-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ResearchStatusNotice } from "@/components/ui/research-status-notice";
import { SectionTitle } from "@/components/ui/section-title";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard
} from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: keyof TrendFilters
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  return trendFiltersSchema.parse({
    sport: readValue(searchParams, "sport"),
    league: readValue(searchParams, "league"),
    market: readValue(searchParams, "market"),
    sportsbook: readValue(searchParams, "sportsbook"),
    side: readValue(searchParams, "side"),
    subject: readValue(searchParams, "subject"),
    team: readValue(searchParams, "team"),
    player: readValue(searchParams, "player"),
    fighter: readValue(searchParams, "fighter"),
    opponent: readValue(searchParams, "opponent"),
    window: readValue(searchParams, "window"),
    sample: readValue(searchParams, "sample")
  });
}

function getConfidenceTone(value: PublishedTrendCard["confidence"]) {
  if (value === "strong") {
    return "success" as const;
  }

  if (value === "moderate") {
    return "brand" as const;
  }

  if (value === "weak") {
    return "premium" as const;
  }

  return "muted" as const;
}

function formatMetric(value: number | null, suffix: string) {
  if (typeof value !== "number") {
    return "--";
  }

  if (suffix === "%") {
    return `${value.toFixed(0)}%`;
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function buildBackHref(filters: TrendFilters) {
  const params = new URLSearchParams();

  if (filters.sport !== "ALL") params.set("sport", filters.sport);
  if (filters.league !== "ALL") params.set("league", filters.league);
  if (filters.market !== "ALL") params.set("market", filters.market);
  if (filters.sportsbook !== "all") params.set("sportsbook", filters.sportsbook);
  if (filters.side !== "ALL") params.set("side", filters.side);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.team) params.set("team", filters.team);
  if (filters.player) params.set("player", filters.player);
  if (filters.fighter) params.set("fighter", filters.fighter);
  if (filters.opponent) params.set("opponent", filters.opponent);
  if (filters.window) params.set("window", filters.window);
  if (filters.sample) params.set("sample", String(filters.sample));

  const query = params.toString();
  return query ? `/trends?${query}` : "/trends";
}

function buildTrendDetailHref(card: PublishedTrendCard, filters: TrendFilters) {
  const params = new URLSearchParams();

  if (filters.sport !== "ALL") params.set("sport", filters.sport);
  if (filters.league !== "ALL") params.set("league", filters.league);
  if (filters.market !== "ALL") params.set("market", filters.market);
  if (filters.sportsbook !== "all") params.set("sportsbook", filters.sportsbook);
  if (filters.side !== "ALL") params.set("side", filters.side);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.team) params.set("team", filters.team);
  if (filters.player) params.set("player", filters.player);
  if (filters.fighter) params.set("fighter", filters.fighter);
  if (filters.opponent) params.set("opponent", filters.opponent);
  if (filters.window) params.set("window", filters.window);
  if (filters.sample) params.set("sample", String(filters.sample));

  const query = params.toString();
  const base = `/trends/${encodeURIComponent(card.sourceTrend.id)}`;
  return query ? `${base}?${query}` : base;
}

function MetricTile({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="surface-panel-muted px-4 py-4">
      <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{note}</div>
    </Card>
  );
}

function RelatedTrendCard({
  card,
  href
}: {
  card: PublishedTrendCard;
  href: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className="surface-panel h-full overflow-hidden px-5 py-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{card.leagueLabel}</Badge>
            <Badge tone="muted">{card.marketLabel}</Badge>
          </div>
          <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
            {card.sampleSize} games
          </div>
        </div>

        <div className="mt-4 text-xl font-semibold leading-tight text-white">{card.title}</div>
        <div className="mt-3 text-sm leading-7 text-slate-400">{card.description}</div>

        <div className="mt-4 flex flex-wrap gap-2">
          {card.whyNow.slice(0, 2).map((reason) => (
            <div
              key={`${card.id}-${reason}`}
              className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-300"
            >
              {reason}
            </div>
          ))}
        </div>
      </Card>
    </Link>
  );
}

export default async function TrendDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const feed = await getPublishedTrendFeed(filters);
  const cards = feed.sections.flatMap((section) => section.cards);

  const card =
    cards.find((entry) => entry.sourceTrend.id === id) ??
    cards.find((entry) => entry.id === id) ??
    null;

  if (!card) {
    notFound();
  }

  const relatedCards = cards.filter((entry) => entry.id !== card.id).slice(0, 3);
  const backHref = buildBackHref(filters);

  return (
    <div className="grid gap-7">
      <Card className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <LeagueBadge league={card.leagueLabel} />
              <Badge tone="muted">{card.marketLabel}</Badge>
              <Badge tone={card.overlooked ? "premium" : "muted"}>{card.category}</Badge>
              <Badge tone={getConfidenceTone(card.confidence)}>{card.confidence}</Badge>
            </div>

            <div className="font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              {card.title}
            </div>

            <div className="max-w-3xl text-base leading-8 text-slate-300">
              {card.description}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={backHref}
                className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                Back to trends
              </Link>

              {filters.league !== "ALL" ? (
                <Link
                  href={`/leagues/${filters.league}`}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
                >
                  Open league desk
                </Link>
              ) : (
                <Link
                  href="/board"
                  className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-400/25"
                >
                  Open board
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Record
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">{card.record}</div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Date range
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {card.sourceTrend.dateRange}
                </div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Trend type
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {card.sourceTrend.title}
                </div>
              </div>

              <div>
                <div className="text-[0.68rem] uppercase tracking-[0.24em] text-slate-500">
                  Current scope
                </div>
                <div className="mt-2 text-sm font-medium text-white">
                  {card.sourceTrend.contextLabel}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <ResearchStatusNotice
        eyebrow="Trend detail"
        title="Historical support, not blind automation"
        body="This page explains why a published trend exists, what is supporting it, and where it is still vulnerable. Use it to validate a read, not replace one."
        meta="Best use: challenge or confirm a board/game angle. Worst use: treating one system page like a guaranteed bet."
      />

      {card.warning ? (
        <Card className="rounded-[1.7rem] border border-amber-400/15 bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
          {card.warning}
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Sample"
          value={String(card.sampleSize)}
          note="Real rows used in this published system."
        />
        <MetricTile
          label="Hit Rate"
          value={formatMetric(card.hitRate, "%")}
          note="Win rate across the stored sample."
        />
        <MetricTile
          label="ROI"
          value={formatMetric(card.roi, "%")}
          note="Historical return on unit stake."
        />
        <MetricTile
          label="Profit"
          value={formatMetric(card.profitUnits, "u")}
          note="Net unit result across the sample."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Why it works"
            title="Why this trend made the rail"
            description="Published trends only stay visible when they clear sample, ranking, and live relevance thresholds."
          />

          <Card className="surface-panel p-5">
            <div className="text-sm leading-7 text-slate-300">{card.description}</div>

            <div className="mt-5 flex flex-wrap gap-2">
              {card.whyNow.length ? (
                card.whyNow.map((reason) => (
                  <div
                    key={`${card.id}-${reason}`}
                    className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-300"
                  >
                    {reason}
                  </div>
                ))
              ) : (
                <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-300">
                  No extra why-now tags
                </div>
              )}
            </div>

            <div className="mt-5 rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-400">
              Primary metric: <span className="text-white">{card.primaryMetricLabel}</span> ={" "}
              <span className="text-white">{card.primaryMetricValue}</span>
            </div>
          </Card>
        </section>

        <section className="grid gap-4">
          <SectionTitle
            eyebrow="Kill switch"
            title="What could weaken it"
            description="A trend can be real and still become unplayable at the current number or context."
          />

          <Card className="surface-panel p-5">
            <div className="grid gap-3">
              <div className="rounded-[1rem] border border-rose-400/20 bg-rose-500/8 px-4 py-3 text-sm leading-6 text-rose-100">
                {card.warning ??
                  "Historical support does not override bad current pricing, weak board support, or a matchup context that no longer fits."}
              </div>

              <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
                Confidence band: <span className="font-medium text-white">{card.confidence}</span>
              </div>

              <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
                Streak context:{" "}
                <span className="font-medium text-white">{card.streak ?? "No active streak"}</span>
              </div>
            </div>
          </Card>
        </section>
      </div>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Intelligence tags"
          title="What is supporting this system"
          description="These tags summarize the strongest reasons the trend remains visible."
        />

        <Card className="surface-panel p-5">
          {card.intelligenceTags.length ? (
            <div className="flex flex-wrap gap-2">
              {card.intelligenceTags.map((tag) => (
                <div
                  key={`${card.id}-${tag}`}
                  className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[0.68rem] uppercase tracking-[0.18em] text-slate-300"
                >
                  {tag}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm leading-7 text-slate-400">
              No additional intelligence tags were attached to this published trend.
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Matches now"
          title="Current slate overlap"
          description="These live or upcoming events currently match the trend scope."
        />

        {card.todayMatches.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {card.todayMatches.map((match) => (
              <Link key={match.id} href={match.href} className="block">
                <Card className="surface-panel h-full p-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
                      {match.league}
                    </div>
                    <Badge tone="brand">{match.tag}</Badge>
                  </div>

                  <div className="mt-3 text-xl font-semibold text-white">{match.matchup}</div>
                  <div className="mt-2 text-sm text-slate-400">{match.startTime}</div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            eyebrow="Matches now"
            title="No current matchup is tied to this system right now"
            description="The historical signal is still visible, but there is no live or near-term board match under the current scope."
          />
        )}
      </section>

      <section className="grid gap-4">
        <SectionTitle
          eyebrow="Related support"
          title="Nearby trends in the same scope"
          description="Use these to confirm or challenge the current read instead of overfitting one angle."
        />

        {relatedCards.length ? (
          <div className="grid gap-4 xl:grid-cols-3">
            {relatedCards.map((related) => (
              <RelatedTrendCard
                key={related.id}
                card={related}
                href={buildTrendDetailHref(related, filters)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            eyebrow="Related support"
            title="No related published trends in this scope"
            description="Widen the trend filters to compare this angle with a broader rail."
          />
        )}
      </section>
    </div>
  );
}