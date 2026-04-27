import Link from "next/link";
import { BetActionButton } from "@/components/bets/bet-action-button";
import { DataTable } from "@/components/ui/data-table";
import type { PropCardView } from "@/lib/types/domain";
import { formatAmericanOdds, formatMarketType } from "@/lib/formatters/odds";
import { buildPropBetIntent } from "@/lib/utils/bet-intelligence";
import { buildPropOpportunity } from "@/services/opportunities/opportunity-service";
import { getOrBuildCachedSim } from "@/services/simulation/get-or-build-cached-sim";
import { getSimTuning } from "@/services/simulation/get-sim-tuning";

type PropsTableProps = {
  props: PropCardView[];
};

async function buildLiveSimEdge(prop: PropCardView) {
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

  return {
    projection: sim,
    displayEdge: sim.edgePct,
    label: sim.decision
  };
}

export async function PropsTable({ props }: PropsTableProps) {
  const simEdges = await Promise.all(props.map(prop => buildLiveSimEdge(prop)));
  const simEdgeMap = new Map(props.map((prop, i) => [prop.id, simEdges[i]]));

  return (
    <DataTable
      columns={[
        "Player",
        "Matchup",
        "Market",
        "Best Price",
        "Sim Edge",
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
        (() => {
          const sim = simEdgeMap.get(prop.id);
          if (!sim) return <div>Sim unavailable</div>;
          const positive = sim.displayEdge > 0;
          return (
            <div key={`${prop.id}-sim-edge`} className="min-w-[116px]">
              <div className={positive ? "font-mono text-sm font-semibold text-emerald-300" : "font-mono text-sm font-semibold text-rose-300"}>
                {sim.displayEdge > 0 ? "+" : ""}{sim.displayEdge.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500">
                {sim.label}
              </div>
            </div>
          );
        })(),
        <div key={`${prop.id}-actions`} className="flex gap-2">
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
