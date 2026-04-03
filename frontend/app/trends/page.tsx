import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

function isFocused(filters: TrendFilters) {
  return Boolean(
    filters.team ||
      filters.subject ||
      filters.player ||
      filters.fighter ||
      filters.opponent ||
      (filters.league && filters.league !== "ALL") ||
      (filters.sport && filters.sport !== "ALL") ||
      (filters.market && filters.market !== "ALL")
  );
}

function formatMetric(value: number | null, suffix: string) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value > 0 && suffix !== "%" ? "+" : ""}${value.toFixed(suffix === "%" ? 0 : 1)}${suffix}`;
}

function getTrendScopeTitle(filters: TrendFilters) {
  return (
    filters.team ||
    filters.subject ||
    filters.player ||
    filters.fighter ||
    (filters.league !== "ALL" ? filters.league : null) ||
    (filters.sport !== "ALL" ? filters.sport.replace(/_/g, " ") : null) ||
    "Trend discovery"
  );
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

function TrendCard({
  card,
  featured = false
}: {
  card: PublishedTrendCard;
  featured?: boolean;
}) {
  return (
    <Link href={card.href} className="block h-full">
      <Card
        className={
          featured
            ? "surface-panel-strong h-full overflow-hidden px-5 py-5"
            : "surface-panel h-full overflow-hidden px-5 py-5 transition hover:border-sky-400/20 hover:bg-white/[0.02]"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{card.leagueLabel}</Badge>
            <Badge tone="muted">{card.marketLabel}</Badge>
            <Badge tone={card.overlooked ? "premium" : "muted"}>{card.category}</Badge>
          </div>
          <div className="text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
            {card.sampleSize} games
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className={featured ? "text-3xl font-semibold leading-tight text-white" : "text-xl font-semibold leading-tight text-white"}>
            {card.title}
          </div>
          <div className="text-sm leading-7 text-slate-400">{card.description}</div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-3 py-3">
            <div className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">Hit Rate</div>
            <div className="mt-2 text-lg font-semibold text-white">{formatMetric(card.hitRate, "%")}</div>
          </div>
          <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-3 py-3">
            <div className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">ROI</div>
            <div className="mt-2 text-lg font-semibold text-emerald-300">{formatMetric(card.roi, "%")}</div>
          </div>
          <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 px-3 py-3">
            <div className="text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">
              {card.primaryMetricLabel}
            </div>
            <div className="mt-2 text-lg font-semibold text-white">{card.primaryMetricValue}</div>
          </div>
        </div>

        {card.whyNow.length ? (
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
        ) : null}

        {card.warning ? (
          <div className="mt-4 rounded-[1rem] border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-sm leading-6 text-amber-100">
            {card.warning}
          </div>
        ) : null}
      </Card>
    </Link>
  );
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const feed = await getPublishedTrendFeed(filters);
  const sections = feed.sections.filter((section) => section.cards.length > 0);
  const cards = sections.flatMap((section) => section.cards);
  const focused = isFocused(filters);
  const liveMatchCount = cards.reduce((total, card) => total + card.todayMatches.length, 0);
  const averageScore = cards.length
    ? Math.round(cards.reduce((total, card) => total + card.rankingScore, 0) / cards.length)
    : 0;
  const featuredCards = feed.featured.slice(0, 3);

  return (
    <div className="grid gap-7">
      <Card className="surface-panel-strong overflow-hidden px-6 py-6 xl:px-8 xl:py-8">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4">
            <div className="section-kicker">Trend discovery</div>
            <div className="font-display text-4xl font-semibold tracking-tight text-white xl:text-5xl">
              {focused ? getTrendScopeTitle(filters) : "Real trend support for the current betting board"}
            </div>
            <div className="max-w-3xl text-base leading-8 text-slate-300">
              Trends stay published only when sample, ROI, hit rate, and current matchup relevance are strong enough to matter.
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-4">
            <form action="/trends" method="get" className="grid gap-3 md:grid-cols-2">
              <select
                name="sport"
                defaultValue={filters.sport}
                className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white"
              >
                <option value="ALL">All sports</option>
                <option value="BASKETBALL">Basketball</option>
                <option value="BASEBALL">Baseball</option>
                <option value="HOCKEY">Hockey</option>
                <option value="FOOTBALL">Football</option>
                <option value="MMA">MMA</option>
                <option value="BOXING">Boxing</option>
              </select>
              <select
                name="league"
                defaultValue={filters.league}
                className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white"
              >
                <option value="ALL">All leagues</option>
                <option value="NBA">NBA</option>
                <option value="NCAAB">NCAAB</option>
                <option value="MLB">MLB</option>
                <option value="NHL">NHL</option>
                <option value="NFL">NFL</option>
                <option value="NCAAF">NCAAF</option>
                <option value="UFC">UFC</option>
                <option value="BOXING">Boxing</option>
              </select>
              <select
                name="market"
                defaultValue={filters.market}
                className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white"
              >
                <option value="ALL">All markets</option>
                <option value="spread">Spread</option>
                <option value="moneyline">Moneyline</option>
                <option value="total">Total</option>
              </select>
              <input
                name="team"
                defaultValue={filters.team}
                placeholder="Team / subject"
                className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white placeholder:text-slate-500"
              />
              <select
                name="window"
                defaultValue={filters.window}
                className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white"
              >
                <option value="30d">30d</option>
                <option value="90d">90d</option>
                <option value="365d">365d</option>
                <option value="all">All history</option>
              </select>
              <select
                name="sample"
                defaultValue={String(filters.sample)}
                className="rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white"
              >
                <option value="5">5+</option>
                <option value="10">10+</option>
                <option value="20">20+</option>
                <option value="30">30+</option>
                <option value="50">50+</option>
              </select>
              <button
                type="submit"
                className="rounded-2xl bg-[#1277ff] px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(18,119,255,0.35)] transition hover:bg-[#1f83ff] md:col-span-2"
              >
                Run trends
              </button>
            </form>
          </div>
        </div>
      </Card>

      <ResearchStatusNotice
        eyebrow="Page status"
        title="Research beta with real filters and real caution"
        body="This page is useful when you want descriptive system research, not a magical prediction machine. Trend cards should inform the read, not replace the market or matchup decision workflow."
        meta="Best use: validate or challenge a current board or game angle. Worst use: treating one trend card like a blind bet instruction."
      />

      {feed.meta.sampleWarning ? (
        <Card className="rounded-[1.7rem] border border-amber-400/15 bg-amber-400/5 p-4 text-sm leading-7 text-amber-100">
          {feed.meta.sampleWarning}
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Published Trends"
          value={String(cards.length)}
          note="Cards that cleared the real sample and ranking floor."
        />
        <MetricTile
          label="Live + Upcoming"
          value={String(liveMatchCount)}
          note="Matchups tied to these trends in the live or next-72-hour slate."
        />
        <MetricTile
          label="Average Rank"
          value={cards.length ? String(averageScore) : "--"}
          note="Composite rank from ROI, hit rate, relevance, and current board fit."
        />
        <MetricTile
          label="Mode"
          value={focused ? "Scoped" : "Discover"}
          note="Focused searches stay narrow. Open searches stay selective."
        />
      </div>

      {cards.length ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            {featuredCards[0] ? <TrendCard card={featuredCards[0]} featured /> : null}
            <div className="grid gap-4">
              {featuredCards.slice(1, 3).map((card) => (
                <TrendCard key={card.id} card={card} />
              ))}
            </div>
          </section>

          <div className="grid gap-8">
            {sections.map((section) => (
              <section key={section.category} className="grid gap-4">
                <SectionTitle
                  eyebrow="Trend rail"
                  title={section.category}
                  description={section.cards[0]?.railReason ?? "Ranked trend feed"}
                />
                <div className="grid gap-4 xl:grid-cols-3">
                  {section.cards.map((card) => (
                    <TrendCard key={card.id} card={card} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <Card className="rounded-[2rem] border border-white/8 bg-[#171717] p-6 text-sm leading-7 text-slate-400">
          No real trend cards match this filter set yet. Widen the scope and SharkEdge will only surface systems that clear the real sample floor.
        </Card>
      )}
    </div>
  );
}
