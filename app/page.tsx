import Link from "next/link";

import {
  HOME_DESK_DATES,
  HOME_LEAGUE_ITEMS,
  formatHomeDateLabel
} from "@/services/home/home-command-service";
import { getSafeHomeCommandData } from "@/services/home/safe-home-command-service";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type HomeSignal = {
  id?: string;
  eventId?: string;
  league?: string;
  leagueKey?: string;
  selectionLabel?: string;
  marketLabel?: string;
  reasonSummary?: string;
  confidence?: number;
  edgeScore?: { score?: number; label?: string };
  whatCouldKillIt?: string[];
};

type HomeGame = {
  id?: string;
  detailHref?: string | null;
  leagueKey?: string;
  startTime?: string;
  awayTeam?: { abbreviation?: string; name?: string };
  homeTeam?: { abbreviation?: string; name?: string };
  bestBookCount?: number;
};

function text(value: unknown, fallback = "—") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function pct(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function gameTime(value: unknown) {
  if (typeof value !== "string") return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function signalHref(signal: HomeSignal) {
  return signal.eventId ? `/game/${signal.eventId}` : "/sim";
}

function gameHref(game: HomeGame) {
  return game.detailHref ?? (game.id ? `/game/${game.id}` : "/sim");
}

function team(game: HomeGame, side: "away" | "home") {
  const entity = side === "away" ? game.awayTeam : game.homeTeam;
  return entity?.abbreviation ?? entity?.name ?? (side === "away" ? "AWAY" : "HOME");
}

function uniqueSignals(signals: HomeSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal, index) => {
    const key = signal.id ?? signal.eventId ?? `${signal.selectionLabel ?? "signal"}-${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" }) {
  const cls =
    tone === "good"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
        : "border-white/10 bg-white/[0.045] text-slate-300";

  return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${cls}`}>{label}</span>;
}

function SectionHeader({ eyebrow, title, href }: { eyebrow: string; title: string; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-aqua">{eyebrow}</div>
        <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-white">{title}</h2>
      </div>
      {href ? <Link href={href} className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 hover:text-aqua">Open</Link> : null}
    </div>
  );
}

function QuickAction({ href, label, title, body }: { href: string; label: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.055]">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">{label}</div>
      <div className="mt-2 font-display text-lg font-black tracking-tight text-white">{title}</div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{body}</p>
    </Link>
  );
}

function TopPlayCard({ signal, rank }: { signal: HomeSignal; rank: number }) {
  const risks = Array.isArray(signal.whatCouldKillIt) ? signal.whatCouldKillIt.slice(0, 2) : [];
  const confidence = signal.edgeScore?.score ?? signal.confidence;

  return (
    <Link href={signalHref(signal)} className="group block h-full">
      <article className="h-full rounded-[1.35rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:-translate-y-0.5 hover:border-aqua/35 hover:bg-aqua/[0.045]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-aqua">Top Play #{rank}</div>
            <div className="mt-2 font-display text-xl font-black tracking-tight text-white">{text(signal.selectionLabel, "Model signal pending")}</div>
          </div>
          <Pill label={text(signal.league ?? signal.leagueKey, "EDGE")} tone="good" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Market</div><div className="mt-1 truncate font-semibold text-white">{text(signal.marketLabel, "Play")}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Confidence</div><div className="mt-1 font-mono font-semibold text-aqua">{pct(confidence)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Grade</div><div className="mt-1 font-semibold text-white">{text(signal.edgeScore?.label, "Review")}</div></div>
        </div>
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-400">{text(signal.reasonSummary, "Open SimHub for model factors, market context, and stale-data checks.")}</p>
        <div className="mt-4 flex flex-wrap gap-2">{risks.length ? risks.map((risk) => <Pill key={risk} label={risk} tone="warn" />) : <Pill label="Model version required" />}</div>
      </article>
    </Link>
  );
}

function SlateCard({ game }: { game: HomeGame }) {
  return (
    <Link href={gameHref(game)} className="rounded-[1.1rem] border border-white/10 bg-[#06101b]/78 p-3 transition hover:border-aqua/35 hover:bg-aqua/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">{text(game.leagueKey, "GAME")} · {gameTime(game.startTime)}</div>
          <div className="mt-1.5 font-display text-lg font-black tracking-tight text-white">{team(game, "away")} @ {team(game, "home")}</div>
        </div>
        <Pill label={Number(game.bestBookCount ?? 0) > 0 ? "Priced" : "Schedule"} tone={Number(game.bestBookCount ?? 0) > 0 ? "good" : "neutral"} />
      </div>
    </Link>
  );
}

function FilterStrip({ selectedLeague, selectedDate }: { selectedLeague: string; selectedDate: string }) {
  return (
    <div className="grid gap-3 rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {HOME_LEAGUE_ITEMS.map((league) => (
          <Link key={league.key} href={`/?league=${league.key}&date=${selectedDate}`} className={selectedLeague === league.key ? "shrink-0 rounded-full border border-aqua/45 bg-aqua/15 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-aqua" : "shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 hover:border-aqua/35 hover:text-aqua"}>{league.label}</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {HOME_DESK_DATES.map((date) => (
          <Link key={date.key} href={`/?league=${selectedLeague}&date=${date.key}`} className={selectedDate === date.key ? "rounded-full border border-aqua/35 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-aqua" : "rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 hover:border-aqua/35 hover:text-aqua"}>{date.label}</Link>
        ))}
      </div>
    </div>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearch = (await searchParams) ?? {};
  const home = await getSafeHomeCommandData(resolvedSearch);
  const topPlays = uniqueSignals([...(home.decisionWindows as HomeSignal[]), ...(home.topActionables as HomeSignal[])]).slice(0, 6);
  const slate = (home.verifiedGames as HomeGame[]).slice(0, 8);
  const alerts = [...(home.traps as HomeSignal[]), ...(home.movementGames as HomeSignal[])];
  const selectedDateLabel = formatHomeDateLabel(home.selectedDate as Parameters<typeof formatHomeDateLabel>[0]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02060b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(0,210,255,0.18),transparent_24rem),radial-gradient(circle_at_100%_10%,rgba(45,212,191,0.10),transparent_18rem),linear-gradient(180deg,#02060b_0%,#050b13_55%,#02060b_100%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-5 px-3 pb-24 pt-3 sm:px-5 md:pb-10">
        <header className="rounded-[1.35rem] border border-white/10 bg-[#06101b]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.30)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-2xl border border-aqua/30 bg-aqua/10 font-display text-lg font-black text-aqua">S</span><span><span className="block text-[10px] font-black uppercase tracking-[0.28em] text-aqua">SharkEdge</span><span className="block text-[11px] text-slate-500">top plays command center</span></span></Link>
            <div className="flex flex-wrap items-center gap-2"><Pill label={home.deskStatusLabel} tone={home.deskStatusState === "HEALTHY" ? "good" : "warn"} /><Link href="/sim" className="rounded-full border border-aqua/25 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-aqua">SimHub</Link><Link href="/accuracy" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua">Accuracy</Link></div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_360px]">
          <div className="rounded-[1.75rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(0,210,255,0.20),transparent_18rem),linear-gradient(135deg,rgba(5,18,32,0.98),rgba(2,7,13,0.98))] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.36)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="text-[10px] font-black uppercase tracking-[0.24em] text-aqua">Today’s command center</div><h1 className="mt-3 max-w-3xl font-display text-4xl font-black leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl">Find the best plays. Then prove the model.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">Home now focuses on MLB, NBA, and UFC signals only: top plays, live slate, model explanation routes, trends, fights, accuracy, and saved plays.</p></div>
              <Pill label={selectedDateLabel} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <QuickAction href="/sim/mlb" label="MLB" title="MLB SimHub" body="Sides, totals, pitcher factors, bullpen fatigue, and market edge." />
              <QuickAction href="/sim/nba" label="NBA" title="NBA SimHub" body="Player sims, side queue, injuries, usage, pace, and matchup context." />
              <QuickAction href="/sharkfights/ufc" label="UFC" title="SharkFights" body="Fight card, path to victory, finish probability, and danger flags." />
              <QuickAction href="/accuracy" label="Proof" title="Sim Accuracy" body="Records, model versions, calibration, and honest empty states." />
            </div>
          </div>

          <div className="grid gap-3">
            <FilterStrip selectedLeague={home.selectedLeague} selectedDate={home.selectedDate} />
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Top Plays</div><div className="mt-1 font-display text-2xl font-black text-white">{topPlays.length}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Slate</div><div className="mt-1 font-display text-2xl font-black text-white">{slate.length}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"><div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Alerts</div><div className="mt-1 font-display text-2xl font-black text-amber-200">{alerts.length}</div></div>
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <SectionHeader eyebrow="Top plays" title="Best model looks right now" href="/sim" />
          {topPlays.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{topPlays.map((signal, index) => <TopPlayCard key={signal.id ?? signal.eventId ?? index} signal={signal} rank={index + 1} />)}</div> : <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-slate-400">No top plays are cleared yet. Use SimHub for raw model output and Accuracy for settled proof.</div>}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4"><SectionHeader eyebrow="Live slate" title="Upcoming verified games" href="/sim" /><div className="grid gap-2 md:grid-cols-2">{slate.length ? slate.map((game, index) => <SlateCard key={game.id ?? index} game={game} />) : <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-slate-400">No verified slate rows returned for this filter.</div>}</div></div>
          <aside className="grid gap-3"><SectionHeader eyebrow="Clean routes" title="Where each thing lives" /><QuickAction href="/sharktrends" label="Trends" title="SharkTrends" body="Actionable, model-confirmed, market-disagreement, and trap/fade trend groups." /><QuickAction href="/saved" label="Saved" title="Saved Plays" body="Watchlist, tracked bets, and alert preferences collapsed into one lean page." /><QuickAction href="/sim" label="Engine" title="SimHub" body="The old board, props, and edge desks are consolidated into the simulation engine." /></aside>
        </section>

        <section className="rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4 text-xs leading-6 text-slate-500"><span className="font-black uppercase tracking-[0.16em] text-slate-300">Data note:</span> {home.deskSourceNote}</section>
      </div>
    </main>
  );
}
