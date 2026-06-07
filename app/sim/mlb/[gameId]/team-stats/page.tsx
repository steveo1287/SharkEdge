import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-title";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { getMlbFranchiseGameStats, statText, type FranchiseTeamRow } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function one(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function pct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-3">
      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {sub ? <div className="mt-1 text-[0.68rem] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function ActualTeamStats({ team }: { team: FranchiseTeamRow | null }) {
  if (!team) return null;
  return (
    <div className="mt-4 grid grid-cols-3 gap-2">
      <Stat label="R" value={statText(team.stats, ["runs", "R", "score"])} />
      <Stat label="H" value={statText(team.stats, ["hits", "H"])} />
      <Stat label="HR" value={statText(team.stats, ["homeRuns", "HR"])} />
      <Stat label="BB" value={statText(team.stats, ["walks", "BB"])} />
      <Stat label="K" value={statText(team.stats, ["strikeouts", "SO", "K"])} />
      <Stat label="F5" value={statText(team.stats, ["firstFiveRuns", "f5Runs", "runsFirstFive"])} />
    </div>
  );
}

function TeamCard({ label, team, projectedRuns, winPct, f5Runs, actual }: { label: string; team: string; projectedRuns: number; winPct: number; f5Runs?: number | null; actual: FranchiseTeamRow | null }) {
  return (
    <Card className="surface-panel p-5">
      <div className="text-[0.64rem] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 font-display text-3xl font-semibold text-white">{team}</div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Proj R" value={one(projectedRuns)} />
        <Stat label="Win" value={pct(winPct)} />
        <Stat label="F5 R" value={one(f5Runs)} />
      </div>
      <ActualTeamStats team={actual} />
    </Card>
  );
}

function matchActualTeam(actualTeams: FranchiseTeamRow[], label: string, index: number) {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return actualTeams.find((team) => {
    const name = team.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return normalized.includes(name) || name.includes(normalized);
  }) ?? actualTeams[index] ?? null;
}

export default async function MlbTeamStatsPage({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const data = await getMlbFranchiseGameStats(decodedId);
  if (!data) notFound();

  const awayActual = matchActualTeam(data.actualTeams, data.projection.matchup.away, 0);
  const homeActual = matchActualTeam(data.actualTeams, data.projection.matchup.home, 1);
  const inning = data.inningStats;

  return (
    <div className="grid gap-6">
      <MlbFranchiseTabs gameId={decodedId} active="team-stats" />

      <section className="surface-panel-strong p-6">
        <div className="section-kicker">Team stats</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white">
          {data.projection.matchup.away} @ {data.projection.matchup.home}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Franchise-style side-by-side team view. Projections first; actual tracked stats appear when available.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TeamCard
          label="Away team"
          team={data.projection.matchup.away}
          projectedRuns={data.projection.distribution.avgAway}
          winPct={data.projection.distribution.awayWinPct}
          f5Runs={inning?.firstFiveAwayRuns}
          actual={awayActual}
        />
        <TeamCard
          label="Home team"
          team={data.projection.matchup.home}
          projectedRuns={data.projection.distribution.avgHome}
          winPct={data.projection.distribution.homeWinPct}
          f5Runs={inning?.firstFiveHomeRuns}
          actual={homeActual}
        />
      </section>

      {data.actualTeams.length ? null : (
        <EmptyState
          title="No final team stats tracked yet"
          description="Projected team stats are shown. Actual box-score stats will appear after the game is ingested."
        />
      )}
    </div>
  );
}
