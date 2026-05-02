import Link from "next/link";

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

const VALID_TREND_LEAGUES: Array<NonNullable<TrendFilters["league"]>> = ["ALL", "NBA", "MLB", "NHL", "NFL", "NCAAF", "BOXING", "UFC"];
const PRIMARY_LEAGUES = new Set(["ALL", "NBA", "MLB", "NHL", "NFL", "UFC"]);

function normalizeTrendLeague(value: string | null | undefined): NonNullable<TrendFilters["league"]> {
  if (!value) return "ALL";
  return VALID_TREND_LEAGUES.includes(value as NonNullable<TrendFilters["league"]>) ? (value as NonNullable<TrendFilters["league"]>) : "ALL";
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

function teamLabel(team: unknown, fallback: string) {
  const value = team as { abbreviation?: string; name?: string } | null | undefined;
  return value?.abbreviation ?? value?.name ?? fallback;
}

function shell(extra = "") {
  return `border border-white/10 bg-white/[0.045] shadow-[0_24px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl ${extra}`;
}

function Header({ statusLabel, statusState }: { statusLabel: string; statusState: string }) {
  return (
    <header className="flex items-center justify-between gap-3 rounded-[1.35rem] border border-white/10 bg-[#06101b]/85 px-3 py-3 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl sm:px-4">
      <Link href="/" className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-2xl border border-aqua/30 bg-aqua/10 font-display text-lg font-black text-aqua shadow-[0_0_30px_rgba(0,210,255,0.16)]">S</span>
        <span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-aqua">SharkEdge</span>
          <span className="block text-[11px] text-slate-500">command desk</span>
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <Badge tone={getProviderHealthTone(statusState)}>{statusLabel}</Badge>
        <Link href="/board" className="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 sm:inline-flex">Board</Link>
      </div>
    </header>
  );
}

function LeagueChips({ selectedLeague, selectedDate }: { selectedLeague: string; selectedDate: string }) {
  const primary = HOME_LEAGUE_ITEMS.filter((league) => PRIMARY_LEAGUES.has(league.key));
  const secondary = HOME_LEAGUE_ITEMS.filter((league) => !PRIMARY_LEAGUES.has(league.key));
  return (
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {[...primary, ...secondary].map((league) => (
        <Link key={league.key} href={`/?league=${league.key}&date=${selectedDate}`} className={selectedLeague === league.key ? "shrink-0 rounded-full border border-aqua/45 bg-aqua/15 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-aqua shadow-[0_0_22px_rgba(0,210,255,0.14)]" : "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 transition hover:border-aqua/35 hover:text-aqua"}>{league.label}</Link>
      ))}
    </div>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "aqua" | "green" | "amber" }) {
  const valueClass = { default: "text-white", aqua: "text-aqua", green: "text-emerald-300", amber: "text-amber-200" }[tone];
  return (
    <div className="rounded-2xl border border-white/10 bg-[#06101b]/75 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-xl font-black tracking-tight ${valueClass}`}>{value}</div>
    </div>
  );
}

function PrimaryCard({ item, selectedDate }: { item: any; selectedDate: string }) {
  const href = item ? `/game/${item.eventId}` : "/board";
  const title = item?.selectionLabel ?? "No primary signal yet";
  const league = item?.league ?? "Slate";
  const note = item?.reasonSummary ?? "The desk is waiting for a cleaner model signal. Open the board or Sim Twin for context.";
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.20),transparent_18rem),linear-gradient(135deg,rgba(5,18,32,0.98),rgba(2,7,13,0.98))] p-4 shadow-[0_28px_100px_rgba(0,0,0,0.36)] sm:p-5">
      <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] size-44 rounded-full bg-aqua/15 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-aqua">Top Signal</div>
          <h1 className="mt-2 max-w-[18rem] font-display text-3xl font-black leading-[0.95] tracking-[-0.06em] text-white sm:text-4xl">Review today&apos;s slate</h1>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">{formatHomeDateLabel(selectedDate)}</span>
      </div>
      <Link href={href} className="relative mt-5 block rounded-[1.35rem] border border-white/10 bg-black/24 p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
        <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{league}</div><div className="mt-1 truncate font-display text-2xl font-black tracking-tight text-white">{title}</div></div><span className="rounded-full bg-aqua px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-950">Open</span></div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">{note}</p>
      </Link>
    </section>
  );
}

function SlateCard({ game }: { game: any }) {
  const href = game?.detailHref ?? `/game/${game?.id}`;
  const away = teamLabel(game?.awayTeam, "AWY");
  const home = teamLabel(game?.homeTeam, "HOME");
  return (
    <Link href={href} className="group rounded-[1.2rem] border border-white/10 bg-[#06101b]/78 p-3 transition hover:border-aqua/35 hover:bg-aqua/[0.04]">
      <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500"><span>{game?.leagueKey ?? "GAME"}</span><span className="h-1 w-1 rounded-full bg-slate-700" /><span>{formatGameTime(game?.startTime)}</span></div><div className="mt-1.5 flex items-baseline gap-2"><span className="font-display text-xl font-black tracking-tight text-white">{away}</span><span className="text-xs font-semibold text-slate-600">@</span><span className="font-display text-xl font-black tracking-tight text-white">{home}</span></div></div><div className="shrink-0 text-right"><div className="rounded-full border border-aqua/20 bg-aqua/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-aqua">View</div></div></div>
      <div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200">Verified</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Live</span></div>
    </Link>
  );
}

function SignalTile({ title, label, note, href, tone = "aqua" }: { title: string; label: string; note: string; href: string; tone?: "aqua" | "green" | "amber" }) {
  const toneClass = { aqua: "border-aqua/20 bg-aqua/10 text-aqua", green: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200", amber: "border-amber-300/20 bg-amber-300/10 text-amber-200" }[tone];
  return (
    <Link href={href} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/78 p-3 transition hover:border-aqua/35 hover:bg-aqua/[0.04]"><div className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${toneClass}`}>{label}</div><div className="mt-2 font-display text-base font-black tracking-tight text-white">{title}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{note}</p></Link>
  );
}

function TrendCard({ card }: { card: PublishedTrendCard }) {
  return (
    <Link href={card.href} className="rounded-[1.15rem] border border-white/10 bg-[#06101b]/78 p-3 transition hover:border-aqua/35 hover:bg-aqua/[0.04]"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-black uppercase tracking-[0.16em] text-aqua">{card.leagueLabel}</span><span className="font-mono text-xs font-black text-emerald-300">{card.record}</span></div><div className="mt-1.5 line-clamp-1 font-display text-base font-black tracking-tight text-white">{card.title}</div><div className="mt-1.5 text-xs leading-5 text-slate-500">{card.todayMatches.length ? `${card.todayMatches.length} active matchup${card.todayMatches.length === 1 ? "" : "s"}` : `${card.marketLabel} system`}</div></Link>
  );
}

function QuickAction({ href, title, label }: { href: string; title: string; label: string }) {
  return <Link href={href} className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] px-3 py-3 transition hover:border-aqua/35 hover:bg-aqua/[0.055]"><div className="text-[9px] font-black uppercase tracking-[0.16em] text-aqua">{label}</div><div className="mt-1 font-display text-base font-black tracking-tight text-white">{title}</div></Link>;
}

function SectionHeader({ title, eyebrow, href }: { title: string; eyebrow: string; href?: string }) {
  return <div className="flex items-end justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.20em] text-aqua">{eyebrow}</div><h2 className="mt-1 font-display text-xl font-black tracking-[-0.04em] text-white">{title}</h2></div>{href ? <Link href={href} className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 transition hover:text-aqua">Open</Link> : null}</div>;
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-slate-500">{text}</div>;
}

function BottomNav({ league }: { league: string }) {
  const items = [{ href: "/", label: "Home", icon: "⌂" }, { href: "/board", label: "Board", icon: "▦" }, { href: "/trends", label: "Trends", icon: "↗" }, { href: "/sim", label: "Sim", icon: "◉" }, { href: `/props?league=${league}`, label: "Props", icon: "◆" }];
  return <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#02060b]/92 px-3 py-2 backdrop-blur-xl md:hidden"><div className="mx-auto grid max-w-[430px] grid-cols-5 gap-1">{items.map((item) => <Link key={item.href} href={item.href} className="grid place-items-center gap-0.5 rounded-2xl px-2 py-1.5 text-slate-500 transition hover:bg-white/[0.04] hover:text-aqua"><span className="text-base leading-none">{item.icon}</span><span className="text-[9px] font-black uppercase tracking-[0.11em]">{item.label}</span></Link>)}</div></nav>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getHomeCommandData(resolvedSearch);
  const trendFeed = await getSafeTrendFeed(home.focusedLeague);
  const topSignal = home.topActionables[0] as any;
  const watchItems = home.topActionables.filter((opp: any) => !home.decisionWindows.some((item: any) => item.id === opp.id)) as any[];
  const shownGames = home.verifiedGames.slice(0, 5) as any[];
  const primarySignal = home.decisionWindows[0] as any;
  const watchSignal = watchItems[0] as any;
  const alertSignal = home.traps[0] as any;
  const alertCount = home.traps.length + home.movementGames.length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02060b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(0,210,255,0.20),transparent_24rem),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.10),transparent_18rem),linear-gradient(180deg,#02060b_0%,#050b13_55%,#02060b_100%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:26px_26px] opacity-40" />
      <div className="relative mx-auto grid max-w-7xl gap-4 px-3 pb-24 pt-3 sm:px-5 md:pb-10 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="mx-auto grid w-full max-w-[440px] gap-4 lg:sticky lg:top-4 lg:mx-0"><Header statusLabel={home.deskStatusLabel} statusState={home.deskStatusState} /><PrimaryCard item={topSignal} selectedDate={home.selectedDate} /><section className="grid grid-cols-4 gap-2"><Kpi label="Games" value={home.verifiedGames.length} /><Kpi label="Verified" value={home.verifiedGames.length} tone="green" /><Kpi label="Signals" value={home.topActionables.length} tone="aqua" /><Kpi label="Alerts" value={alertCount} tone="amber" /></section><section className={shell("rounded-[1.35rem] p-3")}><LeagueChips selectedLeague={home.selectedLeague} selectedDate={home.selectedDate} /><div className="mt-2 flex flex-wrap gap-2">{HOME_DESK_DATES.map((date) => <Link key={date.key} href={`/?league=${home.selectedLeague}&date=${date.key}`} className={home.selectedDate === date.key ? "rounded-full border border-aqua/35 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-aqua" : "rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:border-aqua/35 hover:text-aqua"}>{date.label}</Link>)}</div></section><section className="grid grid-cols-2 gap-2"><QuickAction href="/board" title="Live Board" label="Open" /><QuickAction href="/sim/twin" title="Sim Twin" label="Model" /><QuickAction href="/trends" title="Trends" label="Proof" /><QuickAction href={`/props?league=${home.focusedLeague}`} title="Props Lab" label="Player" /></section></div>
        <div className="mx-auto grid w-full max-w-[440px] gap-4 lg:max-w-none"><section className={shell("rounded-[1.35rem] p-4 sm:p-5")}><SectionHeader eyebrow="Today&apos;s slate" title="Clean board" href="/games" /><div className="mt-4 grid gap-2 xl:grid-cols-2">{shownGames.length ? shownGames.map((game) => <SlateCard key={game.id} game={game} />) : <EmptyCard text="No verified games returned for this window." />}</div></section><section className="grid gap-3 xl:grid-cols-3"><SignalTile title={primarySignal?.selectionLabel ?? topSignal?.selectionLabel ?? "No cleared signal"} label="Primary" note={primarySignal?.reasonSummary ?? topSignal?.reasonSummary ?? "Wait for a stronger model signal before upgrading."} href={primarySignal ? `/game/${primarySignal.eventId}` : topSignal ? `/game/${topSignal.eventId}` : "/board"} tone="green" /><SignalTile title={watchSignal?.selectionLabel ?? "Watch movement"} label="Watch" note={watchSignal?.reasonSummary ?? home.liveDeskMessage ?? "Monitor movement and model agreement before upgrading."} href={watchSignal ? `/game/${watchSignal.eventId}` : "/board"} tone="aqua" /><SignalTile title={alertSignal?.selectionLabel ?? "No major alert"} label="Alert" note={alertSignal?.whatCouldKillIt?.[0] ?? alertSignal?.reasonSummary ?? "No major alert flags on the desk right now."} href={alertSignal ? `/game/${alertSignal.eventId}` : "/board"} tone="amber" /></section><section className={shell("rounded-[1.35rem] p-4 sm:p-5")}><SectionHeader eyebrow="Signals" title="What to watch" href="/trends" /><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{trendFeed.featured.length ? trendFeed.featured.slice(0, 3).map((card) => <TrendCard key={card.id} card={card} />) : <EmptyCard text="No trend-to-game matches are available for this league yet." />}</div></section><section className={shell("rounded-[1.35rem] p-4")}><div className="mb-3 flex items-center justify-between gap-2"><div><div className="text-[9px] font-black uppercase tracking-[0.20em] text-aqua">Data</div><h2 className="mt-1 font-display text-xl font-black tracking-[-0.04em] text-white">Health</h2></div><Badge tone={getProviderHealthTone(home.deskStatusState)}>{home.deskStatusLabel}</Badge></div><DiagnosticMetaStrip items={[`League: ${home.focusedLeague}`, `Slate: ${formatHomeDateLabel(home.selectedDate)}`, home.liveDeskFreshnessLabel, typeof home.liveDeskFreshnessMinutes === "number" ? `${home.liveDeskFreshnessMinutes}m old` : null]} /><p className="mt-3 text-xs leading-5 text-slate-500">{home.deskSourceNote}</p></section></div>
      </div>
      <BottomNav league={home.focusedLeague} />
    </main>
  );
}
