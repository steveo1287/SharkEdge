import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbSimulationTier = "ALPHA" | "PLUS" | "STABLE" | "VOLATILE" | "LOW_SIGNAL";
export type MlbSimulationLabel = "HIGH" | "MEDIUM" | "LOW";

export type MlbSimulatedHitterBoxScore = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  tier: MlbSimulationTier;
  confidenceLabel: MlbSimulationLabel;
  volatilityLabel: MlbSimulationLabel;
  matchupEdge: number;
  range: {
    floor: {
      hits: number;
      totalBases: number;
      homeRuns: number;
      runs: number;
      rbi: number;
      walks: number;
      strikeouts: number;
    };
    median: {
      hits: number;
      totalBases: number;
      homeRuns: number;
      runs: number;
      rbi: number;
      walks: number;
      strikeouts: number;
    };
    ceiling: {
      hits: number;
      totalBases: number;
      homeRuns: number;
      runs: number;
      rbi: number;
      walks: number;
      strikeouts: number;
    };
  };
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
  profile: {
    runEnvironment: MlbSimulationLabel;
    contactGrade: MlbSimulationLabel;
    powerGrade: MlbSimulationLabel;
    strikeoutRisk: MlbSimulationLabel;
    volatilityGrade: MlbSimulationLabel;
    averageConfidence: number;
    gameScript: string;
  };
  leaders: {
    bestHitProbability: MlbSimulatedHitterBoxScore | null;
    bestPower: MlbSimulatedHitterBoxScore | null;
    bestRunProduction: MlbSimulatedHitterBoxScore | null;
    highestVolatility: MlbSimulatedHitterBoxScore | null;
  };
};

export type MlbSimulatedGameBoxScore = {
  modelVersion: "mlb-simulated-box-score-v2";
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
  gameScript: {
    scoringEnvironment: MlbSimulationLabel;
    powerEnvironment: MlbSimulationLabel;
    contactEnvironment: MlbSimulationLabel;
    strikeoutEnvironment: MlbSimulationLabel;
    volatilityEnvironment: MlbSimulationLabel;
    summary: string;
  };
  topProjectedHitters: MlbSimulatedHitterBoxScore[];
  alphaHitters: MlbSimulatedHitterBoxScore[];
  volatileCeilingHitters: MlbSimulatedHitterBoxScore[];
  notes: string[];
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function label(value: number, high: number, medium: number): MlbSimulationLabel {
  if (value >= high) return "HIGH";
  if (value >= medium) return "MEDIUM";
  return "LOW";
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

function matchupEdge(hitter: MlbHitterPerGameProjection) {
  return round(clamp(
    hitter.advancedMatchup.contactMultiplier * 9 +
    hitter.advancedMatchup.powerMultiplier * 9 +
    hitter.advancedMatchup.walkMultiplier * 3 -
    hitter.advancedMatchup.strikeoutMultiplier * 6 +
    hitter.advancedMatchup.pitchTypeScore * 0.7 +
    hitter.advancedMatchup.rollingFormScore * 0.5 +
    hitter.advancedMatchup.environmentScore * 0.4 -
    hitter.plateAppearanceOutcome.pitcherSuppressionScore * 0.5,
    -25,
    35
  ), 2);
}

function simulationTier(args: { impactScore: number; volatility: number; confidence: number; homeRunProbability: number; totalBases4Plus: number }): MlbSimulationTier {
  if (args.confidence < 0.45) return "LOW_SIGNAL";
  if (args.impactScore >= 46 && args.confidence >= 0.68) return "ALPHA";
  if (args.impactScore >= 34 && args.confidence >= 0.58) return "PLUS";
  if (args.volatility >= 1.55 || args.homeRunProbability >= 0.16 || args.totalBases4Plus >= 0.24) return "VOLATILE";
  return "STABLE";
}

function buildRange(expected: number, vol: number, floorFactor = 0.42, ceilingFactor = 1.7) {
  const spread = clamp(vol, 0.75, 2.2);
  return {
    floor: round(Math.max(0, expected * floorFactor / spread), 2),
    median: round(Math.max(0, expected), 2),
    ceiling: round(Math.max(0, expected * ceilingFactor * spread), 2)
  };
}

function summarizeHitter(hitter: MlbHitterPerGameProjection, tier: MlbSimulationTier, edge: number) {
  const pieces: string[] = [];
  if (tier === "ALPHA") pieces.push("alpha projection");
  if (tier === "PLUS") pieces.push("plus matchup");
  if (tier === "VOLATILE") pieces.push("boom/bust ceiling");
  if (hitter.statDistribution.hit1PlusProbability >= 0.65) pieces.push("strong hit expectation");
  if (hitter.statDistribution.totalBases2PlusProbability >= 0.45) pieces.push("extra-base upside");
  if (hitter.statDistribution.homeRunProbability >= 0.12) pieces.push("home-run path");
  if (hitter.expectedWalks >= 0.45) pieces.push("walk/on-base support");
  if (hitter.expectedStrikeouts >= 1.35) pieces.push("strikeout drag");
  if (edge >= 12) pieces.push("positive matchup edge");
  if (edge <= -8) pieces.push("suppressed matchup");
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
  return [...new Set(reasons)].slice(0, 10);
}

export function toSimulatedHitterBoxScore(hitter: MlbHitterPerGameProjection): MlbSimulatedHitterBoxScore {
  const expectedWalks = Math.max(0, hitter.expectedWalks);
  const expectedAtBats = Math.max(0, hitter.expectedPlateAppearances - expectedWalks);
  const vol = volatility(hitter);
  const edge = matchupEdge(hitter);
  const impact = impactScore(hitter);
  const tier = simulationTier({
    impactScore: impact,
    volatility: vol,
    confidence: hitter.confidence,
    homeRunProbability: hitter.statDistribution.homeRunProbability,
    totalBases4Plus: hitter.statDistribution.totalBases4PlusProbability
  });
  const hitRange = buildRange(hitter.expectedHits, vol, 0.45, 1.6);
  const tbRange = buildRange(hitter.expectedTotalBases, vol, 0.35, 1.9);
  const hrRange = buildRange(hitter.expectedHomeRuns, vol, 0.1, 3.6);
  const runRange = buildRange(hitter.expectedRuns, vol, 0.35, 1.8);
  const rbiRange = buildRange(hitter.expectedRbi, vol, 0.35, 1.9);
  const walkRange = buildRange(expectedWalks, vol, 0.4, 1.7);
  const kRange = buildRange(hitter.expectedStrikeouts, vol, 0.45, 1.55);
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
    tier,
    confidenceLabel: label(hitter.confidence, 0.72, 0.55),
    volatilityLabel: label(vol, 1.45, 1.05),
    matchupEdge: edge,
    range: {
      floor: { hits: hitRange.floor, totalBases: tbRange.floor, homeRuns: hrRange.floor, runs: runRange.floor, rbi: rbiRange.floor, walks: walkRange.floor, strikeouts: kRange.floor },
      median: { hits: hitRange.median, totalBases: tbRange.median, homeRuns: hrRange.median, runs: runRange.median, rbi: rbiRange.median, walks: walkRange.median, strikeouts: kRange.median },
      ceiling: { hits: hitRange.ceiling, totalBases: tbRange.ceiling, homeRuns: hrRange.ceiling, runs: runRange.ceiling, rbi: rbiRange.ceiling, walks: walkRange.ceiling, strikeouts: kRange.ceiling }
    },
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
    impactScore: impact,
    volatility: vol,
    summary: summarizeHitter(hitter, tier, edge),
    reasons: hitterReasons(hitter)
  };
}

function sum(hitters: MlbSimulatedHitterBoxScore[], selector: (hitter: MlbSimulatedHitterBoxScore) => number) {
  return round(hitters.reduce((total, hitter) => total + selector(hitter), 0), 3);
}

function topBy(hitters: MlbSimulatedHitterBoxScore[], selector: (hitter: MlbSimulatedHitterBoxScore) => number) {
  return [...hitters].sort((a, b) => selector(b) - selector(a))[0] ?? null;
}

function buildTeamProfile(team: string, hitters: MlbSimulatedHitterBoxScore[], totals: MlbSimulatedTeamBoxScore["totals"]): MlbSimulatedTeamBoxScore["profile"] {
  const averageConfidence = round(mean(hitters.map((row) => row.confidence)), 3);
  const avgVolatility = mean(hitters.map((row) => row.volatility));
  const runEnvironment = label(totals.projectedRuns, 4.8, 3.8);
  const contactGrade = label(totals.hits, 9, 7.2);
  const powerGrade = label(totals.totalBases, 15, 11.5);
  const strikeoutRisk = label(totals.strikeouts, 9.5, 7.2);
  const volatilityGrade = label(avgVolatility, 1.45, 1.05);
  const gameScript = `${team} projects as a ${runEnvironment.toLowerCase()} run environment with ${contactGrade.toLowerCase()} contact, ${powerGrade.toLowerCase()} power, and ${strikeoutRisk.toLowerCase()} strikeout risk.`;
  return { runEnvironment, contactGrade, powerGrade, strikeoutRisk, volatilityGrade, averageConfidence, gameScript };
}

function buildTeam(team: string, projectedRuns: number, hitters: MlbHitterPerGameProjection[]): MlbSimulatedTeamBoxScore {
  const rows = hitters.map(toSimulatedHitterBoxScore).sort((a, b) => a.battingOrder - b.battingOrder);
  const totals = {
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
  };
  return {
    team,
    hitters: rows,
    totals,
    profile: buildTeamProfile(team, rows, totals),
    leaders: {
      bestHitProbability: topBy(rows, (row) => row.probabilities.hit1Plus),
      bestPower: topBy(rows, (row) => row.expected.homeRuns * 4 + row.probabilities.totalBases4Plus),
      bestRunProduction: topBy(rows, (row) => row.expected.runs + row.expected.rbi),
      highestVolatility: topBy(rows, (row) => row.volatility)
    }
  };
}

function gameScript(awayTeam: MlbSimulatedTeamBoxScore, homeTeam: MlbSimulatedTeamBoxScore): MlbSimulatedGameBoxScore["gameScript"] {
  const projectedRuns = awayTeam.totals.projectedRuns + homeTeam.totals.projectedRuns;
  const projectedHits = awayTeam.totals.hits + homeTeam.totals.hits;
  const projectedHomeRuns = awayTeam.totals.homeRuns + homeTeam.totals.homeRuns;
  const projectedStrikeouts = awayTeam.totals.strikeouts + homeTeam.totals.strikeouts;
  const avgVolatility = mean([...awayTeam.hitters, ...homeTeam.hitters].map((row) => row.volatility));
  const scoringEnvironment = label(projectedRuns, 9.3, 7.2);
  const powerEnvironment = label(projectedHomeRuns, 2.2, 1.25);
  const contactEnvironment = label(projectedHits, 17.2, 14.2);
  const strikeoutEnvironment = label(projectedStrikeouts, 18, 14.5);
  const volatilityEnvironment = label(avgVolatility, 1.45, 1.05);
  const summary = `${awayTeam.team} @ ${homeTeam.team}: ${scoringEnvironment.toLowerCase()} scoring, ${contactEnvironment.toLowerCase()} hit volume, ${powerEnvironment.toLowerCase()} power, ${strikeoutEnvironment.toLowerCase()} strikeout pressure, ${volatilityEnvironment.toLowerCase()} volatility.`;
  return { scoringEnvironment, powerEnvironment, contactEnvironment, strikeoutEnvironment, volatilityEnvironment, summary };
}

export function buildMlbSimulatedBoxScore(projection: MlbPlayerStatProjectionGame): MlbSimulatedGameBoxScore {
  const awayRuns = projection.awayHitters.reduce((total, hitter) => total + hitter.expectedRuns, 0);
  const homeRuns = projection.homeHitters.reduce((total, hitter) => total + hitter.expectedRuns, 0);
  const awayTeam = buildTeam(projection.awayTeam, awayRuns, projection.awayHitters);
  const homeTeam = buildTeam(projection.homeTeam, homeRuns, projection.homeHitters);
  const allHitters = [...awayTeam.hitters, ...homeTeam.hitters];
  return {
    modelVersion: "mlb-simulated-box-score-v2",
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
    gameScript: gameScript(awayTeam, homeTeam),
    topProjectedHitters: [...allHitters].sort((a, b) => b.impactScore - a.impactScore).slice(0, 10),
    alphaHitters: [...allHitters].filter((row) => row.tier === "ALPHA" || row.tier === "PLUS").sort((a, b) => b.impactScore - a.impactScore).slice(0, 8),
    volatileCeilingHitters: [...allHitters].filter((row) => row.tier === "VOLATILE" || row.volatilityLabel === "HIGH").sort((a, b) => b.volatility - a.volatility || b.impactScore - a.impactScore).slice(0, 8),
    notes: [
      "Box score is simulation-derived from player ratings, matchup context, lineup order, plate appearance outcomes, and elite adjustment context.",
      "Expected values are means; likely lines are deterministic display estimates and should not be treated as settled results.",
      "Floor/median/ceiling ranges are display bands derived from expected value and player-specific variance, not guaranteed outcomes.",
      "No sportsbook prop odds are required or used for this box score."
    ]
  };
}
