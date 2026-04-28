import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import { getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";
import { getCachedMlbCalibrationConformal } from "@/services/simulation/mlb-calibration-conformal";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type Row = { game: SimGame; projection: Projection; edge?: EdgeResult | null };

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) =>
    section.leagueKey === "MLB"
      ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))
      : []
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
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

function tone(status: string) {
  if (status === "LIVE") return "success" as const;
  if (status === "FINAL") return "neutral" as const;
  if (status === "POSTPONED" || status === "CANCELED") return "danger" as const;
  return "muted" as const;
}

function tierTone(tier: string | undefined) {
  if (tier === "attack") return "success" as const;
  if (tier === "watch") return "premium" as const;
  if (tier === "pass") return "danger" as const;
  return "muted" as const;
}

function tierRank(tier: string | undefined) {
  if (tier === "attack") return 4;
  if (tier === "watch") return 3;
  if (tier === "thin") return 2;
  return 1;
}

function americanToProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function winLean(projection: Projection) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, side: "HOME", pct: home, edge: home - away }
    : { team: projection.matchup.away, side: "AWAY", pct: away, edge: away - home };
}

function bestMarket(row: Row) {
  const edge = row.edge;
  if (edge?.signal) return edge.signal;
  const total = edge?.edges.totalRuns;
  if (typeof total === "number") return { market: total > 0 ? "over" : "under", team: null, edge: Math.abs(total), strength: Math.abs(total) >= 1 ? "strong" : Math.abs(total) >= 0.45 ? "watch" : "thin" };
  return null;
}

function topFactors(projection: Projection) {
  return [...(projection.mlbIntel?.factors ?? [])]
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value))
    .slice(0, 5);
}

function dataSourceBadges(row: Row) {
  const source = row.projection.mlbIntel?.dataSource ?? "unknown";
  return {
    player: source.includes("player-model:real") || source.includes("real/real") || !source.includes("synthetic") ? "real" : "synthetic",
    lines: row.edge?.market ? "matched" : "missing",
    calibration: row.projection.mlbIntel?.calibration?.ece == null ? "pending" : "calibrated"
  };
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function EdgeQueue({ rows }: { rows: Row[] }) {
  const ordered = [...rows].sort((left, right) => {
    const leftTier = tierRank(left.projection.mlbIntel?.governor?.tier ?? bestMarket(left)?.strength);
    const rightTier = tierRank(right.projection.mlbIntel?.governor?.tier ?? bestMarket(right)?.strength);
    if (leftTier !== rightTier) return rightTier - leftTier;
    return Math.abs(right.projection.mlbIntel?.homeEdge ?? 0) - Math.abs(left.projection.mlbIntel?.homeEdge ?? 0);
  });

  return (
    <Card className="surface-panel overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-semibold text-white">MLB decision queue</div>
        <div className="mt-1 text-xs text-slate-500">Sorted by governor tier, edge strength, and market usefulness.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Matchup</th>
              <th className="px-3 py-2">Lean</th>
              <th className="px-3 py-2 text-right">Win%</th>
              <th className="px-3 py-2 text-right">Model edge</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Total edge</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2 text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => {
              const lean = winLean(row.projection);
              const governor = row.projection.mlbIntel?.governor;
              const tier = governor?.tier ?? "pass";
              const badges = dataSourceBadges(row);
              const href = `/sim/mlb/${encodeURIComponent(row.game.id)}`;
              return (
                <tr key={row.game.id} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div>
                    <div className="mt-1 flex gap-2 text-[10px] text-slate-500"><span>{formatTime(row.game.startTime)}</span><Badge tone={tone(row.game.status)}>{row.game.status}</Badge></div>
                  </td>
                  <td className="px-3 py-3 text-slate-200">{lean.team}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(lean.pct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{plus(row.projection.mlbIntel?.homeEdge)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.projection.mlbIntel?.projectedTotal)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{plus(row.edge?.edges.totalRuns)}</td>
                  <td className="px-3 py-3"><Badge tone={tierTone(tier)}>{String(tier).toUpperCase()}</Badge></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={badges.player === "real" ? "success" : "muted"}>{badges.player}</Badge>
                      <Badge tone={badges.lines === "matched" ? "success" : "premium"}>{badges.lines}</Badge>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right"><Link href={href} className="rounded-full bg-sky-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-950">Game</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FactorCards({ rows }: { rows: Row[] }) {
  const actionable = rows
    .filter((row) => row.projection.mlbIntel)
    .sort((left, right) => Math.abs(right.projection.mlbIntel?.homeEdge ?? 0) - Math.abs(left.projection.mlbIntel?.homeEdge ?? 0))
    .slice(0, 6);

  if (!actionable.length) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {actionable.map((row) => {
        const lean = winLean(row.projection);
        const factors = topFactors(row.projection);
        const governor = row.projection.mlbIntel?.governor;
        const market = bestMarket(row);
        return (
          <Card key={row.game.id} className="surface-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{formatTime(row.game.startTime)}</div>
                <div className="mt-2 text-lg font-semibold text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div>
              </div>
              <Badge tone={tierTone(governor?.tier)}>{String(governor?.tier ?? "pass").toUpperCase()}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Tile label="Lean" value={lean.team} sub={pct(lean.pct)} />
              <Tile label="Runs" value={`${num(row.projection.distribution.avgAway)} / ${num(row.projection.distribution.avgHome)}`} sub="Projected score" />
              <Tile label="Market" value={market ? String(market.market).toUpperCase() : "--"} sub={market ? `edge ${num(market.edge)}` : "No line"} />
            </div>
            <div className="mt-4 grid gap-2">
              {factors.map((factor) => (
                <div key={factor.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs">
                  <span className="text-slate-300">{factor.label}</span>
                  <span className={factor.value >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{plus(factor.value)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">{governor?.reasons?.[0] ?? row.projection.read}</div>
              <Link href={`/sim/mlb/${encodeURIComponent(row.game.id)}`} className="rounded-full border border-sky-400/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">Open</Link>
            </div>
          </Card>
        );
      })}
    </div>
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
  const attack = rows.filter((row) => row.projection.mlbIntel?.governor?.tier === "attack" && !row.projection.mlbIntel.governor.noBet).length;
  const watch = rows.filter((row) => row.projection.mlbIntel?.governor?.tier === "watch" && !row.projection.mlbIntel.governor.noBet).length;
  const pass = rows.filter((row) => !row.projection.mlbIntel || row.projection.mlbIntel.governor?.noBet || row.projection.mlbIntel.governor?.tier === "pass").length;
  const lineCount = rows.filter((row) => row.edge?.market).length;
  const realPlayerGames = rows.filter((row) => dataSourceBadges(row).player === "real").length;

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="section-kicker">MLB Edge Workspace</div>
            <h1 className="mt-3 max-w-5xl font-display text-4xl font-semibold tracking-tight text-white">Sides, totals, pitching factors, and roster/projection feed quality in one board.</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-bone/65">MLB is now separated from NBA. The board prioritizes actionable side/total reads, sportsbook-line matching, calibration state, and the MLB Data API player-model layer.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/sim" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">Sim Hub</Link>
            <Link href="/mlb-edge" className="rounded-md border border-aqua/35 bg-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-aqua">MLB Edge</Link>
            <Link href="/api/debug/mlb-data-api?team=Chicago%20Cubs" className="rounded-md border border-bone/[0.12] bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-bone/75">Data Debug</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-6">
        <Tile label="Games" value={String(rows.length)} sub="MLB slate" />
        <Tile label="Attack" value={String(attack)} sub="Governor cleared" />
        <Tile label="Watch" value={String(watch)} sub="Conditional" />
        <Tile label="Pass" value={String(pass)} sub="Filtered" />
        <Tile label="Lines" value={`${lineCount}/${rows.length}`} sub="Matched markets" />
        <Tile label="Data" value={`${realPlayerGames}/${rows.length}`} sub={`ML rows ${mlModel?.rows ?? 0}${calibration?.ok ? ` · ECE ${calibration.ece.toFixed(3)}` : ""}`} />
      </section>

      {rows.length ? (
        <>
          <section className="grid gap-4">
            <SectionTitle title="Edge queue" description="The efficient MLB board: lean, win probability, model edge, total edge, tier, and data quality." />
            <EdgeQueue rows={rows} />
          </section>

          <section className="grid gap-4">
            <SectionTitle title="Why it moved" description="Top factor cards for the highest-edge games. Use this to see whether the signal is pitching, bullpen, power, park/weather, history, or lineup quality." />
            <FactorCards rows={rows} />
          </section>
        </>
      ) : (
        <EmptyState title="No MLB games available" description="The scoreboard provider did not return active MLB games for the current slate." />
      )}
    </div>
  );
}
