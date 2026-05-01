import type { LeagueKey } from "@/lib/types/domain";
import { applyNbaLearnedCalibrator, getOrTrainNbaLearnedCalibrator, type NbaLearnedCalibrationResult } from "@/services/simulation/nba-learned-calibrator";
import { compareNbaRealDataIntelligence } from "@/services/simulation/nba-real-data-warehouse-first";
import { getNbaNoVigMarket, type NbaNoVigMarket } from "@/services/simulation/nba-market-sanity";
import { applyNbaPickHistoryTuner, getOrTrainNbaPickHistoryTuner, type NbaPickHistoryAdjustment } from "@/services/simulation/nba-pick-history-tuner";
import { type SportOutcomeModel } from "@/services/simulation/probability-models";

export type RealityFactor = {
  label: string;
  value: number;
  weight: number;
  source: "team" | "player" | "advanced" | "rating" | "context" | "history";
};

export type RealitySimIntel = {
  modelVersion: "reality-sim-v1" | "nba-intel-v1" | "nba-real-data-v1";
  dataSource: string;
  homeEdge: number;
  projectedTotal: number;
  volatilityIndex: number;
  confidence: number;
  outcomeModel?: SportOutcomeModel;
  factors: RealityFactor[];
  modules: Array<{ label: string; status: "real" | "unavailable"; note: string }>;
  ratingBlend: {
    teamPower: number;
    playerPower: number;
    advancedPower: number;
    gameRatingPower: number;
    contextPower: number;
    historyPower?: number;
  };
  market?: NbaNoVigMarket | null;
  historyAdjustment?: NbaPickHistoryAdjustment | null;
  learnedAdjustment?: NbaLearnedCalibrationResult | null;
  sourceMap?: Record<string, number>;
  sourceHealth?: {
    team: boolean;
    player: boolean;
    history: boolean;
    rating: boolean;
    realModules: number;
    requiredModulesReady: boolean;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function sourceMapFromFactors(factors: RealityFactor[]) {
  return factors.reduce<Record<string, number>>((map, factor) => {
    map[factor.source] = round((map[factor.source] ?? 0) + factor.value * factor.weight, 4);
    return map;
  }, { team: 0, player: 0, advanced: 0, rating: 0, history: 0, context: 0 });
}

function unavailableNbaIntel(reason: string): RealitySimIntel {
  return {
    modelVersion: "nba-real-data-v1",
    dataSource: `real-data-only:unavailable:${reason}`,
    homeEdge: 0,
    projectedTotal: 0,
    volatilityIndex: 2.25,
    confidence: 0.16,
    factors: [{ label: "Real data gate", value: 0, weight: 0, source: "context" }],
    modules: [
      { label: "NBA real-data gate", status: "unavailable", note: "Required NBA team/player feeds are missing or incomplete. Synthetic priors are disabled; model should pass." }
    ],
    ratingBlend: { teamPower: 0, playerPower: 0, advancedPower: 0, gameRatingPower: 0, contextPower: 0, historyPower: 0 },
    market: null,
    historyAdjustment: null,
    learnedAdjustment: null,
    sourceMap: { team: 0, player: 0, advanced: 0, rating: 0, history: 0, context: 0 },
    sourceHealth: { team: false, player: false, history: false, rating: false, realModules: 0, requiredModulesReady: false }
  };
}

async function buildNbaRealityIntel(matchup: { away: string; home: string }): Promise<RealitySimIntel> {
  const [nba, market, tuner, learnedCalibrator] = await Promise.all([
    compareNbaRealDataIntelligence(matchup.away, matchup.home).catch(() => null),
    getNbaNoVigMarket(matchup.away, matchup.home).catch(() => null),
    getOrTrainNbaPickHistoryTuner().catch(() => null),
    getOrTrainNbaLearnedCalibrator().catch(() => null)
  ]);

  if (!nba || !nba.sourceHealth.requiredModulesReady) {
    const fallback = unavailableNbaIntel("missing-required-real-feeds");
    return {
      ...fallback,
      market,
      modules: [
        ...(nba?.modules ?? fallback.modules),
        { label: "NBA no-vig market", status: market?.available ? "real" : "unavailable", note: market?.available ? "Market baseline is available, but sim side is still gated because real team/player feeds are incomplete." : "No NBA no-vig market available." }
      ]
    };
  }

  const factors: RealityFactor[] = nba.factors.map((factor) => ({
    label: factor.label,
    value: factor.value,
    weight: factor.weight,
    source: factor.source
  }));
  const sourceMap = sourceMapFromFactors(factors);
  const rawHomeWinPct = clamp(0.5 + nba.homeEdge / 24, 0.24, 0.76);
  const learnedAdjustment = applyNbaLearnedCalibrator(learnedCalibrator, {
    rawHomeWinPct,
    marketHomeNoVigProbability: market?.homeNoVigProbability ?? null,
    confidence: nba.confidence,
    volatilityIndex: nba.volatilityIndex,
    sourceMap
  });
  const adjustment = applyNbaPickHistoryTuner(tuner, {
    rulesHomeWinPct: learnedAdjustment.calibratedHomeWinPct,
    marketHomeNoVigProbability: market?.homeNoVigProbability ?? null,
    sourceMap,
    volatilityIndex: nba.volatilityIndex
  });
  const tunedHomeEdge = round((adjustment.tunedHomeWinPct - 0.5) * 24, 2);
  const marketTotal = market?.totalLine ?? null;
  const marketTotalBlend = typeof marketTotal === "number" ? nba.projectedTotal * 0.72 + marketTotal * 0.28 : nba.projectedTotal;
  const requiredFeedBoost = nba.sourceHealth.requiredModulesReady ? 0.035 : -0.08;
  const marketBoost = market?.available ? 0.018 : -0.02;
  const learnedPassPenalty = learnedAdjustment.shouldPass ? 0.055 : 0;
  const historyPassPenalty = adjustment.shouldPass ? 0.06 : 0;
  const confidence = round(clamp(nba.confidence + learnedAdjustment.confidenceAdjustment + adjustment.confidenceAdjustment + requiredFeedBoost + marketBoost - learnedPassPenalty - historyPassPenalty, 0.18, 0.84), 3);
  const volatilityIndex = round(clamp(nba.volatilityIndex + (learnedAdjustment.shouldPass ? 0.06 : 0) + (adjustment.shouldPass ? 0.08 : 0) + (market?.available ? -0.02 : 0.04), 0.7, 2.15), 2);

  factors.push({ label: "No-vig market baseline", value: round((market?.homeNoVigProbability ?? 0.5) - 0.5, 4), weight: 6, source: "advanced" });
  factors.push({ label: "NBA learned factor calibration", value: round(learnedAdjustment.calibratedHomeWinPct - rawHomeWinPct, 4), weight: 8, source: "history" });
  factors.push({ label: "NBA graded-history adjustment", value: round(adjustment.tunedHomeWinPct - learnedAdjustment.calibratedHomeWinPct, 4), weight: 8, source: "history" });

  return {
    modelVersion: "nba-real-data-v1",
    dataSource: `${nba.dataSource}+market:${market?.source ?? "missing"}+learned:${learnedCalibrator?.source ?? "fallback"}+history:${tuner?.source ?? "fallback"}`,
    homeEdge: tunedHomeEdge,
    projectedTotal: round(marketTotalBlend, 1),
    volatilityIndex,
    confidence,
    modules: [
      ...nba.modules,
      { label: "NBA no-vig market", status: market?.available ? "real" : "unavailable", note: market?.available ? "Live/warehouse market baseline applied." : "No NBA market baseline available; probability was not copied from a synthetic fallback." },
      { label: "NBA learned factor calibrator", status: learnedCalibrator?.ok ? "real" : "unavailable", note: learnedCalibrator?.ok ? `Learned from ${learnedCalibrator.rows} graded NBA decisions; bucket ${learnedAdjustment.bucketKey} action ${learnedAdjustment.action}.` : "No synthetic learned fallback. Calibrator remains conservative until graded NBA history exists." },
      { label: "NBA graded-pick tuner", status: tuner?.ok ? "real" : "unavailable", note: tuner?.ok ? `Tuned from ${tuner.rows} graded NBA decisions.` : "No synthetic tuning fallback. Tuner remains conservative until graded NBA history exists." }
    ],
    ratingBlend: nba.ratingBlend,
    factors: factors.sort((left, right) => Math.abs(right.value * right.weight) - Math.abs(left.value * left.weight)),
    market,
    historyAdjustment: adjustment,
    learnedAdjustment,
    sourceMap: sourceMapFromFactors(factors),
    sourceHealth: nba.sourceHealth
  };
}

export async function buildRealitySimIntel(league: LeagueKey, matchup: { away: string; home: string }): Promise<RealitySimIntel | null> {
  if (league === "MLB") return null;
  if (league === "NBA") return buildNbaRealityIntel(matchup);

  // Synthetic cross-sport fallbacks are intentionally disabled. Add real feed adapters
  // for each sport before exposing a reality module for that league.
  return null;
}
