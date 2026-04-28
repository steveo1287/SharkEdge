import Link from "next/link";

import {
  SimDecisionBadge,
  SimMetricTile,
  SimSignalCard,
  SimStatusBadge,
  SimTableShell,
  SimWorkspaceHeader
} from "@/components/sim/sim-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { calibrateNbaPlayerBoxScore } from "@/services/simulation/nba-box-score-calibration";
import { buildGuardedSimProjection as buildSimProjection } from "@/services/simulation/guarded-sim-projection-engine";
import type { BoardSportSectionView, LeagueKey } from "@/lib/types/domain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type Projection = Awaited<ReturnType<typeof buildSimProjection>>;
type PlayerProjection = NonNullable<Projection["nbaIntel"]>["playerStatProjections"][number];
type Row = { game: SimGame; projection: Projection };
type Decision = "attack" | "watch" | "pass";

function flatten(sections: BoardSportSectionView[]): SimGame[] {
  return sections.flatMap((section) =>
    section.leagueKey === "NBA"
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

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function tierRank(tier: Decision | undefined) {
  if (tier === "attack") return 3;
  if (tier === "watch") return 2;
  return 1;
}

function withCalibratedPlayers(projection: Projection): Projection {
  const players = projection.nbaIntel?.playerStatProjections ?? [];
  if (!projection.nbaIntel || !players.length) return projection;
  return {
    ...projection,
    nbaIntel: {
      ...projection.nbaIntel,
      playerStatProjections: calibrateNbaPlayerBoxScore(players, {
        awayPoints: projection.distribution.avgAway,
        homePoints: projection.distribution.avgHome
      })
    }
  };
}

function winLean(projection: Projection) {
  const home = projection.distribution.homeWinPct;
  const away = projection.distribution.awayWinPct;
  return home >= away
    ? { team: projection.matchup.home, pct: home, edge: home - away }
    : { team: projection.matchup.away, pct: away, edge: away - home };
}

function topPlayers(row: Row) {
  return [...(row.projection.nbaIntel?.playerStatProjections ?? [])]
    .sort((left, right) => right.projectedPoints + right.projectedRebounds * 0.45 + right.projectedAssists * 0.55 - (left.projectedPoints + left.projectedRebounds * 0.45 + left.projectedAssists * 0.55))
    .slice(0, 3);
}

function topPlayerProp(players: PlayerProjection[]) {
  return players
    .flatMap((player) => Object.entries(player.propHitProbabilities).map(([stat, prop]) => ({ player, stat, prop })))
    .filter((item) => item.prop)
    .sort((left, right) => Math.abs(right.prop.edgeToLine) - Math.abs(left.prop.edgeToLine))[0] ?? null;
}

function ActionTable({ rows }: { rows: Row[] }) {
  const ordered = [...rows].sort((left, right) => {
    const leftTier = tierRank(left.projection.nbaIntel?.tier);
    const rightTier = tierRank(right.projection.nbaIntel?.tier);
    if (leftTier !== rightTier) return rightTier - leftTier;
    return Math.abs(winLean(right.projection).edge) - Math.abs(winLean(left.projection).edge);
  });

  return (
    <SimTableShell title="NBA decision queue" description="Sorted by governor tier, win-probability gap, and player-sim availability.">
      <table className="min-w-full text-left text-xs">
        <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400">
          <tr>
            <th className="px-3 py-2">Matchup</th>
            <th className="px-3 py-2">Lean</th>
            <th className="px-3 py-2 text-right">Win%</th>
            <th className="px-3 py-2 text-right">Conf.</th>
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">Top player</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Open</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => {
            const lean = winLean(row.projection);
            const tier = row.projection.nbaIntel?.tier ?? "pass";
            const top = topPlayers(row)[0];
            const playersHref = `/sim/players?league=NBA&gameId=${encodeURIComponent(row.game.id)}${top ? `&player=${encodeURIComponent(top.playerName)}` : ""}`;
            return (
              <tr key={row.game.id} className="border-b border-white/5 last:border-none">
                <td className="px-3 py-3">
                  <div className="font-semibold text-white">{row.projection.matchup.away} @ {row.projection.matchup.home}</div>
                  <div className="mt-1 flex gap-2 text-[10px] text-slate-500"><span>{formatTime(row.game.startTime)}</span><SimStatusBadge status={row.game.status} /></div>
                </td>
                <td className="px-3 py-3 text-slate-200">{lean.team}</td>
                <td className="px-3 py-3 text-right font-mono text-sky-200">{pct(lean.pct)}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{pct(row.projection.nbaIntel?.confidence, 0)}</td>
                <td className="px-3 py-3"><SimDecisionBadge tier={tier} /></td>
                <td className="px-3 py-3 text-slate-200">{top ? `${top.playerName} ${num(top.projectedPoints)} pts` : "--"}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-200">{num(row.projection.nbaIntel?.projectedTotal)}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={playersHref} className="rounded-full border border-sky-400/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-200">Players</Link>
                    <Link href={`/sim/nba/${encodeURIComponent(row.game.id)}`} className="rounded-full bg-sky-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-950">Game</Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </SimTableShell>
  );
}

function PlayerSignalBoard({ rows }: { rows: Row[] }) {
  const signals = rows
    .flatMap((row) => topPlayers(row).map((player) => ({ row, player })))
    .sort((left, right) => right.player.confidence - left.player.confidence)
    .slice(0, 12);

  if (!signals.length) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {signals.map(({ row, player }) => {
        const prop = topPlayerProp([player]);
        const href = `/sim/players?league=NBA&gameId=${encodeURIComponent(row.game.id)}&player=${encodeURIComponent(player.playerName)}`;
        return (
          <Link key={`${row.game.id}:${player.playerName}`} href={href}>
            <SimSignalCard className="h-full transition hover:border-sky-400/35 hover:bg-sky-500/[0.055]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{player.playerName}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{player.teamName} · {row.projection.matchup.away} @ {row.projection.matchup.home}</div>
                </div>
                <SimDecisionBadge tier={row.projection.nbaIntel?.tier ?? "pass"} />
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                <div><div className="font-mono text-lg text-white">{num(player.projectedPoints)}</div><div className="text-slate-500">PTS</div></div>
                <div><div className="font-mono text-lg text-white">{num(player.projectedRebounds)}</div><div className="text-slate-500">REB</div></div>
                <div><div className="font-mono text-lg text-white">{num(player.projectedAssists)}</div><div className="text-slate-500">AST</div></div>
                <div><div className="font-mono text-lg text-white">{pct(player.confidence, 0)}</div><div className="text-slate-500">CONF</div></div>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-xs text-slate-300">
                {prop ? `${prop.prop.recommendedSide} ${prop.stat} ${num(prop.prop.line)} | edge ${num(prop.prop.edgeToLine)}` : player.whyLikely[0] ?? "Role and matchup context support the median."}
              </div>
            </SimSignalCard>
          </Link>
        );
      })}
    </div>
  );
}

export default async function NbaSimPage() {
  const sections = await buildBoardSportSections({ selectedLeague: "NBA", gamesByLeague: {}, maxScoreboardGames: null });
  const games = flatten(sections);
  const rows: Row[] = await Promise.all(
    games.map(async (game) => ({ game, projection: withCalibratedPlayers(await buildSimProjection(game)) }))
  );
  const attack = rows.filter((row) => row.projection.nbaIntel?.tier === "attack").length;
  const watch = rows.filter((row) => row.projection.nbaIntel?.tier === "watch").length;
  const pass = rows.filter((row) => !row.projection.nbaIntel || row.projection.nbaIntel.tier === "pass").length;
  const playerRows = rows.reduce((total, row) => total + (row.projection.nbaIntel?.playerStatProjections.length ?? 0), 0);
  const realSourceRows = rows.filter((row) => row.projection.nbaIntel?.dataSource && !row.projection.nbaIntel.dataSource.includes("synthetic")).length;

  return (
    <div className="space-y-6">
      <SimWorkspaceHeader
        eyebrow="NBA Sim Workspace"
        title="Side reads, calibrated player sims, and prop drilldowns without the scroll tax."
        description="NBA is now its own workspace: governor tier first, win lean second, player box-score projections third. Open only the matchups worth deeper work."
        actions={[
          { href: "/sim", label: "Sim Hub" },
          { href: "/sim/players?league=NBA", label: "Player Matchups", tone: "primary" },
          { href: "/props?league=NBA", label: "NBA Props" }
        ]}
      />

      <section className="grid gap-3 md:grid-cols-5">
        <SimMetricTile label="Games" value={String(rows.length)} sub="NBA slate" />
        <SimMetricTile label="Attack" value={String(attack)} sub="Governor cleared" emphasis="strong" />
        <SimMetricTile label="Watch" value={String(watch)} sub="Conditional" />
        <SimMetricTile label="Pass" value={String(pass)} sub="Filtered out" emphasis="muted" />
        <SimMetricTile label="Players" value={String(playerRows)} sub={`${realSourceRows}/${rows.length} real-source games`} />
      </section>

      {rows.length ? (
        <>
          <section className="grid gap-4">
            <SectionTitle title="Decision queue" description="One table for the slate: side lean, confidence, tier, total, and the first player to inspect." />
            <ActionTable rows={rows} />
          </section>

          <section className="grid gap-4">
            <SectionTitle title="Player signal board" description="Top calibrated player sims across the slate. Use this for prop triage, not endless card scrolling." />
            <PlayerSignalBoard rows={rows} />
          </section>
        </>
      ) : (
        <EmptyState title="No NBA games available" description="The scoreboard provider did not return active NBA games for the current slate." />
      )}
    </div>
  );
}
