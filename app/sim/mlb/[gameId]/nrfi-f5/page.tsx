import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MlbFranchiseTabs } from "@/components/sim/mlb-franchise-tabs";
import { getMlbFranchiseGameStats } from "@/services/simulation/mlb-franchise-game-stats";

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

function InningRows({ innings }: { innings: NonNullable<Awaited<ReturnType<typeof getMlbFranchiseGameStats>>>["inningStats"]["innings"] }) {
  return (
    <Card className="surface-panel overflow-hidden p-5">
      <div className="mb-4 font-display text-2xl font-semibold text-white">Inning shape</div>
      <div className="grid grid-cols-[0.7fr_repeat(4,1fr)] gap-3 border-b border-white/8 pb-2 text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">
        <div>Inn</div><div>Away</div><div>Home</div><div>Total</div><div>No run</div>
      </div>
      <div className="divide-y divide-white/8">
        {innings.slice(0, 5).map((inning) => (
          <div key={inning.inning} className="grid grid-cols-[0.7fr_repeat(4,1fr)] gap-3 py-3 text-sm text-slate-300">
            <div className="font-semibold text-white">{inning.inning}</div>
            <div>{one(inning.awayExpectedRuns)}</div>
            <div>{one(inning.homeExpectedRuns)}</div>
            <div>{one(inning.expectedRuns)}</div>
            <div>{pct(inning.noRunProbability)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MiniBar({ label, leftLabel, leftValue, rightLabel, rightValue }: { label: string; leftLabel: string; leftValue: number; rightLabel: string; rightValue: number }) {
  const total = Math.max(leftValue + rightValue, 0.0001);
  const leftWidth = Math.max(4, Math.min(96, Math.round((leftValue / total) * 100)));
  return (
    <Card className="surface-panel p-5">
      <div className="mb-3 font-display text-xl font-semibold text-white">{label}</div>
      <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
        <div className="bg-sky-400/75" style={{ width: `${leftWidth}%` }} />
        <div className="bg-emerald-400/75" style={{ width: `${100 - leftWidth}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-400">
        <span>{leftLabel} {pct(leftValue)}</span>
        <span>{rightLabel} {pct(rightValue)}</span>
      </div>
    </Card>
  );
}

export default async function MlbNrfiF5Page({ params }: PageProps) {
  const { gameId } = await params;
  const decodedId = decodeURIComponent(gameId);
  const data = await getMlbFranchiseGameStats(decodedId);
  if (!data) notFound();

  const inning = data.inningStats;

  return (
    <div className="grid gap-6">
      <MlbFranchiseTabs gameId={decodedId} active="nrfi-f5" />

      <section className="surface-panel-strong p-6">
        <div className="section-kicker">NRFI / F5</div>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white">
          {data.projection.matchup.away} @ {data.projection.matchup.home}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Simple first-inning and first-five view. No extra model noise.
        </p>
      </section>

      {inning ? (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <Stat label="NRFI" value={pct(inning.nrfiProbability)} />
            <Stat label="YRFI" value={pct(inning.yrfiProbability)} />
            <Stat label="F5 total" value={one(inning.firstFiveTotalRuns)} />
            <Stat label="F5 away" value={one(inning.firstFiveAwayRuns)} sub={data.projection.matchup.away} />
            <Stat label="F5 home" value={one(inning.firstFiveHomeRuns)} sub={data.projection.matchup.home} />
            <Stat label="F5 over 4.5" value={pct(inning.firstFiveOver4_5Probability)} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <MiniBar label="First inning" leftLabel="NRFI" leftValue={inning.nrfiProbability} rightLabel="YRFI" rightValue={inning.yrfiProbability} />
            <MiniBar label="First five ML" leftLabel={data.projection.matchup.away} leftValue={inning.firstFiveAwayWinProbability} rightLabel={data.projection.matchup.home} rightValue={inning.firstFiveHomeWinProbability} />
          </section>

          <InningRows innings={inning.innings} />
        </>
      ) : (
        <EmptyState title="No NRFI/F5 projection available" description="The game loaded, but inning-level projections are not available yet." />
      )}
    </div>
  );
}
