import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type CachedSimGameProjection,
  type SimBoardSnapshot,
  type SimMarketEdge,
  type SimMarketSnapshot,
  type SimPriorityRow,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

const DISPLAY_TIME_ZONE = "America/Chicago";
const LOW_TOTAL_WARNING_LINE = 6.5;
const HIGH_TOTAL_WARNING_LINE = 13.5;
const MARKET_TOTAL_DELTA_WARNING = 2.5;

type BaseballSnapshots = {
  mlbBoard: SimBoardSnapshot | null;
  priority: SimPrioritySnapshot | null;
  market: SimMarketSnapshot | null;
  status: SimRefreshStatusSnapshot | null;
};

type MlbGameRow = {
  cached: CachedSimGameProjection;
  priority: SimPriorityRow | null;
  edge: SimMarketEdge | null;
  warnings: string[];
};

type TileTone = "neutral" | "good" | "warn" | "bad";

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function signed(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function money(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value > 0 ? `+${value}` : String(value);
}

function dateFrom(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function ageMinutes(value: string | null | undefined) {
  const date = dateFrom(value);
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
}

function formatAge(value: string | null | undefined) {
  const minutes = ageMinutes(value);
  if (minutes === null) return "missing";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m ago` : `${hours}h ago`;
}

function statusTone(status: string): "success" | "neutral" | "danger" | "muted" {
  if (status === "LIVE") return "success";
  if (status === "FINAL") return "neutral";
  if (status === "POSTPONED" || status === "CANCELED") return "danger";
  return "muted";
}

function isActionableStatus(status: string) {
  return !["FINAL", "POSTPONED", "CANCELED"].includes(status.toUpperCase());
}

function decision(row: MlbGameRow) {
  const action = String((row.edge?.signal as { takeAction?: { action?: unknown }; action?: unknown } | null)?.takeAction?.action ?? row.edge?.signal?.action ?? "").toUpperCase();
  if (action === "ATTACK" || action === "PLAY") return { label: action, tone: "success" as const, className: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" };
  if (action === "LEAN" || action === "WATCH") return { label: action, tone: "premium" as const, className: "border-amber-300/30 bg-amber-400/10 text-amber-200" };
  const tier = String(row.cached.projection.mlbIntel?.governor?.tier ?? row.priority?.tier ?? "pass").toUpperCase();
  if (tier === "ATTACK") return { label: "ATTACK", tone: "success" as const, className: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" };
  if (tier === "WATCH") return { label: "WATCH", tone: "premium" as const, className: "border-amber-300/30 bg-amber-400/10 text-amber-200" };
  return { label: "PASS", tone: "danger" as const, className: "border-red-300/25 bg-red-400/10 text-red-200" };
}

function modelSource(row: CachedSimGameProjection) {
  const governor = row.projection.mlbIntel?.governor as { source?: unknown } | undefined;
  return String(row.projection.mlbIntel?.dataSource ?? governor?.source ?? "unknown");
}

function modelVersion(row: CachedSimGameProjection) {
  return String(row.projection.mlbIntel?.modelVersion ?? "mlb-sim");
}

function projectedTotal(row: CachedSimGameProjection) {
  return asNumber(row.projection.mlbIntel?.projectedTotal) ?? asNumber(row.projection.distribution.avgAway + row.projection.distribution.avgHome);
}

function projectedAway(row: CachedSimGameProjection) {
  return asNumber(row.projection.distribution.avgAway);
}

function projectedHome(row: CachedSimGameProjection) {
  return asNumber(row.projection.distribution.avgHome);
}

function marketTotal(edge: SimMarketEdge | null) {
  return asNumber(edge?.market?.total);
}

function totalDelta(row: MlbGameRow) {
  const model = projectedTotal(row.cached);
  const line = marketTotal(row.edge);
  if (model === null || line === null) return asNumber(row.edge?.edges?.totalRuns);
  return model - line;
}

function totalLean(delta: number | null) {
  if (delta === null) return "NO LINE";
  if (Math.abs(delta) < 0.25) return "TIGHT";
  return delta > 0 ? "OVER" : "UNDER";
}

function confidence(row: MlbGameRow) {
  return asNumber(row.cached.projection.mlbIntel?.governor?.confidence) ?? row.priority?.confidence ?? null;
}

function favorite(row: CachedSimGameProjection) {
  const home = asNumber(row.projection.distribution.homeWinPct) ?? 0.5;
  const away = asNumber(row.projection.distribution.awayWinPct) ?? 1 - home;
  return home >= away
    ? { team: row.projection.matchup.home, pct: home, side: "HOME" }
    : { team: row.projection.matchup.away, pct: away, side: "AWAY" };
}

function lineWarnings(row: MlbGameRow) {
  const warnings = [...row.warnings];
  const modelTotal = projectedTotal(row.cached);
  const line = marketTotal(row.edge);
  if (modelTotal !== null && modelTotal < LOW_TOTAL_WARNING_LINE) warnings.push(`Projected total ${modelTotal.toFixed(1)} is unusually low for MLB.`);
  if (modelTotal !== null && modelTotal > HIGH_TOTAL_WARNING_LINE) warnings.push(`Projected total ${modelTotal.toFixed(1)} is unusually high for MLB.`);
  if (modelTotal !== null && line !== null && Math.abs(modelTotal - line) >= MARKET_TOTAL_DELTA_WARNING) {
    warnings.push(`Model total differs from market by ${Math.abs(modelTotal - line).toFixed(1)} runs; inspect inputs before trusting it.`);
  }
  if (!row.edge?.market) warnings.push("No matched sportsbook market for this game.");
  if (/fallback|synthetic|estimated/i.test(modelSource(row.cached))) warnings.push(`Model source is ${modelSource(row.cached)}.`);
  if (row.cached.projection.mlbIntel?.governor?.noBet) warnings.push("Governor marked this game as no-bet.");
  return Array.from(new Set(warnings)).slice(0, 6);
}

function readReasons(row: MlbGameRow) {
  const edgeReasons = ((row.edge?.signal as { reasons?: unknown } | null)?.reasons ?? []) as unknown;
  const signalReasons = Array.isArray(edgeReasons) ? edgeReasons.map(String) : [];
  const governorReasons = Array.isArray(row.cached.projection.mlbIntel?.governor?.reasons)
    ? row.cached.projection.mlbIntel?.governor?.reasons?.map(String) ?? []
    : [];
  return Array.from(new Set([...signalReasons, ...governorReasons])).slice(0, 4);
}

function readFactors(row: MlbGameRow) {
  const raw = row.cached.projection.mlbIntel?.factors;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((factor) => {
      const record = factor as { label?: unknown; value?: unknown };
      return { label: String(record.label ?? "Factor"), value: asNumber(record.value) ?? 0 };
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8);
}

function mergeRows(snapshots: BaseballSnapshots): MlbGameRow[] {
  const priorityById = new Map((snapshots.priority?.rows ?? []).filter((row) => row.leagueKey === "MLB").map((row) => [row.id, row]));
  const edgeById = new Map((snapshots.market?.edges ?? []).map((edge) => [edge.gameId, edge]));
  return (snapshots.mlbBoard?.games ?? [])
    .filter((row) => row.game.leagueKey === "MLB")
    .sort((a, b) => (dateFrom(a.game.startTime)?.getTime() ?? 0) - (dateFrom(b.game.startTime)?.getTime() ?? 0))
    .map((cached) => ({
      cached,
      priority: priorityById.get(cached.game.id) ?? null,
      edge: edgeById.get(cached.game.id) ?? null,
      warnings: [...(snapshots.mlbBoard?.warnings ?? []), ...(snapshots.market?.warnings ?? [])]
    }));
}

async function readSnapshots(): Promise<BaseballSnapshots> {
  // Cache boundary: /baseball is a read-only cockpit. It must not rebuild MLB projections
  // or refresh provider odds during a user request. Cron and /api/sim/refresh own that work.
  const [mlbBoard, priority, market, status] = await Promise.all([
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard),
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus)
  ]);
  return { mlbBoard, priority, market, status };
}

function Tile({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: TileTone }) {
  return (
    <div className={cn(
      "rounded-2xl border bg-slate-950/55 p-4",
      tone === "good" && "border-emerald-300/20 bg-emerald-400/[0.04]",
      tone === "warn" && "border-amber-300/20 bg-amber-400/[0.05]",
      tone === "bad" && "border-red-300/20 bg-red-400/[0.05]",
      tone === "neutral" && "border-white/10"
    )}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs leading-5 text-slate-400">{sub}</div> : null}
    </div>
  );
}

function StatusStrip({ snapshots, rows }: { snapshots: BaseballSnapshots; rows: MlbGameRow[] }) {
  const simFresh = (ageMinutes(snapshots.mlbBoard?.generatedAt) ?? 999) <= 45;
  const marketFresh = (ageMinutes(snapshots.market?.generatedAt) ?? 999) <= 20;
  const refreshOk = snapshots.status?.ok !== false;
  const marketMatched = rows.filter((row) => row.edge?.market).length;
  const activeRows = rows.filter((row) => isActionableStatus(row.cached.game.status)).length;
  const projectedTotals = rows.map((row) => projectedTotal(row.cached)).filter((value): value is number => value !== null);
  const avgTotal = projectedTotals.length ? projectedTotals.reduce((sum, value) => sum + value, 0) / projectedTotals.length : null;
  const lowTotals = rows.filter((row) => (projectedTotal(row.cached) ?? 99) < LOW_TOTAL_WARNING_LINE).length;

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Tile label="Active games" value={`${activeRows}/${rows.length}`} sub="Pregame/live cached rows" tone={activeRows ? "good" : rows.length ? "warn" : "bad"} />
      <Tile label="Markets matched" value={`${marketMatched}/${rows.length || 0}`} sub={`${snapshots.market?.lineCount ?? 0} line rows`} tone={marketMatched ? "good" : "warn"} />
      <Tile label="Avg total" value={avgTotal === null ? "-" : avgTotal.toFixed(1)} sub={lowTotals ? `${lowTotals} low-total flags` : "Projected run environment"} tone={lowTotals ? "warn" : "good"} />
      <Tile label="Sim cache" value={simFresh ? "Fresh" : snapshots.mlbBoard ? "Stale" : "Missing"} sub={formatAge(snapshots.mlbBoard?.generatedAt)} tone={simFresh ? "good" : "warn"} />
      <Tile label="Refresh" value={snapshots.status?.running ? "Running" : refreshOk ? "OK" : "Failed"} sub={snapshots.status?.reason ?? formatAge(snapshots.status?.lastSuccessAt)} tone={refreshOk ? "good" : "bad"} />
    </section>
  );
}

function DataQualityPanel({ rows, snapshots }: { rows: MlbGameRow[]; snapshots: BaseballSnapshots }) {
  const fallbackRows = rows.filter((row) => /fallback|synthetic|estimated/i.test(modelSource(row.cached))).length;
  const noBetRows = rows.filter((row) => row.cached.projection.mlbIntel?.governor?.noBet).length;
  const totalWarnings = rows.reduce((count, row) => count + lineWarnings(row).filter((warning) => /total/i.test(warning)).length, 0);
  const warnings = Array.from(new Set([
    ...(snapshots.mlbBoard?.warnings ?? []),
    ...(snapshots.market?.warnings ?? []),
    ...(snapshots.status?.warnings ?? [])
  ])).slice(0, 6);

  return (
    <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Input quality gates</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <Tile label="Fallback rows" value={fallbackRows} sub="Should be zero for attack picks" tone={fallbackRows ? "bad" : "good"} />
          <Tile label="No-bet gates" value={noBetRows} sub="Governor protection" tone={noBetRows ? "warn" : "good"} />
          <Tile label="Totals flags" value={totalWarnings} sub="Low/high or market mismatch" tone={totalWarnings ? "warn" : "good"} />
        </div>
      </div>
      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Known blockers</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This panel surfaces weak data instead of burying it. If something is stale, synthetic, or missing a market line, the card tells us before it becomes a pick.
            </p>
          </div>
          <Link href="/api/sim/health" className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">Health JSON</Link>
        </div>
        <div className="mt-4 grid gap-2">
          {warnings.length ? warnings.map((warning) => (
            <div key={warning} className="rounded-xl border border-amber-300/15 bg-amber-400/[0.04] px-3 py-2 text-xs leading-5 text-amber-100/80">{warning}</div>
          )) : <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[0.04] px-3 py-2 text-xs text-emerald-100/80">No cache-level warnings in the latest MLB snapshots.</div>}
        </div>
      </div>
    </section>
  );
}

function WinBar({ label, value }: { label: string; value: number | null }) {
  const safe = value ?? 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400"><span>{label}</span><span>{pct(value)}</span></div>
      <div className="mt-1.5 h-2 rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(2, Math.min(100, safe * 100))}%` }} /></div>
    </div>
  );
}

function GameCard({ row }: { row: MlbGameRow }) {
  const dec = decision(row);
  const fav = favorite(row.cached);
  const modelTotal = projectedTotal(row.cached);
  const line = marketTotal(row.edge);
  const delta = totalDelta(row);
  const lean = totalLean(delta);
  const warnings = lineWarnings(row);
  const reasons = readReasons(row);
  const factors = readFactors(row);
  const homeWin = asNumber(row.cached.projection.distribution.homeWinPct);
  const awayWin = asNumber(row.cached.projection.distribution.awayWinPct) ?? (homeWin === null ? null : 1 - homeWin);
  const homeMl = asNumber(row.edge?.market?.homeMoneyline);
  const awayMl = asNumber(row.edge?.market?.awayMoneyline);
  const homeEdge = asNumber(row.edge?.edges?.homeMoneyline);
  const awayEdge = asNumber(row.edge?.edges?.awayMoneyline);
  const conf = confidence(row);

  return (
    <article className="rounded-[1.75rem] border border-white/10 bg-slate-950/75 p-5 shadow-[0_0_70px_rgba(14,165,233,0.07)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone(row.cached.game.status)}>{row.cached.game.status}</Badge>
            <Badge tone={dec.tone}>{dec.label}</Badge>
            <Badge tone={row.edge?.market ? "success" : "premium"}>{row.edge?.market ? "line matched" : "no line"}</Badge>
          </div>
          <h2 className="mt-3 font-display text-2xl font-semibold text-white">{row.cached.projection.matchup.away} @ {row.cached.projection.matchup.home}</h2>
          <div className="mt-1 text-xs text-slate-500">{formatTime(row.cached.game.startTime)} - {modelVersion(row.cached)} - {modelSource(row.cached)}</div>
        </div>
        <Link href={`/sim/mlb/${encodeURIComponent(row.cached.game.id)}`} className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-950">Open detail</Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Tile label="Lean" value={fav.team} sub={`${fav.side} ${pct(fav.pct)}`} tone={dec.label === "PASS" ? "warn" : "good"} />
        <Tile label="Confidence" value={pct(conf)} sub={row.cached.projection.mlbIntel?.governor?.noBet ? "No-bet protected" : "Governor score"} tone={(conf ?? 0) >= 0.6 ? "good" : "warn"} />
        <Tile label="Projected score" value={`${round(projectedAway(row.cached), 1)} - ${round(projectedHome(row.cached), 1)}`} sub={`${row.cached.projection.matchup.away} - ${row.cached.projection.matchup.home}`} />
        <Tile label="Model total" value={round(modelTotal, 1)} sub="Runs projected" tone={modelTotal !== null && (modelTotal < LOW_TOTAL_WARNING_LINE || modelTotal > HIGH_TOTAL_WARNING_LINE) ? "warn" : "neutral"} />
        <Tile label="Market total" value={line === null ? "-" : round(line, 1)} sub={delta === null ? "No sportsbook total" : `${lean} ${signed(delta, 1)} runs`} tone={line === null ? "warn" : Math.abs(delta ?? 0) >= MARKET_TOTAL_DELTA_WARNING ? "warn" : "good"} />
        <Tile label="Moneyline" value={`${money(awayMl)} / ${money(homeMl)}`} sub={`Edges A ${pct(awayEdge)} - H ${pct(homeEdge)}`} tone={row.edge?.market ? "good" : "warn"} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Win distribution</div>
          <div className="mt-4 space-y-3">
            <WinBar label={row.cached.projection.matchup.home} value={homeWin} />
            <WinBar label={row.cached.projection.matchup.away} value={awayWin} />
          </div>
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-slate-300">{row.cached.projection.read}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Why / why not</div>
          <div className="mt-4 grid gap-2">
            {reasons.length ? reasons.map((reason) => <div key={reason} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs leading-5 text-slate-300">{reason}</div>) : <div className="text-sm text-slate-500">No explanation reasons were included in the snapshot.</div>}
          </div>
          {warnings.length ? (
            <div className="mt-4 grid gap-2">
              {warnings.map((warning) => <div key={warning} className="rounded-xl border border-amber-300/15 bg-amber-400/[0.04] px-3 py-2 text-xs leading-5 text-amber-100/80">{warning}</div>)}
            </div>
          ) : null}
        </div>
      </div>

      {factors.length ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Factor stack</div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {factors.map((factor) => <div key={factor.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs"><span className="text-slate-400">{factor.label}</span><span className={factor.value >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>{signed(factor.value, Math.abs(factor.value) < 1 ? 2 : 1)}</span></div>)}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default async function BaseballPage() {
  const snapshots = await readSnapshots();
  const rows = mergeRows(snapshots);
  const activeRows = rows.filter((row) => isActionableStatus(row.cached.game.status));
  const displayRows = activeRows.length ? activeRows : rows;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-cyan-300/15 bg-[#071013] p-6 shadow-[0_0_100px_rgba(14,165,233,0.10)]">
        <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200">MLB flagship cockpit</div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-white md:text-6xl">Baseball Command Center</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Cached MLB simulations, market totals, moneyline edges, confidence gates, and data-quality warnings in one place. This page is read-only by design so slow providers cannot freeze the product.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href="/api/sim/refresh" className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Refresh API</Link>
            <Link href="/api/sim/debug" className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">Debug cache</Link>
            <Link href="/sim/accuracy" className="rounded-full bg-cyan-400 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-950">Accuracy</Link>
          </div>
        </div>
      </section>

      <StatusStrip snapshots={snapshots} rows={rows} />
      <DataQualityPanel rows={displayRows} snapshots={snapshots} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">{activeRows.length ? "Today / upcoming MLB slate" : "Latest cached MLB slate"}</div>
            <h2 className="mt-1 font-display text-3xl font-semibold text-white">{activeRows.length ? "Every active game gets a sim card" : "No active MLB rows right now"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {activeRows.length
                ? "Cards show the whole decision chain: projected score, total sanity, market line, model edge, no-bet blockers, and the factor stack."
                : "The cache currently contains completed games only, so this cockpit is showing the latest settled slate for audit instead of pretending there are actionable picks."}
            </p>
          </div>
          <div className="text-xs text-slate-500">Generated {formatAge(snapshots.mlbBoard?.generatedAt)}</div>
        </div>

        {!activeRows.length && rows.length ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.05] p-4 text-sm leading-6 text-amber-100/80">
            MLB snapshot is populated, but every cached row is FINAL/closed. Wait for the next scheduled refresh window or run the sim refresh before trusting this page for live betting decisions.
          </div>
        ) : null}

        {displayRows.length ? (
          <div className="grid gap-4">
            {displayRows.map((row) => <GameCard key={row.cached.game.id} row={row} />)}
          </div>
        ) : (
          <EmptyState
            eyebrow="MLB sim cache"
            title="No MLB sim snapshot yet"
            description="The page is working, but there are no cached MLB games. Run the scheduled sim refresh or inspect /api/sim/health instead of rebuilding projections during this request."
          />
        )}
      </section>
    </div>
  );
}
