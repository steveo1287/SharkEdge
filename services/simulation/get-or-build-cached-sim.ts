import type { PropCardView } from "@/lib/types/domain";
import { getCachedSim, setCachedSim } from "./sim-cache";
import { buildAdaptivePlayerSimV2 } from "./player-sim-v2-adaptive";
import { getSimTuning } from "./get-sim-tuning";
import type { PlayerSimV2Output } from "./player-sim-v2";
import type { SimTuningParams } from "./sim-tuning";
import { getOrBuildCachedNbaSim } from "@/services/nba/nba-batch-sim-cache";

export type GetOrBuildSimInput = {
  propId: string;
  playerId?: string;
  playerName: string;
  propType: string;
  line: number;
  odds: number;
  teamTotal?: number;
  minutes?: number;
  usageRate?: number;
  matchupRank?: number;
  tuning?: SimTuningParams;
  prop?: PropCardView;
  bankroll?: number;
};

export async function getOrBuildCachedSim(
  input: GetOrBuildSimInput
): Promise<PlayerSimV2Output & { betSizing?: any; nbaRoleAnalysis?: any; dataContext?: any }> {
  if (input.prop?.leagueKey === "NBA") {
    const built = await getOrBuildCachedNbaSim(input.prop, input.tuning, input.bankroll);
    return built.value.result as PlayerSimV2Output & { betSizing?: any; dataContext?: any };
  }

  const cached = getCachedSim(input.propId);
  if (cached) {
    return cached.result;
  }

  const tuning = input.tuning ?? (await getSimTuning());
  const result = await buildAdaptivePlayerSimV2(
    {
      player: input.playerName,
      propType: input.propType as any,
      line: input.line,
      odds: input.odds,
      teamTotal: input.teamTotal ?? 110,
      minutes: input.minutes ?? 34,
      usageRate: input.usageRate ?? 0.24,
      opponentRank: input.matchupRank,
      bankroll: input.bankroll
    },
    tuning
  );

  setCachedSim(
    input.propId,
    input.playerId ?? "",
    input.playerName,
    input.propType,
    input.line,
    input.odds,
    result,
    false
  );

  return result;
}
