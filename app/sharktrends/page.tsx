import Link from "next/link";
import {
  getMlbLeagueTrends,
  getMlbTodayActivations,
  getMlbTeamProfile,
  getMlbTeamNames,
  getMlbTrendBrowserSummary,
  type MlbTrendRecord,
  type MlbTodayGame,
  type MlbTeamProfile,
} from "@/services/mlb/mlb-trend-browser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

type SortKey = "roi" | "winPct" | "wins" | "total" | "streak";
type TabKey = "today" | "trends" | "team";
type MarketFilter = "all" | "moneyline" | "spread" | "total";

function one(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtRecord(r: MlbTrendRecord) {
  return `${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ""}`;
}

function fmtWinPct(r: MlbTrendRecord) {
  if (r.wins + r.losses === 0) return "–";
  return `${r.winPct.toFixed(1)}%`;
}

function fmtRoi(r: MlbTrendRecord) {
  if (r.wins + r.losses === 0) return "–";
  const sign = r.roi >= 0 ? "+" : "";
  return `${sign}${r.roi.toFixed(1)}u`;
}

function fmtStreak(r: MlbTrendRecord) {
  if (!r.streak.type || r.streak.count === 0) return "–";
  return `${r.streak.count}${r.streak.type}`;
}

function fmtTime(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

function fmtRefresh(value: string | null) {
  if (!value) return "never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  const diff = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  return `${h}h ${diff % 60}m ago`;
}

// ── Sorting ───────────────────────────────────────────────────────────────────

function sortTrends(trends: MlbTrendRecord[], sort: SortKey): MlbTrendRecord[] {
  const copy = [...trends];
  if (sort === "roi") return copy.sort((a, b) => b.roi - a.roi);
  if (sort === "winPct") return copy.sort((a, b) => b.winPct - a.winPct);
  if (sort === "wins") return copy.sort((a, b) => b.wins - a.wins);
  if (sort === "total") return copy.sort((a, b) => b.total - a.total);
  if (sort === "streak") return copy.sort((a, b) => {
    if (!a.streak.type && !b.streak.type) return 0;
    if (!a.streak.type) return 1;
    if (!b.streak.type) return -1;
    if (a.streak.type !== b.streak.type) return a.streak.type === "W" ? -1 : 1;
    return b.streak.count - a.streak.count;
  });
  return copy;
}

function filterTrends(trends: MlbTrendRecord[], market: MarketFilter, search: string): MlbTrendRecord[] {
  let out = trends;
  if (market !== "all") out = out.filter((t) => t.market === market);
  if (search) {
    const q = search.toLowerCase();
    out = out.filter((t) => t.label.toLowerCase().includes(q) || t.qualifier.toLowerCase().includes(q));
  }
  return out;
}

// ── Row coloring ──────────────────────────────────────────────────────────────

function roiTone(roi: number, decided: number) {
  if (decided < 10) return "text-slate-400";
  if (roi >= 5) return "text-emerald-300 font-semibold";
  if (roi >= 2) return "text-emerald-400";
  if (roi <= -5) return "text-red-400";
  if (roi <= -2) return "text-red-400/70";
  return "text-slate-300";
}

function winPctTone(pct: number, decided: number) {
  if (decided < 10) return "text-slate-400";
  if (pct >= 58) return "text-emerald-300 font-semibold";
  if (pct >= 54) return "text-emerald-400";
  if (pct <= 44) return "text-red-400";
  return "text-slate-300";
}

function streakTone(streak: MlbTrendRecord["streak"]) {
  if (!streak.type) return "text-slate-500";
  if (streak.type === "W" && streak.count >= 4) return "text-emerald-300 font-semibold";
  if (streak.type === "W") return "text-emerald-400";
  if (streak.type === "L" && streak.count >= 4) return "text-red-400";
  return "text-red-400/70";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TrendRow({ r, rank }: { r: MlbTrendRecord; rank: number }) {
  const decided = r.wins + r.losses;
  return (
    <tr className="group border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors">
      <td className="py-3 pl-4 pr-2 text-[11px] text-slate-500 tabular-nums">{rank}</td>
      <td className="py-3 pr-4">
        <div className="text-sm text-white leading-5">{r.label}</div>
        <div className="mt-0.5 text-[10px] text-slate-500 tracking-wide">{r.market.toUpperCase()} · {r.homeAway}</div>
      </td>
      <td className="py-3 pr-6 tabular-nums text-sm text-slate-200 font-mono">{fmtRecord(r)}</td>
      <td className={`py-3 pr-6 tabular-nums text-sm font-mono ${winPctTone(r.winPct, decided)}`}>{fmtWinPct(r)}</td>
      <td className={`py-3 pr-6 tabular-nums text-sm font-mono ${roiTone(r.roi, decided)}`}>{fmtRoi(r)}</td>
      <td className={`py-3 pr-6 tabular-nums text-sm font-mono ${streakTone(r.streak)}`}>{fmtStreak(r)}</td>
      <td className="py-3 pr-4 tabular-nums text-xs text-slate-500">{r.total}</td>
    </tr>
  );
}

function SortHeader({ label, sortKey, current, base }: { label: string; sortKey: SortKey; current: SortKey; base: string }) {
  const active = current === sortKey;
  return (
    <th className="py-3 pr-6 text-left">
      <Link
        href={`${base}&sort=${sortKey}`}
        className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${active ? "text-sky-300" : "text-slate-500 hover:text-slate-300"}`}
      >
        {label}{active ? " ↓" : ""}
      </Link>
    </th>
  );
}

function TrendTable({ trends, sort, tab, market, team }: { trends: MlbTrendRecord[]; sort: SortKey; tab: TabKey; market: MarketFilter; team: string }) {
  const base = `?tab=${tab}&market=${market}&team=${encodeURIComponent(team)}&sort=`;
  if (!trends.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-6 py-12 text-center">
        <div className="text-sm text-slate-400">No trends found — run the MLB warehouse refresh to populate records.</div>
        <a href="/api/internal/mlb/warehouse/refresh" className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.16em] text-sky-300 hover:text-sky-200">Trigger refresh →</a>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/40">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-white/10 bg-white/[0.02]">
          <tr>
            <th className="py-3 pl-4 pr-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">#</th>
            <th className="py-3 pr-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Trend</th>
            <SortHeader label="W-L" sortKey="wins" current={sort} base={base} />
            <SortHeader label="Win%" sortKey="winPct" current={sort} base={base} />
            <SortHeader label="ROI" sortKey="roi" current={sort} base={base} />
            <SortHeader label="Streak" sortKey="streak" current={sort} base={base} />
            <SortHeader label="N" sortKey="total" current={sort} base={base} />
          </tr>
        </thead>
        <tbody>
          {trends.map((r, i) => <TrendRow key={r.trendKey} r={r} rank={i + 1} />)}
        </tbody>
      </table>
    </div>
  );
}

function GameActivationCard({ game }: { game: MlbTodayGame }) {
  const hasData = game.homeTeamTrends.length > 0 || game.awayTeamTrends.length > 0;
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 overflow-hidden">
      {/* Game header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-white">{game.awayTeam} <span className="text-slate-400">@</span> {game.homeTeam}</div>
          {game.gameTime && <div className="mt-0.5 text-[10px] text-slate-500">{fmtTime(game.gameTime)}</div>}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{game.status}</div>
      </div>

      {!hasData && (
        <div className="px-4 py-6 text-center text-xs text-slate-500">No historical trend data for these teams yet.</div>
      )}

      {hasData && (
        <div className="grid grid-cols-1 divide-y divide-white/[0.04] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {/* Away team */}
          <div className="p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{game.awayTeam} (Away)</div>
            {game.awayTeamTrends.length === 0 && <div className="text-xs text-slate-600">No records</div>}
            {game.awayTeamTrends.map((t) => (
              <TrendMiniRow key={t.trendKey} r={t} />
            ))}
          </div>
          {/* Home team */}
          <div className="p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{game.homeTeam} (Home)</div>
            {game.homeTeamTrends.length === 0 && <div className="text-xs text-slate-600">No records</div>}
            {game.homeTeamTrends.map((t) => (
              <TrendMiniRow key={t.trendKey} r={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendMiniRow({ r }: { r: MlbTrendRecord }) {
  const decided = r.wins + r.losses;
  const good = r.winPct >= 54 && decided >= 10;
  const bad = r.winPct <= 44 && decided >= 10;
  const tone = good ? "text-emerald-300" : bad ? "text-red-400" : "text-slate-300";
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0">
        <div className="truncate text-xs text-slate-200 leading-4">{r.qualifier === "base" ? r.homeAway + " " + r.market : r.label}</div>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <span className={`font-mono text-xs tabular-nums ${tone}`}>{fmtRecord(r)}</span>
        <span className={`font-mono text-[10px] tabular-nums ${tone}`}>{fmtWinPct(r)}</span>
      </div>
    </div>
  );
}

function TeamProfileView({ profile, teamNames }: { profile: MlbTeamProfile | null; teamNames: string[] }) {
  if (!profile) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-6 py-12 text-center">
        <div className="text-sm text-slate-400 mb-4">Search for a team to see their situational betting records.</div>
        <div className="flex flex-wrap justify-center gap-2">
          {teamNames.slice(0, 20).map((name) => (
            <Link key={name} href={`?tab=team&team=${encodeURIComponent(name)}`} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 hover:border-sky-300/30 hover:text-sky-200 transition-colors">
              {name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const allTrends = [...profile.home, ...profile.away];
  const topTrends = [...allTrends].sort((a, b) => b.roi - a.roi).slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{profile.teamName}</div>
          <div className="text-xs text-slate-500">{allTrends.length} situational records · {profile.home.length} home · {profile.away.length} away</div>
        </div>
        <Link href="?tab=team" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 hover:text-slate-200">← Back</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Home records</div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 overflow-hidden">
            {profile.home.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-600">No home records</div>}
            <table className="w-full border-collapse">
              <tbody>
                {profile.home.slice(0, 12).map((r, i) => <TrendRow key={r.trendKey} r={r} rank={i + 1} />)}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Away records</div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 overflow-hidden">
            {profile.away.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-600">No away records</div>}
            <table className="w-full border-collapse">
              <tbody>
                {profile.away.slice(0, 12).map((r, i) => <TrendRow key={r.trendKey} r={r} rank={i + 1} />)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {topTrends.length > 0 && (
        <div>
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Top trends by ROI</div>
          <TrendTable trends={topTrends} sort="roi" tab="team" market="all" team={profile.teamName} />
        </div>
      )}
    </div>
  );
}

function TabLink({ label, tabKey, current, team, market, sort }: { label: string; tabKey: TabKey; current: TabKey; team: string; market: MarketFilter; sort: SortKey }) {
  const active = tabKey === current;
  return (
    <Link
      href={`?tab=${tabKey}&team=${encodeURIComponent(team)}&market=${market}&sort=${sort}`}
      className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors ${active ? "bg-sky-400/15 text-sky-200 border border-sky-300/25" : "text-slate-400 hover:text-slate-200 border border-transparent"}`}
    >
      {label}
    </Link>
  );
}

function MarketTabLink({ label, marketKey, current, tab, team, sort }: { label: string; marketKey: MarketFilter; current: MarketFilter; tab: TabKey; team: string; sort: SortKey }) {
  const active = marketKey === current;
  return (
    <Link
      href={`?tab=${tab}&market=${marketKey}&team=${encodeURIComponent(team)}&sort=${sort}`}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${active ? "bg-white/10 text-white border border-white/20" : "text-slate-500 hover:text-slate-300 border border-transparent"}`}
    >
      {label}
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SharkTrendsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  const tab = (one(params.tab) ?? "today") as TabKey;
  const sort = (one(params.sort) ?? "roi") as SortKey;
  const market = (one(params.market) ?? "all") as MarketFilter;
  const team = one(params.team)?.trim() ?? "";

  // Parallel data fetch based on active tab
  const [summary, trends, todayGames, teamProfile, teamNames] = await Promise.all([
    getMlbTrendBrowserSummary().catch(() => ({ totalRows: 0, finalRows: 0, teamCount: 0, lastUpdated: null })),
    tab === "trends" || tab === "today" ? getMlbLeagueTrends(15).catch(() => [] as MlbTrendRecord[]) : Promise.resolve([] as MlbTrendRecord[]),
    tab === "today" ? getMlbTodayActivations().catch(() => [] as MlbTodayGame[]) : Promise.resolve([] as MlbTodayGame[]),
    tab === "team" && team ? getMlbTeamProfile(team).catch(() => null as MlbTeamProfile | null) : Promise.resolve(null as MlbTeamProfile | null),
    tab === "team" ? getMlbTeamNames().catch(() => [] as string[]) : Promise.resolve([] as string[]),
  ]);

  const displayTrends = sortTrends(filterTrends(trends, market, ""), sort);
  const hasData = summary.finalRows > 0;

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-8">

        {/* Header */}
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-400">SharkEdge</div>
            <h1 className="mt-1 font-display text-3xl font-bold text-white tracking-tight">SharkTrends</h1>
            <p className="mt-2 text-sm text-slate-400">MLB situational betting records — sortable, team-level, and updated daily.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{summary.finalRows.toLocaleString()} graded records</span>
            <span>·</span>
            <span>{summary.teamCount} teams</span>
            <span>·</span>
            <span>updated {fmtRefresh(summary.lastUpdated)}</span>
            {!hasData && (
              <a href="/sharktrends/mlb-warehouse" className="rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-amber-200 hover:bg-amber-400/15">Run warehouse refresh →</a>
            )}
          </div>
        </div>

        {/* Tab nav */}
        <div className="mb-6 flex items-center gap-2">
          <TabLink label="Today's Games" tabKey="today" current={tab} team={team} market={market} sort={sort} />
          <TabLink label="All MLB Trends" tabKey="trends" current={tab} team={team} market={market} sort={sort} />
          <TabLink label="Team Lookup" tabKey="team" current={tab} team={team} market={market} sort={sort} />
        </div>

        {/* ── TODAY TAB ── */}
        {tab === "today" && (
          <div className="space-y-4">
            {todayGames.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-6 py-12 text-center">
                <div className="text-sm text-slate-400">No MLB games scheduled today, or schedule data not yet loaded.</div>
              </div>
            )}
            {todayGames.map((game) => <GameActivationCard key={game.gamePk} game={game} />)}

            {/* League-wide context strip */}
            {trends.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Top league-wide trends right now</div>
                <TrendTable trends={displayTrends.slice(0, 10)} sort={sort} tab={tab} market={market} team={team} />
              </div>
            )}
          </div>
        )}

        {/* ── TRENDS TAB ── */}
        {tab === "trends" && (
          <div className="space-y-4">
            {/* Market filter */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Market:</span>
              <MarketTabLink label="All" marketKey="all" current={market} tab={tab} team={team} sort={sort} />
              <MarketTabLink label="Moneyline" marketKey="moneyline" current={market} tab={tab} team={team} sort={sort} />
              <MarketTabLink label="Spread" marketKey="spread" current={market} tab={tab} team={team} sort={sort} />
              <MarketTabLink label="O/U" marketKey="total" current={market} tab={tab} team={team} sort={sort} />
              <span className="ml-auto text-[10px] text-slate-500">{displayTrends.length} trends</span>
            </div>

            <TrendTable trends={displayTrends} sort={sort} tab={tab} market={market} team={team} />

            <div className="rounded-2xl border border-white/[0.06] bg-slate-950/40 px-4 py-3 text-xs leading-5 text-slate-500">
              Win% and ROI calculated on settled (win/loss) games only. Records require ≥15 settled games. ROI uses +100 flat unit sizing.
              Trends with 54%+ win rate and +2.0 ROI across 30+ games are historically significant.
            </div>
          </div>
        )}

        {/* ── TEAM TAB ── */}
        {tab === "team" && (
          <div className="space-y-4">
            {/* Search form */}
            <form method="GET" action="/sharktrends" className="flex gap-2">
              <input type="hidden" name="tab" value="team" />
              <input
                name="team"
                type="text"
                defaultValue={team}
                placeholder="Search team name (e.g. Yankees, Dodgers...)"
                className="flex-1 rounded-xl border border-white/15 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-400/40 focus:outline-none"
              />
              <button type="submit" className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-5 py-2.5 text-sm font-semibold text-sky-200 hover:bg-sky-400/20 transition-colors">
                Search
              </button>
            </form>

            <TeamProfileView profile={teamProfile} teamNames={teamNames} />
          </div>
        )}

        {/* Footer nav */}
        <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-white/[0.06] pt-6 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Link href="/sharktrends/mlb-warehouse" className="hover:text-slate-300">MLB Warehouse</Link>
          <Link href="/sharktrends/mlb-spine" className="hover:text-slate-300">MLB Spine</Link>
          <Link href="/api/trends/mlb/browser" className="hover:text-slate-300">Browser API</Link>
          <Link href="/api/trends/mlb/today" className="hover:text-slate-300">Today API</Link>
          <Link href="/sharktrends/market-intelligence" className="hover:text-slate-300">Market Intel</Link>
          <Link href="/trends" className="hover:text-slate-300">Internal Ops</Link>
        </div>
      </div>
    </div>
  );
}
