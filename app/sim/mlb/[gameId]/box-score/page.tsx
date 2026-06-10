import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { FranchiseEmptyState, FranchiseTable } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimWorkspaceHeader } from "@/components/sim/sim-ui";
import {
  normalizeMlbFranchiseHitterRows,
  normalizeMlbFranchisePitcherRows,
  resolveMlbSimScoreTargets
} from "@/services/simulation/mlb-franchise-boxscore-normalizer";
import { buildSimulatedFranchiseHitters, buildSimulatedFranchisePitchers } from "@/services/simulation/mlb-franchise-sim-boxscore";
import { getMlbFranchiseGameCenter, type HitterProjection, type PitcherProjection } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };
type RosterPlayer = { id: string; name: string; position: string | null };

function num(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function sum<T>(rows: T[], read: (row: T) => number | null | undefined) {
  return rows.reduce((acc, row) => acc + (read(row) ?? 0), 0);
}

function hasNine(rows: HitterProjection[]) {
  return rows.length >= 9;
}

function hasStaff(rows: PitcherProjection[]) {
  return rows.length >= 2 && sum(rows, (row) => row.outs) >= 24;
}

function simStarter(row: PitcherProjection | null): (PitcherProjection & { actual: null }) | null {
  if (!row) return null;
  return { ...row, actual: null };
}

async function roster(teamId: string | null): Promise<RosterPlayer[]> {
  if (!teamId) return [];
  return prisma.player.findMany({
    where: { teamId },
    select: { id: true, name: true, position: true },
    orderBy: { name: "asc" }
  });
}

function WarningBox({ warnings }: { warnings: string[] }) {
  return (
    <section className="rounded-[1.25rem] border border-amber-400/20 bg-amber-400/[0.045] p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Box-score projection status</div>
      <div className="mt-2 grid gap-1 text-xs leading-5 text-amber-100/85">
        {warnings.map((warning) => <p key={warning}>• {warning}</p>)}
      </div>
    </section>
  );
}

function TeamTotalsTable({ awayHitters, homeHitters, awayPitchers, homePitchers, awayName, homeName }: {
  awayHitters: HitterProjection[];
  homeHitters: HitterProjection[];
  awayPitchers: PitcherProjection[];
  homePitchers: PitcherProjection[];
  awayName: string;
  homeName: string;
}) {
  const rows = [
    { name: awayName, hitters: awayHitters, pitchers: homePitchers },
    { name: homeName, hitters: homeHitters, pitchers: awayPitchers }
  ];
  return (
    <FranchiseTable title="Sim Team Box Score · PA-fixed v4" description="Plate appearances are constrained from baseball events: outs + hits + walks/misc runners. Team totals reconcile to the simulated final score.">
      <table className="min-w-[920px] w-full text-sm">
        <thead className="bg-cyan-400/[0.04] text-[10px] uppercase tracking-[0.14em] text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left">Team</th>
            <th className="px-3 py-3 text-right">R</th>
            <th className="px-3 py-3 text-right">H</th>
            <th className="px-3 py-3 text-right">TB</th>
            <th className="px-3 py-3 text-right">HR</th>
            <th className="px-3 py-3 text-right">PA</th>
            <th className="px-3 py-3 text-right">Bat K</th>
            <th className="px-3 py-3 text-right">Opp K</th>
            <th className="px-3 py-3 text-right">Opp ER</th>
            <th className="px-3 py-3 text-right">Opp BB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.runs), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.hits), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.totalBases), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.homeRuns), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.plateAppearances), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.hitters, (item) => item.strikeouts), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.pitchers, (item) => item.strikeouts), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.pitchers, (item) => item.earnedRuns), 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(sum(row.pitchers, (item) => item.walks), 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FranchiseTable>
  );
}

function HitterTable({ title, rows }: { title: string; rows: HitterProjection[] }) {
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No hitter rows are available yet for this team." />;
  return (
    <FranchiseTable title={title} description="Simulated hitter lines are normalized to the team score and realistic PA totals.">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <tr><th className="px-4 py-3 text-left">Player</th><th className="px-3 py-3 text-right">Order</th><th className="px-3 py-3 text-right">PA</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">TB</th><th className="px-3 py-3 text-right">HR</th><th className="px-3 py-3 text-right">R</th><th className="px-3 py-3 text-right">RBI</th><th className="px-3 py-3 text-right">K</th><th className="px-3 py-3 text-right">SB chance</th></tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr key={`${row.teamSide}:${row.playerId}`}>
              <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{row.battingOrder ?? "--"}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.plateAppearances, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hits, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.totalBases, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.runs, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.rbi, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-aqua">{num((row.stolenBaseChance ?? 0) * 100, 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FranchiseTable>
  );
}

function PitcherTable({ title, rows }: { title: string; rows: PitcherProjection[] }) {
  if (!rows.length) return <FranchiseEmptyState title={`${title} unavailable`} description="No pitcher rows are available yet for this team." />;
  return (
    <FranchiseTable title={title} description="Pitching totals reconcile to the opposing hitter box score.">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <tr><th className="px-4 py-3 text-left">Pitcher</th><th className="px-3 py-3 text-right">IP</th><th className="px-3 py-3 text-right">Outs</th><th className="px-3 py-3 text-right">K</th><th className="px-3 py-3 text-right">ER</th><th className="px-3 py-3 text-right">H</th><th className="px-3 py-3 text-right">BB</th><th className="px-3 py-3 text-right">HR</th></tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => (
            <tr key={`${row.teamSide}:${row.playerId ?? row.name}`}>
              <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.innings)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.outs, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.strikeouts, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.earnedRuns, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.hitsAllowed, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.walks, 0)}</td>
              <td className="px-3 py-3 text-right font-mono text-slate-300">{num(row.homeRuns, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FranchiseTable>
  );
}

export default async function MlbBoxScorePage({ params }: PageProps) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) notFound();

  const [awayRoster, homeRoster] = await Promise.all([roster(game.teams.away.teamId), roster(game.teams.home.teamId)]);
  const targets = resolveMlbSimScoreTargets({
    awayProjectedRuns: game.teams.away.projectedRuns,
    homeProjectedRuns: game.teams.home.projectedRuns,
    awayName: game.teams.away.name,
    homeName: game.teams.home.name
  });

  const franchiseAwayHitters = buildSimulatedFranchiseHitters({ players: awayRoster, teamName: game.teams.away.name, teamSide: "away", projectedRuns: targets.awayRuns }) as HitterProjection[];
  const franchiseHomeHitters = buildSimulatedFranchiseHitters({ players: homeRoster, teamName: game.teams.home.name, teamSide: "home", projectedRuns: targets.homeRuns }) as HitterProjection[];
  const awaySource = hasNine(franchiseAwayHitters) ? franchiseAwayHitters : game.hitters.away;
  const homeSource = hasNine(franchiseHomeHitters) ? franchiseHomeHitters : game.hitters.home;
  const awayHitters = normalizeMlbFranchiseHitterRows(awaySource, targets.awayRuns) as HitterProjection[];
  const homeHitters = normalizeMlbFranchiseHitterRows(homeSource, targets.homeRuns) as HitterProjection[];

  const franchiseAwayPitchers = buildSimulatedFranchisePitchers({ players: awayRoster, teamName: game.teams.away.name, teamSide: "away", starter: simStarter(game.teams.away.starter ?? game.pitchers.away[0] ?? null), opponentProjectedRuns: targets.homeRuns, opponentProjectedHits: sum(homeHitters, (row) => row.hits) }) as PitcherProjection[];
  const franchiseHomePitchers = buildSimulatedFranchisePitchers({ players: homeRoster, teamName: game.teams.home.name, teamSide: "home", starter: simStarter(game.teams.home.starter ?? game.pitchers.home[0] ?? null), opponentProjectedRuns: targets.awayRuns, opponentProjectedHits: sum(awayHitters, (row) => row.hits) }) as PitcherProjection[];
  const awayPitcherSource = hasStaff(franchiseAwayPitchers) ? franchiseAwayPitchers : game.pitchers.away;
  const homePitcherSource = hasStaff(franchiseHomePitchers) ? franchiseHomePitchers : game.pitchers.home;
  const awayPitchers = normalizeMlbFranchisePitcherRows(awayPitcherSource, homeHitters, targets.homeRuns) as PitcherProjection[];
  const homePitchers = normalizeMlbFranchisePitcherRows(homePitcherSource, awayHitters, targets.awayRuns) as PitcherProjection[];

  const warnings = Array.from(new Set([
    ...game.warnings,
    `Box-score engine v4 live: PA-fixed formula is outs + hits + walks/misc runners.` ,
    `Sim final score target: ${game.teams.away.name} ${targets.awayRuns}, ${game.teams.home.name} ${targets.homeRuns} (${targets.reason}).`,
    `Sources: ${game.teams.away.name} hitters=${awaySource === franchiseAwayHitters ? "franchise-sim" : "linked/cached"}, ${game.teams.home.name} hitters=${homeSource === franchiseHomeHitters ? "franchise-sim" : "linked/cached"}.`
  ]));

  return (
    <div className="space-y-5">
      <SimWorkspaceHeader eyebrow="MLB Game Center" title="Franchise Sim Box Score" description={`${game.teams.away.name} @ ${game.teams.home.name} - ${game.cacheLabel}`} actions={[{ href: `/sim/mlb/${encodeURIComponent(game.gameId)}`, label: "Summary" }, { href: "/sim/mlb", label: "MLB Board", tone: "primary" }]} />
      <MlbFranchiseTabs gameId={game.gameId} active="box-score" />
      <WarningBox warnings={warnings} />
      <TeamTotalsTable awayHitters={awayHitters} homeHitters={homeHitters} awayPitchers={awayPitchers} homePitchers={homePitchers} awayName={game.teams.away.name} homeName={game.teams.home.name} />
      <PitcherTable title="Pitching Staff" rows={[...awayPitchers, ...homePitchers]} />
      <HitterTable title={`${game.teams.away.name} Hitters`} rows={awayHitters} />
      <HitterTable title={`${game.teams.home.name} Hitters`} rows={homeHitters} />
      <FranchiseEmptyState title="Franchise sim mode" description="This page is showing a normalized simulated box score. Official player-game actuals will replace simulated rows once stat rows are linked after settlement." />
    </div>
  );
}
