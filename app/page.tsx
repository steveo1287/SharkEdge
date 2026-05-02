import Link from "next/link";

import { LiveEdgeBoardCard } from "@/components/board/live-edge-board-card";
import { DiagnosticMetaStrip } from "@/components/intelligence/provider-diagnostic-shells";
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

function formatGameTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function StatTile({ label, value, sub, tone = "neutral" }: { label: string; value: string | number; sub: string; tone?: "neutral" | "aqua" | "green" | "amber" }) {
  const valueClass = {
    neutral: "text-white",
    aqua: "text-aqua",
    green: "text-emerald-300",
    amber: "text-amber-200"
  }[tone];
  return (
    <div className="min-w-[132px] rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 sm:min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function QuickLaunch({ href, title, detail, primary = false }: { href: string; title: string; detail: string; primary?: boolean }) {
  return (
    <Link href={href} className={primary ? "rounded-2xl border border-aqua/30 bg-aqua/10 px-3 py-3 transition hover:bg-aqua/[0.14]" : "rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 transition hover:border-aqua/35 hover:bg-aqua/[0.055]"}>
      <div className={primary ? "text-[9px] font-semibold uppercase tracking-[0.16em] text-aqua" : "text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"}>Open</div>
      <div className="mt-1 font-display text-lg font-semibold tracking-tight text-white">{title}</div>
      <div className="mt-1.5 text-xs leading-5 text-slate-400">{detail}</div>
    </Link>
  );
}

function DecisionCard({ title, tone, items, empty }: { title: string; tone: "play" | "watch" | "avoid"; items: Array<{ id: string; eventId: string; selectionLabel: string; league: string; reasonSummary: string; whatCouldKillIt?: string[] }>; empty: string }) {
  const toneClass = tone === "play" ? "text-emerald-300" : tone === "avoid" ? "text-red-300" : "text-aqua";
  return (
    <section className="rounded-[1.25rem] border border-white/10 bg-[#07111d]/85 p-3 sm:p-4">
      <div className={`text-[9px] font-semibold uppercase tracking-[0.16em] ${toneClass}`}>{title}</div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.slice(0, 2).map((opp) => (
          <Link key={`${title}-${opp.id}`} href={`/game/${opp.eventId}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-aqua/35">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-sm font-semibold text-white">{opp.selectionLabel}</div>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{opp.league}</span>
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-400">{tone === "avoid" ? (opp.whatCouldKillIt?.[0] ?? opp.reasonSummary) : opp.reasonSummary}</div>
          </Link>
        )) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 text-xs leading-5 text-slate-500">{empty}</div>
        )}
      </div>
    </section>
  );
}

function TrendCard({ card }: { card: PublishedTrendCard }) {
  return (
    <Link href={card.href} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-aqua/35 hover:bg-aqua/[0.055]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-aqua">{card.leagueLabel} · {card.marketLabel}</span>
        <span className="font-mono text-xs font-semibold text-emerald-300">{card.record}</span>
      </div>
      <div className="mt-1.5 font-display text-base font-semibold tracking-tight text-white">{card.title}</div>
      <div className="mt-1.5 text-xs leading-5 text-slate-400">{card.todayMatches.length ? `${card.todayMatches.length} live matchups qualify today.` : "Historical system ready."}</div>
    </Link>
  );
}

function SectionTitle({ eyebrow, title, href }: { eyebrow: string; title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-aqua">{eyebrow}</div>
        <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
      </div>
      {href ? <Link href={href} className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:text-aqua">Open →</Link> : null}
    </div>
  );
}

function LeagueChips({ selectedLeague, selectedDate }: { selectedLeague: string; selectedDate: string }) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {HOME_LEAGUE_ITEMS.map((league) => (
        <Link key={league.key} href={`/?league=${league.key}&date=${selectedDate}`} className={selectedLeague === league.key ? "shrink-0 rounded-full border border-aqua/40 bg-aqua/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-aqua" : "shrink-0 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:border-aqua/35 hover:text-aqua"}>{league.label}</Link>
      ))}
    </div>
  );
}

function CompactVerifiedGameRow({ game }: { game: any }) {
  const href = game.detailHref ?? `/game/${game.id}`;
  const matchup = `${game.awayTeam?.abbreviation ?? "AWY"} @ ${game.homeTeam?.abbreviation ?? "HOME"}`;
  const lineLabel = game.spread?.lineLabel ?? game.moneyline?.lineLabel ?? game.total?.lineLabel ?? "Open";

  return (
    <Link href={href} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-aqua/35">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{game.leagueKey} · {formatGameTime(game.startTime)}</div>
          <div className="mt-1 truncate text-sm font-semibold text-white">{matchup}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-xs font-semibold text-aqua">{lineLabel}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">view</div>
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getHomeCommandData(resolvedSearch);
  const trendFeed = await getSafeTrendFeed(home.focusedLeague);
  const topEdge = home.topActionables[0];
  const watchItems = home.topActionables.filter((opp) => !home.decisionWindows.some((item) => item.id === opp.id));
  const shownGames = home.verifiedGames.slice(0, 8);

  return (
    <div className="grid gap-4 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.10),transparent_26rem)] pb-8 sm:gap-5">
      <section className="rounded-[1.35rem] border border-aqua/20 bg-[#07111d]/90 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.28)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-aqua">SharkEdge Command Center</div>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Slate Desk</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Action first: best play, watch list, traps, verified games, trends, and model launchers without the scroll bloat.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Badge tone={getProviderHealthTone(home.deskStatusState)}>{home.deskStatusLabel}</Badge>
            <Link href={topEdge ? `/game/${topEdge.eventId}` : "/board"} className="rounded-full bg-aqua px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950">{topEdge ? "Best play" : "Board"}</Link>
          </div>
        </div>
        <div className="mt-4">
          <LeagueChips selectedLeague={home.selectedLeague} selectedDate={home.selectedDate} />
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.35rem] border border-aqua/20 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.12),transparent_20rem),#07111d] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-aqua">Best available edge</div>
            <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{formatHomeDateLabel(home.selectedDate)}</span>
          </div>
          <div className="mt-3 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{topEdge ? topEdge.selectionLabel : "No qualified edge right now"}</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">{topEdge ? topEdge.reasonSummary : "The engine is waiting for a cleaner number. Check the watch list, movement, and trends before forcing action."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={topEdge ? `/game/${topEdge.eventId}` : "/board"} className="rounded-full bg-aqua px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-950">Open</Link>
            <Link href="/board" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 hover:border-aqua/35 hover:text-aqua">Full board</Link>
            <Link href="/sim/twin" className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 hover:border-aqua/35 hover:text-aqua">Sim twin</Link>
          </div>
        </div>

        <div className="scrollbar-none flex gap-2 overflow-x-auto xl:grid xl:grid-cols-2 xl:gap-3 xl:overflow-visible">
          <StatTile label="Games" value={home.verifiedGames.length} sub={formatHomeDateLabel(home.selectedDate)} />
          <StatTile label="Edges" value={home.topActionables.length} sub="cleared signals" tone="aqua" />
          <StatTile label="Play now" value={home.decisionWindows.length} sub="timing windows" tone="green" />
          <StatTile label="Traps" value={home.traps.length} sub="avoid flags" tone="amber" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <DecisionCard title="Play now" tone="play" items={home.decisionWindows.length ? home.decisionWindows : home.topActionables} empty="No immediate windows. Wait for a cleaner number." />
        <DecisionCard title="Watch list" tone="watch" items={watchItems} empty="No secondary watches. Check movement and trends." />
        <DecisionCard title="Avoid / traps" tone="avoid" items={home.traps} empty="No major trap flags on the desk." />
      </section>

      <section className="rounded-[1.35rem] border border-white/10 bg-[#07111d]/85 p-4 sm:p-5">
        <SectionTitle eyebrow="Today's slate" title="Verified games" href="/games" />
        <div className="mt-3 grid gap-2 md:hidden">
          {shownGames.length ? shownGames.map((game) => <CompactVerifiedGameRow key={game.id} game={game} />) : <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500">No verified games returned for this window.</div>}
        </div>
        <div className="mt-4 hidden gap-3 md:grid xl:grid-cols-2">
          {home.verifiedGames.length ? home.verifiedGames.slice(0, 6).map((game) => <LiveEdgeBoardCard key={game.id} game={game} />) : <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-sm text-slate-500">No verified games returned for this window.</div>}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLaunch href="/board" title="Live Board" detail="Odds, edge labels, movement, and matchup openers." primary />
        <QuickLaunch href="/sim" title="Sim Studio" detail="NBA and MLB model workspaces built for decisions." />
        <QuickLaunch href="/trends" title="Trends Engine" detail="Historical systems connected to live games." />
        <QuickLaunch href={`/props?league=${home.focusedLeague}`} title="Props Lab" detail="Player markets and prop context." />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <section className="rounded-[1.35rem] border border-white/10 bg-[#07111d]/85 p-4 sm:p-5">
          <SectionTitle eyebrow="Trend matches" title="Systems attached to today" href="/trends" />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {trendFeed.featured.length ? trendFeed.featured.map((card) => <TrendCard key={card.id} card={card} />) : <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500">No trend-to-game matches are available for this league yet.</div>}
          </div>
        </section>

        <aside className="hidden xl:grid xl:content-start xl:gap-5">
          <section className="rounded-[1.35rem] border border-white/10 bg-[#07111d]/85 p-4">
            <div className="flex items-center justify-between gap-3"><div><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-aqua">Market radar</div><h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-white">Line movement</h2></div><span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{home.liveDeskFreshnessLabel}</span></div>
            <div className="mt-4 grid gap-2">
              {home.movementGames.length ? home.movementGames.slice(0, 5).map((game) => <Link key={game.id} href={`/game/${game.id}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition hover:border-aqua/35"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-white">{game.awayTeam.abbreviation} @ {game.homeTeam.abbreviation}</div><div className="font-mono text-sm text-aqua">{game.spread?.lineLabel ?? game.moneyline?.lineLabel ?? "—"}</div></div><div className="mt-1 text-xs text-slate-500">{game.leagueKey} movement detected</div></Link>) : <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-500">{home.liveDeskMessage ?? "No qualified movement right now."}</div>}
            </div>
          </section>

          <section className="rounded-[1.35rem] border border-white/10 bg-[#07111d]/85 p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Data health</div><Badge tone={getProviderHealthTone(home.deskStatusState)}>{home.deskStatusLabel}</Badge></div>
            <DiagnosticMetaStrip items={[`League: ${home.focusedLeague}`, `Slate: ${formatHomeDateLabel(home.selectedDate)}`, home.liveDeskFreshnessLabel, typeof home.liveDeskFreshnessMinutes === "number" ? `${home.liveDeskFreshnessMinutes}m old` : null]} />
            <p className="mt-3 text-xs leading-5 text-slate-500">{home.deskSourceNote}</p>
            <div className="mt-4 flex flex-wrap gap-2">{HOME_DESK_DATES.map((date) => <Link key={date.key} href={`/?league=${home.selectedLeague}&date=${date.key}`} className={home.selectedDate === date.key ? "rounded-full border border-aqua/40 bg-aqua/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-aqua" : "rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 hover:border-aqua/35 hover:text-aqua"}>{date.label}</Link>)}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
