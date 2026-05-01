import Link from "next/link";

import {
  SimDataQualityBadges,
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimStatusBadge,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatLongDate } from "@/lib/formatters/date";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { getCachedMlbCalibrationConformal } from "@/services/simulation/mlb-calibration-conformal";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";
import { buildGuardedSimProjection as buildSimProjection } from "@/services/simulation/guarded-sim-projection-engine";
import {
  readSimCache,
  refreshFullSimSnapshots,
  SIM_CACHE_KEYS,
  type CachedSimProjection,
  type SimBoardSnapshot,
  type SimMarketSnapshot
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type LiveProjection = Awaited<ReturnType<typeof buildSimProjection>>;
type Projection = LiveProjection | CachedSimProjection;
type LiveEdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type CacheEdgeResult = SimMarketSnapshot["edges"][number];
type EdgeResult = LiveEdgeResult | CacheEdgeResult;
type Row = { game: SimGame; projection: Projection; edge?: EdgeResult | null };

type DecisionTier = "attack" | "watch" | "thin" | "pass";

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) =>
    section.leagueKey === "MLB" ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })) : []
  );
}

function formatTime(value: string) { return formatLongDate(value); }
function pct(value: number | null | undefined, digits = 1) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return `${(value * 100).toFixed(digits)}%`; }
function num(value: number | null | undefined, digits = 2) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return value.toFixed(digits); }
function plus(value: number | null | undefined, digits = 2) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`; }
function tierRank(tier: DecisionTier | string | undefined) { if (tier === "attack") return 4; if (tier === "watch") return 3; if (tier === "thin") return 2; return 1; }
function factorTeamLabel(row: Row, value: number) { if (Math.abs(value) < 0.01) return "neutral"; return value > 0 ? `favors ${row.projection.matchup.home}` : `favors ${row.projection.matchup.away}`; }

function edgeMarket(edge: EdgeResult | null | undefined) {
  return edge && "market" in edge ? edge.market : null;
}

function edgeSignal(edge: EdgeResult | null | undefined) {
  return edge && "signal" in edge ? edge.signal : null;
}

function edgeTotals(edge: EdgeResult | null | undefined) {
  return edge && "edges" in edge ? edge.edges : null;
}

function bestMarket(row: Row) {
  const edge = row.edge;
  const signal = edgeSignal(edge);
  if (signal) return signal;
  const total = edgeTotals(edge)?.totalRuns;
  if (typeof total === "number") {
    return { market: total > 0 ? "over" : "under", team: null, edge: Math.abs(total), strength: Math.abs(total) >= 1 ? "strong" : Math.abs(total) >= 0.45 ? "watch" : "thin" };
  }
  return null;
}

function decisionTier(row: Row): DecisionTier {
  const governor = row.projection.mlbIntel?.governor;
  if (!row.projection.mlbIntel || governor?.noBet || governor?.tier === "pass") return "pass";
  if (governor?.tier === "attack") return "attack";
  if (governor?.tier === "watch") return "watch";
  if (bestMarket(row)?.strength === "strong") return "watch";
  if (bestMarket(row)?.strength === "thin") return "thin";
  return "thin";
}

function winLean(projection: Projection) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away ? { team: projection.matchup.home, side: "HOME", pct: home, edge: home - away } : { team: projection.matchup.away, side: "AWAY", pct: away, edge: away - home };
}

function dataSourceBadges(row: Row) {
  const source = row.projection.mlbIntel?.dataSource ?? "unknown";
  return {
    player: source.includes("player-model:real") || source.includes("real/real") || !source.includes("synthetic") ? ("real" as const) : ("synthetic" as const),
    lines: edgeMarket(row.edge) ? ("matched" as const) : ("missing" as const),
    calibration: row.projection.mlbIntel?.calibration?.ece == null ? ("pending" as const) : ("calibrated" as const)
  };
}

function topFactors(row: Row, limit = 4) {
  return [...(row.projection.mlbIntel?.factors ?? [])].sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, limit);
}

function sortRows(rows: Row[]) {
  return [...rows].sort((left, right) => {
    const leftTier = tierRank(decisionTier(left));
    const rightTier = tierRank(decisionTier(right));
    if (leftTier !== rightTier) return rightTier - leftTier;
    const leftEdge = Math.abs(left.projection.mlbIntel?.homeEdge ?? 0) + Math.abs(edgeTotals(left.edge)?.totalRuns ?? 0) * 0.25;
    const rightEdge = Math.abs(right.projection.mlbIntel?.homeEdge ?? 0) + Math.abs(edgeTotals(right.edge)?.totalRuns ?? 0) * 0.25;
    return rightEdge - leftEdge;
  });
}

function RowSummary({ row }: { row: Row }) {
  const lean = winLean(row.projection);
  const tier = decisionTier(row);
  const market = bestMarket(row);
  const badges = dataSourceBadges(row);
  const factors = topFactors(row, 3);

  return (
    <SimSignalCard className="group h-full transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <span>{formatTime(row.game.startTime)}</span>
            <SimStatusBadge status={row.game.status} />
          </div>
          <div className="mt-2 font-display text-xl font-semibold tracking-tight text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div>
        </div>
        <SimDecisionBadge tier={tier} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <SimMetricTile label="Lean" value={lean.team} sub={pct(lean.pct)} emphasis={tier === "attack" ? "strong" : "normal"} />
        <SimMetricTile label="Score" value={`${num(row.projection.distribution.avgAway, 1)}-${num(row.projection.distribution.avgHome, 1)}`} sub="away / home" />
        <SimMetricTile label="Model edge" value={plus(row.projection.mlbIntel?.homeEdge)} sub="home-side delta" />
        <SimMetricTile label="Market" value={market ? String(market.market).toUpperCase() : "--"} sub={market ? `edge ${num(market.edge)}` : "no matched signal"} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <SimDataQualityBadges playerSource={badges.player} marketSource={badges.lines} calibrationSource={badges.calibration} />
      </div>

      <div className="mt-4 grid gap-2">
        {factors.length ? factors.map((factor) => (
          <div key={`${row.game.id}:${factor.label}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="truncate text-slate-300">{factor.label}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">{factorTeamLabel(row, factor.value)}</div>
            </div>
            <span className={factor.value >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{plus(factor.value)}</span>
          </div>
        )) : <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-500">No factor stack available.</div>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div className="line-clamp-2 text-xs leading-5 text-slate-500">{row.projection.mlbIntel?.governor?.reasons?.[0] ?? row.projection.read}</div>
        <Link href={`/sim/mlb/${encodeURIComponent(row.game.id)}`} className="shrink-0 rounded-full border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-aqua hover:bg-aqua/15">Open</Link>
      </div>
    </SimSignalCard>
  );
}

function PriorityStack({ rows }: { rows: Row[] }) {
  const ordered = sortRows(rows).slice(0, 6);
  if (!ordered.length) return null;
  return (
    <section className="grid gap-4">
      <SectionTitle title="Priority stack" description="The page leads with the highest-quality reads, while the full slate remains available in the ledger below." />
      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {ordered.map((row) => <RowSummary key={row.game.id} row={row} />)}
      </div>
    </section>
  );
}

function CompactLedger({ rows }: { rows: Row[] }) {
  const ordered = sortRows(rows);
  return (
    <section className="grid gap-4">
      <SectionTitle title="Full slate ledger" description="Every MLB game returned by the cached sim board or live scoreboard fallback. No display cap." />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
        {ordered.map((row) => {
          const lean = winLean(row.projection);
          const tier = decisionTier(row);
          return (
            <Link key={`ledger:${row.game.id}`} href={`/sim/mlb/${encodeURIComponent(row.game.id)}`} className="grid gap-3 border-b border-white/10 px-4 py-3 transition last:border-none hover:bg-aqua/[0.045] md:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_auto] md:items-center">
              <div>
                <div className="font-semibold text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500"><span>{formatTime(row.game.startTime)}</span><SimStatusBadge status={row.game.status} /></div>
              </div>
              <div className="text-sm text-slate-300"><span className="text-slate-500">Lean</span> {lean.team}</div>
              <div className="font-mono text-sm text-aqua">{pct(lean.pct)}</div>
              <div className="font-mono text-sm text-slate-300">{plus(row.projection.mlbIntel?.homeEdge)}</div>
              <div className="justify-self-start md:justify-self-end"><SimDecisionBadge tier={tier} /></div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

async function readCachedRows() {
  const [mlbBoard, market] = await Promise.all([
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market)
  ]);

  if (!mlbBoard?.games?.length) return { rows: [] as Row[], source: "missing-cache" as const };
  const edgeByGame = new Map((market?.edges ?? []).map((edge) => [edge.gameId, edge]));
  return {
    rows: mlbBoard.games.map((item) => ({ game: item.game, projection: item.projection, edge: edgeByGame.get(item.game.id) ?? null })),
    source: mlbBoard.stale ? "stale-cache" as const : "cache" as const
  };
}

async function buildLiveRows() {
  const [sections, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null }),
    buildMlbEdges().catch(() => ({ edges: [] as LiveEdgeResult[] }))
  ]);

  const games = flatten(sections);
  const edgeByGame = new Map((edgeData.edges ?? []).map((edge) => [edge.gameId, edge]));
  const rows: Row[] = await Promise.all(games.map(async (game) => ({ game, projection: await buildSimProjection(game), edge: edgeByGame.get(game.id) ?? null })));
  return rows;
}

async function loadMlbRows() {
  const cached = await readCachedRows();
  if (cached.rows.length) return cached;

  await refreshFullSimSnapshots().catch(() => null);
  const rebuilt = await readCachedRows();
  if (rebuilt.rows.length) return { ...rebuilt, source: "repaired-cache" as const };

  return { rows: await buildLiveRows(), source: "live-fallback" as const };
}

export default async function MlbSimPage() {
  const [{ rows, source }, mlModel, calibration] = await Promise.all([
    loadMlbRows(),
    getCachedMlbMlModel(),
    getCachedMlbCalibrationConformal()
  ]);

  const attack = rows.filter((row) => decisionTier(row) === "attack").length;
  const watch = rows.filter((row) => decisionTier(row) === "watch").length;
  const pass = rows.filter((row) => decisionTier(row) === "pass").length;
  const lineCount = rows.filter((row) => edgeMarket(row.edge)).length;
  const realPlayerGames = rows.filter((row) => dataSourceBadges(row).player === "real").length;
  const topRow = sortRows(rows)[0] ?? null;
  const topLean = topRow ? winLean(topRow.projection) : null;

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="MLB Command Desk"
        title="Kill the spreadsheet. Surface the side, total, pitcher context, market match, and data quality first."
        description="MLB now reads the cached sim board first, repairs blank cache states once, then falls back to the live scoreboard. ESPN empty slates can fall through to the official MLB schedule provider."
        actions={[{ href: "/sim", label: "Sim Hub" }, { href: "/board#MLB", label: "MLB Board", tone: "primary" }, { href: "/mlb-edge", label: "Edge Lab" }]}
      >
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SimMetricTile label="Games" value={String(rows.length)} sub={`MLB slate · ${source}`} emphasis={rows.length ? "strong" : "normal"} />
          <SimMetricTile label="Attack" value={String(attack)} sub="Governor cleared" emphasis="strong" />
          <SimMetricTile label="Watch" value={String(watch)} sub="Conditional" />
          <SimMetricTile label="Pass" value={String(pass)} sub="Filtered" emphasis="muted" />
          <SimMetricTile label="Lines" value={`${lineCount}/${rows.length}`} sub="Matched markets" />
          <SimMetricTile label="Data" value={`${realPlayerGames}/${rows.length}`} sub={`ML rows ${mlModel?.rows ?? 0}${calibration?.ok ? ` · ECE ${calibration.ece.toFixed(3)}` : ""}`} />
        </div>
      </SimWorkspaceHeader>

      {topRow && topLean ? (
        <section className="rounded-[1.75rem] border border-aqua/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28rem),rgba(7,17,29,0.92)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-aqua">Top MLB read</div>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">{topRow.projection.matchup.away} @ {topRow.projection.matchup.home}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{topRow.projection.mlbIntel?.governor?.reasons?.[0] ?? topRow.projection.read}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-2">
              <SimMetricTile label="Lean" value={topLean.team} sub={pct(topLean.pct)} emphasis="strong" />
              <SimMetricTile label="Model edge" value={plus(topRow.projection.mlbIntel?.homeEdge)} sub="home-side delta" />
              <SimMetricTile label="Total" value={num(topRow.projection.mlbIntel?.projectedTotal)} sub={`edge ${plus(edgeTotals(topRow.edge)?.totalRuns)}`} />
              <SimMetricTile label="Tier" value={<SimDecisionBadge tier={decisionTier(topRow)} />} sub={formatTime(topRow.game.startTime)} />
            </div>
          </div>
        </section>
      ) : null}

      {rows.length ? <><PriorityStack rows={rows} /><CompactLedger rows={rows} /></> : <EmptyState title="No MLB games available" description="Cached MLB rows were missing, repair did not rebuild them, and the live scoreboard fallback returned zero MLB games. Check /api/sim/health and the sim-refresh logs." />}
    </div>
  );
}
