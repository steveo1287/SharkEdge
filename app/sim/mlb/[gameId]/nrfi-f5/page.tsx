import { notFound } from "next/navigation";

import { FranchiseStat, FranchiseTable } from "@/components/sim/mlb-franchise-primitives";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { SimSignalCard, SimWorkspaceHeader } from "@/components/sim/sim-ui";
import { buildMlbCanonicalGameState } from "@/services/simulation/mlb-canonical-game-state";
import { getMlbFranchiseGameCenter } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ gameId: string }> };

function pct(value: number | null | undefined, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

function num(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function Bar({ left, right, leftPct }: { left: string; right: string; leftPct: number | null }) {
  const safeLeft = typeof leftPct === "number" && Number.isFinite(leftPct) ? Math.max(0, Math.min(100, leftPct * 100)) : 50;
  return (
    <div>
      <div className="mb-2 flex justify-between text-[10px] uppercase tracking-[0.14em] text-slate-500"><span>{left}</span><span>{right}</span></div>
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-800"><div className="bg-cyan-400" style={{ width: `${safeLeft}%` }} /><div className="bg-violet-400" style={{ width: `${100 - safeLeft}%` }} /></div>
    </div>
  );
}

export default async function MlbNrfiF5Page({ params }: PageProps) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) notFound();
  const state = buildMlbCanonicalGameState(game.projection);
  const view = {
    nrfiPct: state.nrfi.nrfiProbability,
    yrfiPct: state.nrfi.yrfiProbability,
    f5Total: state.firstFive.totalRuns,
    f5AwayRuns: state.firstFive.awayRuns,
    f5HomeRuns: state.firstFive.homeRuns,
    f5Over45Pct: Math.max(0.12, Math.min(0.88, 0.5 + (state.firstFive.totalRuns - 4.5) * 0.12)),
    f5AwayWinPct: state.firstFive.awayWinProbability,
    f5HomeWinPct: state.firstFive.homeWinProbability,
    f5TiePct: state.firstFive.tieProbability,
    innings: state.innings.slice(0, 5).map((row) => ({ ...row, noRunPct: row.noRunProbability }))
  };
  return (
    <div className="space-y-5">
      <SimWorkspaceHeader eyebrow="MLB Game Center" title="NRFI / F5" description={`${state.awayTeam} @ ${state.homeTeam} - canonical first inning and first five view`} actions={[{ href: `/sim/mlb/${encodeURIComponent(game.gameId)}`, label: "Summary" }, { href: "/sim/mlb", label: "MLB Board", tone: "primary" }]} />
      <MlbFranchiseTabs gameId={game.gameId} active="nrfi-f5" />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <FranchiseStat label="NRFI" value={pct(view.nrfiPct)} sub={`1st inning xRuns ${num(state.nrfi.firstInningTotalRuns)}`} />
        <FranchiseStat label="YRFI" value={pct(view.yrfiPct)} sub={`${state.nrfi.side} canonical lean`} />
        <FranchiseStat label="F5 Total" value={num(view.f5Total)} sub={`${state.awayTeam} ${num(view.f5AwayRuns)} - ${state.homeTeam} ${num(view.f5HomeRuns)}`} />
        <FranchiseStat label="F5 Over 4.5" value={pct(view.f5Over45Pct)} sub="canonical projection probability" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <SimSignalCard><Bar left="NRFI" right="YRFI" leftPct={view.nrfiPct} /></SimSignalCard>
        <SimSignalCard>
          <Bar left={state.awayTeam} right={state.homeTeam} leftPct={view.f5AwayWinPct} />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <FranchiseStat label="Away F5" value={pct(view.f5AwayWinPct)} />
            <FranchiseStat label="Tie F5" value={pct(view.f5TiePct)} />
            <FranchiseStat label="Home F5" value={pct(view.f5HomeWinPct)} />
          </div>
        </SimSignalCard>
      </section>
      <FranchiseTable title="Canonical Inning Shape" description="Expected runs and no-run probability by inning from the same game state used by moneyline, total, F5, NRFI, and the box-score normalizer.">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.14em] text-slate-600"><tr><th className="px-4 py-3 text-left">Inning</th><th className="px-4 py-3 text-right">Away xRuns</th><th className="px-4 py-3 text-right">Home xRuns</th><th className="px-4 py-3 text-right">Total xRuns</th><th className="px-4 py-3 text-right">No-run %</th></tr></thead>
          <tbody className="divide-y divide-white/[0.06]">{view.innings.map((row) => <tr key={row.inning}><td className="px-4 py-3 text-slate-300">{row.inning}</td><td className="px-4 py-3 text-right font-mono text-cyan-300">{num(row.awayRuns)}</td><td className="px-4 py-3 text-right font-mono text-violet-300">{num(row.homeRuns)}</td><td className="px-4 py-3 text-right font-mono text-white">{num(row.totalRuns)}</td><td className="px-4 py-3 text-right font-mono text-aqua">{pct(row.noRunPct)}</td></tr>)}</tbody>
        </table>
      </FranchiseTable>
    </div>
  );
}
