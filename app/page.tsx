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
    default: "text-text-primary",
    green:   "text-mint",
    blue:    "text-aqua",
    amber:   "text-bone"
  }[tone];

  const inner = (
    <div className="flex flex-col gap-1">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">{label}</div>
      <div className={`display-number text-[22px] leading-none ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-bone/50">{sub}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="focusable group block rounded-md border border-bone/[0.08] bg-surface px-4 py-3 transition-colors hover:border-bone/[0.14]">
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-md border border-bone/[0.08] bg-surface px-4 py-3">
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
      className="focusable group flex items-start gap-3 rounded-md border border-bone/[0.08] bg-surface p-4 transition-colors hover:border-aqua/25 hover:bg-aqua/[0.03]"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bone/[0.10] bg-panel text-bone/60 transition-colors group-hover:border-aqua/30 group-hover:text-aqua">
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" dangerouslySetInnerHTML={{ __html: icon }} />
      </div>
      <div>
        <div className="text-[13px] font-semibold text-text-primary">{label}</div>
        <div className="mt-1 text-[11.5px] leading-snug text-bone/55">{description}</div>
      </div>
      <div className="ml-auto mt-0.5 text-bone/30 transition-colors group-hover:text-aqua">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
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
  from?: string;
  to: string;
  note?: string;
}) {
  const hasFrom = typeof from === "string" && from.length > 0 && from !== "—";
  return (
    <div className="flex items-center gap-3 border-b border-bone/[0.06] py-2.5 last:border-0">
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center text-[11px] font-semibold ${
          direction === "up" ? "text-mint" : "text-crimson"
        }`}
      >
        {direction === "up" ? "▲" : "▼"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-text-primary">{label}</div>
        {note && <div className="mt-0.5 text-[11px] text-bone/50">{note}</div>}
      </div>
      <div className="shrink-0 text-right">
        {hasFrom ? (
          <div className="font-mono text-[11px] text-bone/40 line-through tabular-nums">{from}</div>
        ) : null}
        <div
          className={`font-mono text-[12.5px] font-semibold tabular-nums ${
            direction === "up" ? "text-mint" : "text-crimson"
          }`}
        >
          {to}
        </div>
      </div>
      <div className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.10em] text-bone/50">
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
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">{eyebrow}</div>
        <h2 className="mt-1 font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-[11.5px] font-medium uppercase tracking-[0.08em] text-bone/50 transition-colors hover:text-aqua"
        >
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
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">The Desk</div>
              <h1 className="mt-1 font-display text-[20px] font-semibold tracking-[-0.01em] text-text-primary">Today's Market</h1>
            </div>
            <div className="flex items-center gap-1.5 rounded-sm border border-bone/[0.10] bg-surface px-2 py-1">
              <span className="live-dot" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/80">Live</span>
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

        {/* League filter strip — segmented control, sharp squared chips */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/45">League</span>
            {HOME_LEAGUE_ITEMS.map((league) => (
              <Link
                key={league.key}
                href={`/?league=${league.key}&date=${home.selectedDate}`}
                className={
                  home.selectedLeague === league.key
                    ? "rounded-sm border border-aqua/40 bg-aqua/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-aqua"
                    : "rounded-sm border border-bone/[0.08] bg-transparent px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/55 transition-colors hover:border-bone/[0.14] hover:text-bone/90"
                }
              >
                {league.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {HOME_DESK_DATES.map((date) => (
              <Link
                key={date.key}
                href={`/?league=${home.selectedLeague}&date=${date.key}`}
                className={
                  home.selectedDate === date.key
                    ? "rounded-sm border border-bone/30 bg-bone/[0.08] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-primary"
                    : "rounded-sm border border-bone/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/45 transition-colors hover:border-bone/[0.14] hover:text-bone/80"
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
                <div className="col-span-2 rounded-lg border border-bone/[0.08] bg-surface p-8 text-center">
                  <div className="text-[13px] font-medium text-text-primary">No edges cleared the threshold right now</div>
                  <div className="mt-2 text-[12px] text-bone/50">The engine refuses to force picks. Check back as lines move.</div>
                  <Link href="/board" className="mt-5 inline-block rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-[12px] font-medium uppercase tracking-[0.08em] text-bone/80 transition-colors hover:border-aqua/40 hover:text-aqua">
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
                <Link href="/games" className="mt-3 flex items-center justify-center gap-2 rounded-md border border-bone/[0.08] py-2.5 text-[12px] font-medium uppercase tracking-[0.08em] text-bone/55 transition-colors hover:border-aqua/30 hover:text-aqua">
                  +{home.verifiedGames.length - 6} more on the slate
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
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
              <div className="rounded-lg border border-bone/[0.08] bg-surface p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="live-dot" />
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-mint">
                    Bet Now Windows
                  </span>
                </div>
                <div className="grid gap-2">
                  {home.decisionWindows.length > 0 ? (
                    home.decisionWindows.map((opp) => (
                      <Link
                        key={`${opp.id}-window`}
                        href={`/game/${opp.eventId}`}
                        className="focusable group rounded-md border border-bone/[0.06] bg-panel p-3 transition-colors hover:border-mint/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13px] font-medium text-text-primary">{opp.selectionLabel}</div>
                          <span className="rounded-sm border border-bone/[0.10] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/60">{opp.league}</span>
                        </div>
                        <div className="mt-1.5 text-[11.5px] leading-snug text-bone/55">{opp.reasonSummary}</div>
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-md border border-bone/[0.06] bg-panel p-3 text-[11.5px] text-bone/45">
                      No immediate bet-now windows right now.
                    </div>
                  )}
                </div>
              </div>

              {/* Traps */}
              <div className="rounded-lg border border-bone/[0.08] bg-surface p-4">
                <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-crimson">
                  Trap Desk
                </div>
                <div className="grid gap-2">
                  {home.traps.length > 0 ? (
                    home.traps.slice(0, 3).map((opp) => (
                      <div
                        key={`${opp.id}-trap`}
                        className="focusable rounded-md border border-[rgba(255,77,94,0.18)] bg-[rgba(255,77,94,0.04)] p-3"
                      >
                        <div className="text-[13px] font-medium text-text-primary">{opp.selectionLabel}</div>
                        <div className="mt-1.5 text-[11.5px] leading-snug text-[rgba(255,77,94,0.80)]">
                          {opp.whatCouldKillIt?.[0] ?? opp.reasonSummary}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-bone/[0.06] bg-panel p-3 text-[11.5px] text-bone/45">
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
          <div className="rounded-lg border border-bone/[0.08] bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Live Watch</div>
                <div className="mt-1 text-[14px] font-semibold text-text-primary">Line Movement</div>
              </div>
              {home.liveDeskAvailable ? (
                <div className="flex items-center gap-1.5">
                  <span className="live-dot" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/80">Live</span>
                </div>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/40">Static</span>
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
                      to={game.spread?.lineLabel ?? game.moneyline?.lineLabel ?? "—"}
                      note={game.spread?.movement ? `Spread moved ${Math.abs(game.spread.movement).toFixed(1)}` : undefined}
                    />
                  </Link>
                ))}
                {home.movementGames.length > 5 && (
                  <Link href="/board?sort=movement" className="mt-2 block text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/45 transition-colors hover:text-aqua">
                    +{home.movementGames.length - 5} more →
                  </Link>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-bone/[0.06] bg-panel p-4 text-center">
                <div className="text-[11.5px] text-bone/45">
                  {home.liveDeskMessage ?? "No qualified movement right now."}
                </div>
              </div>
            )}
          </div>

          {/* Quick Access */}
          <div>
            <div className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Quick Access</div>
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
                href="/sim"
                label="Sim Engine"
                description="Model outcomes and stress-test lines"
                icon={`<path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M9 11h4M11 9v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>`}
              />
            </div>
          </div>

          {/* Provider Health */}
          <div className="rounded-lg border border-bone/[0.08] bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">Data Health</div>
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
            <div className="mt-3 text-[11.5px] leading-[1.5] text-bone/50">
              {home.deskSourceNote}
            </div>
            <Link href="/providers" className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.08em] text-aqua transition-colors hover:text-aqua-hot">
              Provider detail →
            </Link>
          </div>

          {/* Additional trend sections */}
          {trendFeed.sections.slice(0, 1).map((section) => (
            <div key={section.category} className="rounded-lg border border-bone/[0.08] bg-surface p-4">
              <div className="mb-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Trend Rail</div>
                <div className="mt-1 text-[14px] font-semibold text-text-primary">{section.category}</div>
              </div>
              <div className="grid gap-2">
                {section.cards.slice(0, 3).map((card) => (
                  <Link
                    key={card.id}
                    href={card.href}
                    className="focusable group rounded-md border border-bone/[0.06] bg-panel p-3 transition-colors hover:border-aqua/25"
                  >
                    <div className="text-[12.5px] font-medium leading-snug text-text-primary">{card.title}</div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold tabular-nums text-mint">{card.record}</span>
                      <span className="text-bone/20">·</span>
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-bone/55">{card.leagueLabel}</span>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/trends" className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.08em] text-bone/50 transition-colors hover:text-aqua">
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
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Top Edges</div>
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
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">Active Signals</div>
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
