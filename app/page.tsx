import Link from "next/link";

import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
import { MobileTrendCard } from "@/components/home/mobile-trend-card";
import { OpportunitySpotlightCard } from "@/components/intelligence/opportunity-spotlight-card";
import { DiagnosticMetaStrip } from "@/components/intelligence/provider-diagnostic-shells";
import { HorizontalEventRail } from "@/components/mobile/horizontal-event-rail";
import { SectionTabs } from "@/components/mobile/section-tabs";
import { Badge } from "@/components/ui/badge";
import {
  getPublishedTrendFeed,
  type PublishedTrendCard,
  type PublishedTrendSection
} from "@/lib/trends/publisher";
import type { TrendFilters } from "@/lib/types/domain";
import {
  HOME_DESK_DATES,
  HOME_LEAGUE_ITEMS,
  formatHomeDateLabel,
  getHomeCommandData
} from "@/services/home/home-command-service";
import { getProviderHealthTone } from "@/app/_components/home-primitives";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SafeTrendFeed = {
  featured: PublishedTrendCard[];
  sections: PublishedTrendSection[];
};

const VALID_TREND_LEAGUES: Array<NonNullable<TrendFilters["league"]>> = [
  "ALL","NBA","NCAAB","MLB","NHL","NFL","NCAAF","BOXING","UFC"
];

function normalizeTrendLeague(value: string | null | undefined): NonNullable<TrendFilters["league"]> {
  if (!value) return "ALL";
  return VALID_TREND_LEAGUES.includes(value as NonNullable<TrendFilters["league"]>)
    ? (value as NonNullable<TrendFilters["league"]>)
    : "ALL";
}

function isValidTrendCard(card: unknown): card is PublishedTrendCard {
  if (!card || typeof card !== "object") return false;
  const v = card as Partial<PublishedTrendCard>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.href === "string" &&
    typeof v.leagueLabel === "string" &&
    typeof v.marketLabel === "string" &&
    typeof v.confidence === "string" &&
    typeof v.record === "string" &&
    Array.isArray(v.todayMatches)
  );
}

function isValidTrendSection(section: unknown): section is PublishedTrendSection {
  if (!section || typeof section !== "object") return false;
  const v = section as Partial<PublishedTrendSection>;
  return typeof v.category === "string" && Array.isArray(v.cards);
}

async function getSafeTrendFeed(league: string): Promise<SafeTrendFeed> {
  try {
    const safeLeague = normalizeTrendLeague(league);
    const feed = await getPublishedTrendFeed({ league: safeLeague, window: "365d", sample: 5 });
    return {
      featured: Array.isArray(feed?.featured) ? feed.featured.filter(isValidTrendCard).slice(0, 4) : [],
      sections: Array.isArray(feed?.sections)
        ? feed.sections.filter(isValidTrendSection).map((s) => ({ ...s, cards: s.cards.filter(isValidTrendCard).slice(0, 5) })).filter((s) => s.cards.length > 0).slice(0, 2)
        : []
    };
  } catch {
    return { featured: [], sections: [] };
  }
}

// ─── Stat Bar ─────────────────────────────────────────────────────────────────
function StatBar({ label, value, sub, href, tone = "default" }: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  tone?: "default" | "green" | "blue" | "amber";
}) {
  const valueClass = {
    default: "text-white",
    green: "text-green-400",
    blue: "text-blue-400",
    amber: "text-amber-400"
  }[tone];

  const inner = (
    <div className="flex flex-col gap-0.5">
      <div className="text-[0.62rem] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</div>
      <div className={`font-mono text-xl font-semibold leading-none ${valueClass}`}>{value}</div>
      {sub && <div className="text-[0.65rem] text-zinc-600">{sub}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="group block rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-4 py-3 transition hover:border-zinc-700/70 hover:bg-zinc-800/50">
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/50 px-4 py-3">
      {inner}
    </div>
  );
}

// ─── Quick Action ─────────────────────────────────────────────────────────────
function QuickAction({ href, label, icon, description }: {
  href: string;
  label: string;
  icon: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-4 transition hover:border-blue-500/25 hover:bg-blue-500/5"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700/50 bg-zinc-800 text-zinc-400 transition group-hover:border-blue-500/30 group-hover:text-blue-400">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" dangerouslySetInnerHTML={{ __html: icon }} />
      </div>
      <div>
        <div className="text-[0.8125rem] font-semibold text-white">{label}</div>
        <div className="mt-0.5 text-[0.72rem] leading-snug text-zinc-500">{description}</div>
      </div>
      <div className="ml-auto mt-0.5 text-zinc-700 transition group-hover:text-zinc-400">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

// ─── Movement Row ─────────────────────────────────────────────────────────────
function MovementRow({ label, league, direction, from, to, note }: {
  label: string;
  league: string;
  direction: "up" | "down";
  from: string;
  to: string;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-zinc-800/50 last:border-0">
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs ${direction === "up" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
        {direction === "up" ? "↑" : "↓"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[0.8rem] font-medium text-white truncate">{label}</div>
        {note && <div className="text-[0.68rem] text-zinc-500">{note}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[0.75rem] text-zinc-400 line-through">{from}</div>
        <div className={`font-mono text-[0.8rem] font-semibold ${direction === "up" ? "text-green-400" : "text-red-400"}`}>{to}</div>
      </div>
      <div className="shrink-0 rounded-md border border-zinc-800 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-zinc-500">
        {league}
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  eyebrow,
  title,
  href,
  hrefLabel = "View all"
}: {
  eyebrow: string;
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-blue-500">{eyebrow}</div>
        <h2 className="mt-0.5 font-display text-base font-semibold text-white">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-[0.72rem] font-medium text-zinc-500 transition hover:text-zinc-300">
          {hrefLabel} →
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getHomeCommandData(resolvedSearch);
  const trendFeed = await getSafeTrendFeed(home.focusedLeague);

  const railItems = home.verifiedGames.slice(0, 8).map((game, i) => ({
    id: game.id,
    label: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
    note: new Date(game.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    href: game.detailHref ?? `/game/${game.id}`,
    active: i === 0
  }));

  const topEdge = home.topActionables[0];
  const edgeLabel = topEdge
    ? `${topEdge.selectionLabel} — ${topEdge.league}`
    : "No qualified edge right now";

  return (
    <div className="grid gap-6">

      {/* ── MOBILE RAIL ──────────────────────────────────────────────────── */}
      <div className="xl:hidden">
        <div className="mobile-surface">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-zinc-600">Command Center</div>
              <h1 className="mt-0.5 font-display text-xl font-semibold text-white">Today's Market</h1>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/8 px-2.5 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-green-400">Live</span>
            </div>
          </div>

          <SectionTabs
            items={[
              { label: "For You", active: true },
              { label: home.selectedLeague === "ALL" ? "All Sports" : home.selectedLeague }
            ]}
          />
        </div>

        {railItems.length ? (
          <div className="mt-3">
            <HorizontalEventRail items={railItems} />
          </div>
        ) : null}
      </div>

      {/* ── DESKTOP COMMAND HEADER ────────────────────────────────────────── */}
      <div className="hidden xl:block">
        {/* Top stats bar */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          <StatBar
            label="Games Today"
            value={home.verifiedGames.length}
            sub={formatHomeDateLabel(home.selectedDate)}
            href="/games"
          />
          <StatBar
            label="Live Edges"
            value={home.topActionables.length}
            sub="Cleared threshold"
            href="/board"
            tone="blue"
          />
          <StatBar
            label="Live Watch"
            value={home.liveDeskAvailable ? home.movementGames.length : "—"}
            sub={home.liveDeskAvailable ? "Moving markets" : "Feed offline"}
            tone={home.liveDeskAvailable ? "green" : "default"}
          />
          <StatBar
            label="Trap Flags"
            value={home.traps.length}
            sub="Avoid these"
            tone={home.traps.length > 0 ? "amber" : "default"}
          />
          <StatBar
            label="Data Health"
            value={home.liveDeskAvailable ? "Live" : "Static"}
            sub={home.liveDeskFreshnessLabel ?? "Board mode"}
            tone={home.liveDeskAvailable ? "green" : "default"}
          />
        </div>

        {/* League filter strip */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-zinc-600">Filter</span>
            {HOME_LEAGUE_ITEMS.map((league) => (
              <Link
                key={league.key}
                href={`/?league=${league.key}&date=${home.selectedDate}`}
                className={
                  home.selectedLeague === league.key
                    ? "rounded-md border border-blue-500/30 bg-blue-500/12 px-2.5 py-1 text-[0.72rem] font-semibold text-blue-300"
                    : "rounded-md border border-zinc-800 bg-transparent px-2.5 py-1 text-[0.72rem] font-medium text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
                }
              >
                {league.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {HOME_DESK_DATES.map((date) => (
              <Link
                key={date.key}
                href={`/?league=${home.selectedLeague}&date=${date.key}`}
                className={
                  home.selectedDate === date.key
                    ? "rounded-md border border-zinc-600 bg-zinc-800 px-2.5 py-1 text-[0.72rem] font-semibold text-white"
                    : "rounded-md border border-zinc-800 px-2.5 py-1 text-[0.72rem] font-medium text-zinc-600 transition hover:border-zinc-700 hover:text-zinc-400"
                }
              >
                {date.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── MAIN GRID ─────────────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">

        {/* Left column */}
        <div className="grid gap-6">

          {/* ── TOP PLAYS ──────────────────────────────────────────────── */}
          <section>
            <SectionHeader
              eyebrow="Best Edges Right Now"
              title="Top Plays"
              href="/board"
              hrefLabel="Open board"
            />
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {home.topActionables.length > 0 ? (
                home.topActionables.slice(0, 4).map((opportunity) => (
                  <OpportunitySpotlightCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    href={`/game/${opportunity.eventId}`}
                    ctaLabel={opportunity.kind === "prop" ? "Open prop" : "Open matchup"}
                  />
                ))
              ) : (
                <div className="col-span-2 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6 text-center">
                  <div className="text-[0.75rem] font-medium text-zinc-500">No edges cleared the threshold right now</div>
                  <div className="mt-2 text-[0.68rem] text-zinc-700">The engine refuses to force picks. Check back as lines move.</div>
                  <Link href="/board" className="mt-4 inline-block rounded-lg bg-zinc-800 px-4 py-2 text-[0.75rem] font-medium text-zinc-300 transition hover:bg-zinc-700">
                    Browse the board →
                  </Link>
                </div>
              )}
            </div>
          </section>

          {/* ── VERIFIED GAMES ─────────────────────────────────────────── */}
          {home.verifiedGames.length > 0 && (
            <section>
              <SectionHeader
                eyebrow="Today's Slate"
                title="Verified Games"
                href="/games"
                hrefLabel="Full slate"
              />
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {home.verifiedGames.slice(0, 6).map((game) => (
                  <LiveEdgeBoardCard key={game.id} game={game} />
                ))}
              </div>
              {home.verifiedGames.length > 6 && (
                <Link href="/games" className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-zinc-800/70 py-2.5 text-[0.75rem] font-medium text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300">
                  +{home.verifiedGames.length - 6} more games on the slate
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </Link>
              )}
            </section>
          )}

          {/* ── TRENDS ─────────────────────────────────────────────────── */}
          {trendFeed.featured.length > 0 && (
            <section>
              <SectionHeader
                eyebrow="Trends Engine"
                title="Active Signals"
                href="/trends"
                hrefLabel="All trends"
              />
              <div className="mobile-scroll-row hide-scrollbar mt-3">
                {trendFeed.featured.map((card) => (
                  <MobileTrendCard key={card.id} card={card} featured={false} />
                ))}
              </div>
            </section>
          )}

          {/* ── DECISION DESK ───────────────────────────────────────────── */}
          <section>
            <SectionHeader
              eyebrow="Decision Support"
              title="Bet Now Windows & Traps"
            />
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {/* Bet now */}
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-4">
                <div className="mb-3 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-green-500">
                  Bet Now Windows
                </div>
                <div className="grid gap-2">
                  {home.decisionWindows.length > 0 ? (
                    home.decisionWindows.map((opp) => (
                      <Link
                        key={`${opp.id}-window`}
                        href={`/game/${opp.eventId}`}
                        className="group rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 transition hover:border-green-500/25 hover:bg-green-500/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[0.8rem] font-medium text-white">{opp.selectionLabel}</div>
                          <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[0.6rem] font-semibold text-zinc-500">{opp.league}</span>
                        </div>
                        <div className="mt-1.5 text-[0.72rem] leading-snug text-zinc-400">{opp.reasonSummary}</div>
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-[0.72rem] text-zinc-600">
                      No immediate bet-now windows right now.
                    </div>
                  )}
                </div>
              </div>

              {/* Traps */}
              <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-4">
                <div className="mb-3 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-red-500">
                  Trap Desk
                </div>
                <div className="grid gap-2">
                  {home.traps.length > 0 ? (
                    home.traps.slice(0, 3).map((opp) => (
                      <div
                        key={`${opp.id}-trap`}
                        className="rounded-lg border border-red-500/15 bg-red-500/5 p-3"
                      >
                        <div className="text-[0.8rem] font-medium text-white">{opp.selectionLabel}</div>
                        <div className="mt-1.5 text-[0.72rem] leading-snug text-red-300/80">
                          {opp.whatCouldKillIt?.[0] ?? opp.reasonSummary}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 text-[0.72rem] text-zinc-600">
                      No trap flags are dominating the desk.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="hidden xl:grid xl:gap-5 xl:content-start">

          {/* Live Watch Feed */}
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-zinc-600">Live Watch</div>
                <div className="mt-0.5 text-[0.875rem] font-semibold text-white">Line Movement</div>
              </div>
              {home.liveDeskAvailable ? (
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                  </span>
                  <span className="text-[0.6rem] font-semibold text-green-500">Live</span>
                </div>
              ) : (
                <span className="text-[0.6rem] font-semibold text-zinc-600">Static</span>
              )}
            </div>

            {home.liveDeskAvailable && home.movementGames.length > 0 ? (
              <div>
                {home.movementGames.slice(0, 5).map((game) => (
                  <Link key={game.id} href={`/game/${game.id}`}>
                    <MovementRow
                      label={`${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`}
                      league={game.leagueKey}
                      direction={
                        (game.spread?.movement ?? game.moneyline?.movement ?? 0) >= 0 ? "up" : "down"
                      }
                      from={game.spread?.openLabel ?? game.moneyline?.openLabel ?? "—"}
                      to={game.spread?.lineLabel ?? game.moneyline?.lineLabel ?? "—"}
                      note={game.spread?.movement ? `Spread moved ${Math.abs(game.spread.movement).toFixed(1)}` : undefined}
                    />
                  </Link>
                ))}
                {home.movementGames.length > 5 && (
                  <Link href="/board?sort=movement" className="mt-2 block text-center text-[0.68rem] text-zinc-600 transition hover:text-zinc-400">
                    +{home.movementGames.length - 5} more →
                  </Link>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/50 p-4 text-center">
                <div className="text-[0.72rem] text-zinc-600">
                  {home.liveDeskMessage ?? "No qualified movement right now."}
                </div>
              </div>
            )}
          </div>

          {/* Quick Access */}
          <div>
            <div className="mb-3 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-zinc-600">Quick Access</div>
            <div className="grid gap-2">
              <QuickAction
                href="/board"
                label="Live Board"
                description="Full odds across all books"
                icon={`<rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/>`}
              />
              <QuickAction
                href="/trends"
                label="Trends Engine"
                description="Historical systems with live matches"
                icon={`<path d="M2 12l3.5-4 3 2.5L12 5l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 5h3v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`}
              />
              <QuickAction
                href={`/props?league=${home.focusedLeague}`}
                label="Props Lab"
                description="Player markets with EV context"
                icon={`<circle cx="8" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M3.5 14c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>`}
              />
              <QuickAction
                href="/game/sim"
                label="Sim Engine"
                description="Model outcomes and stress-test lines"
                icon={`<path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M9 11h4M11 9v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`}
              />
            </div>
          </div>

          {/* Provider Health */}
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-zinc-600">Data Health</div>
              <Badge tone={getProviderHealthTone(home.deskStatusState)}>{home.deskStatusLabel}</Badge>
            </div>
            <DiagnosticMetaStrip
              items={[
                `League: ${home.focusedLeague}`,
                `Slate: ${formatHomeDateLabel(home.selectedDate)}`,
                home.liveDeskFreshnessLabel,
                typeof home.liveDeskFreshnessMinutes === "number"
                  ? `${home.liveDeskFreshnessMinutes}m old`
                  : null
              ]}
            />
            <div className="mt-3 text-[0.7rem] leading-relaxed text-zinc-600">
              {home.deskSourceNote}
            </div>
            <Link href="/providers" className="mt-3 block text-[0.68rem] font-medium text-blue-500 transition hover:text-blue-400">
              View provider detail →
            </Link>
          </div>

          {/* Additional trend sections */}
          {trendFeed.sections.slice(0, 1).map((section) => (
            <div key={section.category} className="rounded-xl border border-zinc-800/70 bg-zinc-900/30 p-4">
              <div className="mb-3">
                <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-blue-500">Trend Rail</div>
                <div className="mt-0.5 text-[0.875rem] font-semibold text-white">{section.category}</div>
              </div>
              <div className="grid gap-2">
                {section.cards.slice(0, 3).map((card) => (
                  <Link
                    key={card.id}
                    href={card.href}
                    className="group rounded-lg border border-zinc-800/60 bg-zinc-900/60 p-3 transition hover:border-blue-500/20 hover:bg-blue-500/5"
                  >
                    <div className="text-[0.78rem] font-medium text-white leading-snug">{card.title}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-mono text-[0.68rem] text-green-400">{card.record}</span>
                      <span className="text-zinc-700">·</span>
                      <span className="text-[0.68rem] text-zinc-500">{card.leagueLabel}</span>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/trends" className="mt-3 block text-[0.68rem] font-medium text-zinc-600 transition hover:text-zinc-400">
                More trends →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* ── MOBILE EXTRAS ─────────────────────────────────────────────────── */}
      <div className="xl:hidden">
        {home.topActionables.length > 0 && (
          <section className="grid gap-3">
            <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-blue-500">Top Edges</div>
            {home.topActionables.slice(0, 2).map((opp) => (
              <OpportunitySpotlightCard
                key={opp.id}
                opportunity={opp}
                href={`/game/${opp.eventId}`}
                ctaLabel={opp.kind === "prop" ? "Open prop" : "Open matchup"}
              />
            ))}
          </section>
        )}

        {trendFeed.featured.length > 0 && (
          <section className="grid gap-3">
            <div className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-blue-500">Active Signals</div>
            <div className="mobile-scroll-row hide-scrollbar">
              {trendFeed.featured.map((card) => (
                <MobileTrendCard key={card.id} card={card} featured={false} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
