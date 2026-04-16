import type {
  SimulationContribution,
  SimulationDecomposition,
  SimulationScenarioResult,
  SimulationScenarioSpec
} from "@/lib/types/simulation";

export type BuildSimulationDecompositionInput = {
  baseRatingEdge: number;
  marketAnchorEffect?: number;
  weatherEffect?: number;
  travelEffect?: number;
  styleEffect?: number;
  playerAvailabilityEffect?: number;
  residualModelEffect?: number;
  uncertaintyPenalty?: number;
  confidence?: number;
  scenarios?: SimulationScenarioResult[];
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function contribution(
  key: string,
  label: string,
  value: number,
  confidence: number,
  source: string,
  detail: string
): SimulationContribution {
  return {
    key,
    label,
    value: round(value),
    confidence: round(confidence, 2),
    source,
    detail
  };
}

export function applyUncertaintyPenalty(edge: number, uncertaintyPenalty = 0) {
  const cappedPenalty = clamp(uncertaintyPenalty, 0, 0.2);
  return round(edge * (1 - cappedPenalty));
}

export function buildScenarioSet(base: {
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
}): SimulationScenarioResult[] {
  const specs: SimulationScenarioSpec[] = [
    { id: "baseline", label: "Baseline" },
    { id: "optimistic", label: "Optimistic", weatherShift: 0.02, paceShift: 0.03, injuryUsageShift: 0.01, fatigueShift: -0.01 },
    { id: "pessimistic", label: "Pessimistic", weatherShift: -0.03, paceShift: -0.02, injuryUsageShift: -0.02, fatigueShift: 0.02 },
    { id: "chaos", label: "Chaos", weatherShift: -0.01, paceShift: 0.04, officiatingShift: 0.03, fatigueShift: 0.01 }
  ];

  return specs.map((scenario) => {
    const delta =
      (scenario.weatherShift ?? 0) +
      (scenario.paceShift ?? 0) +
      (scenario.injuryUsageShift ?? 0) -
      (scenario.fatigueShift ?? 0) +
      (scenario.officiatingShift ?? 0);

    const total = base.projectedTotal * (1 + delta);
    const spread = base.projectedSpreadHome * (1 + delta * 0.5);
    const home = (total + spread) / 2;
    const away = total - home;

    return {
      scenario,
      projectedHomeScore: round(home, 2),
      projectedAwayScore: round(away, 2),
      projectedTotal: round(total, 2),
      projectedSpreadHome: round(spread, 2),
      winProbHome: round(clamp(base.winProbHome + delta * 0.08, 0.05, 0.95), 4)
    };
  });
}

export function buildSimulationDecomposition(input: BuildSimulationDecompositionInput): SimulationDecomposition {
  const baseRatingEdge = round(input.baseRatingEdge);
  const marketAnchorEffect = round(input.marketAnchorEffect ?? 0);
  const weatherEffect = round(input.weatherEffect ?? 0);
  const travelEffect = round(input.travelEffect ?? 0);
  const styleEffect = round(input.styleEffect ?? 0);
  const playerAvailabilityEffect = round(input.playerAvailabilityEffect ?? 0);
  const residualModelEffect = round(input.residualModelEffect ?? 0);
  const uncertaintyPenalty = round(clamp(input.uncertaintyPenalty ?? 0.06, 0, 0.2));
  const prePenalty =
    baseRatingEdge +
    marketAnchorEffect +
    weatherEffect +
    travelEffect +
    styleEffect +
    playerAvailabilityEffect +
    residualModelEffect;
  const totalAdjustedEdge = applyUncertaintyPenalty(prePenalty, uncertaintyPenalty);
  const confidence = round(clamp(input.confidence ?? 0.62, 0.35, 0.98), 2);

  return {
    baseRatingEdge,
    marketAnchorEffect,
    weatherEffect,
    travelEffect,
    styleEffect,
    playerAvailabilityEffect,
    residualModelEffect,
    uncertaintyPenalty,
    totalAdjustedEdge,
    confidence,
    contributions: [
      contribution("base_rating_edge", "Base rating edge", baseRatingEdge, 0.8, "team-strength engine", "Core opponent-adjusted team strength edge."),
      contribution("market_anchor_effect", "Market anchor", marketAnchorEffect, 0.78, "market model", "Keeps projections tethered to a liquid price prior."),
      contribution("weather_effect", "Weather", weatherEffect, 0.66, "weather blend", "Environmental scoring or pace adjustment."),
      contribution("travel_effect", "Travel and rest", travelEffect, 0.63, "schedule/travel model", "Circadian, mileage, and rest differential adjustment."),
      contribution("style_effect", "Style clash", styleEffect, 0.64, "style engine", "Schematic fit and tempo interaction."),
      contribution("player_availability_effect", "Player availability", playerAvailabilityEffect, 0.72, "injury and usage model", "Lineup, usage, and replacement-level adjustment."),
      contribution("residual_model_effect", "Residual model", residualModelEffect, 0.59, "residual ML layer", "Nonlinear correction learned from historical miss patterns."),
      contribution("uncertainty_penalty", "Uncertainty penalty", -uncertaintyPenalty, 0.85, "calibration layer", "Compresses edge when data quality or variance is worse.")
    ],
    scenarios: input.scenarios ?? []
  };
}
