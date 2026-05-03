import Link from "next/link";
import { notFound } from "next/navigation";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { Badge } from "@/components/ui/badge";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { calibrateNbaPlayerBoxScore } from "@/services/simulation/nba-box-score-calibration";
import { getNbaFullStatProjectionView } from "@/services/simulation/nba-full-stat-projection-view";
import { buildGuardedSimProjection as buildSimProjection } from "@/services/simulation/guarded-sim-projection-engine";
import { getSimRunDepth } from "@/services/simulation/sim-run-depth";

type FullStatView = Awaited<ReturnType<typeof getNbaFullStatProjectionView>>;
type FullStatPlayer = FullStatView["players"][number];

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

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function findFullStatPlayer(player: { playerName: string; teamName: string }, fullStatPlayers: FullStatPlayer[]) {
  const rowName = normalizeName(player.playerName);
  const rowTeam = normalizeName(player.teamName);
  return fullStatPlayers.find((candidate) => {
    const candidateName = normalizeName(candidate.playerName);
    const candidateTeam = normalizeName(candidate.teamName);
    const nameMatch = rowName === candidateName || rowName.includes(candidateName) || candidateName.includes(rowName);
    const teamMatch = !rowTeam || !candidateTeam || rowTeam === candidateTeam || rowTeam.includes(candidateTeam) || candidateTeam.includes(rowTeam);
    return nameMatch && teamMatch;
  }) ?? null;
}

function statMean(player: FullStatPlayer | null, statKey: string, fallback: number | null | undefined) {
  const stat = player?.stats.find((candidate) => candidate.statKey === statKey);
  return stat?.meanValue ?? fallback ?? null;
}

function statConfidence(player: FullStatPlayer | null, statKey: string, fallback: number | null | undefined) {
  const stat = player?.stats.find((candidate) => candidate.statKey === statKey);
  return stat?.confidence ?? player?.minutes?.confidence ?? fallback ?? null;
}

function statBlockers(player: FullStatPlayer | null) {
  return [...new Set([...(player?.lineupTruth?.blockers ?? []), ...(player?.minutes?.blockers ?? []), ...((player?.stats ?? []).flatMap((stat) => stat.blockers))])];
}

function statWarnings(player: FullStatPlayer | null) {
  return [...new Set([...(player?.lineupTruth?.warnings ?? []), ...(player?.minutes?.warnings ?? []), ...((player?.stats ?? []).flatMap((stat) => stat.warnings))])];
}

function v2Health(players: FullStatPlayer[]) {
  const blocked = players.filter((player) => statBlockers(player).length > 0 || player.lineupTruth?.status === "RED").length;
  const warning = players.filter((player) => !statBlockers(player).length && (statWarnings(player).length > 0 || player.lineupTruth?.status === "YELLOW")).length;
  const status = blocked > 0 ? "RED" : warning > 0 ? "YELLOW" : players.length > 0 ? "GREEN" : "RED";
  const topReason = players.map((player) => statBlockers(player)[0] ?? statWarnings(player)[0]).find(Boolean) ?? "No V2 projection quality issues detected.";
  return { blocked, warning, status, topReason };
}

export default async function NbaGameDetailPage({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const sections = await buildBoardSportSections({ selectedLeague: "NBA", gamesByLeague: {}, maxScoreboardGames: null });
  const game = sections.flatMap((section) => section.scoreboard.map((item) => ({ ...item, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))).find((item) => item.id === decodedId);
  if (!game) notFound();

  const [rawProjection, fullStatView] = await Promise.all([
    buildSimProjection({ ...game, simulationRuns: getSimRunDepth("detail") }),
    getNbaFullStatProjectionView({ eventId: decodedId, includeModelOnly: true, take: 750 })
  ]);
  const fallbackFullStatView = fullStatView.players.length
    ? fullStatView
    : await getNbaFullStatProjectionView({ includeModelOnly: true, take: 1500 });
  const fullStatPlayers = fallbackFullStatView.players;
  const health = v2Health(fullStatPlayers);
  const players = rawProjection.nbaIntel?.playerStatProjections ?? [];
  const projection = rawProjection.nbaIntel && players.length
    ? { ...rawProjection, nbaIntel: { ...rawProjection.nbaIntel, playerStatProjections: calibrateNbaPlayerBoxScore(players, { awayPoints: rawProjection.distribution.avgAway, homePoints: rawProjection.distribution.avgHome }) } }
    : rawProjection;
  const leanHome = projection.distribution.homeWinPct >= projection.distribution.awayWinPct;
  const lean = leanHome ? projection.matchup.home : projection.matchup.away;
  const leanPct = Math.max(projection.distribution.homeWinPct, projection.distribution.awayWinPct);
  const topPlayers = [...(projection.nbaIntel?.playerStatProjections ?? [])]
    .sort((left, right) => {
      const rightFull = findFullStatPlayer(right, fullStatPlayers);
      const leftFull = findFullStatPlayer(left, fullStatPlayers);
      const rightScore = (statMean(rightFull, "player_points", right.projectedPoints) ?? 0) + (statMean(rightFull, "player_rebounds", right.projectedRebounds) ?? 0) * 0.45 + (statMean(rightFull, "player_assists", right.projectedAssists) ?? 0) * 0.55;
      const leftScore = (statMean(leftFull, "player_points", left.projectedPoints) ?? 0) + (statMean(leftFull, "player_rebounds", left.projectedRebounds) ?? 0) * 0.45 + (statMean(leftFull, "player_assists", left.projectedAssists) ?? 0) * 0.55;
      return rightScore - leftScore;
    })
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="NBA Game Sim"
        title={`${projection.matchup.away} @ ${projection.matchup.home}`}
        description={`${formatTime(game.startTime)} · ${projection.read}`}
        actions={[
          { href: "/sim/nba", label: "NBA Board" },
          { href: `/sim/players?league=NBA&gameId=${encodeURIComponent(decodedId)}`, label: "Player Box Score", tone: "primary" },
          { href: "/api/simulation/nba/full-stat-health", label: "V2 Health API" }
        ]}
      >
        <div className="flex flex-wrap gap-2"><SimDecisionBadge tier={projection.nbaIntel?.tier ?? "pass"} /><Badge tone="brand">FULL-STAT V2</Badge><Badge tone={health.status === "RED" ? "danger" : health.status === "YELLOW" ? "premium" : "success"}>{health.status}</Badge></div>
      </SimWorkspaceHeader>

      <section className="grid gap-3 md:grid-cols-6">
        <SimMetricTile label="Lean" value={lean} sub={pct(leanPct)} emphasis="strong" />
        <SimMetricTile label="Score" value={`${num(projection.distribution.avgAway)} / ${num(projection.distribution.avgHome)}`} sub="Away / Home" />
        <SimMetricTile label="Confidence" value={pct(projection.nbaIntel?.confidence, 0)} sub="Governor" />
        <SimMetricTile label="V2 health" value={health.status} sub={`${health.blocked} blocked · ${health.warning} warning`} />
        <SimMetricTile label="V2 rows" value={String(fullStatPlayers.length)} sub="Full-stat projection players" />
        <SimMetricTile label="Players" value={String(projection.nbaIntel?.playerStatProjections.length ?? 0)} sub={projection.nbaIntel?.dataSource ?? "no NBA intel"} />
      </section>

      {health.status !== "GREEN" ? <SimSignalCard className="border-red-400/25 bg-red-500/[0.045]"><div className="text-sm font-semibold text-white">V2 projection health is {health.status}</div><div className="mt-1 text-xs text-slate-400">{health.topReason}</div></SimSignalCard> : null}

      <SimTableShell title="Top full-stat V2 player sims" description="Uses stored full-stat projections where available, including STL/BLK/PRA and minutes risk. Falls back to live sim rows if a V2 player row is missing.">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400"><tr><th className="px-3 py-2">Player</th><th className="px-3 py-2 text-right">Min</th><th className="px-3 py-2 text-right">Pts</th><th className="px-3 py-2 text-right">Reb</th><th className="px-3 py-2 text-right">Ast</th><th className="px-3 py-2 text-right">3PM</th><th className="px-3 py-2 text-right">STL</th><th className="px-3 py-2 text-right">BLK</th><th className="px-3 py-2 text-right">PRA</th><th className="px-3 py-2 text-right">Conf</th></tr></thead>
          <tbody>{topPlayers.map((player) => {
            const fullStat = findFullStatPlayer(player, fullStatPlayers);
            const points = statMean(fullStat, "player_points", player.projectedPoints);
            const rebounds = statMean(fullStat, "player_rebounds", player.projectedRebounds);
            const assists = statMean(fullStat, "player_assists", player.projectedAssists);
            const threes = statMean(fullStat, "player_threes", player.projectedThrees);
            const steals = statMean(fullStat, "player_steals", null);
            const blocks = statMean(fullStat, "player_blocks", null);
            const pra = statMean(fullStat, "player_pra", (points ?? 0) + (rebounds ?? 0) + (assists ?? 0));
            const blockers = statBlockers(fullStat);
            return (
              <tr key={`${player.teamName}:${player.playerName}`} className={blockers.length ? "border-b border-red-400/15 bg-red-500/[0.035] last:border-none" : "border-b border-white/5 last:border-none"}>
                <td className="px-3 py-2 font-semibold text-white"><div className="flex items-center gap-2">{player.playerName}{fullStat ? <Badge tone="brand">V2</Badge> : null}{blockers.length ? <Badge tone="danger">BLOCK</Badge> : null}</div><div className="text-[10px] text-slate-500">{player.teamName}</div><div className={blockers.length ? "mt-1 text-[10px] text-red-200/75" : "mt-1 text-[10px] text-slate-500"}>{fullStat?.minutes ? `${fullStat.minutes.role ?? "role"} · range ${num(fullStat.minutes.floorMinutes)}-${num(fullStat.minutes.ceilingMinutes)} · stable ${pct(fullStat.minutes.rotationStability, 0)}` : "legacy sim row"}</div></td>
                <td className="px-3 py-2 text-right font-mono text-slate-200">{num(fullStat?.minutes?.projectedMinutes ?? fullStat?.projectedMinutes ?? player.projectedMinutes)}</td><td className="px-3 py-2 text-right font-mono text-sky-200">{num(points)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(rebounds)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(assists)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(threes)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(steals)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(blocks)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{num(pra)}</td><td className="px-3 py-2 text-right font-mono text-slate-200">{pct(statConfidence(fullStat, "player_points", player.confidence), 0)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </SimTableShell>
    </div>
  );
}
