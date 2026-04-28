import Link from "next/link";
import { notFound } from "next/navigation";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { calibrateNbaPlayerBoxScore } from "@/services/simulation/nba-box-score-calibration";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default async function NbaGameDetailPage({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const sections = await buildBoardSportSections({ selectedLeague: "NBA", gamesByLeague: {}, maxScoreboardGames: null });
  const game = sections.flatMap((section) => section.scoreboard.map((item) => ({ ...item, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))).find((item) => item.id === decodedId);
  if (!game) notFound();

  const rawProjection = await buildSimProjection(game);
  const players = rawProjection.nbaIntel?.playerStatProjections ?? [];
  const projection = rawProjection.nbaIntel && players.length
    ? { ...rawProjection, nbaIntel: { ...rawProjection.nbaIntel, playerStatProjections: calibrateNbaPlayerBoxScore(players, { awayPoints: rawProjection.distribution.avgAway, homePoints: rawProjection.distribution.avgHome }) } }
    : rawProjection;
  const leanHome = projection.distribution.homeWinPct >= projection.distribution.awayWinPct;
  const lean = leanHome ? projection.matchup.home : projection.matchup.away;
  const leanPct = Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct);
  const topPlayers = [...(projection.nbaIntel?.playerStatProjections ?? [])]
    .sort((left, right) => right.projectedPoints + right.projectedRebounds * 0.45 + right.projectedAssists * 0.55 - (left.projectedPoints + left.projectedRebounds * 0.45 + left.projectedAssists * 0.55))
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="NBA Game Sim"
        title={`${projection.matchup.away} @ ${projection.matchup.home}`}
        description={`${formatTime(game.startTime)} · ${projection.read}`}
        actions={[
          { href: "/sim/nba", label: "NBA Board" },
          { href: `/sim/players?league=NBA&gameId=${encodeURIComponent(decodedId)}`, label: "Player Box Score", tone: "primary" }
        ]}
      >
        <div className="flex flex-wrap gap-2"><SimDecisionBadge tier={projection.nbaIntel?.tier ?? "pass"} /></div>
      </SimWorkspaceHeader>

      <section className="grid gap-3 md:grid-cols-5">
        <SimMetricTile label="Lean" value={lean} sub={pct(leanPct)} emphasis="strong" />
        <SimMetricTile label="Score" value={`${num(projection.distribution.avgAway)} / ${num(projection.distribution.avgHome)}`} sub="Away / Home" />
        <SimMetricTile label="Confidence" value={pct(projection.nbaIntel?.confidence, 0)} sub="Governor" />
        <SimMetricTile label="Total" value={num(projection.nbaIntel?.projectedTotal)} sub="Projected" />
        <SimMetricTile label="Players" value={String(projection.nbaIntel?.playerStatProjections.length ?? 0)} sub={projection.nbaIntel?.dataSource ?? "no NBA intel"} />
      </section>

      <SimTableShell title="Top calibrated player sims" description="Highest projected players after the team-total calibration pass.">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Player</th><th className="px-3 py-2 text-right">Min</th><th className="px-3 py-2 text-right">Pts</th><th className="px-3 py-2 text-right">Reb</th><th className="px-3 py-2 text-right">Ast</th><th className="px-3 py-2 text-right">Conf</th></tr></thead>
          <tbody>{topPlayers.map((player) => <tr key={`${player.teamName}:${player.playerName}`} className="border-b border-white/5 last:border-none"><td className="px-3 py-2 font-semibold text-white">{player.playerName}<div className="text-[10px] text-slate-500">{player.teamName}</div></td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(player.projectedMinutes)}</td><td className="px-3 py-2 text-right font-mono text-sky-200">{num(player.projectedPoints)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(player.projectedRebounds)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(player.projectedAssists)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{pct(player.confidence, 0)}</td></tr>)}</tbody>
        </table>
      </SimTableShell>
    </div>
  );
}
