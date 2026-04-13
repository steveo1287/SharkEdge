import Link from "next/link";
import { headers } from "next/headers";

import { MobileTrendCard } from "@/components/home/mobile-trend-card";
import { MobileTopBar } from "@/components/mobile/mobile-top-bar";
import { SectionTabs } from "@/components/mobile/section-tabs";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard,
  type PublishedTrendSection
} from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import type { RankedTrendPlay, TrendsPlaysResponse } from "@/services/trends/play-types";

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
  if (!card || typeof card !== "object") {
    return false;
  }

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
  if (!section || typeof section !== "object") {
    return false;
  }

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
  const basePath = `/trends/${encodeURIComponent(card.sourceTrend.id)}`;

  return query ? `${basePath}?${query}` : basePath;
}

async function getRequestOrigin() {
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  return host ? `${proto}://${host}` : null;
}

async function fetchTrendPlays(): Promise<TrendsPlaysResponse> {
  const origin = await getRequestOrigin();
  const url = origin ? `${origin}/api/trends/plays` : "http://localhost:3000/api/trends/plays";

  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`Trends plays route returned ${resp.status}`);
    }
    return (await resp.json()) as TrendsPlaysResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load trend plays.";
    return {
      generatedAt: new Date().toISOString(),
      diagnostics: {
        historicalRows: 0,
        currentRows: 0,
        discoveredSystems: 0,
        validatedSystems: 0,
        activeCandidates: 0,
        surfacedPlays: 0,
        providerStatus: "down",
        issues: [message]
      },
      bestPlays: [],
      buildingSignals: [],
      historicalSystems: []
    };
  }
}

function formatProb(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function formatOdds(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatEdge(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function playMarketLabel(play: RankedTrendPlay) {
  if (play.marketType === "moneyline") return "Moneyline";
  if (play.marketType === "spread") return "Spread";
  return "Total";
}

function PlayCard({ play }: { play: RankedTrendPlay }) {
  return (
    <div className="mobile-surface grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{play.gameLabel}</div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300">
          {playMarketLabel(play)} {play.tier}
        </div>
      </div>

      <div className="text-sm text-slate-300">
        {play.selection}
        {play.line !== null ? ` @ ${play.line}` : ""}{" "}
        {play.oddsAmerican !== null ? `(${formatOdds(play.oddsAmerican)})` : ""}
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
        <span className="rounded-full border border-white/8 px-3 py-1">
          Edge {formatEdge(play.edgePct)}
        </span>
        <span className="rounded-full border border-white/8 px-3 py-1">
          Conf {play.confidenceScore}
        </span>
        <span className="rounded-full border border-white/8 px-3 py-1">
          Score {play.finalScore}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
        <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Market</div>
          <div className="mt-1 text-sm text-white">{formatProb(play.marketImpliedProb)}</div>
        </div>
        <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Fair</div>
          <div className="mt-1 text-sm text-white">
            {formatProb(play.calibratedModelProb)}{" "}
            {play.fairOddsAmerican !== null ? `(${formatOdds(play.fairOddsAmerican)})` : ""}
          </div>
        </div>
      </div>

      {play.warnings.length ? (
        <div className="rounded-[14px] border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          {play.warnings[0]}
        </div>
      ) : null}
    </div>
  );
}

export default async function TrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const [plays, feed] = await Promise.all([fetchTrendPlays(), getSafeTrendFeed(filters)]);
  const sections = feed.sections;
  const cards = sections.flatMap((section) => section.cards);
  const activeSystems =
    typeof feed.meta?.activeSystems === "number"
      ? feed.meta.activeSystems
      : cards.filter((card) => card.todayMatches.length > 0).length;

  const surfacedNow = plays.bestPlays.length + plays.buildingSignals.length;

  return (
    <div className="grid gap-4">
      <MobileTopBar title="My Trends" subtitle="Discover" />

      <section className="mobile-surface !pb-2">
        <SectionTabs items={[{ label: "For You", active: true }, { label: "Search" }]} />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white">
            {filters.league === "ALL" ? "All leagues" : filters.league}
          </div>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
            {activeSystems} active - {cards.length} tracked
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">
          {[
            filters.market === "ALL" ? "All markets" : filters.market.replace(/_/g, " "),
            filters.window ?? "365d",
            filters.sportsbook === "all" ? "All books" : filters.sportsbook
          ].map((item, index) => (
            <div
              key={item}
              className={
                index === 0
                  ? "rounded-full bg-white px-3 py-1 text-slate-950"
                  : "rounded-full border border-white/8 px-3 py-1"
              }
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mobile-surface">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[1.25rem] font-semibold text-white">Trends Play Engine</div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300">
            {plays.diagnostics.providerStatus}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Validated</div>
            <div className="mt-1 text-base font-semibold text-white">{plays.diagnostics.validatedSystems}</div>
          </div>
          <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Candidates</div>
            <div className="mt-1 text-base font-semibold text-white">{plays.diagnostics.activeCandidates}</div>
          </div>
          <div className="rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Surfaced</div>
            <div className="mt-1 text-base font-semibold text-white">{surfacedNow}</div>
          </div>
        </div>

        <details className="mt-3 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
          <summary className="cursor-pointer list-none select-none text-slate-200">Diagnostics</summary>
          <div className="mt-2 grid gap-1 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Historical rows</span>
              <span className="text-white">{plays.diagnostics.historicalRows}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Current rows</span>
              <span className="text-white">{plays.diagnostics.currentRows}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-400">Surfaced plays</span>
              <span className="text-white">{plays.diagnostics.surfacedPlays}</span>
            </div>
            {plays.diagnostics.issues.length ? (
              <div className="mt-2 rounded-[12px] border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-amber-100">
                {plays.diagnostics.issues.map((issue) => (
                  <div key={issue}>{issue}</div>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[1.25rem] font-semibold text-white">Best Plays Now</div>
        </div>
        {plays.bestPlays.length ? (
          <div className="grid gap-3">
            {plays.bestPlays.slice(0, 8).map((play) => (
              <PlayCard key={`${play.systemId}:${play.eventId}:${play.selection}`} play={play} />
            ))}
          </div>
        ) : (
          <div className="mobile-surface text-sm leading-6 text-slate-400">
            No qualified best plays right now. The engine is staying conservative instead of forcing edges.
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[1.25rem] font-semibold text-white">Building Signals</div>
        </div>
        {plays.buildingSignals.length ? (
          <div className="grid gap-3">
            {plays.buildingSignals.slice(0, 10).map((play) => (
              <PlayCard key={`${play.systemId}:${play.eventId}:${play.selection}`} play={play} />
            ))}
          </div>
        ) : (
          <div className="mobile-surface text-sm leading-6 text-slate-400">
            No building signals yet. If this stays empty, it usually means: DB not connected, not enough validated systems, or current odds ingestion is quiet.
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[1.25rem] font-semibold text-white">Historical Systems</div>
        </div>
        {plays.historicalSystems.length ? (
          <div className="grid gap-3">
            {plays.historicalSystems.slice(0, 10).map((play) => (
              <PlayCard key={`${play.systemId}:${play.eventId}`} play={play} />
            ))}
          </div>
        ) : (
          <div className="mobile-surface text-sm leading-6 text-slate-400">
            No historical systems found yet. Once the database is connected and the trends worker runs, systems will populate here even when no live edges qualify.
          </div>
        )}
      </section>

      {feed.featured.length ? (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.4rem] font-semibold text-white">Legacy cards</div>
            <Link href="/trends" className="text-sm text-slate-500">
              Open
            </Link>
          </div>

          <div className="mobile-scroll-row hide-scrollbar">
            {feed.featured.map((card, index) => (
              <MobileTrendCard
                key={card.id}
                card={{
                  ...card,
                  href: buildTrendDetailHref(card, filters)
                }}
                featured={index === 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      {sections.map((section) => (
        <section key={section.category}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[1.4rem] font-semibold text-white">{section.category}</div>
            <Link href="/trends" className="text-sm text-slate-500">
              Open
            </Link>
          </div>

          <div className="mobile-scroll-row hide-scrollbar">
            {section.cards.map((card) => (
              <MobileTrendCard
                key={card.id}
                card={{
                  ...card,
                  href: buildTrendDetailHref(card, filters)
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {!sections.length ? (
        <div className="mobile-surface text-sm leading-6 text-slate-400">
          No trend systems matched this scope yet. SharkEdge is staying selective instead of stuffing the feed with weak systems.
        </div>
      ) : null}
    </div>
  );
}

