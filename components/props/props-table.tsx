import Link from "next/link";
import { BetActionButton } from "@/components/bets/bet-action-button";
import { DataTable } from "@/components/ui/data-table";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent } from "@/lib/utils/bet-intelligence";
import { getOrBuildCachedSim } from "@/services/simulation/get-or-build-cached-sim";
import { getSimTuning } from "@/services/simulation/get-sim-tuning";

type PropsTableProps = {
  props: PropCardView[];
};

function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function pct(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function displayOdds(value: number | null | undefined) {
  if (typeof value !== "number") return "--";
  return formatAmericanOdds(value);
}

function playerMatchupHref(prop: PropCardView) {
  const params = new URLSearchParams({
    league: prop.leagueKey,
    gameId: prop.gameId,
    player: prop.player.name
  });
  return `/sim/players?${params.toString()}`;
}

async function buildLiveSimEdge(prop: PropCardView) {
  try {
    const bookOdds = prop.bestAvailableOddsAmerican ?? prop.oddsAmerican;
    const tuning = await getSimTuning();

    const sim = await getOrBuildCachedSim({
      propId: prop.id,
      playerName: prop.player.name,
      propType: String(prop.marketType),
      line: prop.line,
      odds: bookOdds,
      teamTotal: 110,
      minutes: 34,
      usageRate: 0.24,
      matchupRank: typeof prop.matchupRank === "number" ? prop.matchupRank : undefined,
      tuning,
      prop
    });

    const lineDelta = sim.adjustedMean - prop.line;
    const lean = Math.abs(lineDelta) < 0.05 ? "PUSH" : lineDelta > 0 ? "OVER" : "UNDER";
    const leanProbability = lean === "UNDER" ? 1 - sim.calibratedProbability : lean === "OVER" ? sim.calibratedProbability : 0.5;

    return {
      projection: sim,
      adjustedMean: sim.adjustedMean,
      rawMean: sim.rawMean,
      lineDelta,
      lean,
      leanProbability,
      displayEdge: sim.edgePct,
      fairOdds: sim.fairOdds,
      confidence: sim.confidence,
      label: sim.decision,
      reasons: sim.reasons ?? [],
      riskFlags: sim.riskFlags ?? []
    };
  } catch {
    return null;
  }
}

type LiveSimEdge = NonNullable<Awaited<ReturnType<typeof buildLiveSimEdge>>>;

function renderSimCell(prop: PropCardView, sim: LiveSimEdge | null | undefined) {
  if (!sim) {
    return (
      <div key={`${prop.id}-sim-edge`} className="min-w-[150px]">
        <div className="text-sm font-semibold text-bone/70">Sim unavailable</div>
        <div className="text-xs text-bone/45">Projection cache did not return a result.</div>
      </div>
    );
  }

  const positive = sim.displayEdge > 0;
  const meanPositive = sim.lineDelta > 0;
  const primaryReason = sim.reasons[0] ?? "Baseline projection only; richer context inputs pending.";

  return (
    <div key={`${prop.id}-sim-edge`} className="min-w-[190px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className={positive ? "font-mono text-sm font-semibold text-emerald-300" : "font-mono text-sm font-semibold text-rose-300"}>
          {signed(sim.displayEdge)}%
        </span>
        <span className="rounded-sm border border-bone/[0.08] bg-panel px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-bone/65">
          {sim.label}
        </span>
        <span className={meanPositive ? "text-xs font-semibold text-emerald-300" : "text-xs font-semibold text-amber-300"}>
          {sim.lean}
        </span>
      </div>
      <div className="mt-1 text-xs text-bone/55">
        Mean {sim.adjustedMean.toFixed(1)} · Δ {signed(sim.lineDelta)} · {pct(sim.leanProbability)}
      </div>
      <div className="mt-1 text-xs text-bone/45">
        Fair {displayOdds(sim.fairOdds)} · Conf {pct(sim.confidence, 0)}
      </div>
      <div className="mt-1 max-w-[220px] truncate text-[11px] text-bone/40" title={primaryReason}>
        {primaryReason}
      </div>
    </div>
  );
}

export async function PropsTable({ props }: PropsTableProps) {
  const simEdges = await Promise.all(props.map((prop) => buildLiveSimEdge(prop)));
  const simEdgeMap = new Map(props.map((prop, i) => [prop.id, simEdges[i] ?? null]));

  return (
    <DataTable
      columns={[
        "Player",
        "Matchup",
        "Market",
        "Best Price",
        "Sim Expectation",
        "Actions"
      ]}
      rows={props.map((prop) => [
        <div key={`${prop.id}-player`}>
          <div className="font-medium text-white">{prop.player.name}</div>
        </div>,
        <div key={`${prop.id}-matchup`}>
          <div className="text-white">
            {prop.gameLabel ?? `${prop.team?.abbreviation} vs ${prop.opponent?.abbreviation}`}
          </div>
        </div>,
        <div key={`${prop.id}-market`}>
          <div className="text-white">{formatMarketType(prop.marketType)} {prop.side}</div>
          <div className="text-xs text-slate-500">{prop.line}</div>
        </div>,
        <div key={`${prop.id}-best`}>
          <div className="text-white">
            {formatAmericanOdds(prop.bestAvailableOddsAmerican ?? prop.oddsAmerican)}
          </div>
        </div>,
        renderSimCell(prop, simEdgeMap.get(prop.id)),
        <div key={`${prop.id}-actions`} className="flex flex-wrap gap-2">
          <Link
            href={playerMatchupHref(prop)}
            className="concept-chip concept-chip-muted"
          >
            Matchup Sim
          </Link>
          <Link
            href={`/game/${prop.gameId}`}
            className="concept-chip concept-chip-muted"
          >
            Game
          </Link>
          <BetActionButton intent={buildPropBetIntent(prop, "props", "/props")} className="px-3 py-1.5 text-xs">
            Slip
          </BetActionButton>
        </div>
      ])}
    />
  );
}
