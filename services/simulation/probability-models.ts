import type { LeagueKey } from "@/lib/types/domain";

export type PoissonScoreOutcome = {
  homeWinPct: number;
  awayWinPct: number;
  tiePct: number;
};

export type SportOutcomeModel = {
  modelVersion: "outcome-ensemble-v1";
  league: LeagueKey;
  bradleyTerryHomeWinPct: number;
  marginLogisticHomeWinPct: number | null;
  poissonHomeWinPct: number | null;
  poissonTiePct: number | null;
  blendedHomeWinPct: number;
  notes: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

export function bradleyTerryWinProbability(homeSkill: number, awaySkill: number, temperature = 1) {
  const safeTemperature = clamp(temperature, 0.1, 12);
  return clamp(sigmoid((homeSkill - awaySkill) / safeTemperature), 0.01, 0.99);
}

export function marginLogisticWinProbability(homeScoreMargin: number, scale: number) {
  return clamp(sigmoid(homeScoreMargin / clamp(scale, 0.4, 40)), 0.01, 0.99);
}

export function poissonProbability(mean: number, score: number) {
  const safeMean = clamp(mean, 0.05, 260);
  let probability = Math.exp(-safeMean);
  for (let index = 1; index <= score; index += 1) {
    probability *= safeMean / index;
  }
  return probability;
}

export function poissonScoreOutcome(args: {
  awayMean: number;
  homeMean: number;
  maxScore: number;
  tieHomeWinPct?: number;
}): PoissonScoreOutcome {
  const maxScore = Math.max(1, Math.floor(args.maxScore));
  const tieHomeWinPct = clamp(args.tieHomeWinPct ?? 0.5, 0, 1);
  const awayProbabilities = Array.from({ length: maxScore + 1 }, (_, score) => poissonProbability(args.awayMean, score));
  const homeProbabilities = Array.from({ length: maxScore + 1 }, (_, score) => poissonProbability(args.homeMean, score));
  let homeWin = 0;
  let awayWin = 0;
  let tie = 0;

  for (let awayScore = 0; awayScore <= maxScore; awayScore += 1) {
    for (let homeScore = 0; homeScore <= maxScore; homeScore += 1) {
      const probability = awayProbabilities[awayScore] * homeProbabilities[homeScore];
      if (homeScore > awayScore) homeWin += probability;
      else if (awayScore > homeScore) awayWin += probability;
      else tie += probability;
    }
  }

  const covered = homeWin + awayWin + tie;
  if (covered > 0) {
    homeWin /= covered;
    awayWin /= covered;
    tie /= covered;
  }

  return {
    homeWinPct: round(clamp(homeWin + tie * tieHomeWinPct, 0.01, 0.99)),
    awayWinPct: round(clamp(awayWin + tie * (1 - tieHomeWinPct), 0.01, 0.99)),
    tiePct: round(clamp(tie, 0, 0.35))
  };
}

function marginScale(league: LeagueKey) {
  switch (league) {
    case "NBA": return 12;
    case "NFL": return 8.2;
    case "NCAAF": return 10.8;
    case "NHL": return 1.18;
    default: return 8;
  }
}

function scoreCap(league: LeagueKey, awayScore: number, homeScore: number) {
  if (league === "NHL") return 14;
  return Math.ceil(Math.max(awayScore, homeScore) + 8);
}

export function buildSportOutcomeModel(args: {
  league: LeagueKey;
  awayScore: number;
  homeScore: number;
  homeSkillEdge: number;
  volatilityIndex: number;
}): SportOutcomeModel {
  const skillTemperature = args.league === "UFC" || args.league === "BOXING" ? 6.5 : 5.2;
  const bradleyTerry = bradleyTerryWinProbability(args.homeSkillEdge, 0, skillTemperature);
  const margin = args.homeScore - args.awayScore;
  const marginModel = args.league === "UFC" || args.league === "BOXING"
    ? null
    : marginLogisticWinProbability(margin, marginScale(args.league));
  const poisson = args.league === "NHL"
    ? poissonScoreOutcome({ awayMean: args.awayScore, homeMean: args.homeScore, maxScore: scoreCap(args.league, args.awayScore, args.homeScore), tieHomeWinPct: 0.51 })
    : null;

  const volatilityShrink = clamp((args.volatilityIndex - 1) * 0.045, 0, 0.08);
  let blended = bradleyTerry;
  const notes = ["Bradley-Terry skill model converts weighted team/fighter strength into a matchup probability."];

  if (args.league === "NHL" && poisson && marginModel != null) {
    blended = poisson.homeWinPct * 0.6 + bradleyTerry * 0.25 + marginModel * 0.15;
    notes.push("NHL uses a discrete Poisson score model because goals are low-count events.");
    notes.push(`Tie/OT probability modeled at ${(poisson.tiePct * 100).toFixed(1)}% with small home OT advantage.`);
  } else if (marginModel != null) {
    blended = marginModel * 0.58 + bradleyTerry * 0.42;
    notes.push("Team sports blend score-margin logistic probability with Bradley-Terry skill probability.");
  } else {
    notes.push("Combat sports use Bradley-Terry as the core winner model because score totals are not meaningful.");
  }

  blended = clamp(0.5 + (blended - 0.5) * (1 - volatilityShrink), 0.04, 0.96);

  return {
    modelVersion: "outcome-ensemble-v1",
    league: args.league,
    bradleyTerryHomeWinPct: round(bradleyTerry),
    marginLogisticHomeWinPct: marginModel == null ? null : round(marginModel),
    poissonHomeWinPct: poisson?.homeWinPct ?? null,
    poissonTiePct: poisson?.tiePct ?? null,
    blendedHomeWinPct: round(blended),
    notes
  };
}
