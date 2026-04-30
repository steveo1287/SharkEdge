import { normalCdf } from "./probability-math";
import type { EventGameRatingsPrior, TeamGameRatingsProfile } from "@/services/simulation/game-ratings-prior";
import type {
  CoachTendencyProfile,
  EventIntangibleProfile,
  HeadToHeadSimulationContext,
  TeamPlaystyleProfile
} from "@/services/simulation/context-profiles";
import {
  linearWinExpectancyProfile,
  linearWinPriorProbability,
  type LinearWinExpectancyProfile,
  type SupportedLinearWinLeague
} from "@/services/analytics/team-strength/linear-win-expectancy";
import {
  blendProbabilitySignal,
  eloExpectedWinProbability,
  log5FromScoring,
  type Log5MatchupResult
} from "@/services/analytics/team-strength/matchup-probability";
import {
  mlbPregameEloAdjustment,
  type MlbPregameEloAdjustment,
  type MlbPregameEloAdjustmentInput
} from "@/services/analytics/team-strength/mlb-elo-adjustments";

export type TeamStrengthContext = {
  scored?: number | null;
  allowed?: number | null;
  actualWins?: number | null;
  actualLosses?: number | null;
};

export type TeamLinearWinExpectancyInput = TeamStrengthContext;

export type MlbPregameEloContext = MlbPregameEloAdjustmentInput & {
  rating?: number | null;
};

export type TeamSimulationFactors = {
  teamName: string;
  offense: number;
  defense: number;
  pace: number;
  recentForm?: number | null;
  recentWinRate?: number | null;
  restDays?: number | null;
  travelProxyScore?: number | null;
  backToBack?: boolean | null;
  revengeSpot?: boolean | null;
  teamStrengthContext?: TeamStrengthContext | null;
  linearWinExpectancy?: TeamLinearWinExpectancyInput | null;
  mlbPregameEloContext?: MlbPregameEloContext | null;
  ratings?: TeamGameRatingsProfile | null;
  style?: TeamPlaystyleProfile | null;
  coach?: CoachTendencyProfile | null;
  intangibles?: EventIntangibleProfile | null;
};

export type ContextualGameSimulationInput = {
  leagueKey: string;
  home: TeamSimulationFactors;
  away: TeamSimulationFactors;
  ratingsPrior?: EventGameRatingsPrior | null;
  venue?: {
    name?: string | null;
    homeEdge?: number | null;
  } | null;
  weather?: {
    available: boolean;
    totalFactor?: number | null;
    note?: string | null;
  } | null;
  marketAnchor?: {
    total?: number | null;
    spreadHome?: number | null;
    spreadAway?: number | null;
    homeMoneylineOdds?: number | null;
    awayMoneylineOdds?: number | null;
    homeSpreadOdds?: number | null;
    awaySpreadOdds?: number | null;
    overOdds?: number | null;
    underOdds?: number | null;
  } | null;
  interactionContext?: HeadToHeadSimulationContext | null;
  linearWinExpectancyWeight?: number | null;
  log5Weight?: number | null;
  pythagoreanExponent?: number | null;
  mlbEloWeight?: number | null;
  samples?: number;
  seed?: number;
};

export type ContextualGameSimulationSummary = {
  engine: string;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
  winProbAway: number;
  distribution: {
    totalStdDev: number;
    homeScoreStdDev: number;
    awayScoreStdDev: number;
    spreadStdDev: number;
    p10Total: number;
    p50Total: number;
    p90Total: number;
    p10SpreadHome: number;
    p50SpreadHome: number;
    p90SpreadHome: number;
  };
  drivers: string[];
  ratingsPrior: {
    source: EventGameRatingsPrior["source"];
    blendWeight: number;
    deltaOverall: number;
    confidence: number;
  };
  teamStrengthPriors?: {
    log5: null | {
      homeProbability: number;
      homeExpectedWinPct: number;
      awayExpectedWinPct: number;
      weight: number;
      movementPts: number;
    };
    linear: null | {
      homeProbability: number;
      weight: number;
      movementPts: number;
      homeProfile: LinearWinExpectancyProfile;
      awayProfile: LinearWinExpectancyProfile;
    };
    mlbElo: null | {
      homeProbability: number | null;
      weight: number;
      movementPts: number;
      homeAdjustment: MlbPregameEloAdjustment;
      awayAdjustment: MlbPregameEloAdjustment;
      inputsUsed: {
        homeRating: boolean;
        awayRating: boolean;
        homeTravel: boolean;
        awayTravel: boolean;
        homeRest: boolean;
        awayRest: boolean;
        homePitcher: boolean;
        awayPitcher: boolean;
        noFans: boolean;
      };
      notes: string[];
    };
  };
};

type SportConfig = {
  baseScore: number;
  baseStdDev: number;
  homeEdge: number;
  paceBaseline: number;
  totalBlendWeight: number;
  spreadBlendWeight: number;
};

type Log5ScoringSignal = Log5MatchupResult & {
  teamAExpectedWinPct: number;
  teamBExpectedWinPct: number;
  exponent: number;
};

const SPORT_CONFIG: Record<string, SportConfig> = {
  NBA: { baseScore: 112, baseStdDev: 12.5, homeEdge: 2.6, paceBaseline: 99, totalBlendWeight: 0.18, spreadBlendWeight: 0.16 },
  NCAAB: { baseScore: 74, baseStdDev: 10.8, homeEdge: 3.2, paceBaseline: 69, totalBlendWeight: 0.2, spreadBlendWeight: 0.18 },
  NFL: { baseScore: 23.5, baseStdDev: 9.6, homeEdge: 1.8, paceBaseline: 64, totalBlendWeight: 0.16, spreadBlendWeight: 0.16 },
  NCAAF: { baseScore: 28, baseStdDev: 11.4, homeEdge: 2.7, paceBaseline: 70, totalBlendWeight: 0.16, spreadBlendWeight: 0.16 },
  NHL: { baseScore: 3.1, baseStdDev: 1.55, homeEdge: 0.18, paceBaseline: 31, totalBlendWeight: 0.14, spreadBlendWeight: 0.14 },
  MLB: { baseScore: 4.4, baseStdDev: 2.2, homeEdge: 0.16, paceBaseline: 38, totalBlendWeight: 0.1, spreadBlendWeight: 0.1 }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function supportedLinearWinLeague(leagueKey: string): SupportedLinearWinLeague | null {
  const normalized = leagueKey.toUpperCase();
  if (normalized === "MLB" || normalized === "NFL" || normalized === "NBA") {
    return normalized;
  }
  return null;
}

function teamStrengthContext(team: TeamSimulationFactors): TeamStrengthContext | null {
  return team.teamStrengthContext ?? team.linearWinExpectancy ?? null;
}

function buildLinearWinProfile(
  leagueKey: string,
  team: TeamSimulationFactors
): LinearWinExpectancyProfile | null {
  const league = supportedLinearWinLeague(leagueKey);
  const context = teamStrengthContext(team);
  const scored = finiteNumber(context?.scored);
  const allowed = finiteNumber(context?.allowed);
  if (!league || scored == null || allowed == null) return null;

  return linearWinExpectancyProfile({
    league,
    scored,
    allowed,
    actualWins: finiteNumber(context?.actualWins),
    actualLosses: finiteNumber(context?.actualLosses)
  });
}

function buildLog5ScoringSignal(input: ContextualGameSimulationInput): Log5ScoringSignal | null {
  if (!supportedLinearWinLeague(input.leagueKey)) return null;

  const homeContext = teamStrengthContext(input.home);
  const awayContext = teamStrengthContext(input.away);
  const homeScored = finiteNumber(homeContext?.scored);
  const homeAllowed = finiteNumber(homeContext?.allowed);
  const awayScored = finiteNumber(awayContext?.scored);
  const awayAllowed = finiteNumber(awayContext?.allowed);

  if (homeScored == null || homeAllowed == null || awayScored == null || awayAllowed == null) {
    return null;
  }

  return log5FromScoring({
    teamAScored: homeScored,
    teamAAllowed: homeAllowed,
    teamBScored: awayScored,
    teamBAllowed: awayAllowed,
    exponent: finiteNumber(input.pythagoreanExponent) ?? undefined
  });
}

function buildMlbEloPrior(input: ContextualGameSimulationInput) {
  if (input.leagueKey !== "MLB") return null;
  const home = input.home.mlbPregameEloContext ?? null;
  const away = input.away.mlbPregameEloContext ?? null;
  const homeRating = finiteNumber(home?.rating);
  const awayRating = finiteNumber(away?.rating);
  const homeAdjustment = mlbPregameEloAdjustment({ ...home, isHome: true });
  const awayAdjustment = mlbPregameEloAdjustment({ ...away, isHome: false });
  const inputsUsed = {
    homeRating: homeRating != null,
    awayRating: awayRating != null,
    homeTravel: finiteNumber(home?.milesTraveled) != null,
    awayTravel: finiteNumber(away?.milesTraveled) != null,
    homeRest: finiteNumber(home?.restDays) != null,
    awayRest: finiteNumber(away?.restDays) != null,
    homePitcher: !home?.isOpener && finiteNumber(home?.pitcherRollingGameScore) != null && finiteNumber(home?.teamRollingGameScore) != null,
    awayPitcher: !away?.isOpener && finiteNumber(away?.pitcherRollingGameScore) != null && finiteNumber(away?.teamRollingGameScore) != null,
    noFans: Boolean(home?.noFans || away?.noFans)
  };
  const notes = [...homeAdjustment.notes.map((note) => `Home ${note}`), ...awayAdjustment.notes.map((note) => `Away ${note}`)];

  if (homeRating == null || awayRating == null) {
    return {
      probability: null,
      homeAdjustment,
      awayAdjustment,
      inputsUsed,
      notes: ["MLB Elo probability skipped: both teams need real base ratings.", ...notes]
    };
  }

  const expected = eloExpectedWinProbability({
    ratingA: homeRating + homeAdjustment.totalAdjustment,
    ratingB: awayRating + awayAdjustment.totalAdjustment,
    homeFieldElo: 0
  });

  return {
    probability: expected.teamAProbability,
    homeAdjustment,
    awayAdjustment,
    inputsUsed,
    notes
  };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function percentile(values: number[], quantile: number) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.floor((sorted.length - 1) * quantile), 0, sorted.length - 1);
  return sorted[index];
}

function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomNormal(random: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function teamMeanScore(args: {
  config: SportConfig;
  offense: number;
  opponentDefense: number;
  paceFactor: number;
}) {
  const base = (args.offense + args.opponentDefense) / 2;
  const normalizedBase = base > 0 ? base : args.config.baseScore;
  return normalizedBase * args.paceFactor;
}

export function simulateContextualGame(input: ContextualGameSimulationInput): ContextualGameSimulationSummary {
  const config = SPORT_CONFIG[input.leagueKey] ?? SPORT_CONFIG.NBA;
  const ratingsPrior = input.ratingsPrior ?? null;
  const random = createSeededRandom(input.seed ?? 7);
  const samples = Math.max(800, input.samples ?? 2500);

  const avgPace = average([
    input.home.pace || config.paceBaseline,
    input.away.pace || config.paceBaseline
  ]);
  const interactionPaceMultiplier = clamp(input.interactionContext?.paceMultiplier ?? 1, 0.9, 1.1);
  const paceFactor = clamp((avgPace / Math.max(1, config.paceBaseline)) * interactionPaceMultiplier, 0.84, 1.18);

  let homeMean = teamMeanScore({
    config,
    offense: input.home.offense || config.baseScore,
    opponentDefense: input.away.defense || config.baseScore,
    paceFactor
  });
  let awayMean = teamMeanScore({
    config,
    offense: input.away.offense || config.baseScore,
    opponentDefense: input.home.defense || config.baseScore,
    paceFactor
  });

  const drivers: string[] = [];
  if (input.interactionContext) {
    homeMean += input.interactionContext.homeOffenseDelta;
    awayMean += input.interactionContext.awayOffenseDelta;
    drivers.push(...input.interactionContext.drivers);
  }

  const homeStyleBoost =
    ((input.home.style?.efficiency ?? 50) - 50) * 0.045 +
    ((input.home.coach?.aggression ?? 50) - 50) * 0.018 -
    ((input.away.style?.defenseResistance ?? 50) - 50) * 0.04;
  if (homeStyleBoost !== 0) {
    homeMean += clamp(homeStyleBoost, -4.5, 4.5);
    drivers.push(`Home style/coach delta ${round(homeStyleBoost, 2)}`);
  }

  const awayStyleBoost =
    ((input.away.style?.efficiency ?? 50) - 50) * 0.045 +
    ((input.away.coach?.aggression ?? 50) - 50) * 0.018 -
    ((input.home.style?.defenseResistance ?? 50) - 50) * 0.04;
  if (awayStyleBoost !== 0) {
    awayMean += clamp(awayStyleBoost, -4.5, 4.5);
    drivers.push(`Away style/coach delta ${round(awayStyleBoost, 2)}`);
  }

  const homeIntangibleShift =
    ((input.home.intangibles?.restEdge ?? 0) - (input.home.intangibles?.fatigueRisk ?? 0) - (input.home.intangibles?.travelStress ?? 0)) * 0.08 +
    ((input.home.intangibles?.revengeBoost ?? 0) + (input.home.intangibles?.morale ?? 0)) * 0.05;
  if (homeIntangibleShift !== 0) {
    homeMean += clamp(homeIntangibleShift, -3.5, 3.5);
    drivers.push(`Home intangible delta ${round(homeIntangibleShift, 2)}`);
  }

  const awayIntangibleShift =
    ((input.away.intangibles?.restEdge ?? 0) - (input.away.intangibles?.fatigueRisk ?? 0) - (input.away.intangibles?.travelStress ?? 0)) * 0.08 +
    ((input.away.intangibles?.revengeBoost ?? 0) + (input.away.intangibles?.morale ?? 0)) * 0.05;
  if (awayIntangibleShift !== 0) {
    awayMean += clamp(awayIntangibleShift, -3.5, 3.5);
    drivers.push(`Away intangible delta ${round(awayIntangibleShift, 2)}`);
  }
  const homeEdge = (input.venue?.homeEdge ?? config.homeEdge);
  homeMean += homeEdge;
  awayMean -= homeEdge * 0.18;
  drivers.push(`Home edge ${round(homeEdge, 2)}`);

  const restDelta = (input.home.restDays ?? 0) - (input.away.restDays ?? 0);
  if (restDelta !== 0) {
    const restShift = clamp(restDelta * (input.leagueKey.includes("NFL") ? 0.55 : 0.28), -3.4, 3.4);
    homeMean += restShift;
    awayMean -= restShift * 0.55;
    drivers.push(`Rest delta ${round(restDelta, 2)} days`);
  }

  const travelDelta = (input.away.travelProxyScore ?? 0) - (input.home.travelProxyScore ?? 0);
  if (travelDelta !== 0) {
    const travelShift = clamp(travelDelta * 0.35, -2.5, 2.5);
    homeMean += travelShift;
    awayMean -= travelShift * 0.4;
    drivers.push(`Travel edge ${round(travelDelta, 2)}`);
  }

  const recentFormDelta = (input.home.recentForm ?? 0) - (input.away.recentForm ?? 0);
  if (recentFormDelta !== 0) {
    const formShift = clamp(recentFormDelta * 0.18, -3, 3);
    homeMean += formShift;
    awayMean -= formShift * 0.35;
    drivers.push(`Recent form delta ${round(recentFormDelta, 2)}`);
  }

  const winRateDelta = (input.home.recentWinRate ?? 0.5) - (input.away.recentWinRate ?? 0.5);
  if (winRateDelta !== 0) {
    const winRateShift = clamp(winRateDelta * (input.leagueKey.includes("NFL") ? 5.5 : 3.6), -2.4, 2.4);
    homeMean += winRateShift;
    awayMean -= winRateShift * 0.28;
    drivers.push(`Win-rate delta ${round(winRateDelta, 3)}`);
  }

  if (input.home.backToBack) {
    homeMean -= input.leagueKey.includes("NBA") || input.leagueKey.includes("NCAAB") ? 1.7 : 0.7;
    drivers.push("Home back-to-back penalty");
  }
  if (input.away.backToBack) {
    awayMean -= input.leagueKey.includes("NBA") || input.leagueKey.includes("NCAAB") ? 1.7 : 0.7;
    drivers.push("Away back-to-back penalty");
  }
  if (input.home.revengeSpot) {
    homeMean += input.leagueKey.includes("NFL") ? 0.5 : 0.25;
    drivers.push("Home revenge spot");
  }
  if (input.away.revengeSpot) {
    awayMean += input.leagueKey.includes("NFL") ? 0.5 : 0.25;
    drivers.push("Away revenge spot");
  }

  const weatherFactor = input.weather?.available ? clamp(input.weather.totalFactor ?? 1, 0.9, 1.1) : 1;
  if (input.weather?.available && weatherFactor !== 1) {
    homeMean *= Math.sqrt(weatherFactor);
    awayMean *= Math.sqrt(weatherFactor);
    drivers.push(input.weather.note ?? `Weather factor ${round(weatherFactor, 3)}`);
  }

  if (ratingsPrior && ratingsPrior.blendWeight > 0) {
    const overallDelta = ratingsPrior.deltaOverall / 100;
    const homeRatingFactor = 1 + clamp(overallDelta * ratingsPrior.blendWeight, -0.08, 0.08);
    const awayRatingFactor = 1 - clamp(overallDelta * ratingsPrior.blendWeight, -0.08, 0.08);
    homeMean *= homeRatingFactor;
    awayMean *= awayRatingFactor;
    drivers.push(
      `${ratingsPrior.source === "EXTERNAL_VIDEO_GAME" ? "External" : "Derived"} ratings prior ${ratingsPrior.deltaOverall >= 0 ? "home+" : "away+"} ${round(Math.abs(ratingsPrior.deltaOverall), 1)}`
    );
  }

  let projectedTotal = homeMean + awayMean;
  let projectedSpreadHome = homeMean - awayMean;

  if (typeof input.marketAnchor?.total === "number" && Number.isFinite(input.marketAnchor.total)) {
    projectedTotal =
      projectedTotal * (1 - config.totalBlendWeight) +
      input.marketAnchor.total * config.totalBlendWeight;
    const ratio = projectedTotal / Math.max(1, homeMean + awayMean);
    homeMean *= ratio;
    awayMean *= ratio;
    drivers.push(`Market total anchor ${round(input.marketAnchor.total, 2)}`);
  }

  if (typeof input.marketAnchor?.spreadHome === "number" && Number.isFinite(input.marketAnchor.spreadHome)) {
    projectedSpreadHome =
      projectedSpreadHome * (1 - config.spreadBlendWeight) +
      input.marketAnchor.spreadHome * config.spreadBlendWeight;
    const avgScore = (homeMean + awayMean) / 2;
    homeMean = avgScore + projectedSpreadHome / 2;
    awayMean = avgScore - projectedSpreadHome / 2;
    drivers.push(`Market spread anchor ${round(input.marketAnchor.spreadHome, 2)}`);
  }

  const varianceMultiplier = clamp(input.interactionContext?.varianceMultiplier ?? 1, 0.85, 1.22);
  const homeStdBase =
    config.baseStdDev *
    clamp((input.home.ratings?.volatility ?? 50) / 50, 0.72, 1.38) *
    Math.sqrt(paceFactor) *
    varianceMultiplier;
  const awayStdBase =
    config.baseStdDev *
    clamp((input.away.ratings?.volatility ?? 50) / 50, 0.72, 1.38) *
    Math.sqrt(paceFactor) *
    varianceMultiplier;

  const homeScores: number[] = [];
  const awayScores: number[] = [];
  let homeWins = 0;

  for (let i = 0; i < samples; i += 1) {
    const homeScore = Math.max(0, homeMean + randomNormal(random) * homeStdBase);
    const awayScore = Math.max(0, awayMean + randomNormal(random) * awayStdBase);
    homeScores.push(homeScore);
    awayScores.push(awayScore);
    if (homeScore > awayScore) {
      homeWins += 1;
    } else if (homeScore === awayScore) {
      homeWins += 0.5;
    }
  }

  const totals = homeScores.map((score, index) => score + awayScores[index]);
  const spreadsHome = homeScores.map((score, index) => score - awayScores[index]);
  const projectedHomeScore = average(homeScores);
  const projectedAwayScore = average(awayScores);
  projectedTotal = projectedHomeScore + projectedAwayScore;
  projectedSpreadHome = projectedHomeScore - projectedAwayScore;
  const spreadStdDev = standardDeviation(spreadsHome);
  const monteCarloWinProbHome = homeWins / samples;
  const marginWinProbHome = normalCdf(projectedSpreadHome, 0, Math.max(0.25, spreadStdDev));
  let winProbHome = clamp(monteCarloWinProbHome * 0.72 + marginWinProbHome * 0.28, 0.02, 0.98);

  const log5Signal = buildLog5ScoringSignal(input);
  const teamStrengthPriors: ContextualGameSimulationSummary["teamStrengthPriors"] = {
    log5: null,
    linear: null,
    mlbElo: null
  };

  // These are low-weight priors, not the primary model. Monte Carlo + margin probability remains the main engine.
  // Log5/Pythagenpat is only a team-strength sanity layer when real scored/allowed context exists.
  if (log5Signal) {
    const prior = blendProbabilitySignal({
      baseProbability: winProbHome,
      signalProbability: log5Signal.teamAProbability,
      weight: input.log5Weight ?? 0.1,
      maxWeight: 0.25
    });
    const movement = prior.adjustedProbability - winProbHome;
    winProbHome = prior.adjustedProbability;
    teamStrengthPriors.log5 = {
      homeProbability: round(prior.signalProbability, 4),
      homeExpectedWinPct: round(log5Signal.teamAExpectedWinPct, 4),
      awayExpectedWinPct: round(log5Signal.teamBExpectedWinPct, 4),
      weight: prior.weight,
      movementPts: round(movement * 100, 2)
    };
    drivers.push(
      `Log5 Pythagenpat prior ${round(prior.signalProbability * 100, 1)}% home (${round(prior.weight * 100, 1)}% blend, ${movement >= 0 ? "+" : ""}${round(movement * 100, 2)} pts)`
    );
  } else {
    const homeLinearWinProfile = buildLinearWinProfile(input.leagueKey, input.home);
    const awayLinearWinProfile = buildLinearWinProfile(input.leagueKey, input.away);
    if (homeLinearWinProfile && awayLinearWinProfile) {
      const prior = linearWinPriorProbability({
        homeExpectedWinPct: homeLinearWinProfile.expectedWinPct,
        awayExpectedWinPct: awayLinearWinProfile.expectedWinPct,
        baseHomeWinProbability: winProbHome,
        weight: input.linearWinExpectancyWeight ?? 0.08
      });
      const movement = prior.adjustedHomeWinProbability - winProbHome;
      winProbHome = prior.adjustedHomeWinProbability;
      teamStrengthPriors.linear = {
        homeProbability: round(prior.linearHomeSignal, 4),
        weight: prior.weight,
        movementPts: round(movement * 100, 2),
        homeProfile: homeLinearWinProfile,
        awayProfile: awayLinearWinProfile
      };
      drivers.push(
        `Linear win expectancy prior ${round(prior.linearHomeSignal * 100, 1)}% home (${round(prior.weight * 100, 1)}% blend, ${movement >= 0 ? "+" : ""}${round(movement * 100, 2)} pts)`
      );
    }
  }

  // MLB Elo context is optional and data-dependent. It only blends when both real base ratings exist.
  const mlbEloPrior = buildMlbEloPrior(input);
  if (mlbEloPrior) {
    const weight = mlbEloPrior.probability == null ? 0 : clamp(input.mlbEloWeight ?? 0.06, 0, 0.15);
    const movement = mlbEloPrior.probability == null ? 0 : (mlbEloPrior.probability - winProbHome) * weight;
    if (mlbEloPrior.probability != null && weight > 0) {
      const prior = blendProbabilitySignal({
        baseProbability: winProbHome,
        signalProbability: mlbEloPrior.probability,
        weight,
        maxWeight: 0.15
      });
      winProbHome = prior.adjustedProbability;
      drivers.push(
        `MLB Elo context prior ${round(prior.signalProbability * 100, 1)}% home (${round(prior.weight * 100, 1)}% blend, ${movement >= 0 ? "+" : ""}${round(movement * 100, 2)} pts)`
      );
    }
    teamStrengthPriors.mlbElo = {
      homeProbability: mlbEloPrior.probability == null ? null : round(mlbEloPrior.probability, 4),
      weight,
      movementPts: round(movement * 100, 2),
      homeAdjustment: mlbEloPrior.homeAdjustment,
      awayAdjustment: mlbEloPrior.awayAdjustment,
      inputsUsed: mlbEloPrior.inputsUsed,
      notes: mlbEloPrior.notes
    };
  }

  return {
    engine: "contextual-monte-carlo-v2",
    projectedHomeScore: round(projectedHomeScore),
    projectedAwayScore: round(projectedAwayScore),
    projectedTotal: round(projectedTotal),
    projectedSpreadHome: round(projectedSpreadHome),
    winProbHome: round(winProbHome, 4),
    winProbAway: round(1 - winProbHome, 4),
    distribution: {
      totalStdDev: round(standardDeviation(totals)),
      homeScoreStdDev: round(standardDeviation(homeScores)),
      awayScoreStdDev: round(standardDeviation(awayScores)),
      spreadStdDev: round(spreadStdDev),
      p10Total: round(percentile(totals, 0.1)),
      p50Total: round(percentile(totals, 0.5)),
      p90Total: round(percentile(totals, 0.9)),
      p10SpreadHome: round(percentile(spreadsHome, 0.1)),
      p50SpreadHome: round(percentile(spreadsHome, 0.5)),
      p90SpreadHome: round(percentile(spreadsHome, 0.9))
    },
    drivers: Array.from(new Set(drivers)),
    ratingsPrior: {
      source: ratingsPrior?.source ?? "MISSING",
      blendWeight: ratingsPrior?.blendWeight ?? 0,
      deltaOverall: ratingsPrior?.deltaOverall ?? 0,
      confidence: ratingsPrior?.confidence ?? 0
    },
    teamStrengthPriors
  };
}
