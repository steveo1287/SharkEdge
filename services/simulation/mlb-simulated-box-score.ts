import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbSimulatedHitterBoxScore = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  expected: {
    plateAppearances: number;
    atBats: number;
    hits: number;
    totalBases: number;
    homeRuns: number;
    runs: number;
    rbi: number;
    walks: number;
    strikeouts: number;
    stolenBases: number;
  };
  likelyLine: {
    plateAppearances: number;
    atBats: number;
    hits: number;
    totalBases: number;
    homeRuns: number;
    runs: number;
    rbi: number;
    walks: number;
    strikeouts: number;
    stolenBases: number;
  };
  probabilities: {
    hit1Plus: number;
    hit2Plus: number;
    hit3Plus: number;
    totalBases2Plus: number;
    totalBases4Plus: number;
    homeRun: number;
    walk1Plus: number;
    strikeout2Plus: number;
  };
  confidence: number;
  impactScore: number;
  volatility: number;
  summary: string;
  reasons: string[];
};

export type MlbSimulatedTeamBoxScore = {
  team: string;
  hitters: MlbSimulatedHitterBoxScore[];
  totals: {
    projectedRuns: number;
    plateAppearances: number;
    atBats: number;
    hits: number;
    totalBases: number;
    homeRuns: number;
    runs: number;
    rbi: number;
    walks: number;
    strikeouts: number;
    stolenBases: number;
  };
  leaders: {
    bestHitProbability: MlbSimulatedHitterBoxScore | null;
    bestPower: MlbSimulatedHitterBoxScore | null;
    bestRunProduction: MlbSimulatedHitterBoxScore | null;
    highestVolatility: MlbSimulatedHitterBoxScore | null;
  };
};

export type MlbSimulatedGameBoxScore = {
  modelVersion: "mlb-simulated-box-score-v1";
  awayTeam: MlbSimulatedTeamBoxScore;
  homeTeam: MlbSimulatedTeamBoxScore;
  gameTotals: {
    projectedRuns: number;
    projectedHits: number;
    projectedTotalBases: number;
    projectedHomeRuns: number;
    projectedWalks: number;
    projectedStrikeouts: number;
  };
  topProjectedHitters: MlbSimulatedHitterBoxScore[];
  notes: string[];
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function likelyCount(expected: number, probability?: number, threshold = 0.5) {
  if (typeof probability === "number" && Number.isFinite(probability)) {
    if (probability >= threshold) return Math.max(1, Math.round(expected));
    if (probability < 0.18) return 0;
  }
  return Math.max(0, Math.round(expected));
}

function impactScore(hitter: MlbHitterPerGameProjection) {
  return round(
    hitter.expectedHits * 18 +
    hitter.expectedTotalBases * 10 +
    hitter.expectedHomeRuns * 55 +
    hitter.expectedRuns * 9 +
    hitter.expectedRbi * 10 +
    hitter.expectedWalks * 4 -
    hitter.expectedStrikeouts * 2,
    2
  );
}

function volatility(hitter: MlbHitterPerGameProjection) {
  return round(clamp(
    hitter.statDistribution.volatility +
    hitter.statDistribution.homeRunProbability * 1.2 +
    hitter.statDistribution.totalBases4PlusProbability * 0.8,
    0.6,
    2.4
  ), 3);
}

function summarizeHitter(hitter: MlbHitterPerGameProjection) {
  const pieces: string[] = [];
  if (hitter.statDistribution.hit1PlusProbability >= 0.65) pieces.push("strong hit expectation");
  if (hitter.statDistribution.totalBases2PlusProbability >= 0.45) pieces.push("extra-base upside");
  if (hitter.statDistribution.homeRunProbability >= 0.12) pieces.push("home-run path");
  if (hitter.expectedWalks >= 0.45) pieces.push("walk/on-base support");
  if (hitter.expectedStrikeouts >= 1.35) pieces.push("strikeout drag");
  if (!pieces.length) pieces.push("balanced projection");
  return pieces.join(", ");
}

function hitterReasons(hitter: MlbHitterPerGameProjection) {
  const reasons = [
    ...hitter.reasons,
    ...hitter.batterStatProfile.drivers,
    ...hitter.advancedMatchup.drivers,
    ...hitter.plateAppearanceOutcome.drivers,
    ...hitter.eliteContext.drivers
  ];
  return [...new Set(reasons)].slice(0, 8);
}

export function toSimulatedHitterBoxScore(hitter: MlbHitterPerGameProjection): MlbSimulatedHitterBoxScore {
  const expectedWalks = Math.max(0, hitter.expectedWalks);
  const expectedAtBats = Math.max(0, hitter.expectedPlateAppearances - expectedWalks);
  const expected = {
    plateAppearances: round(hitter.expectedPlateAppearances, 2),
    atBats: round(expectedAtBats, 2),
    hits: round(hitter.expectedHits, 3),
    totalBases: round(hitter.expectedTotalBases, 3),
    homeRuns: round(hitter.expectedHomeRuns, 3),
    runs: round(hitter.expectedRuns, 3),
    rbi: round(hitter.expectedRbi, 3),
    walks: round(expectedWalks, 3),
    strikeouts: round(hitter.expectedStrikeouts, 3),
    stolenBases: round(hitter.stolenBaseProbability, 3)
  };
  const likelyHits = likelyCount(hitter.expectedHits, hitter.statDistribution.hit1PlusProbability, 0.52);
  const likelyHomeRuns = hitter.statDistribution.homeRunProbability >= 0.28 ? 1 : 0;
  const likelyTotalBases = Math.max(likelyHits, likelyHomeRuns ? 4 : likelyCount(hitter.expectedTotalBases, hitter.statDistribution.totalBases2PlusProbability, 0.55));
  const likely = {
    plateAppearances: Math.max(3, Math.round(hitter.expectedPlateAppearances)),
    atBats: Math.max(2, Math.round(expectedAtBats)),
    hits: likelyHits,
    totalBases: likelyTotalBases,
    homeRuns: likelyHomeRuns,
    runs: likelyCount(hitter.expectedRuns, undefined, 0.5),
    rbi: likelyCount(hitter.expectedRbi, undefined, 0.5),
    walks: likelyCount(expectedWalks, hitter.statDistribution.walk1PlusProbability, 0.5),
    strikeouts: likelyCount(hitter.expectedStrikeouts, hitter.statDistribution.strikeout1PlusProbability, 0.5),
    stolenBases: hitter.stolenBaseProbability >= 0.18 ? 1 : 0
  };

  return {
    playerId: hitter.playerId,
    playerName: hitter.playerName,
    team: hitter.team,
    battingOrder: hitter.battingOrder,
    expected,
    likelyLine: likely,
    probabilities: {
      hit1Plus: round(hitter.statDistribution.hit1PlusProbability, 4),
      hit2Plus: round(hitter.statDistribution.hit2PlusProbability, 4),
      hit3Plus: round(hitter.statDistribution.hit3PlusProbability, 4),
      totalBases2Plus: round(hitter.statDistribution.totalBases2PlusProbability, 4),
      totalBases4Plus: round(hitter.statDistribution.totalBases4PlusProbability, 4),
      homeRun: round(hitter.statDistribution.homeRunProbability, 4),
      walk1Plus: round(hitter.statDistribution.walk1PlusProbability, 4),
      strikeout2Plus: round(hitter.statDistribution.strikeout2PlusProbability, 4)
    },
    confidence: round(hitter.confidence, 3),
    impactScore: impactScore(hitter),
    volatility: volatility(hitter),
    summary: summarizeHitter(hitter),
    reasons: hitterReasons(hitter)
  };
}

function sum(hitters: MlbSimulatedHitterBoxScore[], selector: (hitter: MlbSimulatedHitterBoxScore) => number) {
  return round(hitters.reduce((total, hitter) => total + selector(hitter), 0), 3);
}

function topBy(hitters: MlbSimulatedHitterBoxScore[], selector: (hitter: MlbSimulatedHitterBoxScore) => number) {
  return [...hitters].sort((a, b) => selector(b) - selector(a))[0] ?? null;
}

function buildTeam(team: string, projectedRuns: number, hitters: MlbHitterPerGameProjection[]): MlbSimulatedTeamBoxScore {
  const rows = hitters.map(toSimulatedHitterBoxScore).sort((a, b) => a.battingOrder - b.battingOrder);
  return {
    team,
    hitters: rows,
    totals: {
      projectedRuns: round(projectedRuns, 2),
      plateAppearances: sum(rows, (row) => row.expected.plateAppearances),
      atBats: sum(rows, (row) => row.expected.atBats),
      hits: sum(rows, (row) => row.expected.hits),
      totalBases: sum(rows, (row) => row.expected.totalBases),
      homeRuns: sum(rows, (row) => row.expected.homeRuns),
      runs: sum(rows, (row) => row.expected.runs),
      rbi: sum(rows, (row) => row.expected.rbi),
      walks: sum(rows, (row) => row.expected.walks),
      strikeouts: sum(rows, (row) => row.expected.strikeouts),
      stolenBases: sum(rows, (row) => row.expected.stolenBases)
    },
    leaders: {
      bestHitProbability: topBy(rows, (row) => row.probabilities.hit1Plus),
      bestPower: topBy(rows, (row) => row.expected.homeRuns * 4 + row.probabilities.totalBases4Plus),
      bestRunProduction: topBy(rows, (row) => row.expected.runs + row.expected.rbi),
      highestVolatility: topBy(rows, (row) => row.volatility)
    }
  };
}

export function buildMlbSimulatedBoxScore(projection: MlbPlayerStatProjectionGame): MlbSimulatedGameBoxScore {
  const awayRuns = projection.awayHitters.reduce((total, hitter) => total + hitter.expectedRuns, 0);
  const homeRuns = projection.homeHitters.reduce((total, hitter) => total + hitter.expectedRuns, 0);
  const awayTeam = buildTeam(projection.awayTeam, awayRuns, projection.awayHitters);
  const homeTeam = buildTeam(projection.homeTeam, homeRuns, projection.homeHitters);
  const allHitters = [...awayTeam.hitters, ...homeTeam.hitters];
  return {
    modelVersion: "mlb-simulated-box-score-v1",
    awayTeam,
    homeTeam,
    gameTotals: {
      projectedRuns: round(awayTeam.totals.projectedRuns + homeTeam.totals.projectedRuns, 2),
      projectedHits: round(awayTeam.totals.hits + homeTeam.totals.hits, 3),
      projectedTotalBases: round(awayTeam.totals.totalBases + homeTeam.totals.totalBases, 3),
      projectedHomeRuns: round(awayTeam.totals.homeRuns + homeTeam.totals.homeRuns, 3),
      projectedWalks: round(awayTeam.totals.walks + homeTeam.totals.walks, 3),
      projectedStrikeouts: round(awayTeam.totals.strikeouts + homeTeam.totals.strikeouts, 3)
    },
    topProjectedHitters: [...allHitters].sort((a, b) => b.impactScore - a.impactScore).slice(0, 10),
    notes: [
      "Box score is simulation-derived from player ratings, matchup context, lineup order, plate appearance outcomes, and elite adjustment context.",
      "Expected values are means; likely lines are deterministic display estimates and should not be treated as settled results.",
      "No sportsbook prop odds are required or used for this box score."
    ]
  };
}
