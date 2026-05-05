import { notFound } from "next/navigation";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMlbEdges } from "@/services/simulation/mlb-edge-detector";
import { buildMainSimProjection as buildSimProjection, mainBrainLabel } from "@/services/simulation/main-sim-brain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };
type EdgeResult = Awaited<ReturnType<typeof buildMlbEdges>>["edges"][number];

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

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function winLean(projection: Awaited<ReturnType<typeof buildSimProjection>>) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home }
    : { team: projection.matchup.away, pct: away };
}

function MarketPanel({ edge }: { edge?: EdgeResult | null }) {
  if (!edge?.market) {
    return <SimSignalCard className="border-amber-400/20 bg-amber-500/[0.055] text-sm text-amber-100">No matched sportsbook line for this game yet. The model read is still available, but market edge should be treated as incomplete.</SimSignalCard>;
  }
  return (
    <SimSignalCard>
      <div className="text-sm font-semibold text-white">Matched market</div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <SimMetricTile label="Home ML" value={String(edge.market.homeMoneyline ?? "--")} sub={edge.edges.homeMoneyline == null ? "No edge" : `edge ${plus(edge.edges.homeMoneyline)}`} />
        <SimMetricTile label="Away ML" value={String(edge.market.awayMoneyline ?? "--")} sub={edge.edges.awayMoneyline == null ? "No edge" : `edge ${plus(edge.edges.awayMoneyline)}`} />
        <SimMetricTile label="Total" value={String(edge.market.total ?? "--")} sub={edge.edges.totalRuns == null ? "No edge" : `runs edge ${plus(edge.edges.totalRuns)}`} emphasis="strong" />
        <SimMetricTile label="Book" value={edge.market.sportsbook ?? "unknown"} sub={edge.signal ? `${edge.signal.market} · ${edge.signal.strength}` : "no signal"} />
      </div>
    </SimSignalCard>
  );
}

export default async function MlbGameDetailPage({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const [sections, edgeData] = await Promise.all([
    buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null }),
    buildMlbEdges().catch(() => ({ edges: [] as EdgeResult[] }))
  ]);
  const game = sections.flatMap((section) => section.scoreboard.map((item) => ({ ...item, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))).find((item) => item.id === decodedId);
  if (!game) notFound();

  const projection = await buildSimProjection(game);
  const edge = edgeData.edges.find((item) => item.gameId === decodedId) ?? null;
  const lean = winLean(projection);
  const factors = [...(projection.mlbIntel?.factors ?? [])].sort((left, right) => Math.abs(right.value) - Math.abs(left.value)).slice(0, 12);
  const governor = projection.mlbIntel?.governor;
  const brain = mainBrainLabel("MLB");

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="MLB Game Sim"
        title={`${projection.matchup.away} @ ${projection.matchup.home}`}
        description={`${formatTime(game.startTime)} · ${brain} · ${projection.read}`}
        actions={[
          { href: "/sim/mlb", label: "MLB Board" },
          { href: "/sim/mlb/v7/live", label: "V8 Live" },
          { href: "/mlb-edge", label: "MLB Edge", tone: "primary" }
        ]}
      >
        <div className="flex flex-wrap gap-2"><SimDecisionBadge tier={governor?.tier ?? "pass"} /></div>
      </SimWorkspaceHeader>

      <section className="grid gap-3 md:grid-cols-5">
        <SimMetricTile label="Lean" value={lean.team} sub={pct(lean.pct)} emphasis="strong" />
        <SimMetricTile label="Score" value={`${num(projection.distribution.avgAway)} / ${num(projection.distribution.avgHome)}`} sub="Away / Home" />
        <SimMetricTile label="Home edge" value={plus(projection.mlbIntel?.homeEdge)} sub="Model signal" />
        <SimMetricTile label="Total" value={num(projection.mlbIntel?.projectedTotal)} sub="Projected runs" />
        <SimMetricTile label="Confidence" value={pct(governor?.confidence, 0)} sub={governor?.noBet ? "No-bet active" : "Eligible"} />
      </section>

      <MarketPanel edge={edge} />

      <SimTableShell title="Top MLB factors" description="Primary model drivers ranked by absolute impact.">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Factor</th><th className="px-3 py-2 text-right">Value</th></tr></thead>
          <tbody>{factors.map((factor) => <tr key={factor.label} className="border-b border-white/5 last:border-none"><td className="px-3 py-2 text-slate-200">{factor.label}</td><td className={factor.value >= 0 ? "px-3 py-2 text-right font-mono text-emerald-300" : "px-3 py-2 text-right font-mono text-red-300"}>{plus(factor.value)}</td></tr>)}</tbody>
        </table>
      </SimTableShell>

      <SimSignalCard>
        <div className="text-sm font-semibold text-white">Governor notes</div>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          {(governor?.reasons ?? [projection.read]).map((reason, index) => <div key={index} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">{reason}</div>)}
        </div>
      </SimSignalCard>
    </div>
  );
}
