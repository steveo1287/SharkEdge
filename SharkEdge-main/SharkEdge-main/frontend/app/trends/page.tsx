import Link from "next/link";

import { getPublishedTrendFeed, type PublishedTrendCard, type PublishedTrendSection } from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SafeTrendFeed = {
  featured: PublishedTrendCard[];
  sections: PublishedTrendSection[];
  meta?: {
    activeSystems?: number;
    count?: number;
    sampleWarning?: string | null;
  };
};

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: keyof TrendFilters
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  try {
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
  } catch {
    return trendFiltersSchema.parse({});
  }
}

function isValidTrendCard(card: unknown): card is PublishedTrendCard {
  if (!card || typeof card !== "object") return false;
  const value = card as Partial<PublishedTrendCard>;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.href === "string" &&
    typeof value.leagueLabel === "string" &&
    typeof value.marketLabel === "string" &&
    typeof value.confidence === "string" &&
    typeof value.record === "string" &&
    value.sourceTrend != null &&
    typeof value.sourceTrend === "object" &&
    typeof value.sourceTrend.id === "string" &&
    Array.isArray(value.todayMatches)
  );
}

function isValidTrendSection(section: unknown): section is PublishedTrendSection {
  if (!section || typeof section !== "object") return false;
  const value = section as Partial<PublishedTrendSection>;
  return typeof value.category === "string" && Array.isArray(value.cards);
}

async function getSafeTrendFeed(filters: TrendFilters): Promise<SafeTrendFeed> {
  try {
    const feed = await getPublishedTrendFeed(filters);
    const featured = Array.isArray(feed?.featured)
      ? feed.featured.filter(isValidTrendCard).slice(0, 5)
      : [];
    const sections = Array.isArray(feed?.sections)
      ? feed.sections
          .filter(isValidTrendSection)
          .map((section) => ({
            ...section,
            cards: section.cards.filter(isValidTrendCard).slice(0, 6)
          }))
          .filter((section) => section.cards.length > 0)
      : [];

    return {
      featured,
      sections,
      meta:
        feed && typeof feed === "object" && "meta" in feed && feed.meta && typeof feed.meta === "object"
          ? (feed.meta as SafeTrendFeed["meta"])
          : undefined
    };
  } catch {
    return { featured: [], sections: [] };
  }
}

function buildFilterHref(filters: TrendFilters, patch: Partial<TrendFilters>) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.sport !== "ALL") params.set("sport", next.sport);
  if (next.league !== "ALL") params.set("league", next.league);
  if (next.market !== "ALL") params.set("market", next.market);
  if (next.sportsbook !== "all") params.set("sportsbook", next.sportsbook);
  if (next.side !== "ALL") params.set("side", next.side);
  if (next.subject) params.set("subject", next.subject);
  if (next.team) params.set("team", next.team);
  if (next.player) params.set("player", next.player);
  if (next.fighter) params.set("fighter", next.fighter);
  if (next.opponent) params.set("opponent", next.opponent);
  if (next.window) params.set("window", next.window);
  if (next.sample) params.set("sample", String(next.sample));
  const query = params.toString();
  return query ? `/trends?${query}` : "/trends";
}

function scopeLabel(filters: TrendFilters) {
  if (filters.league !== "ALL") return filters.league;
  if (filters.sport !== "ALL") return filters.sport.replace(/_/g, " ");
  return "All sports";
}

function marketLabel(filters: TrendFilters) {
  if (filters.market === "ALL") return "All markets";
  return filters.market.replace(/_/g, " ");
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number") return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function weightFromScore(value: number) {
  return Math.max(35, Math.min(99, Math.round(value / 10)));
}

function TrendChip({ label, active = false, href }: { label: string; active?: boolean; href?: string }) {
  const className = active
    ? "rounded-full border border-cyan-400/30 bg-cyan-400/[0.10] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100"
    : "rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/[0.16] hover:text-white";

  if (href) {
    return <Link href={href} className={className}>{label}</Link>;
  }

  return <div className={className}>{label}</div>;
}

function TrendEvidenceCard({ card, featured = false }: { card: PublishedTrendCard; featured?: boolean }) {
  const todayCount = card.todayMatches.length;
  const weight = weightFromScore(card.rankingScore);
  const confidence = card.sourceTrend.adjustedConfidenceScore ?? weight;

  return (
    <Link href={card.href} className={featured ? "edge-panel rounded-[1.5rem] p-5 transition hover:border-white/[0.14]" : "edge-panel-soft rounded-[1.2rem] p-4 transition hover:border-white/[0.14]"}>
      <div className="flex flex-wrap items-center gap-2">
        <TrendChip label={card.leagueLabel} />
        <TrendChip label={card.marketLabel} />
        <TrendChip label={`${todayCount} active`} active={todayCount > 0} />
      </div>
      <div className="mt-4 text-[1.05rem] font-semibold leading-7 text-white xl:text-[1.2rem]">{card.title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{card.description}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Record</div>
          <div className="mt-1 text-lg font-semibold text-white">{card.record}</div>
        </div>
        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">ROI</div>
          <div className="mt-1 text-lg font-semibold text-emerald-200">{formatPercent(card.roi)}</div>
        </div>
        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Sample</div>
          <div className="mt-1 text-lg font-semibold text-white">{card.sampleSize}</div>
        </div>
        <div className="rounded-[1rem] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Engine weight</div>
          <div className="mt-1 text-lg font-semibold text-cyan-100">{weight}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-500">
          <span>Confidence</span>
          <span className="text-white">{Math.round(confidence)}/100</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#7df9ff,#4aa8ff,#a56bff)]" style={{ width: `${Math.max(8, Math.min(100, Math.round(confidence)))}%` }} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-300">
        {card.whyNow.slice(0, 3).map((item) => (
          <div key={`${card.id}:${item}`} className="rounded-[0.95rem] bg-white/[0.03] px-3 py-2">{item}</div>
        ))}
        {!card.whyNow.length ? <div className="text-slate-500">No supporting notes available.</div> : null}
      </div>

      {card.warning ? (
        <div className="mt-4 rounded-[0.95rem] border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-100">
          {card.warning}
        </div>
      ) : null}
    </Link>
  );
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const feed = await getSafeTrendFeed(filters);
  const cards = feed.sections.flatMap((section) => section.cards);
  const activeSystems = typeof feed.meta?.activeSystems === "number"
    ? feed.meta.activeSystems
    : cards.filter((card) => card.todayMatches.length > 0).length;
  const totalTracked = typeof feed.meta?.count === "number" ? feed.meta.count : cards.length;

  return (
    <div className="grid gap-6">
      <section className="edge-panel overflow-hidden rounded-[1.8rem] p-5 xl:p-7">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-300">Evidence engine</div>
            <h1 className="mt-3 max-w-4xl font-display text-[2.2rem] font-semibold tracking-tight text-white xl:text-[4rem] xl:leading-[0.98]">
              Trends are support, not theater.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 xl:text-base">
              This surface filters out vanity records and elevates the systems that still connect to current board conditions, live matchups, and executable prices.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <TrendChip label={scopeLabel(filters)} active />
              <TrendChip label={marketLabel(filters)} />
              <TrendChip label={filters.window ?? "365d"} />
              <TrendChip label={filters.sportsbook === "all" ? "All books" : filters.sportsbook} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="edge-panel-soft rounded-[1.2rem] p-4">
              <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">Active today</div>
              <div className="mt-3 text-[1.9rem] font-semibold text-white">{activeSystems}</div>
              <div className="mt-1 text-sm text-slate-400">Systems firing now</div>
            </div>
            <div className="edge-panel-soft rounded-[1.2rem] p-4">
              <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">Featured</div>
              <div className="mt-3 text-[1.9rem] font-semibold text-cyan-100">{feed.featured.length}</div>
              <div className="mt-1 text-sm text-slate-400">Priority evidence cards</div>
            </div>
            <div className="edge-panel-soft rounded-[1.2rem] p-4">
              <div className="text-[0.62rem] uppercase tracking-[0.22em] text-slate-500">Tracked</div>
              <div className="mt-3 text-[1.9rem] font-semibold text-white">{totalTracked}</div>
              <div className="mt-1 text-sm text-slate-400">Rows in current scope</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {["ALL", "NBA", "MLB", "NHL", "NFL", "NCAAB", "NCAAF", "UFC", "BOXING"].map((league) => (
            <TrendChip
              key={league}
              label={league}
              active={filters.league === league}
              href={buildFilterHref(filters, { league: league as TrendFilters["league"] })}
            />
          ))}
          {[
            { label: "All markets", market: "ALL" },
            { label: "Moneyline", market: "moneyline" },
            { label: "Spread", market: "spread" },
            { label: "Total", market: "total" }
          ].map((item) => (
            <TrendChip
              key={item.label}
              label={item.label}
              active={filters.market === item.market}
              href={buildFilterHref(filters, { market: item.market as TrendFilters["market"] })}
            />
          ))}
        </div>

        {feed.meta?.sampleWarning ? (
          <div className="mt-4 rounded-[1rem] border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
            {feed.meta.sampleWarning}
          </div>
        ) : null}
      </section>

      {feed.featured.length ? (
        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Priority evidence</div>
              <div className="mt-1 text-2xl font-semibold text-white">Featured systems</div>
            </div>
            <Link href="/board" className="rounded-full border border-cyan-400/30 bg-cyan-400/[0.10] px-4 py-2 text-sm font-medium text-cyan-100">
              Open board
            </Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {feed.featured.map((card) => (
              <TrendEvidenceCard key={card.id} card={card} featured />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4">
        {feed.sections.map((section) => (
          <div key={section.category} className="edge-panel rounded-[1.5rem] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Trend bucket</div>
                <div className="mt-1 text-xl font-semibold text-white">{section.category}</div>
              </div>
              <TrendChip label={`${section.cards.length} cards`} />
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {section.cards.map((card) => (
                <TrendEvidenceCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        ))}

        {!feed.sections.length ? (
          <div className="edge-panel rounded-[1.45rem] p-6 text-sm leading-7 text-slate-400">
            No trend systems qualified for this scope. The rebuild keeps the page honest instead of padding it with weak cards.
          </div>
        ) : null}
      </section>
    </div>
  );
}
