import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { getCachedMlbCalibrationConformal } from "@/services/simulation/mlb-calibration-conformal";
import { getCachedMlbMlModel } from "@/services/simulation/mlb-ml-training-engine";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];
type Row = { game: SimGame; projection: Projection; edge?: EdgeResult | null };

type WorkspaceConfig = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  primaryMetric: string;
  secondaryMetric: string;
  action: string;
};

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) => section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })));
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

function num(value: number | null | undefined, digits = 1) {
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

function decisionTier(row: Row) {
  if (row.game.leagueKey === "MLB") {
    const governor = row.projection.mlbIntel?.governor;
    if (governor?.noBet || governor?.tier === "pass") return "pass";
    if (governor?.tier === "attack") return "attack";
    return "watch";
  }
  if (row.game.leagueKey === "NBA") return row.projection.nbaIntel?.tier ?? "pass";
  const edge = Math.abs(row.projection.distribution.homeWinPct - 0.5);
  if (edge >= 0.08) return "attack";
  if (edge >= 0.045) return "watch";
  return "pass";
}

function tierRank(tier: string | undefined) {
  if (tier === "attack") return 3;
  if (tier === "watch") return 2;
  return 1;
}

function winLean(projection: Projection) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home, edge: home - away }
    : { team: projection.matchup.away, pct: away, edge: away - home };
}

function confidence(row: Row) {
  return row.projection.mlbIntel?.governor?.confidence ?? row.projection.nbaIntel?.confidence ?? row.projection.realityIntel?.confidence ?? null;
}

function leagueRows(rows: Row[], league: LeagueKey) {
  return rows.filter((row) => row.game.leagueKey === league);
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

function WorkspaceCard({ config }: { config: WorkspaceConfig }) {
  return (
    <Link href={config.href} className="group rounded-3xl border border-white/10 bg-slate-950/45 p-5 transition hover:border-sky-400/35 hover:bg-sky-500/[0.055]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200/80">{config.eyebrow}</div>
          <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">{config.title}</div>
        </div>
        <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-200">Open</span>
      </div>
      <p className="mt-4 min-h-[52px] text-sm leading-6 text-slate-400">{config.description}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Tile label="Primary" value={config.primaryMetric} />
        <Tile label="Status" value={config.secondaryMetric} />
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-sky-200 group-hover:text-sky-100">{config.action} →</div>
    </Link>
  );
}

function PriorityTable({ rows }: { rows: Row[] }) {
  const ordered = [...rows]
    .filter((row) => row.game.leagueKey === "NBA" || row.game.leagueKey === "MLB")
    .sort((left, right) => {
      const leftTier = tierRank(decisionTier(left));
      const rightTier = tierRank(decisionTier(right));
      if (leftTier !== rightTier) return rightTier - leftTier;
      return Math.abs(winLean(right.projection).edge) - Math.abs(winLean(left.projection).edge);
    })
    .slice(0, 10);

  if (!ordered.length) {
    return <EmptyState title="No NBA or MLB sims available" description="The scoreboard providers did not return an active NBA or MLB slate right now." />;
  }

  return (
    <Card className="surface-panel overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-semibold text-white">Priority queue</div>
        <div className="mt-1 text-xs text-slate-500">Only the first decisions worth checking. Open the league workspace for the full board.</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
            <tr>
              <th className="px-3 py-2">Game</th>
              <th className="px-3 py-2">League</th>
              <th className="px-3 py-2">Lean</th>
              <th className="px-3 py-2 text-right">Win%</th>
              <th className="px-3 py-2 text-right">Edge</th>
              <th className="px-3 py-2 text-right">Conf.</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2 text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => {
              const lean = winLean(row.projection);
              const tier = decisionTier(row);
              const href = row.game.leagueKey === "NBA" ? `/sim/nba/${encodeURIComponent(row.game.id)}` : `/sim/mlb/${encodeURIComponent(row.game.id)}`;
              return (
                <tr key={`${row.game.leagueKey}:${row.game.id}`} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div>
                    <div className="mt-1 flex gap-2 text-[10px] text-slate-500"><span>{formatTime(row.game.startTime)}</span><Badge tone={tone(row.game.status)}>{row.game.status}</Badge></div>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{row.game.leagueKey}</td>
                  <td className="px-3 py-3 text-slate-200">{lean.team}</td>
                  <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(lean.pct)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{row.game.leagueKey === "MLB" ? plus(row.projection.mlbIntel?.homeEdge) : pct(Math.abs(lean.edge), 1)}</td>
                  <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(confidence(row), 0)}</td>
                  <td className="px-3 py-3"><Badge tone={tierTone(tier)}>{tier.toUpperCase()}</Badge></td>
                  <td className="px-3 py-3 text-right"><Link href={href} className="rounded-full border border-sky-400/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">Open</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function SimHubPage() {
  const [sections, mlModel, calibration, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: "ALL", gamesByLeague: {}, maxScoreboardGames: null }),
    getCachedMlbMlModel(),
    getCachedMlbCalibrationConformal(),
    buildMlbEdges().catch(() => ({ edges: [] as EdgeResult[] }))
  ]);
  const games = flatten(sections).filter((game) => game.leagueKey === "NBA" || game.leagueKey === "MLB");
  const edgeByGame = new Map((edgeData.edges ?? []).map((edge) => [edge.gameId, edge]));
  const rows: Row[] = await Promise.all(games.map(async (game) => ({ game, projection: await buildSimProjection(game), edge: edgeByGame.get(game.id) ?? null })));
  const nbaRows = leagueRows(rows, "NBA");
  const mlbRows = leagueRows(rows, "MLB");
  const attack = rows.filter((row) => decisionTier(row) === "attack").length;
  const watch = rows.filter((row) => decisionTier(row) === "watch").length;
  const nbaPlayers = nbaRows.reduce((total, row) => total + (row.projection.nbaIntel?.playerStatProjections.length ?? 0), 0);
  const mlbMatchedLines = mlbRows.filter((row) => row.edge?.market).length;
  const realMlbData = mlbRows.filter((row) => row.projection.mlbIntel?.dataSource && !row.projection.mlbIntel.dataSource.includes("synthetic")).length;

  const workspaces: WorkspaceConfig[] = [
    {
      href: "/sim/nba",
      eyebrow: "NBA workspace",
      title: "Player Sims + Side Queue",
      description: "Calibrated player box scores, prop drilldowns, confidence gates, and side reads in one tight board.",
      primaryMetric: `${nbaRows.length} games`,
      secondaryMetric: `${nbaPlayers} players`,
      action: "Open NBA desk"
    },
    {
      href: "/sim/mlb",
      eyebrow: "MLB workspace",
      title: "Sides + Totals Edge Desk",
      description: "Moneyline, total edge, pitcher/bullpen factors, market-line matching, and MLB Data API player-model status.",
      primaryMetric: `${mlbRows.length} games`,
      secondaryMetric: `${mlbMatchedLines}/${mlbRows.length} lines`,
      action: "Open MLB desk"
    },
    {
      href: "/sim/players?league=NBA",
      eyebrow: "NBA drilldown",
      title: "Projected Player Box Scores",
      description: "Use this when the player prop board needs exact points, boards, assists, threes, PRA, floor and ceiling.",
      primaryMetric: `${nbaPlayers} rows`,
      secondaryMetric: "calibrated",
      action: "Open player board"
    }
  ];

  return (
    <div className="space-y-6">
      <section className="surface-panel-strong overflow-hidden p-6">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <div className="section-kicker">Simulation Command Desk</div>
            <h1 className="mt-3 max-w-5xl font-display text-4xl font-semibold tracking-tight text-white">Pick the right workspace, then make the decision fast.</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">The hub is now a routing layer, not a dump. NBA and MLB have separate boards because the betting questions are different: NBA needs player/prop sims; MLB needs sides, totals, pitching, bullpen, and market confirmation.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Tile label="Actionable" value={`${attack}/${watch}`} sub="Attack / watch signals" />
            <Tile label="MLB Data" value={`${realMlbData}/${mlbRows.length}`} sub={`ML rows ${mlModel?.rows ?? 0}${calibration?.ok ? ` · ECE ${calibration.ece.toFixed(3)}` : ""}`} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {workspaces.map((workspace) => <WorkspaceCard key={workspace.href} config={workspace} />)}
      </section>

      <section className="grid gap-4">
        <SectionTitle title="First decisions to check" description="A compact, ranked queue across NBA and MLB. This is the triage layer; league desks carry the full detail." />
        <PriorityTable rows={rows} />
      </section>
    </div>
  );
}
