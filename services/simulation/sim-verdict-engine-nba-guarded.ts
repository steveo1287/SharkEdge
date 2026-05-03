import * as safeEngine from "./sim-verdict-engine-nba-safe";
import { applyNbaVerdictSafety, applyNbaVerdictSafetyToList, type NbaVerdictSafetyInput } from "./nba-verdict-safety";
import type { PlayerPropSimulationSummary } from "./player-prop-sim";

export type VerdictRating = safeEngine.VerdictRating;
export type VerdictConfidence = safeEngine.VerdictConfidence;
export type VerdictSide = safeEngine.VerdictSide;
export type TrapFlag = safeEngine.TrapFlag;
export type ActionState = safeEngine.ActionState;
export type TimingState = safeEngine.TimingState;
export type MarketVerdict = safeEngine.MarketVerdict;
export type GameSimVerdict = safeEngine.GameSimVerdict;
export type PlayerPropVerdict = safeEngine.PlayerPropVerdict;

type GameVerdictArgs = Parameters<typeof safeEngine.buildGameSimVerdict>[0] & {
  nbaSafety?: Partial<Omit<NbaVerdictSafetyInput, "verdict">>;
};

type SafetyContext = Omit<NbaVerdictSafetyInput, "verdict">;

function defaultMissingNbaSafety(): SafetyContext {
  return {
    modelHealthGreen: false,
    sourceHealthGreen: false,
    injuryReportFresh: false,
    calibrationBucketHealthy: false,
    noVigMarketAvailable: false,
    noBet: true,
    blockerReasons: ["Explicit NBA safety context was not supplied to the verdict layer."]
  };
}

function buildExplicitNbaSafety(input: Partial<Omit<NbaVerdictSafetyInput, "verdict">> | undefined, fallbackNoVig: boolean): SafetyContext {
  if (!input) return defaultMissingNbaSafety();
  return {
    modelHealthGreen: input.modelHealthGreen === true,
    sourceHealthGreen: input.sourceHealthGreen === true,
    injuryReportFresh: input.injuryReportFresh === true,
    calibrationBucketHealthy: input.calibrationBucketHealthy === true,
    noVigMarketAvailable: input.noVigMarketAvailable ?? fallbackNoVig,
    noBet: input.noBet === true,
    blockerReasons: input.blockerReasons ?? []
  };
}

function withGameMarketSafety(verdict: MarketVerdict, safety: SafetyContext, args: GameVerdictArgs) {
  if (args.leagueKey.toUpperCase() !== "NBA") return verdict;
  const noVigMarketAvailable = verdict.market === "moneyline"
    ? args.homeMoneylineOdds !== null && args.awayMoneylineOdds !== null
    : verdict.market === "spread"
      ? args.marketSpreadHome !== null && args.homeSpreadOdds !== null && args.awaySpreadOdds !== null
      : verdict.market === "total"
        ? args.marketTotal !== null && args.overOdds !== null && args.underOdds !== null
        : safety.noVigMarketAvailable;

  return applyNbaVerdictSafety({
    ...safety,
    verdict,
    noVigMarketAvailable: safety.noVigMarketAvailable && noVigMarketAvailable
  });
}

function recomputeOverall(args: safeEngine.GameSimVerdict, verdicts: MarketVerdict[]): safeEngine.GameSimVerdict["overallVerdict"] {
  const actionable = verdicts.filter((verdict) => verdict.side !== "NONE" && verdict.actionState !== "PASS" && verdict.kellyPct > 0);
  const bestBet = actionable.sort((left, right) => right.edgeScore - left.edgeScore || (right.edgePct ?? -999) - (left.edgePct ?? -999))[0] ?? null;
  return {
    bestBet,
    rating: bestBet?.rating ?? "NEUTRAL",
    summary: bestBet ? `${bestBet.market} ${bestBet.side} is the top simulated lean after NBA safety gates.` : "No actionable simulated edge after NBA safety gates.",
    actionNote: bestBet?.actionState === "BET_NOW" ? "Window open only if NBA safety, market, injury, source, and calibration gates are green." : "Monitor only until NBA market, injury, source, and calibration gates clear."
  };
}

export function buildMoneylineVerdict(
  ...args: Parameters<typeof safeEngine.buildMoneylineVerdict>
): MarketVerdict[] {
  return safeEngine.buildMoneylineVerdict(...args);
}

export function buildSpreadVerdict(
  ...args: Parameters<typeof safeEngine.buildSpreadVerdict>
): MarketVerdict {
  return safeEngine.buildSpreadVerdict(...args);
}

export function buildTotalVerdict(
  ...args: Parameters<typeof safeEngine.buildTotalVerdict>
): MarketVerdict {
  return safeEngine.buildTotalVerdict(...args);
}

export function buildPlayerPropVerdict(
  sim: PlayerPropSimulationSummary,
  playerId: string,
  playerName: string,
  statKey: string,
  marketLine: number,
  overOdds: number | null,
  underOdds: number | null,
  leagueKey = "NBA",
  nbaSafety?: Partial<Omit<NbaVerdictSafetyInput, "verdict">>
): PlayerPropVerdict {
  const result = safeEngine.buildPlayerPropVerdict(sim, playerId, playerName, statKey, marketLine, overOdds, underOdds, leagueKey);
  if (leagueKey.toUpperCase() !== "NBA") return result;
  const safety = buildExplicitNbaSafety(nbaSafety, overOdds !== null && underOdds !== null);
  return {
    ...result,
    verdict: applyNbaVerdictSafety({ ...safety, verdict: result.verdict })
  };
}

export function buildGameSimVerdict(args: GameVerdictArgs): GameSimVerdict {
  const result = safeEngine.buildGameSimVerdict(args);
  if (args.leagueKey.toUpperCase() !== "NBA") return result;
  const safety = buildExplicitNbaSafety(args.nbaSafety, args.homeMoneylineOdds !== null && args.awayMoneylineOdds !== null);
  const verdicts = result.verdicts.map((verdict) => withGameMarketSafety(verdict, safety, args));
  return {
    ...result,
    verdicts,
    overallVerdict: recomputeOverall(result, verdicts)
  };
}

export const __simVerdictTestHooks = safeEngine.__simVerdictTestHooks;
export { applyNbaVerdictSafety, applyNbaVerdictSafetyToList };
