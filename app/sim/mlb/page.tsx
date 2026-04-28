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

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type Row = { game: SimGame; projection: Projection; edge?: EdgeResult | null };

type DecisionTier = "attack" | "watch" | "thin" | "pass";

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) =>
    section.leagueKey === "MLB" ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })) : []
  );
}

function formatTime(value: string) {
  return formatLongDate(value);
}

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function plus(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function tierRank(tier: DecisionTier | string | undefined) {
  if (tier === "attack") return 4;
  if (tier === "watch") return 3;
  if (tier === "thin") return 2;
  return 1;
}

function bestMarket(row: Row) {
  const edge = row.edge;
  if (edge?.signal) return edge.signal;
  const total = edge?.edges.totalRuns;
  if (typeof total === "number") {
    return {
      market: total > 0 ? "over" : "under",
      team: null,
      edge: Math.abs(total),
      strength: Math.abs(total) >= 1 ? "strong" : Math.abs(total) >= 0.45 ? "watch" : "thin"
    };
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
  return home >= away
    ? { team: projection.matchup.home, side: "HOME", pct: home, edge: home - away }
    : { team: projection.matchup.away, side: "AWAY", pct: away, edge: away - home };
}

function dataSourceBadges(row: Row) {
  const source = row.projection.mlbIntel?.dataSource ?? "unknown";
  return {
    player: source.includes("player-model:real") || source.includes("real/real") || !source.includes("synthetic") ? ("real" as const) : ("synthetic" as const),
    lines: row.edge?.market ? ("matched" as const) : ("missing" as const),
    calibration: row.projection.mlbIntel?.calibration?.ece == null ? ("pending" as const) : ("calibrated" as const)
  };
}

function topFactors(row: Row, limit = 4) {
  return [...(row.projection.mlbIntel?.factors ?? [])]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, limit);
}

function sortRows(rows: Row[]) {
  return [...rows].sort((left, right) => {
    const leftTier = tierRank(decisionTier(left));
    const rightTier = tierRank(decisionTier(right));
    if (leftTier !== rightTier) return rightTier - leftTier;
    const leftEdge = Math.abs(left.projection.mlbIntel?.homeEdge ?? 0) + Math.abs(left.edge?.edges.totalRuns ?? 0) * 0.25;
    const rightEdge = Math.abs(right.projection.mlbIntel?.homeEdge ?? 0) + Math.abs(right.edge?.edges.totalRuns ?? 0) * 0.25;
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
          <div key={`${row.game.id}:${factor.label}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs">
            <span className="truncate text-slate-300">{factor.label}</span>
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
      <SectionTitle title="Priority stack" description="The page now leads with cards you can actually scan: decision tier, lean, score, market signal, data quality, and the factor stack." />
      <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {ordered.map((row) => <RowSummary key={row.game.id} row={row} />)}
      </div>
    </section>
  );
}

function CompactLedger({ rows }: { rows: Row[] }) {
  const ordered = sortRows(rows).slice(0, 12);
  return (
    <section className="grid gap-4">
      <SectionTitle title="Fast ledger" description="A tight fallback list for the rest of the slate. Open only the games that survive the first scan." />
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

export default async function MlbSimPage() {
  const [sections, edgeData, mlModel, calibration] = await Promise.all([
    buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null }),
    buildMlbEdges().catch(() => ({ edges: [] as EdgeResult[] })),
    getCachedMlbMlModel(),
    getCachedMlbCalibrationConformal()
  ]);

  const games = flatten(sections);
  const edgeByGame = new Map((edgeData.edges ?? []).map((edge) => [edge.gameId, edge]));
  const rows: Row[] = await Promise.all(games.map(async (game) => ({ game, projection: await buildSimProjection(game), edge: edgeByGame.get(game.id) ?? null })));
  const attack = rows.filter((row) => decisionTier(row) === "attack").length;
  const watch = rows.filter((row) => decisionTier(row) === "watch").length;
  const pass = rows.filter((row) => decisionTier(row) === "pass").length;
  const lineCount = rows.filter((row) => row.edge?.market).length;
  const realPlayerGames = rows.filter((row) => dataSourceBadges(row).player === "real").length;
  const topRow = sortRows(rows)[0] ?? null;
  const topLean = topRow ? winLean(topRow.projection) : null;

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="MLB Command Desk"
        title="Kill the spreadsheet. Surface the side, total, pitcher context, market match, and data quality first."
        description="This page is now a decision desk instead of a dense table. Top games get full scan cards; the rest of the slate drops into a compact ledger."
        actions={[
          { href: "/sim", label: "Sim Hub" },
          { href: "/board#MLB", label: "MLB Board", tone: "primary" },
          { href: "/mlb-edge", label: "Edge Lab" }
        ]}
      >
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SimMetricTile label="Games" value={String(rows.length)} sub="MLB slate" />
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
              <SimMetricTile label="Total" value={num(topRow.projection.mlbIntel?.projectedTotal)} sub={`edge ${plus(topRow.edge?.edges.totalRuns)}`} />
              <SimMetricTile label="Tier" value={<SimDecisionBadge tier={decisionTier(topRow)} />} sub={formatTime(topRow.game.startTime)} />
            </div>
          </div>
        </section>
      ) : null}

      {rows.length ? (
        <>
          <PriorityStack rows={rows} />
          <CompactLedger rows={rows} />
        </>
      ) : (
        <EmptyState title="No MLB games available" description="The scoreboard provider did not return active MLB games for the current slate." />
      )}
    </div>
  );
}
