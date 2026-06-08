import Link from "next/link";

import {
  SimDataQualityBadges,
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimStatusBadge
} from "@/components/sim/sim-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { formatLongDate } from "@/lib/formatters/date";
import type { LeagueKey } from "@/lib/types/domain";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type CachedSimGameProjection,
  type CachedSimProjection,
  type SimBoardSnapshot,
  type SimMarketSnapshot
} from "@/services/simulation/sim-snapshot-service";
import { buildMlbDailySimPickBoard, type MlbPick3Parlay, type MlbSimPick } from "@/services/simulation/mlb-sim-pick-selector";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = CachedSimProjection;
type EdgeResult = SimMarketSnapshot["edges"][number];
type Row = { game: SimGame; projection: Projection; edge?: EdgeResult | null };
type DecisionTier = "attack" | "watch" | "thin" | "pass";

function formatTime(value: string) { return formatLongDate(value); }
function pct(value: number | null | undefined, digits = 1) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return `${(value * 100).toFixed(digits)}%`; }
function num(value: number | null | undefined, digits = 2) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return value.toFixed(digits); }
function plus(value: number | null | undefined, digits = 2) { if (typeof value !== "number" || !Number.isFinite(value)) return "--"; return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`; }
function tierRank(tier: DecisionTier | string | undefined) { if (tier === "attack") return 4; if (tier === "watch") return 3; if (tier === "thin") return 2; return 1; }
function factorTeamLabel(row: Row, value: number) { if (Math.abs(value) < 0.01) return "neutral"; return value > 0 ? `favors ${row.projection.matchup.home}` : `favors ${row.projection.matchup.away}`; }
function edgeMarket(edge: EdgeResult | null | undefined) { return edge && "market" in edge ? edge.market : null; }
function edgeSignal(edge: EdgeResult | null | undefined) { return edge && "signal" in edge ? edge.signal : null; }
function edgeTotals(edge: EdgeResult | null | undefined) { return edge && "edges" in edge ? edge.edges : null; }
function bestMarket(row: Row) {
  const edge = row.edge;
  const signal = edgeSignal(edge);
  if (signal) return signal;
  const total = edgeTotals(edge)?.totalRuns;
  if (typeof total === "number") return { market: total > 0 ? "over" : "under", team: null, edge: Math.abs(total), strength: Math.abs(total) >= 1 ? "strong" : Math.abs(total) >= 0.45 ? "watch" : "thin" };
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
  const playerMatch = source.match(/player-model:([^+]+)/);
  const playerSource = playerMatch?.[1] ?? "unknown";
  const player = playerSource === "real/real" ? ("real" as const) : playerSource.includes("estimated") ? ("estimated" as const) : playerSource.includes("synthetic") ? ("synthetic" as const) : ("unknown" as const);
  return { player, lines: edgeMarket(row.edge) ? ("matched" as const) : ("missing" as const), calibration: row.projection.mlbIntel?.calibration?.ece == null ? ("pending" as const) : ("calibrated" as const) };
}
function topFactors(row: Row, limit = 4) { return [...(row.projection.mlbIntel?.factors ?? [])].sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, limit); }
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
function navClass(active = false) { return active ? "rounded-full border border-aqua/30 bg-aqua/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-aqua" : "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 hover:text-aqua"; }
function Badge({ label, tone = "slate" }: { label: string; tone?: "slate" | "aqua" | "green" | "amber" | "red" }) {
  const cls = tone === "green" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : tone === "amber" ? "border-amber-400/25 bg-amber-400/10 text-amber-200" : tone === "red" ? "border-rose-400/25 bg-rose-400/10 text-rose-200" : tone === "aqua" ? "border-aqua/25 bg-aqua/10 text-aqua" : "border-white/10 bg-white/[0.04] text-slate-300";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${cls}`}>{label}</span>;
}
function pickTone(pick: MlbSimPick) { return pick.tier === "OFFICIAL" ? "green" : pick.tier === "QUALIFIED_LEAN" ? "aqua" : pick.tier === "WATCHLIST" ? "amber" : "slate"; }
function marketLabel(market: MlbSimPick["market"]) { return market.replace(/_/g, " "); }

function PickCard({ pick }: { pick: MlbSimPick }) {
  return (
    <Link href={`/sim/mlb/${encodeURIComponent(pick.gameId)}`} className="rounded-[1.1rem] border border-white/10 bg-[#06101b]/82 p-4 transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{marketLabel(pick.market)}</div><div className="mt-1 font-display text-xl font-black tracking-tight text-white">{pick.selection}</div><div className="mt-1 text-xs text-slate-500">{pick.gameLabel}</div></div><Badge label={pick.tier.replace(/_/g, " ")} tone={pickTone(pick)} /></div>
      <div className="mt-4 grid grid-cols-3 gap-2"><SimMetricTile label="Model" value={pct(pick.modelProbability)} sub={pick.source} /><SimMetricTile label="EV" value={pick.expectedValue == null ? "--" : pct(pick.expectedValue)} sub={pick.americanOdds == null ? "no odds" : `${pick.americanOdds > 0 ? "+" : ""}${pick.americanOdds}`} /><SimMetricTile label="Score" value={String(pick.score)} sub={`conf ${pct(pick.confidence)}`} /></div>
      <div className="mt-3 flex flex-wrap gap-2"><Badge label={`quality ${pick.dataQuality}`} />{pick.projectedRunEdge != null ? <Badge label={`run ${plus(pick.projectedRunEdge)}`} tone="aqua" /> : null}{pick.warnings.length ? <Badge label="verify odds" tone="amber" /> : null}</div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{pick.reasons.join(" · ")}</p>
    </Link>
  );
}

function ParlayCard({ parlay, index }: { parlay: MlbPick3Parlay; index: number }) {
  return (
    <div className="rounded-[1.1rem] border border-amber-300/20 bg-amber-300/[0.055] p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">Pick 3 parlay #{index + 1}</div><div className="mt-1 font-display text-xl font-black text-white">Fair {parlay.fairAmericanOdds > 0 ? "+" : ""}{parlay.fairAmericanOdds}</div></div><Badge label={`score ${parlay.score}`} tone="amber" /></div>
      <div className="mt-3 grid gap-2">{parlay.legs.map((leg) => <div key={leg.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs"><div className="font-semibold text-white">{leg.selection}</div><div className="mt-1 text-slate-500">{marketLabel(leg.market)} · {leg.gameLabel} · {pct(leg.modelProbability)}</div></div>)}</div>
      <div className="mt-3 flex flex-wrap gap-2"><Badge label={`model ${pct(parlay.modelProbability)}`} tone="amber" /><Badge label={`avg conf ${pct(parlay.avgConfidence)}`} />{parlay.warnings.length ? <Badge label="verify derived legs" tone="red" /> : null}</div>
    </div>
  );
}

function MlbPickBoard({ board }: { board: ReturnType<typeof buildMlbDailySimPickBoard> }) {
  const picks = [...board.officialPlays, ...board.qualifiedLeans].slice(0, 6);
  return (
    <section className="grid gap-4">
      <SectionTitle title="MLB Sim Picks" description="Moneyline, O/U, F5, NRFI and pick-3 parlays from the sim selector." />
      <div className="flex flex-wrap gap-2"><Badge label={`${board.summary.officialCount} official`} tone={board.summary.officialCount ? "green" : "slate"} /><Badge label={`${board.summary.qualifiedLeanCount} leans`} tone={board.summary.qualifiedLeanCount ? "aqua" : "slate"} /><Badge label={`${board.summary.pick3Count} pick 3`} tone={board.summary.pick3Count ? "amber" : "slate"} /></div>
      {picks.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{picks.map((pick) => <PickCard key={pick.id} pick={pick} />)}</div> : <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.035] p-5 text-sm leading-6 text-slate-400">No official plays or qualified leans cleared. Watchlist only.</div>}
      {board.pick3Parlays.length ? <div className="grid gap-3 xl:grid-cols-3">{board.pick3Parlays.map((parlay, index) => <ParlayCard key={parlay.id} parlay={parlay} index={index} />)}</div> : null}
    </section>
  );
}

function RowSummary({ row }: { row: Row }) {
  const lean = winLean(row.projection);
  const tier = decisionTier(row);
  const market = bestMarket(row);
  const badges = dataSourceBadges(row);
  const factors = topFactors(row, 3);
  return (
    <SimSignalCard className="group h-full transition hover:border-aqua/35 hover:bg-aqua/[0.045]">
      <div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500"><span>{formatTime(row.game.startTime)}</span><SimStatusBadge status={row.game.status} /></div><div className="mt-2 font-display text-xl font-semibold tracking-tight text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div></div><SimDecisionBadge tier={tier} /></div>
      <div className="mt-4 grid grid-cols-2 gap-3"><SimMetricTile label="Lean" value={lean.team} sub={pct(lean.pct)} emphasis={tier === "attack" ? "strong" : "normal"} /><SimMetricTile label="Score" value={`${num(row.projection.distribution.avgAway, 1)}-${num(row.projection.distribution.avgHome, 1)}`} sub="away / home" /><SimMetricTile label="Model edge" value={plus(row.projection.mlbIntel?.homeEdge)} sub="home-side delta" /><SimMetricTile label="Market" value={market ? String(market.market).toUpperCase() : "--"} sub={market ? `edge ${num(market.edge)}` : "no matched signal"} /></div>
      <div className="mt-4 flex flex-wrap gap-1.5"><SimDataQualityBadges playerSource={badges.player} marketSource={badges.lines} calibrationSource={badges.calibration} /></div>
      <div className="mt-4 grid gap-2">{factors.length ? factors.map((factor) => <div key={`${row.game.id}:${factor.label}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs"><div className="min-w-0"><div className="truncate text-slate-300">{factor.label}</div><div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">{factorTeamLabel(row, factor.value)}</div></div><span className={factor.value >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{plus(factor.value)}</span></div>) : <div className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-500">No factor stack available.</div>}</div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4"><div className="line-clamp-2 text-xs leading-5 text-slate-500">{row.projection.mlbIntel?.governor?.reasons?.[0] ?? row.projection.read}</div><Link href={`/sim/mlb/${encodeURIComponent(row.game.id)}`} className="shrink-0 rounded-full border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-aqua hover:bg-aqua/15">Open</Link></div>
    </SimSignalCard>
  );
}

function PriorityStack({ rows }: { rows: Row[] }) {
  const ordered = sortRows(rows).slice(0, 6);
  if (!ordered.length) return null;
  return <section className="grid gap-4"><SectionTitle title="Best MLB reads" description="Highest-quality games from the cached MLB sim board." /><div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">{ordered.map((row) => <RowSummary key={row.game.id} row={row} />)}</div></section>;
}
function CompactLedger({ rows }: { rows: Row[] }) {
  const ordered = sortRows(rows);
  return <section className="grid gap-4"><SectionTitle title="Full MLB slate" description="Every cached MLB game." /><div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">{ordered.map((row) => { const lean = winLean(row.projection); const tier = decisionTier(row); return <Link key={`ledger:${row.game.id}`} href={`/sim/mlb/${encodeURIComponent(row.game.id)}`} className="grid gap-3 border-b border-white/10 px-4 py-3 transition last:border-none hover:bg-aqua/[0.045] md:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_auto] md:items-center"><div><div className="font-semibold text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500"><span>{formatTime(row.game.startTime)}</span><SimStatusBadge status={row.game.status} /></div></div><div className="text-sm text-slate-300"><span className="text-slate-500">Lean</span> {lean.team}</div><div className="font-mono text-sm text-aqua">{pct(lean.pct)}</div><div className="font-mono text-sm text-slate-300">{plus(row.projection.mlbIntel?.homeEdge)}</div><div className="justify-self-start md:justify-self-end"><SimDecisionBadge tier={tier} /></div></Link>; })}</div></section>;
}

async function readCachedRows() {
  const [mlbBoard, market] = await Promise.all([readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard), readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market)]);
  if (!mlbBoard?.games?.length) return { rows: [] as Row[], games: [] as CachedSimGameProjection[], edges: [] as EdgeResult[], source: "missing-cache" as const };
  const edgeByGame = new Map((market?.edges ?? []).map((edge) => [edge.gameId, edge]));
  return { rows: mlbBoard.games.map((item) => ({ game: item.game, projection: item.projection, edge: edgeByGame.get(item.game.id) ?? null })), games: mlbBoard.games, edges: market?.edges ?? [], source: mlbBoard.stale ? "stale-cache" as const : "cache" as const };
}
async function loadMlbRows() { const cached = await readCachedRows(); return cached.rows.length ? cached : { rows: [] as Row[], games: [] as CachedSimGameProjection[], edges: [] as EdgeResult[], source: "missing-cache" as const }; }

export default async function MlbSimPage() {
  const { rows, games, edges, source } = await loadMlbRows();
  const attack = rows.filter((row) => decisionTier(row) === "attack").length;
  const watch = rows.filter((row) => decisionTier(row) === "watch").length;
  const lineCount = rows.filter((row) => edgeMarket(row.edge)).length;
  const pickBoard = buildMlbDailySimPickBoard({ games, edges });

  return (
    <div className="space-y-5">
      <section className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display text-3xl font-black tracking-[-0.05em] text-white">MLB Sim</h1><p className="mt-1 text-sm text-slate-500">Moneyline, O/U, F5, NRFI, pick-3 parlays, and full slate.</p></div><div className="flex flex-wrap gap-2"><Link href="/sim" className={navClass()}>SimHub</Link><Link href="/sim/mlb" className={navClass(true)}>MLB</Link><Link href="/mlb/batter-box" className={navClass()}>Batter Box</Link><Link href="/accuracy/mlb" className={navClass()}>Accuracy</Link></div></div>
        <div className="mt-4 flex flex-wrap gap-2"><Badge label={`${rows.length} games`} tone={rows.length ? "green" : "slate"} /><Badge label={`${attack} attack`} tone={attack ? "green" : "slate"} /><Badge label={`${watch} watch`} tone={watch ? "amber" : "slate"} /><Badge label={`${lineCount} lines`} tone={lineCount ? "aqua" : "slate"} /><Badge label={source} /></div>
      </section>
      {rows.length ? <><MlbPickBoard board={pickBoard} /><PriorityStack rows={rows} /><CompactLedger rows={rows} /></> : <EmptyState title="No MLB games available" description="Cached MLB rows are missing. Run the sim refresh job if the slate should be populated." />}
    </div>
  );
}
