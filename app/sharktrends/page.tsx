import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TileTone = "good" | "warn" | "bad" | "neutral";

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

function toneClass(tone: TileTone) {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/7";
  if (tone === "warn") return "border-amber-300/25 bg-amber-300/7";
  if (tone === "bad") return "border-red-400/20 bg-red-400/7";
  return "border-white/10 bg-slate-950/60";
}

function Tile({ label, value, note, tone = "neutral" }: { label: string; value: string | number; note: string; tone?: TileTone }) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClass(tone)}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{note}</div>
    </div>
  );
}

function unitsLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value > 0 ? "+" : ""}${value}u`;
}

function pctLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "TBD";
  return `${value}%`;
}

function proofClass(grade: string | null | undefined) {
  const value = String(grade ?? "").toUpperCase();
  if (value === "A") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value === "B") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (value === "C") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return "border-amber-300/25 bg-amber-300/10 text-amber-100";
}

function tierClass(tier: string) {
  if (tier === "promote") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (tier === "watch") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  if (tier === "verified-idle") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function actionClass(actionability: string | null | undefined) {
  const value = String(actionability ?? "").toUpperCase();
  if (value.includes("ACTIVE")) return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  if (value.includes("WATCH")) return "border-sky-400/25 bg-sky-400/10 text-sky-200";
  return "border-slate-500/25 bg-slate-800/60 text-slate-300";
}

function laneClass(tier: string) {
  if (tier === "promote") return "border-emerald-400/20 bg-emerald-400/[0.05]";
  if (tier === "watch") return "border-sky-400/20 bg-sky-400/[0.05]";
  if (tier === "verified-idle") return "border-cyan-400/20 bg-cyan-400/[0.05]";
  return "border-white/10 bg-slate-950/50";
}

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = item || "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function distributionText(record: Record<string, number> | undefined, limit = 6) {
  const entries = Object.entries(record ?? {}).sort((left, right) => right[1] - left[1]).slice(0, limit);
  return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(" · ") : "none";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "time TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function priceLabel(price: number | null | undefined) {
  if (typeof price !== "number" || !Number.isFinite(price)) return "price needed";
  return price > 0 ? `+${price}` : String(price);
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

function pageLanes(rows: any[]) {
  return {
    promote: rows.filter((item) => item.tier === "promote"),
    watch: rows.filter((item) => item.tier === "watch"),
    "verified-idle": rows.filter((item) => item.tier === "verified-idle"),
    bench: rows.filter((item) => item.tier === "bench")
  };
}

function filterMatchupGroups(groups: any[], filters: SharkTrendsFilters, trendLimit: number) {
  return groups
    .filter((group) => filters.league === "ALL" || String(group.league ?? "").toUpperCase() === filters.league)
    .map((group) => {
      const matchups = (group.matchups ?? [])
        .map((matchup: any) => {
          const allTrends = (matchup.allTrends ?? matchup.trends ?? []).filter((trend: any) => trendPassesFilters(trend, group.league, filters));
          if (!allTrends.length) return null;
          const topScore = allTrends[0]?.score ?? 0;
          const verifiedTrends = allTrends.filter((trend: any) => trend.verified).length;
          const activeTrends = allTrends.filter((trend: any) => String(trend.actionability ?? "").toUpperCase().includes("ACTIVE")).length;
          const blockedTrends = allTrends.filter((trend: any) => trend.blockers?.length).length;
          const bestRoiPct = allTrends.reduce((max: number, trend: any) => Math.max(max, trend.proof?.roiPct ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
          const bestProfitUnits = allTrends.reduce((max: number, trend: any) => Math.max(max, trend.proof?.profitUnits ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
          return {
            ...matchup,
            trendCount: allTrends.length,
            visibleTrendCount: Math.min(trendLimit, allTrends.length),
            hiddenTrendCount: Math.max(0, allTrends.length - trendLimit),
            verifiedTrends,
            activeTrends,
            blockedTrends,
            topScore,
            bestRoiPct: Number.isFinite(bestRoiPct) ? bestRoiPct : null,
            bestProfitUnits: Number.isFinite(bestProfitUnits) ? bestProfitUnits : null,
            trends: allTrends.slice(0, trendLimit),
            allTrends
          };
        })
        .filter(Boolean);
      return {
        ...group,
        matchupCount: matchups.length,
        trendCount: matchups.reduce((sum: number, item: any) => sum + item.trendCount, 0),
        activeTrendCount: matchups.reduce((sum: number, item: any) => sum + item.activeTrends, 0),
        verifiedTrendCount: matchups.reduce((sum: number, item: any) => sum + item.verifiedTrends, 0),
        matchups
      };
    })
    .filter((group) => group.matchups.length > 0);
}

function FilterPanel({ filters }: { filters: SharkTrendsFilters }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Filters</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Narrow SharkTrends by league, market, proof grade, ROI floor, live-active status, and verification.</div>
        </div>
        <a href="/sharktrends" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">Reset</a>
      </div>
      <form method="get" className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">League</span>
          <select name="league" defaultValue={filters.league} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            {[
              "ALL", "NBA", "MLB", "NFL", "NHL", "NCAAB", "NCAAF", "UFC", "BOXING"
            ].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Market</span>
          <select name="market" defaultValue={filters.market} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="ALL">ALL</option>
            <option value="moneyline">Moneyline</option>
            <option value="total">Total</option>
            <option value="spread">Spread</option>
            <option value="player_prop">Player prop</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Proof grade</span>
          <select name="grade" defaultValue={filters.grade} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="ALL">ALL</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="PROVISIONAL">PROVISIONAL</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">ROI floor</span>
          <select name="roiFloor" defaultValue={filters.roiFloor === null ? "" : String(filters.roiFloor)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            <option value="">Any</option>
            <option value="0">0%+</option>
            <option value="5">5%+</option>
            <option value="10">10%+</option>
            <option value="15">15%+</option>
            <option value="20">20%+</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300">
          <input type="checkbox" name="active" value="1" defaultChecked={filters.activeOnly} className="h-4 w-4 accent-cyan-300" />
          Active only
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-300">
          <input type="checkbox" name="verified" value="1" defaultChecked={filters.verifiedOnly} className="h-4 w-4 accent-cyan-300" />
          Verified only
        </label>
        <div className="md:col-span-3 xl:col-span-6 flex flex-wrap gap-2">
          <button type="submit" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-300/15">Apply filters</button>
          <a href="/sharktrends?active=1&verified=1" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Active verified</a>
          <a href="/sharktrends?roiFloor=10" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">ROI 10%+</a>
          <a href="/sharktrends?grade=A" className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 hover:border-cyan-300/25">Grade A</a>
        </div>
      </form>
    </section>
  );
}

function LaneCard({ item }: { item: any }) {
  return (
    <a href={item.href} className="block rounded-xl border border-white/10 bg-black/25 p-3 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold text-white">#{item.rank} {item.name}</div>
        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${tierClass(item.tier)}`}>{item.score}</div>
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</div>
      {item.proof ? <div className="mt-2 text-[11px] leading-5 text-cyan-100/75">{item.proof.summary}</div> : null}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{item.primaryAction}</span>
        {item.blockers?.length ? item.blockers.map((blocker: string) => <span key={blocker}>· {blocker}</span>) : <span>· clear</span>}
      </div>
    </a>
  );
}

function PlacementLane({ title, description, tier, items }: { title: string; description: string; tier: string; items: any[] }) {
  const hidden = Math.max(0, items.length - 4);
  return (
    <div className={`rounded-[1.25rem] border p-4 ${laneClass(tier)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
        </div>
        <div className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tierClass(tier)}`}>{items.length}</div>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.slice(0, 4).map((item) => <LaneCard key={item.id} item={item} />) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No systems in this lane.</div>}
      </div>
      {hidden ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">+{hidden} more in filtered inventory</div> : null}
    </div>
  );
}

function CuratedRail({ title, description, items }: { title: string; description: string; items: any[] }) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{title}</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{items.length}</div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {items.length ? items.slice(0, 6).map((item) => (
          <a key={`${title}-${item.id}`} href={item.href} className="rounded-2xl border border-white/10 bg-black/25 p-4 hover:border-cyan-300/30">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{item.league} · {item.market} · {item.category}</div>
              </div>
              <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${proofClass(item.proof?.grade)}`}>Grade {item.proof?.grade ?? "P"}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
              <span>{item.proof?.record ?? "Record TBD"}</span>
              <span>{unitsLabel(item.proof?.profitUnits)}</span>
              <span>{pctLabel(item.proof?.roiPct)} ROI</span>
              <span>{pctLabel(item.proof?.winRatePct)} hit</span>
            </div>
            <div className="mt-3 text-xs leading-5 text-slate-400">{item.proof?.description ?? item.reason}</div>
          </a>
        )) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No systems match this rail under the current filters.</div>}
      </div>
    </section>
  );
}

function MatchupTrendTile({ trend }: { trend: any }) {
  return (
    <a href={trend.href} className="rounded-xl border border-white/10 bg-black/25 p-3 hover:border-cyan-300/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold text-white">{trend.name}</div>
        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${actionClass(trend.actionability)}`}>{trend.actionability}</div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4">
        <span>{trend.market}</span>
        <span>{trend.side}</span>
        <span>{priceLabel(trend.price)}</span>
        <span>{trend.edgePct == null ? "edge TBD" : `${trend.edgePct}% edge`}</span>
      </div>
      {trend.proof ? <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-cyan-100/75 sm:grid-cols-4">
        <span>{trend.proof.record}</span>
        <span>{unitsLabel(trend.proof.profitUnits)}</span>
        <span>{pctLabel(trend.proof.roiPct)} ROI</span>
        <span>Grade {trend.proof.grade}</span>
      </div> : null}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] uppercase tracking-[0.12em] text-slate-500">
        <span>{trend.verified ? "verified" : "provisional"}</span>
        <span>score {trend.score}</span>
        <span>{trend.primaryAction}</span>
      </div>
    </a>
  );
}

function MatchupTile({ matchup }: { matchup: any }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href={matchup.href} className="text-base font-semibold text-white hover:text-cyan-100">{matchup.eventLabel}</a>
          <div className="mt-1 text-xs leading-5 text-slate-500">{formatTime(matchup.startTime)} · {matchup.status}</div>
          <div className="mt-1 text-xs leading-5 text-cyan-100/70">Best ROI {pctLabel(matchup.bestRoiPct)} · Best profit {unitsLabel(matchup.bestProfitUnits)}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">{matchup.trendCount} trends</span>
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{matchup.activeTrends} active</span>
          <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">{matchup.verifiedTrends} verified</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {matchup.trends?.length ? matchup.trends.map((trend: any) => <MatchupTrendTile key={trend.id} trend={trend} />) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No visible trends for this matchup.</div>}
      </div>
      {matchup.hiddenTrendCount ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-slate-500">+{matchup.hiddenTrendCount} more trends in matchup detail</div> : null}
    </div>
  );
}

function LeagueMatchupSection({ group }: { group: any }) {
  return (
    <section className="rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.035] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">{group.league}</div>
          <h2 className="mt-1 text-xl font-semibold text-white">{group.matchupCount} matchup{group.matchupCount === 1 ? "" : "s"}</h2>
          <div className="mt-1 text-xs leading-5 text-slate-400">{group.trendCount} filtered trend links · {group.activeTrendCount} active · {group.verifiedTrendCount} verified</div>
        </div>
        <a href={`/trends?league=${encodeURIComponent(group.league)}&mode=power`} className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">League trends</a>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {group.matchups?.map((matchup: any) => <MatchupTile key={matchup.id} matchup={matchup} />)}
      </div>
    </section>
  );
}

export default async function SharkTrendsPage({ searchParams }: PageProps) {
  const resolved = (await searchParams) ?? {};
  const filters = buildFilters(resolved);
  const snapshot = await buildTrendsCenterSnapshot();
  const trendLimit = snapshot.thresholds?.matchupTrendLimit ?? 6;
  const boardLimit = snapshot.thresholds?.promotionBoardLimit ?? 12;
  const rawRows = snapshot.allPromotionRows ?? [];
  const allRows = rawRows.filter((item: any) => rowPassesFilters(item, filters));
  const board = allRows.slice(0, boardLimit);
  const lanes = pageLanes(allRows);
  const queue = snapshot.commandQueue ?? [];
  const activeSystems = (snapshot.activeSystems ?? []).filter((item: any) => rowPassesFilters(item, filters));
  const matchupGroups = filterMatchupGroups(snapshot.matchupsByLeague ?? [], filters, trendLimit);
  const counts = snapshot.counts;
  const coverage = snapshot.coverage;
  const hiddenBoardRows = Math.max(0, allRows.length - board.length);
  const filteredMatchups = matchupGroups.reduce((sum: number, group: any) => sum + group.matchupCount, 0);
  const filteredTrendLinks = matchupGroups.reduce((sum: number, group: any) => sum + group.trendCount, 0);
  const filteredActiveRows = allRows.filter((item: any) => Number(item.activeMatches ?? 0) > 0).length;
  const filteredVerifiedRows = allRows.filter((item: any) => item.verified).length;
  const filteredBlockedRows = allRows.filter((item: any) => item.blockers?.length).length;
  const mostProfitable = [...allRows].sort((left: any, right: any) => (right.proof?.profitUnits ?? 0) - (left.proof?.profitUnits ?? 0));
  const undefeated = allRows.filter((item: any) => (item.proof?.losses ?? 1) === 0 || String(item.proof?.currentStreak ?? "").toUpperCase().startsWith("W")).sort((left: any, right: any) => (right.proof?.winRatePct ?? 0) - (left.proof?.winRatePct ?? 0));
  const hotTeam = allRows.filter((item: any) => String(item.category ?? "").toLowerCase().includes("hot") || (item.proof?.last30WinRatePct ?? 0) >= 60).sort((left: any, right: any) => (right.proof?.last30WinRatePct ?? 0) - (left.proof?.last30WinRatePct ?? 0));
  const verified = allRows.filter((item: any) => item.verified).sort((left: any, right: any) => String(left.proof?.grade ?? "Z").localeCompare(String(right.proof?.grade ?? "Z")) || (right.proof?.sampleSize ?? 0) - (left.proof?.sampleSize ?? 0));
  const filteredDistribution = {
    byMatchupLeague: Object.fromEntries(matchupGroups.map((group: any) => [group.league, group.matchupCount])),
    byProofGrade: countBy(allRows.map((item: any) => String(item.proof?.grade ?? "UNKNOWN"))),
    byBlocker: countBy(allRows.flatMap((item: any) => item.blockers ?? [])),
    byPrimaryAction: countBy(allRows.map((item: any) => String(item.primaryAction ?? "UNKNOWN"))),
    byPromotionTier: countBy(allRows.map((item: any) => String(item.tier ?? "UNKNOWN")))
  };

  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[1.75rem] border border-cyan-300/15 bg-slate-950/70 p-5 shadow-[0_0_60px_rgba(14,165,233,0.10)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">SharkTrends</div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white md:text-4xl">Matchup trend board</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              The main browse path is league → matchup tiles → trend links. Filters now narrow the rails, matchups, placement lanes, and global top rail by proof and market quality.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.14em]">
            <a href="/trends" className="text-cyan-200 hover:text-cyan-100">Trends</a>
            <a href="/api/trends/sharktrends" className="text-cyan-200 hover:text-cyan-100">JSON</a>
            <a href="/api/trends/systems/cycle?inactive=true&limit=500" className="text-cyan-200 hover:text-cyan-100">Run cycle</a>
            <a href="/api/trends/historical-audit" className="text-cyan-200 hover:text-cyan-100">Historical audit</a>
          </div>
        </div>
      </section>

      <FilterPanel filters={filters} />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Tile label="Filtered systems" value={`${allRows.length}/${counts.allPromotionRows ?? counts.publishedTotal}`} tone={allRows.length ? "good" : "warn"} note={`Global board shows top ${board.length}. Reset filters to view all systems.`} />
        <Tile label="Matchups" value={filteredMatchups} tone={filteredMatchups ? "good" : "warn"} note={`${matchupGroups.length} league groups · ${filteredTrendLinks} attached trend links after filters.`} />
        <Tile label="Active published" value={`${filteredActiveRows}/${allRows.length}`} tone={filteredActiveRows ? "good" : "warn"} note={`Filtered active systems. Full active coverage is ${coverage.publishedActivePct}%.`} />
        <Tile label="Promotion ready" value={`${lanes.promote.length}/${allRows.length}`} tone={lanes.promote.length ? "good" : lanes.watch.length ? "warn" : "neutral"} note={`${lanes.watch.length} watchlist · ${lanes.bench.length + lanes["verified-idle"].length} bench/idle after filters.`} />
        <Tile label="Verified" value={`${filteredVerifiedRows}/${allRows.length}`} tone={filteredVerifiedRows ? "good" : "warn"} note="Verified systems inside the current filter set." />
        <Tile label="Blocked" value={filteredBlockedRows} tone={filteredBlockedRows ? "warn" : "good"} note="Filtered systems blocked by proof, activity, ROI, or action-gate issues." />
      </section>

      <section className="grid gap-4">
        <CuratedRail title="Most profitable systems" description="Sorted by historical profit units with ROI and hit-rate proof shown on every card." items={mostProfitable} />
        <CuratedRail title="Undefeated / hot streak trends" description="Undefeated systems and current winning streaks with proof grade and record visible." items={undefeated} />
        <CuratedRail title="Hot team trends" description="Systems with strong last-30 performance or hot-team classification." items={hotTeam} />
        <CuratedRail title="Verified systems" description="Verified systems sorted by proof grade and sample size." items={verified} />
      </section>

      {matchupGroups.length ? (
        <section className="grid gap-4">
          {matchupGroups.map((group: any) => <LeagueMatchupSection key={group.league} group={group} />)}
        </section>
      ) : (
        <section className="rounded-[1.5rem] border border-amber-300/20 bg-amber-300/7 p-4 text-sm text-amber-100">
          No matchup trend tiles match the current filters. Loosen league, market, grade, ROI, active-only, or verified-only filters.
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-4">
        <PlacementLane title="Promote" tier="promote" description="Verified systems with live qualifiers. These deserve the top rail." items={lanes.promote ?? []} />
        <PlacementLane title="Watch" tier="watch" description="Live qualifiers without enough proof. Keep visible but not premium." items={lanes.watch ?? []} />
        <PlacementLane title="Verified idle" tier="verified-idle" description="Verified but no current qualifier. Keep ready for the next slate." items={lanes["verified-idle"] ?? []} />
        <PlacementLane title="Bench" tier="bench" description="No live qualifier and/or proof/action blockers. Do not promote." items={lanes.bench ?? []} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Global top rail</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Top {board.length} of {allRows.length} filtered systems</h2>
              <div className="mt-1 text-xs leading-5 text-slate-500">Display limit {boardLimit}. Filters apply before ranking.</div>
            </div>
            <a href="/api/trends/sharktrends" className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200 hover:text-cyan-100">Inspect JSON</a>
          </div>

          <div className="mt-4 grid gap-3">
            {board.length ? board.map((item: any) => (
              <a key={item.id} href={item.href} className="rounded-2xl border border-white/10 bg-black/25 p-4 hover:border-cyan-300/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">#{item.rank} {item.name}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</div>
                    {item.proof ? <div className="mt-1 text-xs leading-5 text-cyan-100/75">{item.proof.summary}</div> : null}
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tierClass(item.tier)}`}>
                    {item.tier} · {item.score}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  <span>{item.league}</span>
                  <span>{item.market}</span>
                  <span>{item.category}</span>
                  <span>{item.activeMatches} live</span>
                  <span>{item.verified ? "verified" : "provisional"}</span>
                  <span>{item.primaryAction}</span>
                  {item.blockers?.map((blocker: string) => <span key={blocker}>{blocker}</span>)}
                </div>
              </a>
            )) : (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/7 p-4 text-sm text-amber-100">
                No systems match the current filter set.
              </div>
            )}
            {hiddenBoardRows ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] p-3 text-xs leading-5 text-cyan-100/80">{hiddenBoardRows} lower-ranked filtered systems are omitted from the display board but still counted in lanes and distributions.</div> : null}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Command queue</div>
            <div className="mt-3 grid gap-2">
              {queue.length ? queue.map((item: any) => (
                <a key={`${item.reason}-${item.id}`} href={item.href} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 hover:border-amber-200/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{item.name}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">{item.reason}</div>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{item.note}</div>
                </a>
              )) : (
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3 text-xs leading-5 text-emerald-100/80">
                  No command blockers. Use matchup tiles, proof grade, ROI, and live signal quality for placement.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Filtered distribution</div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Matchups</span><span className="ml-2">{distributionText(filteredDistribution.byMatchupLeague)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Proof</span><span className="ml-2">{distributionText(filteredDistribution.byProofGrade)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Blockers</span><span className="ml-2">{distributionText(filteredDistribution.byBlocker)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Actions</span><span className="ml-2">{distributionText(filteredDistribution.byPrimaryAction)}</span></div>
              <div><span className="font-semibold uppercase tracking-[0.14em] text-slate-300">Tiers</span><span className="ml-2">{distributionText(filteredDistribution.byPromotionTier)}</span></div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Active systems</div>
            <div className="mt-3 grid gap-2">
              {activeSystems.length ? activeSystems.map((item: any) => (
                <a key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs hover:border-cyan-300/25">
                  <span className="min-w-0 truncate text-slate-200">{item.name}</span>
                  <span className="shrink-0 text-slate-500">{item.league} · {item.market} · {item.activeMatches} live</span>
                </a>
              )) : <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-500">No active published systems match the current filters.</div>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-4 text-xs leading-5 text-slate-400">
        <span className="font-semibold uppercase tracking-[0.16em] text-cyan-300">Next action:</span> {snapshot.nextAction}
      </section>
    </main>
  );
}
