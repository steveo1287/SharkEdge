import Link from "next/link";

import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
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
  "ALL", "NBA", "MLB", "NHL", "NFL", "NCAAF", "BOXING", "UFC"
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
  return typeof v.id === "string" && typeof v.title === "string" && typeof v.href === "string" && typeof v.leagueLabel === "string" && typeof v.marketLabel === "string" && typeof v.confidence === "string" && typeof v.record === "string" && Array.isArray(v.todayMatches);
}

function isValidTrendSection(section: unknown): section is PublishedTrendSection {
  if (!section || typeof section !== "object") return false;
  const v = section as Partial<PublishedTrendSection>;
  return typeof v.category === "string" && Array.isArray(v.cards);
}

async function getSafeTrendFeed(league: string): Promise<SafeTrendFeed> {
  try {
    const feed = await getPublishedTrendFeed({ league: normalizeTrendLeague(league), window: "365d", sample: 5 });
    return {
      featured: Array.isArray(feed?.featured) ? feed.featured.filter(isValidTrendCard).slice(0, 4) : [],
      sections: Array.isArray(feed?.sections)
        ? feed.sections
            .filter(isValidTrendSection)
            .map((section) => ({ ...section, cards: section.cards.filter(isValidTrendCard).slice(0, 4) }))
            .filter((section) => section.cards.length > 0)
            .slice(0, 2)
        : []
    };
  } catch {
    return { featured: [], sections: [] };
  }
}

function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: string | number; sub: string; tone?: "neutral" | "aqua" | "green" | "amber" }) {
  const valueClass = {
    neutral: "text-white",
    aqua: "text-aqua",
    green: "text-emerald-300",
    amber: "text-amber-200"
  }[tone];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 font-display text-3xl font-semibold tracking-tight ${valueClass}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function QuickLaunch({ href, title, detail, primary = false }: { href: string; title: string; detail: string; primary?: boolean }) {
  return (
    <Link href={href} className={primary ? "rounded-2xl border border-aqua/30 bg-aqua/10 p-4 transition hover:bg-aqua/[0.14]" : "rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.055]"}>
      <div className={primary ? "text-[10px] font-semibold uppercase tracking-[0.18em] text-aqua" : "text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"}>Launch</div>
      <div className="mt-2 font-display text-xl font-semibold tracking-tight text-white">{title}</div>
      <div className="mt-2 text-sm leading-5 text-slate-400">{detail}</div>
    </Link>
  );
}

function DecisionCard({ title, tone, items, empty }: { title: string; tone: "play" | "watch" | "avoid"; items: Array<{ id: string; eventId: string; selectionLabel: string; league: string; reasonSummary: string; whatCouldKillIt?: string[] }>; empty: string }) {
  const toneClass = tone === "play" ? "text-emerald-300" : tone === "avoid" ? "text-red-300" : "text-aqua";
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#07111d]/85 p-4">
      <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClass}`}>{title}</div>
      <div className="mt-4 grid gap-3">
        {items.length ? items.slice(0, 3).map((opp) => (
          <Link key={`${title}-${opp.id}`} href={`/game/${opp.eventId}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-aqua/35">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate font-semibold text-white">{opp.selectionLabel}</div>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{opp.league}</span>
            </div>
            <div className="mt-1.5 text-xs leading-5 text-slate-400">{tone === "avoid" ? (opp.whatCouldKillIt?.[0] ?? opp.reasonSummary) : opp.reasonSummary}</div>
          </Link>
        )) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500">{empty}</div>
        )}
      </div>
    </section>
  );
}

function TrendCard({ card }: { card: PublishedTrendCard }) {
  return (
    <Link href={card.href} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.055]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aqua">{card.leagueLabel} · {card.marketLabel}</span>
        <span className="font-mono text-xs font-semibold text-emerald-300">{card.record}</span>
      </div>
      <div className="mt-2 font-display text-lg font-semibold tracking-tight text-white">{card.title}</div>
      <div className="mt-2 text-sm leading-5 text-slate-400">{card.todayMatches.length ? `${card.todayMatches.length} live matchups qualify today.` : "Historical system ready."}</div>
    </Link>
  );
}

function SectionTitle({ eyebrow, title, href }: { eyebrow: string; title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aqua">{eyebrow}</div>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white">{title}</h2>
      </div>
      {href ? <Link href={href} className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-aqua">Open →</Link> : null}
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getHomeCommandData(resolvedSearch);
  const trendFeed = await getSafeTrendFeed(home.focusedLeague);
  const topEdge = home.topActionables[0];
  const watchItems = home.topActionables.filter((opp) => !home.decisionWindows.some((item) => item.id === opp.id));
  const railItems = home.verifiedGames.slice(0, 8).map((game, index) => ({
    id: game.id,
    label: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
    note: new Date(game.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    href: game.detailHref ?? `/game/${game.id}`,
    active: index === 0
  }));

  return (
    <div className="grid gap-6 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.12),transparent_32rem)]">
      <section className="rounded-[2rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.16),transparent_28rem),#07111d] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-aqua">SharkEdge Command Center</div>
            <h1 className="mt-3 font-display text-[44px] font-semibold tracking-[-0.055em] text-white xl:text-[58px]">Stop scrolling. Attack the slate.</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">Best plays, market movement, trap flags, live games, trends, and sim launchers are now one command layer.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {HOME_LEAGUE_ITEMS.map((league) => (
                <Link key={league.key} href={`/?league=${league.key}&date=${home.selectedDate}`} className={home.selectedLeague === league.key ? "rounded-full border border-aqua/40 bg-aqua/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-aqua" : "rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 hover:border-aqua/35 hover:text-aqua"}>{league.label}</Link>
              ))}
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-aqua/20 bg-aqua/[0.055] p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aqua">Best play</div>
              <Badge tone={getProviderHealthTone(home.deskStatusState)}>{home.deskStatusLabel}</Badge>
            </div>
            <div className="mt-3 font-display text-2xl font-semibold tracking-tight text-white">{topEdge ? topEdge.selectionLabel : "No qualified edge right now"}</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">{topEdge ? topEdge.reasonSummary : "The engine is waiting for a cleaner number. Use watch list, movement, and trends until a bet clears."}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={topEdge ? `/game/${topEdge.eventId}` : "/board"} className="rounded-full bg-aqua px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-950">Open best play</Link>
              <Link href="/board" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 hover:border-aqua/35 hover:text-aqua">Full board</Link>
            </div>
          </div>
        </div>
      </section>

      <div className="xl:hidden">
        <div className="mobile-surface">
          <div className="mb-3 flex items-center justify-between">
            <div><div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua">The Desk</div><h1 className="mt-1 font-display text-[20px] font-semibold tracking-[-0.01em] text-text-primary">Today's Market</h1></div>
            <div className="flex items-center gap-1.5 rounded-sm border border-bone/[0.10] bg-surface px-2 py-1"><span className="live-dot" /><span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/80">Live</span></div>
          </div>
          <SectionTabs items={[{ label: "For You", active: true }, { label: home.selectedLeague === "ALL" ? "All Sports" : home.selectedLeague }]} />
        </div>
        {railItems.length ? <div className="mt-3"><HorizontalEventRail items={railItems} /></div> : null}
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Games" value={home.verifiedGames.length} sub={formatHomeDateLabel(home.selectedDate)} />
        <StatTile label="Edges" value={home.topActionables.length} sub="cleared signals" tone="aqua" />
        <StatTile label="Play now" value={home.decisionWindows.length} sub="timing windows" tone="green" />
        <StatTile label="Movement" value={home.movementGames.length} sub={home.liveDeskAvailable ? "live markets" : "feed static"} tone="amber" />
        <StatTile label="Traps" value={home.traps.length} sub="avoid flags" />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <DecisionCard title="Play now" tone="play" items={home.decisionWindows.length ? home.decisionWindows : home.topActionables} empty="No immediate windows. Wait for a cleaner number." />
        <DecisionCard title="Watch list" tone="watch" items={watchItems} empty="No secondary watches. Check movement and trends." />
        <DecisionCard title="Avoid / traps" tone="avoid" items={home.traps} empty="No major trap flags on the desk." />
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <QuickLaunch href="/board" title="Live Board" detail="Odds, edge labels, movement, and matchup openers." primary />
        <QuickLaunch href="/sim" title="Sim Studio" detail="NBA and MLB model workspaces built for decisions." />
        <QuickLaunch href="/trends" title="Trends Engine" detail="Historical systems connected to live games." />
        <QuickLaunch href={`/props?league=${home.focusedLeague}`} title="Props Lab" detail="Player markets and prop context." />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-6">
          <section className="rounded-[1.5rem] border border-white/10 bg-[#07111d]/85 p-5">
            <SectionTitle eyebrow="Today's slate" title="Verified games" href="/games" />
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {home.verifiedGames.length ? home.verifiedGames.slice(0, 6).map((game) => <LiveEdgeBoardCard key={game.id} game={game} />) : <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-sm text-slate-500">No verified games returned for this window.</div>}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-[#07111d]/85 p-5">
            <SectionTitle eyebrow="Trend matches" title="Systems attached to today" href="/trends" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {trendFeed.featured.length ? trendFeed.featured.map((card) => <TrendCard key={card.id} card={card} />) : <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-sm text-slate-500">No trend-to-game matches are available for this league yet.</div>}
            </div>
          </section>
        </div>

        <aside className="hidden xl:grid xl:content-start xl:gap-5">
          <section className="rounded-[1.5rem] border border-white/10 bg-[#07111d]/85 p-4">
            <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aqua">Market radar</div><h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-white">Line movement</h2></div><span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{home.liveDeskFreshnessLabel}</span></div>
            <div className="mt-4 grid gap-2">
              {home.movementGames.length ? home.movementGames.slice(0, 5).map((game) => <Link key={game.id} href={`/game/${game.id}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-aqua/35"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-white">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div><div className="font-mono text-sm text-aqua">{game.spread?.lineLabel ?? game.moneyline?.lineLabel ?? "—"}</div></div><div className="mt-1 text-xs text-slate-500">{game.leagueKey} movement detected</div></Link>) : <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500">{home.liveDeskMessage ?? "No qualified movement right now."}</div>}
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-[#07111d]/85 p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Data health</div><Badge tone={getProviderHealthTone(home.deskStatusState)}>{home.deskStatusLabel}</Badge></div>
            <DiagnosticMetaStrip items={[`League: ${home.focusedLeague}`, `Slate: ${formatHomeDateLabel(home.selectedDate)}`, home.liveDeskFreshnessLabel, typeof home.liveDeskFreshnessMinutes === "number" ? `${home.liveDeskFreshnessMinutes}m old` : null]} />
            <p className="mt-3 text-xs leading-5 text-slate-500">{home.deskSourceNote}</p>
            <div className="mt-4 flex flex-wrap gap-2">{HOME_DESK_DATES.map((date) => <Link key={date.key} href={`/?league=${home.selectedLeague}&date=${date.key}`} className={home.selectedDate === date.key ? "rounded-full border border-aqua/40 bg-aqua/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-aqua" : "rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 hover:border-aqua/35 hover:text-aqua"}>{date.label}</Link>)}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
