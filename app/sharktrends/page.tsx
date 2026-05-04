import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SharkTrendsFilters = {
  league: string;
  market: string;
  grade: string;
  roiFloor: number | null;
  activeOnly: boolean;
  verifiedOnly: boolean;
};

type LaneKey = "actionable" | "watch" | "market" | "research" | "blocked";

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function readBool(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = readValue(searchParams, key);
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

function readNumber(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>): SharkTrendsFilters {
  return {
    league: (readValue(searchParams, "league") || "ALL").toUpperCase(),
    market: (readValue(searchParams, "market") || "ALL").toLowerCase(),
    grade: (readValue(searchParams, "grade") || "ALL").toUpperCase(),
    roiFloor: readNumber(readValue(searchParams, "roiFloor")),
    activeOnly: readBool(searchParams, "active"),
    verifiedOnly: readBool(searchParams, "verified")
  };
}

function unit(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}u`;
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function price(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "price needed";
  return value > 0 ? `+${value}` : String(value);
}

function time(value: string | null | undefined) {
  if (!value) return "time TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function chipClass(kind: "good" | "watch" | "warn" | "bad" | "muted") {
  if (kind === "good") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (kind === "watch") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (kind === "warn") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  if (kind === "bad") return "border-red-400/25 bg-red-400/10 text-red-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function gradeClass(grade: string | null | undefined) {
  const value = String(grade ?? "").toUpperCase();
  if (value === "A") return chipClass("good");
  if (value === "B") return chipClass("watch");
  if (value === "C") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return chipClass("warn");
}

function actionKind(value: string | null | undefined): "good" | "watch" | "warn" | "bad" | "muted" {
  const action = String(value ?? "").toUpperCase();
  if (action.includes("ACTIONABLE") || action.includes("ACTIVE")) return "good";
  if (action.includes("WATCH")) return "watch";
  if (action.includes("WAIT")) return "warn";
  if (action.includes("PASS") || action.includes("BENCH")) return "bad";
  return "muted";
}

function Chip({ children, kind = "muted" }: { children: React.ReactNode; kind?: "good" | "watch" | "warn" | "bad" | "muted" }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${chipClass(kind)}`}>{children}</span>;
}

function Metric({ label, value, note, kind = "muted" }: { label: string; value: string | number; note: string; kind?: "good" | "watch" | "warn" | "bad" | "muted" }) {
  return (
    <div className={`rounded-2xl border p-4 ${chipClass(kind).replace("text-emerald-200", "").replace("text-sky-200", "").replace("text-amber-100", "").replace("text-red-200", "").replace("text-slate-300", "")}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function rowPassesFilters(item: any, filters: SharkTrendsFilters) {
  if (filters.league !== "ALL" && String(item.league ?? "").toUpperCase() !== filters.league) return false;
  if (filters.market !== "all" && String(item.market ?? "").toLowerCase() !== filters.market) return false;
  if (filters.grade !== "ALL" && String(item.proof?.grade ?? "").toUpperCase() !== filters.grade) return false;
  if (filters.roiFloor !== null && (item.proof?.roiPct ?? Number.NEGATIVE_INFINITY) < filters.roiFloor) return false;
  if (filters.activeOnly && Number(item.activeMatches ?? 0) <= 0) return false;
  if (filters.verifiedOnly && !item.verified) return false;
  return true;
}

function trendPassesFilters(trend: any, league: string, filters: SharkTrendsFilters) {
  if (filters.league !== "ALL" && String(league ?? "").toUpperCase() !== filters.league) return false;
  if (filters.market !== "all" && String(trend.market ?? "").toLowerCase() !== filters.market) return false;
  if (filters.grade !== "ALL" && String(trend.proof?.grade ?? "").toUpperCase() !== filters.grade) return false;
  if (filters.roiFloor !== null && (trend.proof?.roiPct ?? Number.NEGATIVE_INFINITY) < filters.roiFloor) return false;
  if (filters.activeOnly && !String(trend.actionability ?? "").toUpperCase().includes("ACTIVE")) return false;
  if (filters.verifiedOnly && !trend.verified) return false;
  return true;
}

function classifyTrend(trend: any): LaneKey {
  const action = String(trend.primaryAction ?? trend.actionability ?? "").toUpperCase();
  const blockers = Array.isArray(trend.blockers) ? trend.blockers : [];
  const hasPrice = typeof trend.price === "number" && Number.isFinite(trend.price);
  const edge = typeof trend.edgePct === "number" ? trend.edgePct : null;
  if (action.includes("ACTIONABLE") || (String(trend.actionability ?? "").toUpperCase().includes("ACTIVE") && trend.verified && hasPrice && (edge ?? 0) > 0 && !blockers.length)) return "actionable";
  if (/MOVE|MARKET|STEAM|LINE/i.test(`${trend.name ?? ""} ${trend.reason ?? ""} ${trend.category ?? ""}`)) return "market";
  if (String(trend.actionability ?? "").toUpperCase().includes("WATCH") || action.includes("WATCH") || action.includes("WAIT") || hasPrice || (edge ?? 0) > 0) return "watch";
  if (blockers.length || action.includes("PASS") || !trend.verified) return "blocked";
  return "research";
}

function lanePriority(lane: LaneKey) {
  if (lane === "actionable") return 1;
  if (lane === "watch") return 2;
  if (lane === "market") return 3;
  if (lane === "research") return 4;
  return 5;
}

function laneLabel(lane: LaneKey) {
  if (lane === "actionable") return "Actionable now";
  if (lane === "watch") return "Watch / needs price";
  if (lane === "market") return "Market movement";
  if (lane === "research") return "Research library";
  return "Bench / blocked";
}

function groupMatchups(groups: any[], filters: SharkTrendsFilters, trendLimit = 4) {
  return groups
    .filter((group) => filters.league === "ALL" || String(group.league ?? "").toUpperCase() === filters.league)
    .flatMap((group) => (group.matchups ?? []).map((matchup: any) => ({ group, matchup })))
    .map(({ group, matchup }) => {
      const trends = (matchup.allTrends ?? matchup.trends ?? []).filter((trend: any) => trendPassesFilters(trend, group.league, filters));
      if (!trends.length) return null;
      const sorted = [...trends].sort((left: any, right: any) => (lanePriority(classifyTrend(left)) - lanePriority(classifyTrend(right))) || ((right.score ?? 0) - (left.score ?? 0)));
      const best = sorted[0];
      const lane = classifyTrend(best);
      const bestRoi = sorted.reduce((max: number, trend: any) => Math.max(max, trend.proof?.roiPct ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
      const bestProfit = sorted.reduce((max: number, trend: any) => Math.max(max, trend.proof?.profitUnits ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
      const active = sorted.filter((trend: any) => String(trend.actionability ?? "").toUpperCase().includes("ACTIVE")).length;
      const verified = sorted.filter((trend: any) => trend.verified).length;
      const blocked = sorted.filter((trend: any) => trend.blockers?.length).length;
      return {
        ...matchup,
        league: group.league,
        lane,
        primaryTrend: best,
        trends: sorted.slice(0, trendLimit),
        hiddenTrendCount: Math.max(0, sorted.length - trendLimit),
        trendCount: sorted.length,
        activeTrendCount: active,
        verifiedTrendCount: verified,
        blockedTrendCount: blocked,
        bestRoiPct: Number.isFinite(bestRoi) ? bestRoi : null,
        bestProfitUnits: Number.isFinite(bestProfit) ? bestProfit : null,
        topScore: best?.score ?? 0
      };
    })
    .filter(Boolean)
    .sort((left: any, right: any) => lanePriority(left.lane) - lanePriority(right.lane) || (right.topScore ?? 0) - (left.topScore ?? 0));
}

function FilterPanel({ filters }: { filters: SharkTrendsFilters }) {
  return (
    <section className="sticky top-3 z-20 rounded-[1.5rem] border border-white/10 bg-slate-950/90 p-4 backdrop-blur-xl">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Command filters</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Keep the default board matchup-first. Filters narrow games, attached signals, and the research drawer.</div>
        </div>
        <a href="/sharktrends" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">Reset</a>
      </div>
      <form method="get" className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span><select name="league" defaultValue={filters.league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">{["ALL", "NBA", "MLB", "NFL", "NHL", "NCAAF", "UFC", "BOXING"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span><select name="market" defaultValue={filters.market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"><option value="ALL">ALL</option><option value="moneyline">Moneyline</option><option value="total">Total</option><option value="spread">Spread</option><option value="player_prop">Player prop</option><option value="fight_winner">Fight winner</option></select></label>
        <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Proof grade</span><select name="grade" defaultValue={filters.grade} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"><option value="ALL">ALL</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="PROVISIONAL">PROVISIONAL</option></select></label>
        <label className="grid gap-1 text-xs text-slate-400"><span className="font-semibold uppercase tracking-[0.14em] text-slate-500">ROI floor</span><select name="roiFloor" defaultValue={filters.roiFloor === null ? "" : String(filters.roiFloor)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"><option value="">Any</option><option value="0">0%+</option><option value="5">5%+</option><option value="10">10%+</option><option value="15">15%+</option><option value="20">20%+</option></select></label>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300"><input type="checkbox" name="active" value="1" defaultChecked={filters.activeOnly} className="h-4 w-4 accent-cyan-300" />Active only</label>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300"><input type="checkbox" name="verified" value="1" defaultChecked={filters.verifiedOnly} className="h-4 w-4 accent-cyan-300" />Verified only</label>
        <div className="md:col-span-3 xl:col-span-6 flex flex-wrap gap-2"><button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Apply filters</button><a href="/sharktrends?active=1&verified=1" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Active verified</a><a href="/sharktrends?roiFloor=10" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">ROI 10%+</a><a href="/sharktrends?grade=A" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Grade A</a></div>
      </form>
    </section>
  );
}

function TrendRow({ trend }: { trend: any }) {
  return (
    <a href={trend.href} className="rounded-xl border border-white/10 bg-black/25 p-3 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{trend.name}</div><div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{trend.market} · {trend.side}</div></div><Chip kind={actionKind(trend.actionability)}>{trend.actionability ?? trend.primaryAction ?? "review"}</Chip></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4"><span>{price(trend.price)}</span><span>{trend.edgePct == null ? "edge TBD" : `${trend.edgePct}% edge`}</span><span>{trend.proof?.record ?? "record TBD"}</span><span>{pct(trend.proof?.roiPct)} ROI</span></div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500"><span>{trend.verified ? "verified" : "provisional"}</span><span>score {trend.score ?? 0}</span>{trend.blockers?.slice(0, 2).map((blocker: string) => <span key={blocker}>· {blocker}</span>)}</div>
    </a>
  );
}

function MatchupCard({ matchup }: { matchup: any }) {
  const primary = matchup.primaryTrend;
  const lane = matchup.lane as LaneKey;
  const laneKind = lane === "actionable" ? "good" : lane === "watch" || lane === "market" ? "watch" : lane === "blocked" ? "bad" : "muted";
  return (
    <article className="rounded-[1.35rem] border border-white/10 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2"><Chip kind={laneKind}>{laneLabel(lane)}</Chip><Chip kind="muted">{matchup.league}</Chip>{primary?.proof?.grade ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.13em] ${gradeClass(primary.proof.grade)}`}>Grade {primary.proof.grade}</span> : null}</div>
          <a href={matchup.href} className="mt-3 block text-lg font-semibold leading-snug text-white hover:text-cyan-100">{matchup.eventLabel}</a>
          <div className="mt-1 text-xs leading-5 text-slate-500">{time(matchup.startTime)} · {matchup.status}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-[0.12em] text-slate-500"><div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{matchup.trendCount}</div>signals</div><div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{matchup.activeTrendCount}</div>active</div><div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2"><div className="text-sm font-semibold text-white">{matchup.verifiedTrendCount}</div>verified</div></div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Primary signal</div>
        <div className="mt-1 text-sm font-semibold text-white">{primary?.name ?? "No primary signal"}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4"><span>{primary?.market ?? "market"}</span><span>{primary?.side ?? "side"}</span><span>{price(primary?.price)}</span><span>{primary?.edgePct == null ? "edge TBD" : `${primary.edgePct}% edge`}</span></div>
        {primary?.proof ? <div className="mt-2 text-[11px] text-cyan-100/75">{primary.proof.record} · {unit(primary.proof.profitUnits)} · {pct(primary.proof.roiPct)} ROI · {pct(primary.proof.winRatePct)} hit</div> : null}
      </div>

      <div className="mt-3 grid gap-2">{matchup.trends.map((trend: any) => <TrendRow key={trend.id} trend={trend} />)}</div>
      {matchup.hiddenTrendCount ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">+{matchup.hiddenTrendCount} more signals in matchup detail</div> : null}
    </article>
  );
}

function MatchupLane({ id, title, description, items, collapsed = false }: { id: string; title: string; description: string; items: any[]; collapsed?: boolean }) {
  const body = <div className="mt-4 grid gap-3 xl:grid-cols-2">{items.length ? items.map((matchup) => <MatchupCard key={matchup.id} matchup={matchup} />) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-500">No matchups in this lane under the current filters.</div>}</div>;
  if (collapsed) {
    return <details id={id} className="scroll-mt-28 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div><div className="mt-1 text-xs leading-5 text-slate-400">{description}</div></div><Chip kind="muted">{items.length}</Chip></div></summary>{body}</details>;
  }
  return <section id={id} className="scroll-mt-28 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div><div className="mt-1 text-xs leading-5 text-slate-400">{description}</div></div><Chip kind="watch">{items.length}</Chip></div>{body}</section>;
}

function SystemCard({ item }: { item: any }) {
  return (
    <a href={item.href} className="rounded-2xl border border-white/10 bg-black/25 p-4 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-semibold text-white">#{item.rank} {item.name}</div><div className="mt-1 text-xs leading-5 text-slate-500">{item.league} · {item.market} · {item.category}</div></div><Chip kind={item.tier === "promote" ? "good" : item.tier === "watch" ? "watch" : item.tier === "bench" ? "bad" : "muted"}>{item.tier}</Chip></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400"><span>{item.proof?.record ?? "record TBD"}</span><span>{unit(item.proof?.profitUnits)}</span><span>{pct(item.proof?.roiPct)} ROI</span><span>{pct(item.proof?.winRatePct)} hit</span></div>
      <div className="mt-3 text-xs leading-5 text-slate-400">{item.reason}</div>
    </a>
  );
}

function ResearchDrawer({ rows }: { rows: any[] }) {
  return (
    <details className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4">
      <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Research library</div><div className="mt-1 text-xs leading-5 text-slate-400">Historical systems stay here unless attached to a current matchup. This replaces the old repeated rail stack.</div></div><Chip kind="muted">{rows.length} systems</Chip></div></summary>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">{rows.slice(0, 18).map((item) => <SystemCard key={item.id} item={item} />)}</div>
    </details>
  );
}

export default async function SharkTrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const snapshot = await buildTrendsCenterSnapshot();
  const rawRows = snapshot.allPromotionRows ?? [];
  const rows = rawRows.filter((item: any) => rowPassesFilters(item, filters));
  const matchups = groupMatchups(snapshot.matchupsByLeague ?? [], filters, 4);
  const actionable = matchups.filter((item: any) => item.lane === "actionable");
  const watch = matchups.filter((item: any) => item.lane === "watch");
  const market = matchups.filter((item: any) => item.lane === "market");
  const researchMatchups = matchups.filter((item: any) => item.lane === "research");
  const blocked = matchups.filter((item: any) => item.lane === "blocked");
  const activeRows = rows.filter((item: any) => Number(item.activeMatches ?? 0) > 0);
  const verifiedRows = rows.filter((item: any) => item.verified);
  const blockedRows = rows.filter((item: any) => item.blockers?.length);

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends</div><h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Matchup command board</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Default path: league → matchup → attached signal stack. Historical systems are still available, but they no longer own the main screen unless tied to a game, team, current price, or movement record.</p></div><div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><a href="#actionable" className="text-cyan-200 hover:text-cyan-100">Actionable</a><a href="#watch" className="text-cyan-200 hover:text-cyan-100">Watch</a><a href="#market" className="text-cyan-200 hover:text-cyan-100">Market</a><a href="#research" className="text-cyan-200 hover:text-cyan-100">Research</a></div></div>
      </section>

      <FilterPanel filters={filters} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><Metric label="Matchups" value={matchups.length} note="Games with attached filtered signals." kind="watch" /><Metric label="Actionable" value={actionable.length} note="Current matchup plus clean signal stack." kind="good" /><Metric label="Watch" value={watch.length} note="Interesting, but still needs price, proof, or gate cleanup." kind="watch" /><Metric label="Verified systems" value={verifiedRows.length} note="Historical systems inside the current filter set." kind="muted" /><Metric label="Blocked" value={blockedRows.length} note="Rows blocked by proof, activity, price, or gate issues." kind="bad" /></section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-4"><div className="flex flex-wrap items-center gap-2"><Chip kind="good">Actionable {actionable.length}</Chip><Chip kind="watch">Watch {watch.length}</Chip><Chip kind="watch">Market {market.length}</Chip><Chip kind="muted">Research {researchMatchups.length}</Chip><Chip kind="bad">Blocked {blocked.length}</Chip><Chip kind="muted">Active systems {activeRows.length}</Chip></div></section>

      <MatchupLane id="actionable" title="Actionable matchups" description="These get the top screen space: current matchup, attached signal, proof, price context, and clean action gate." items={actionable} />
      <MatchupLane id="watch" title="Watch / needs price" description="Current or near-current setups that still need a cleaner price, stronger proof, or gate confirmation." items={watch} />
      <MatchupLane id="market" title="Market movement attached to games" description="Movement-style signals stay attached to matchup cards instead of floating as a global feed." items={market} />
      <MatchupLane id="research-matchups" title="Current research matchups" description="Matched games with context, but not enough to promote above the fold." items={researchMatchups} collapsed />
      <MatchupLane id="blocked" title="Bench / blocked matchups" description="Provisional, missing proof, missing qualifier, or hard-blocked signals are collapsed by default." items={blocked} collapsed />
      <ResearchDrawer rows={rows} />
    </main>
  );
}
