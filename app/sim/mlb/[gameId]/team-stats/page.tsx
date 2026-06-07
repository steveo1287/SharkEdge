import { notFound } from "next/navigation";

import { FranchiseEmptyState, FranchiseStat, FranchiseTable } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { getMlbFranchiseGameCenter, type FranchiseTeamSummary } from "@/services/simulation/mlb-franchise-game-stats";

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

function TeamCard({ team }: { team: FranchiseTeamSummary }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{team.side === "away" ? "Away Team" : "Home Team"}</div>
      <h2 className="mt-2 font-display text-2xl font-semibold text-white">{team.name}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FranchiseStat label="Projected Runs" value={num(team.projectedRuns)} />
        <FranchiseStat label="Win Chance" value={pct(team.winPct)} />
        <FranchiseStat label="F5 Runs" value={num(team.f5Runs)} />
        <FranchiseStat label="Starter" value={team.starter?.name ?? "TBD"} sub={team.starter ? `${num(team.starter.innings)} IP, ${num(team.starter.strikeouts)} K` : "not tracked yet"} />
      </div>
      {team.actual ? (
        <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-sm text-slate-300 sm:grid-cols-3">
          <div>R: <span className="font-mono text-white">{num(team.actual.runs, 0)}</span></div>
          <div>H: <span className="font-mono text-white">{num(team.actual.hits, 0)}</span></div>
          <div>HR: <span className="font-mono text-white">{num(team.actual.homeRuns, 0)}</span></div>
          <div>BB: <span className="font-mono text-white">{num(team.actual.walks, 0)}</span></div>
          <div>K: <span className="font-mono text-white">{num(team.actual.strikeouts, 0)}</span></div>
          <div>F5: <span className="font-mono text-white">{num(team.actual.f5Runs, 0)}</span></div>
        </div>
      ) : <div className="mt-4"><FranchiseEmptyState title="Actuals not tracked yet" description="Projected team profile is live; official team stat row is not linked to this game yet." /></div>}
    </section>
  );
}

export default async function MlbTeamStatsPage({ params }: PageProps) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) notFound();
  return (
    <div className="space-y-5">
      <SimWorkspaceHeader eyebrow="MLB Game Center" title="Team Stats" description={`${game.teams.away.name} @ ${game.teams.home.name} - ${game.cacheLabel}`} actions={[{ href: `/sim/mlb/${encodeURIComponent(game.gameId)}`, label: "Summary" }, { href: "/sim/mlb", label: "MLB Board", tone: "primary" }]} />
      <MlbFranchiseTabs gameId={game.gameId} active="team-stats" />
      <div className="grid gap-4 lg:grid-cols-2"><TeamCard team={game.teams.away} /><TeamCard team={game.teams.home} /></div>
      <FranchiseTable title="Team Comparison" description="Simple side-by-side projection view.">
        <table className="min-w-[620px] w-full text-sm">
          <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600"><tr><th className="px-4 py-3 text-left">Stat</th><th className="px-4 py-3 text-right">{game.teams.away.name}</th><th className="px-4 py-3 text-right">{game.teams.home.name}</th></tr></thead>
          <tbody className="divide-y divide-white/[0.06]">
            {[
              ["Projected Runs", num(game.teams.away.projectedRuns), num(game.teams.home.projectedRuns)],
              ["Win %", pct(game.teams.away.winPct), pct(game.teams.home.winPct)],
              ["F5 Runs", num(game.teams.away.f5Runs), num(game.teams.home.f5Runs)],
              ["Projected Hits", num(game.lineScore.away.hits), num(game.lineScore.home.hits)]
            ].map(([label, away, home]) => <tr key={label}><td className="px-4 py-3 text-slate-300">{label}</td><td className="px-4 py-3 text-right font-mono text-cyan-300">{away}</td><td className="px-4 py-3 text-right font-mono text-violet-300">{home}</td></tr>)}
          </tbody>
        </table>
      </FranchiseTable>
    </div>
  );
}
