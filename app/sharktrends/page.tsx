import Link from "next/link";

import { SimDecisionBadge } from "@/components/sim/sim-ui";
import { cn } from "@/lib/utils/cn";
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
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimPriorityRow,
  type SimPrioritySnapshot,
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
type SortKey = "roi" | "winPct" | "wins" | "total" | "streak";
type TabKey = "today" | "trends" | "team";
type MarketFilter = "all" | "moneyline" | "spread" | "total";

function one(v: string | string[] | undefined) { return Array.isArray(v) ? v[0] : v; }

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtRecord(r: MlbTrendRecord) {
  return `${r.wins}-${r.losses}${r.pushes ? `-${r.pushes}` : ""}`;
}
function fmtWinPct(r: MlbTrendRecord) {
  if (r.wins + r.losses === 0) return "–";
  return `${r.winPct.toFixed(1)}%`;
}
function fmtRoi(r: MlbTrendRecord) {
  if (r.wins + r.losses === 0) return "–";
  return `${r.roi >= 0 ? "+" : ""}${r.roi.toFixed(1)}u`;
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
function fmtAge(value: string | null) {
  if (!value) return "never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  const diff = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  return `${h}h ${diff % 60}m ago`;
}
function fmtPct(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "--";
  return `${(v * 100).toFixed(1)}%`;
}

// ─── Sorting / filtering ──────────────────────────────────────────────────────

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

function filterTrends(trends: MlbTrendRecord[], market: MarketFilter): MlbTrendRecord[] {
  if (market === "all") return trends;
  return trends.filter((t) => t.market === market);
}

// ─── Sim matching ─────────────────────────────────────────────────────────────

function teamToken(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function teamsMatch(a: string, b: string) {
  const na = teamToken(a), nb = teamToken(b);
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

function matchSim(game: MlbTodayGame, rows: SimPriorityRow[]): SimPriorityRow | null {
  return rows.find(
    (r) => r.leagueKey === "MLB" &&
      teamsMatch(r.matchup.home, game.homeTeam) &&
      teamsMatch(r.matchup.away, game.awayTeam)
  ) ?? null;
}

// ─── Edge stack ───────────────────────────────────────────────────────────────

const MIN_SAMPLE = 15;
const STRONG_WIN_PCT = 54;

type EdgeStack = {
  team: string | null;
  direction: "home" | "away" | null;
  count: number;
  topSignals: MlbTrendRecord[];
  conflicted: boolean;
  simConfirmed: boolean;
};

function buildEdgeStack(game: MlbTodayGame, sim: SimPriorityRow | null): EdgeStack {
  const goodHome = game.homeTeamTrends.filter((t) => t.wins + t.losses >= MIN_SAMPLE && t.winPct >= STRONG_WIN_PCT);
  const goodAway = game.awayTeamTrends.filter((t) => t.wins + t.losses >= MIN_SAMPLE && t.winPct >= STRONG_WIN_PCT);
  const trendFavorsHome = goodHome.length > goodAway.length;

  if (!sim) {
    const favHome = goodHome.length >= goodAway.length;
    return {
      team: favHome ? game.homeTeam : game.awayTeam,
      direction: favHome ? "home" : "away",
      count: favHome ? goodHome.length : goodAway.length,
      topSignals: (favHome ? goodHome : goodAway).slice(0, 4),
      conflicted: goodHome.length > 0 && goodAway.length > 0 && Math.abs(goodHome.length - goodAway.length) <= 1,
      simConfirmed: false,
    };
  }

  const simFavorsHome = teamsMatch(sim.lean.team, game.homeTeam);
  const conflicted = simFavorsHome !== trendFavorsHome && goodHome.length >= 1 && goodAway.length >= 1;
  const sigCount = simFavorsHome ? goodHome.length : goodAway.length;
  const topSignals = simFavorsHome ? goodHome.slice(0, 4) : goodAway.slice(0, 4);

  return {
    team: sim.lean.team,
    direction: simFavorsHome ? "home" : "away",
    count: sigCount,
    topSignals,
    conflicted,
    simConfirmed: sigCount >= 1,
  };
}

function gameScore(game: MlbTodayGame, sim: SimPriorityRow | null, stack: EdgeStack): number {
  let score = stack.count * 2;
  if (sim) {
    const tier = sim.tier;
    if (tier === "attack") score += 4;
    else if (tier === "watch") score += 2;
    if ((sim.confidence ?? 0) >= 0.65) score += 1;
    if (stack.simConfirmed) score += 2;
    if (stack.conflicted) score -= 2;
  }
  return score;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function roiColor(roi: number, n: number) {
  if (n < 10) return "text-slate-500";
  if (roi >= 5) return "text-mint font-semibold";
  if (roi >= 2) return "text-mint/80";
  if (roi <= -5) return "text-crimson";
  if (roi <= -2) return "text-crimson/70";
  return "text-slate-300";
}

function winPctColor(pct: number, n: number) {
  if (n < 10) return "text-slate-500";
  if (pct >= 58) return "text-mint font-semibold";
  if (pct >= 54) return "text-mint/80";
  if (pct <= 44) return "text-crimson";
  return "text-slate-300";
}

function streakColor(s: MlbTrendRecord["streak"]) {
  if (!s.type) return "text-slate-600";
  if (s.type === "W" && s.count >= 4) return "text-mint font-semibold";
  if (s.type === "W") return "text-mint/80";
  if (s.type === "L" && s.count >= 4) return "text-crimson";
  return "text-crimson/70";
}

// ─── Stability badge ──────────────────────────────────────────────────────────

const STABILITY: Record<string, { label: string; cls: string }> = {
  stable:     { label: "Stable",      cls: "border-mint/20 bg-mint/[0.08] text-mint/80" },
  solid:      { label: "Solid",       cls: "border-aqua/20 bg-aqua/[0.08] text-aqua/80" },
  noisy:      { label: "Noisy",       cls: "border-amber-400/20 bg-amber-400/[0.08] text-amber-300/80" },
  low_sample: { label: "Low sample",  cls: "border-white/10 bg-white/[0.03] text-slate-500" },
};

// ─── Today's Edge Board ───────────────────────────────────────────────────────

function TrendSignalRow({ r }: { r: MlbTrendRecord }) {
  const n = r.wins + r.losses;
  const strong = n >= MIN_SAMPLE && r.winPct >= STRONG_WIN_PCT;
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0",
    )}>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[11px] leading-4", strong ? "text-white" : "text-slate-400")}>
          {r.qualifier === "base" ? `${r.homeAway} ${r.market}` : r.label}
        </div>
        <div className="mt-0.5 text-[10px] text-slate-600 uppercase tracking-wider">{r.market}</div>
      </div>
      <div className="shrink-0 flex items-center gap-3 tabular-nums">
        <span className="text-[11px] font-mono text-slate-400">{fmtRecord(r)}</span>
        <span className={cn("text-[11px] font-mono font-semibold", winPctColor(r.winPct, n))}>{fmtWinPct(r)}</span>
        <span className={cn("text-[11px] font-mono", roiColor(r.roi, n))}>{fmtRoi(r)}</span>
      </div>
    </div>
  );
}

function EdgeStackBar({ stack }: { stack: EdgeStack }) {
  if (!stack.team) return null;
  const bars = Math.min(stack.count, 5);
  return (
    <div className={cn(
      "rounded-xl border px-4 py-3",
      stack.conflicted
        ? "border-amber-400/20 bg-amber-500/[0.05]"
        : stack.simConfirmed && stack.count >= 2
          ? "border-mint/20 bg-mint/[0.04]"
          : "border-white/[0.08] bg-white/[0.02]"
    )}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {stack.conflicted ? "Signal conflict" : stack.simConfirmed ? "Edge stack" : "Trend lean"}
          </div>
          <div className={cn(
            "mt-1 font-display text-base font-bold leading-none",
            stack.conflicted ? "text-amber-300" : stack.simConfirmed ? "text-mint" : "text-slate-200"
          )}>
            {stack.count > 0 ? `${stack.count} signal${stack.count !== 1 ? "s" : ""} → ` : ""}{stack.team}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={cn(
              "h-2.5 w-2 rounded-sm",
              i < bars
                ? stack.conflicted ? "bg-amber-400/60" : stack.simConfirmed ? "bg-mint/70" : "bg-slate-400/60"
                : "bg-white/[0.06]"
            )} />
          ))}
        </div>
      </div>
      {stack.conflicted && (
        <p className="mt-2 text-[10px] text-amber-300/70">
          Trend history and sim model disagree — proceed with extra caution.
        </p>
      )}
    </div>
  );
}

function GameEdgeCard({ game, sim }: { game: MlbTodayGame; sim: SimPriorityRow | null }) {
  const stack = buildEdgeStack(game, sim);
  const hasAway = game.awayTeamTrends.length > 0;
  const hasHome = game.homeTeamTrends.length > 0;
  const tier = sim?.tier;
  const conf = sim?.confidence;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.09] bg-black/30">
      {/* Game header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.02] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-sm border border-aqua/25 bg-aqua/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-aqua">MLB</span>
            {tier && <SimDecisionBadge tier={tier} />}
            {sim?.status && (
              <span className="inline-flex items-center rounded-sm border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-slate-400">{sim.status}</span>
            )}
          </div>
          <div className="mt-2 font-display text-[17px] font-semibold leading-tight text-white">
            {game.awayTeam} <span className="text-slate-500">@</span> {game.homeTeam}
          </div>
        </div>
        <div className="text-right">
          {game.gameTime && <div className="text-sm font-semibold tabular-nums text-slate-300">{fmtTime(game.gameTime)}</div>}
          {sim && (
            <div className="mt-1 text-[11px] tabular-nums text-slate-500">
              {sim.lean.team} · {fmtPct(sim.lean.pct)} win{conf != null ? ` · ${(conf * 100).toFixed(0)}% conf` : ""}
            </div>
          )}
        </div>
      </div>

      {/* Sim insight strip */}
      {sim && (
        <div className="grid grid-cols-2 gap-px bg-white/[0.04] border-b border-white/[0.08]">
          <div className="bg-black/30 px-5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Model lean</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-semibold text-white">{sim.lean.team}</span>
              <span className="text-[11px] tabular-nums text-slate-400">{fmtPct(sim.lean.pct)}</span>
            </div>
          </div>
          <div className="bg-black/30 px-5 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Model edge vs line</div>
            <div className={cn("mt-1 font-semibold tabular-nums", (sim.lean.edge ?? 0) > 0.015 ? "text-mint" : (sim.lean.edge ?? 0) < -0.015 ? "text-crimson" : "text-slate-400")}>
              {(sim.lean.edge ?? 0) > 0 ? "+" : ""}{((sim.lean.edge ?? 0) * 100).toFixed(1)}%
              {sim.edgeMatched ? <span className="ml-2 text-[10px] text-slate-500">line matched</span> : <span className="ml-2 text-[10px] text-slate-600">no line</span>}
            </div>
          </div>
        </div>
      )}

      {/* Edge stack */}
      {(stack.count > 0 || stack.conflicted) && (
        <div className="px-5 pt-4">
          <EdgeStackBar stack={stack} />
        </div>
      )}

      {/* Trend records */}
      {(hasAway || hasHome) ? (
        <div className="mt-4 grid grid-cols-1 gap-px bg-white/[0.04] border-t border-white/[0.04] sm:grid-cols-2">
          <div className="bg-black/30 px-5 py-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              {game.awayTeam} <span className="text-slate-700">away trends</span>
            </div>
            {!hasAway && <div className="text-[11px] text-slate-700">No records</div>}
            {game.awayTeamTrends.slice(0, 6).map((t) => <TrendSignalRow key={t.trendKey} r={t} />)}
          </div>
          <div className="bg-black/30 px-5 py-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              {game.homeTeam} <span className="text-slate-700">home trends</span>
            </div>
            {!hasHome && <div className="text-[11px] text-slate-700">No records</div>}
            {game.homeTeamTrends.slice(0, 6).map((t) => <TrendSignalRow key={t.trendKey} r={t} />)}
          </div>
        </div>
      ) : (
        <div className="border-t border-white/[0.04] px-5 py-6 text-center">
          <div className="text-[11px] text-slate-600">No historical trend records for these teams yet.</div>
          <div className="mt-1 text-[10px] text-slate-700">Run the MLB warehouse refresh to populate records.</div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.01] px-5 py-3">
        <div className="text-[10px] text-slate-700">
          {game.awayTeamTrends.length + game.homeTeamTrends.length} trend records · {stack.count} strong signal{stack.count !== 1 ? "s" : ""}
        </div>
        {sim && (
          <Link
            href={sim.href}
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-aqua/70 transition-colors hover:text-aqua"
          >
            Full sim analysis →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── League trends table ──────────────────────────────────────────────────────

function SortLink({ label, sortKey, current, base }: { label: string; sortKey: SortKey; current: SortKey; base: string }) {
  const active = current === sortKey;
  return (
    <th className="py-3 pr-6 text-left">
      <Link href={`${base}&sort=${sortKey}`} className={cn(
        "text-[10px] font-semibold uppercase tracking-[0.18em]",
        active ? "text-aqua" : "text-slate-600 hover:text-slate-400"
      )}>
        {label}{active ? " ↓" : ""}
      </Link>
    </th>
  );
}

function TrendRow({ r, rank }: { r: MlbTrendRecord; rank: number }) {
  const n = r.wins + r.losses;
  const badge = STABILITY[r.stability] ?? STABILITY.low_sample;
  const edgeSign = (r.edgeVsBaseline ?? 0) > 0 ? "+" : "";
  const edgeColor = r.edgeVsBaseline == null || r.qualifier === "base" ? "" :
    r.edgeVsBaseline >= 5 ? "text-mint font-semibold" :
    r.edgeVsBaseline >= 2 ? "text-mint/70" :
    r.edgeVsBaseline <= -5 ? "text-crimson" :
    r.edgeVsBaseline <= -2 ? "text-crimson/70" : "text-slate-600";

  return (
    <tr className="group border-b border-white/[0.04] hover:bg-white/[0.018] transition-colors">
      <td className="py-3 pl-5 pr-3 text-[11px] tabular-nums text-slate-600">{rank}</td>
      <td className="py-3 pr-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-white">{r.label}</span>
          <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]", badge.cls)}>{badge.label}</span>
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-600">{r.market} · {r.homeAway}</div>
      </td>
      <td className="py-3 pr-6 font-mono text-[12px] tabular-nums text-slate-300">{fmtRecord(r)}</td>
      <td className={cn("py-3 pr-6 font-mono text-[12px] tabular-nums", winPctColor(r.winPct, n))}>
        {fmtWinPct(r)}
        {r.edgeVsBaseline != null && r.qualifier !== "base" && (
          <span className={cn("ml-1.5 text-[10px]", edgeColor)}>{edgeSign}{r.edgeVsBaseline.toFixed(1)}%</span>
        )}
      </td>
      <td className={cn("py-3 pr-6 font-mono text-[12px] tabular-nums", roiColor(r.roi, n))}>{fmtRoi(r)}</td>
      <td className={cn("py-3 pr-6 font-mono text-[12px] tabular-nums", streakColor(r.streak))}>{fmtStreak(r)}</td>
      <td className="py-3 pr-5 text-[11px] tabular-nums text-slate-600">{r.total}</td>
    </tr>
  );
}

function TrendTable({ trends, sort, tab, market, team }: { trends: MlbTrendRecord[]; sort: SortKey; tab: TabKey; market: MarketFilter; team: string }) {
  const base = `?tab=${tab}&market=${market}&team=${encodeURIComponent(team)}&sort=`;
  if (!trends.length) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-black/20 px-6 py-12 text-center">
        <div className="text-sm text-slate-500">No trends found. Run the MLB warehouse refresh to populate records.</div>
        <a href="/api/internal/mlb/warehouse/refresh" className="mt-3 inline-block text-[11px] font-semibold uppercase tracking-[0.16em] text-aqua/70 hover:text-aqua">Trigger refresh →</a>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/20">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-white/[0.08] bg-white/[0.015]">
          <tr>
            <th className="py-3 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">#</th>
            <th className="py-3 pr-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Trend</th>
            <SortLink label="W-L" sortKey="wins" current={sort} base={base} />
            <SortLink label="Win%" sortKey="winPct" current={sort} base={base} />
            <SortLink label="ROI" sortKey="roi" current={sort} base={base} />
            <SortLink label="Streak" sortKey="streak" current={sort} base={base} />
            <SortLink label="N" sortKey="total" current={sort} base={base} />
          </tr>
        </thead>
        <tbody>
          {trends.map((r, i) => <TrendRow key={r.trendKey} r={r} rank={i + 1} />)}
        </tbody>
      </table>
    </div>
  );
}

// ─── Team DNA ─────────────────────────────────────────────────────────────────

function TrendMiniRow({ r }: { r: MlbTrendRecord }) {
  const n = r.wins + r.losses;
  const tone = n >= MIN_SAMPLE && r.winPct >= STRONG_WIN_PCT ? "text-mint" :
    n >= MIN_SAMPLE && r.winPct <= 44 ? "text-crimson" : "text-slate-400";
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-slate-300 leading-4">
          {r.qualifier === "base" ? `${r.homeAway} ${r.market}` : r.label}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-3 tabular-nums">
        <span className={cn("font-mono text-[11px]", tone)}>{fmtRecord(r)}</span>
        <span className={cn("font-mono text-[10px]", tone)}>{fmtWinPct(r)}</span>
        <span className={cn("font-mono text-[10px]", roiColor(r.roi, n))}>{fmtRoi(r)}</span>
      </div>
    </div>
  );
}

function TeamDNA({ profile, teamNames }: { profile: MlbTeamProfile | null; teamNames: string[] }) {
  if (!profile) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-black/20 px-6 py-10 text-center">
          <div className="text-sm text-slate-500 mb-5">Search a team to see their full situational betting DNA.</div>
          <div className="flex flex-wrap justify-center gap-2">
            {teamNames.slice(0, 30).map((name) => (
              <Link key={name} href={`?tab=team&team=${encodeURIComponent(name)}`}
                className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400 hover:border-aqua/25 hover:text-aqua/80 transition-colors">
                {name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const allTrends = [...profile.home, ...profile.away];
  const topByRoi = [...allTrends].sort((a, b) => b.roi - a.roi).slice(0, 5);
  const topByWinPct = [...allTrends].filter((t) => t.wins + t.losses >= MIN_SAMPLE).sort((a, b) => b.winPct - a.winPct).slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-bold text-white">{profile.teamName}</div>
          <div className="mt-1 text-[11px] text-slate-500">{allTrends.length} situational records · {profile.home.length} home · {profile.away.length} away</div>
        </div>
        <Link href="?tab=team" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 hover:text-slate-300">← All teams</Link>
      </div>

      {/* Top signals */}
      {(topByRoi.length > 0 || topByWinPct.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Best by ROI</div>
            <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-2">
              {topByRoi.map((r) => <TrendMiniRow key={r.trendKey} r={r} />)}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Best by win%</div>
            <div className="rounded-xl border border-white/[0.08] bg-black/20 px-4 py-2">
              {topByWinPct.map((r) => <TrendMiniRow key={r.trendKey} r={r} />)}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Home records</div>
          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20">
            {profile.home.length === 0
              ? <div className="px-4 py-6 text-center text-[11px] text-slate-600">No home records</div>
              : <table className="w-full border-collapse"><tbody>{profile.home.slice(0, 15).map((r, i) => <TrendRow key={r.trendKey} r={r} rank={i + 1} />)}</tbody></table>}
          </div>
        </div>
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Away records</div>
          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/20">
            {profile.away.length === 0
              ? <div className="px-4 py-6 text-center text-[11px] text-slate-600">No away records</div>
              : <table className="w-full border-collapse"><tbody>{profile.away.slice(0, 15).map((r, i) => <TrendRow key={r.trendKey} r={r} rank={i + 1} />)}</tbody></table>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function TabLink({ label, count, tabKey, current, team, market, sort }: { label: string; count?: number; tabKey: TabKey; current: TabKey; team: string; market: MarketFilter; sort: SortKey }) {
  const active = tabKey === current;
  return (
    <Link href={`?tab=${tabKey}&team=${encodeURIComponent(team)}&market=${market}&sort=${sort}`}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[12px] font-semibold transition-colors",
        active
          ? "border-aqua/25 bg-aqua/10 text-aqua"
          : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/[0.14] hover:text-slate-200"
      )}>
      {label}
      {count != null && <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] tabular-nums", active ? "bg-aqua/15 text-aqua/80" : "bg-white/[0.06] text-slate-500")}>{count}</span>}
    </Link>
  );
}

function MarketLink({ label, marketKey, current, tab, team, sort }: { label: string; marketKey: MarketFilter; current: MarketFilter; tab: TabKey; team: string; sort: SortKey }) {
  const active = marketKey === current;
  return (
    <Link href={`?tab=${tab}&market=${marketKey}&team=${encodeURIComponent(team)}&sort=${sort}`}
      className={cn(
        "rounded border px-3 py-1.5 text-[11px] font-semibold transition-colors",
        active ? "border-white/[0.14] bg-white/[0.07] text-white" : "border-transparent text-slate-500 hover:text-slate-300"
      )}>
      {label}
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SharkTrendsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const tab = (one(params.tab) ?? "today") as TabKey;
  const sort = (one(params.sort) ?? "roi") as SortKey;
  const market = (one(params.market) ?? "all") as MarketFilter;
  const team = one(params.team)?.trim() ?? "";

  const [summary, trends, todayGames, teamProfile, teamNames, simPriority] = await Promise.all([
    getMlbTrendBrowserSummary().catch(() => ({ totalRows: 0, finalRows: 0, teamCount: 0, lastUpdated: null })),
    tab === "trends" || tab === "today" ? getMlbLeagueTrends(15).catch(() => [] as MlbTrendRecord[]) : Promise.resolve([] as MlbTrendRecord[]),
    tab === "today" ? getMlbTodayActivations().catch(() => [] as MlbTodayGame[]) : Promise.resolve([] as MlbTodayGame[]),
    tab === "team" && team ? getMlbTeamProfile(team).catch(() => null as MlbTeamProfile | null) : Promise.resolve(null as MlbTeamProfile | null),
    tab === "team" ? getMlbTeamNames().catch(() => [] as string[]) : Promise.resolve([] as string[]),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority).catch(() => null),
  ]);

  const mlbSimRows = (simPriority?.rows ?? []).filter((r) => r.leagueKey === "MLB");
  const displayTrends = sortTrends(filterTrends(trends, market), sort);
  const hasData = summary.finalRows > 0;

  // Build today's edge board sorted by composite score
  const scoredGames = todayGames.map((game) => {
    const sim = matchSim(game, mlbSimRows);
    const stack = buildEdgeStack(game, sim);
    return { game, sim, stack, score: gameScore(game, sim, stack) };
  }).sort((a, b) => b.score - a.score);

  const attackCount = scoredGames.filter((g) => g.sim?.tier === "attack").length;
  const stackedCount = scoredGames.filter((g) => g.stack.simConfirmed && g.stack.count >= 2).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="surface-panel-strong overflow-hidden p-6 pb-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="section-kicker">MLB · SharkTrends</div>
            <h1 className="mt-2 font-display text-[2.1rem] font-bold leading-none tracking-tight text-white">
              Beat the Books
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-slate-400">
              Real-data sim engine meets historical betting trends. Surface edges where the model and history agree — then back them with confidence.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <Link href="/sim/mlb" className="rounded border border-white/[0.10] bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 hover:text-slate-200 transition-colors">MLB Sim Board</Link>
            <Link href="/sharktrends/mlb-stat-trends" className="rounded border border-white/[0.10] bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 hover:text-slate-200 transition-colors">Pregame Context</Link>
            <Link href="/mlb-edge" className="rounded border border-aqua/30 bg-aqua/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-aqua transition-colors hover:bg-aqua/15">MLB Edge Lab</Link>
          </div>
        </div>

        {/* Status tiles */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Graded records", value: summary.finalRows.toLocaleString(), sub: `${summary.teamCount} teams · updated ${fmtAge(summary.lastUpdated)}` },
            { label: "Today's games", value: String(todayGames.length || "–"), sub: mlbSimRows.length > 0 ? `${mlbSimRows.length} sim rows loaded` : "Sim data pending" },
            { label: "Attack signals", value: String(attackCount || "–"), sub: "Tier 1 sim picks today" },
            { label: "Stacked edges", value: String(stackedCount || "–"), sub: "Sim + 2+ trends aligned" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">{label}</div>
              <div className="mt-2 font-display text-[22px] font-bold leading-none tabular-nums text-white">{value}</div>
              <div className="mt-2 text-[11px] leading-5 text-slate-500">{sub}</div>
            </div>
          ))}
        </div>

        {!hasData && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] px-4 py-3">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span className="text-[11px] text-amber-200/80">
              No warehouse data yet. <a href="/api/internal/mlb/spine/backfill?seasons=2024,2025&warehouse=true" className="font-semibold hover:text-amber-100">Backfill 2024–2025 seasons →</a>
            </span>
          </div>
        )}
      </section>

      {/* Tab nav */}
      <div className="flex flex-wrap items-center gap-2">
        <TabLink label="Today's Edge Board" count={todayGames.length || undefined} tabKey="today" current={tab} team={team} market={market} sort={sort} />
        <TabLink label="League Trends" count={displayTrends.length || undefined} tabKey="trends" current={tab} team={team} market={market} sort={sort} />
        <TabLink label="Team DNA" tabKey="team" current={tab} team={team} market={market} sort={sort} />
      </div>

      {/* ── TODAY'S EDGE BOARD ── */}
      {tab === "today" && (
        <div className="space-y-4">
          {scoredGames.length === 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-black/20 px-6 py-12 text-center">
              <div className="text-sm text-slate-500">No MLB games scheduled today, or schedule data is not yet loaded.</div>
            </div>
          )}
          {scoredGames.map(({ game, sim }) => (
            <GameEdgeCard key={game.gamePk} game={game} sim={sim} />
          ))}

          {/* Context strip */}
          {trends.length > 0 && (
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Strongest league-wide trends active right now</div>
              <TrendTable trends={sortTrends(trends, "roi").slice(0, 8)} sort={sort} tab={tab} market={market} team={team} />
            </div>
          )}
        </div>
      )}

      {/* ── LEAGUE TRENDS ── */}
      {tab === "trends" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Market:</span>
            <MarketLink label="All" marketKey="all" current={market} tab={tab} team={team} sort={sort} />
            <MarketLink label="Moneyline" marketKey="moneyline" current={market} tab={tab} team={team} sort={sort} />
            <MarketLink label="Run Line" marketKey="spread" current={market} tab={tab} team={team} sort={sort} />
            <MarketLink label="Over / Under" marketKey="total" current={market} tab={tab} team={team} sort={sort} />
            <span className="ml-auto text-[10px] tabular-nums text-slate-600">{displayTrends.length} trends</span>
          </div>

          <TrendTable trends={displayTrends} sort={sort} tab={tab} market={market} team={team} />

          <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-[11px] leading-5 text-slate-600">
            Win% and edge vs baseline calculated on settled games only. Min 15 games to display.
            Stability: <span className="text-mint/70">Stable = 300+</span> · <span className="text-aqua/70">Solid = 80–299</span> · <span className="text-amber-400/70">Noisy = 30–79</span> · <span className="text-slate-500">Low = &lt;30</span>
          </div>
        </div>
      )}

      {/* ── TEAM DNA ── */}
      {tab === "team" && (
        <div className="space-y-4">
          <form method="GET" action="/sharktrends" className="flex gap-2">
            <input type="hidden" name="tab" value="team" />
            <input name="team" type="text" defaultValue={team}
              placeholder="Team name (e.g. Yankees, Dodgers, Red Sox…)"
              className="flex-1 rounded-lg border border-white/[0.12] bg-black/30 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-aqua/35 focus:outline-none" />
            <button type="submit"
              className="rounded-lg border border-aqua/25 bg-aqua/10 px-5 py-2.5 text-[12px] font-semibold text-aqua hover:bg-aqua/15 transition-colors">
              Search
            </button>
          </form>
          <TeamDNA profile={teamProfile} teamNames={teamNames} />
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-4 border-t border-white/[0.06] pt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
        {[
          { href: "/sharktrends/mlb-warehouse", label: "MLB Warehouse" },
          { href: "/sharktrends/mlb-spine", label: "MLB Spine" },
          { href: "/sharktrends/market-intelligence", label: "Market Intel" },
          { href: "/sharktrends/proof-terminal", label: "Proof Terminal" },
          { href: "/api/trends/mlb/browser", label: "Browser API" },
          { href: "/api/trends/mlb/today", label: "Today API" },
          { href: "/sim", label: "Sim Hub" },
        ].map(({ href, label }) => (
          <Link key={href} href={href} className="hover:text-slate-400 transition-colors">{label}</Link>
        ))}
      </div>
    </div>
  );
}
