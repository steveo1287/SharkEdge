import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";
import type { MlbSimulatedTeamPitchingBoxScore } from "@/services/simulation/mlb-simulated-pitching-box-score";

export type MlbPitchingPhase = "STARTER_FRESH" | "STARTER_SECOND_LOOK" | "STARTER_FATIGUE" | "BULLPEN" | "LATE_BULLPEN";
export type MlbPaBestOutcome = "CONTACT" | "CONTACT_PLUS" | "POWER" | "WALK" | "STRIKEOUT_RISK" | "VOLATILE";

export type MlbPlateAppearanceNode = {
  paNumber: number;
  inning: number;
  pitchingPhase: MlbPitchingPhase;
  pitcherRole: "STARTER" | "BULLPEN";
  bestOutcome: MlbPaBestOutcome;
  hitProbability: number;
  extraBaseHitProbability: number;
  homeRunProbability: number;
  walkProbability: number;
  strikeoutProbability: number;
  ballInPlayOutProbability: number;
  runContext: number;
  rbiContext: number;
  confidence: number;
  note: string;
};

export type MlbHitterPlateAppearancePath = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  expectedPlateAppearances: number;
  latePaChance: number;
  bestHitWindow: MlbPlateAppearanceNode;
  bestPowerWindow: MlbPlateAppearanceNode;
  highestStrikeoutRiskWindow: MlbPlateAppearanceNode;
  bullpenExposureShare: number;
  summary: string;
  plateAppearances: MlbPlateAppearanceNode[];
};

export type MlbTeamPlateAppearancePath = {
  team: string;
  opponentTeam: string;
  starterHandoffInning: number;
  bullpenExposureBeginsInning: number;
  averageLatePaChance: number;
  bullpenExposureShare: number;
  paths: MlbHitterPlateAppearancePath[];
  latePaCandidates: MlbHitterPlateAppearancePath[];
  bullpenUpsideHitters: MlbHitterPlateAppearancePath[];
};

export type MlbGamePlateAppearanceScript = {
  modelVersion: "mlb-plate-appearance-game-script-v1";
  awayTeam: MlbTeamPlateAppearancePath;
  homeTeam: MlbTeamPlateAppearancePath;
  topPlateAppearancePaths: MlbHitterPlateAppearancePath[];
  summary: string;
};

type BuildArgs = {
  projection: MlbPlayerStatProjectionGame;
  boxScore: MlbSimulatedGameBoxScore;
  awayPitching: MlbSimulatedTeamPitchingBoxScore;
  homePitching: MlbSimulatedTeamPitchingBoxScore;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProbabilities(args: {
  hit: number;
  extraBase: number;
  homeRun: number;
  walk: number;
  strikeout: number;
}) {
  const hit = clamp(args.hit, 0.02, 0.62);
  const extraBase = clamp(Math.min(args.extraBase, hit * 0.82), 0.005, 0.42);
  const homeRun = clamp(Math.min(args.homeRun, extraBase * 0.72), 0.001, 0.28);
  const walk = clamp(args.walk, 0.015, 0.28);
  const strikeout = clamp(args.strikeout, 0.035, 0.48);
  const used = hit + walk + strikeout;
  const ballInPlayOut = clamp(1 - used, 0.08, 0.74);
  return {
    hitProbability: round(hit),
    extraBaseHitProbability: round(extraBase),
    homeRunProbability: round(homeRun),
    walkProbability: round(walk),
    strikeoutProbability: round(strikeout),
    ballInPlayOutProbability: round(ballInPlayOut)
  };
}

function phaseForPa(paNumber: number, battingOrder: number, starterHandoffInning: number): { inning: number; phase: MlbPitchingPhase; pitcherRole: "STARTER" | "BULLPEN" } {
  const inning = Math.max(1, Math.min(9, Math.round((battingOrder + (paNumber - 1) * 9) / 3.35)));
  if (inning >= starterHandoffInning + 2) return { inning, phase: "LATE_BULLPEN", pitcherRole: "BULLPEN" };
  if (inning >= starterHandoffInning) return { inning, phase: "BULLPEN", pitcherRole: "BULLPEN" };
  if (paNumber === 1) return { inning, phase: "STARTER_FRESH", pitcherRole: "STARTER" };
  if (paNumber === 2) return { inning, phase: "STARTER_SECOND_LOOK", pitcherRole: "STARTER" };
  return { inning, phase: "STARTER_FATIGUE", pitcherRole: "STARTER" };
}

function phaseMultipliers(phase: MlbPitchingPhase, hitter: MlbHitterPerGameProjection) {
  const powerBias = hitter.statDistribution.homeRunProbability + hitter.statDistribution.totalBases4PlusProbability;
  switch (phase) {
    case "STARTER_FRESH":
      return { hit: 0.94, extraBase: 0.88, homeRun: 0.82, walk: 0.96, strikeout: 1.1, confidence: 0.96 };
    case "STARTER_SECOND_LOOK":
      return { hit: 1.02, extraBase: 1.03, homeRun: 1.02, walk: 1.0, strikeout: 0.98, confidence: 1.0 };
    case "STARTER_FATIGUE":
      return { hit: 1.08, extraBase: 1.12, homeRun: 1.16 + powerBias * 0.28, walk: 1.04, strikeout: 0.95, confidence: 0.98 };
    case "BULLPEN":
      return { hit: 1.0, extraBase: 1.08, homeRun: 1.12 + powerBias * 0.22, walk: 1.08, strikeout: 1.08, confidence: 0.9 };
    case "LATE_BULLPEN":
      return { hit: 0.98, extraBase: 1.12, homeRun: 1.18 + powerBias * 0.3, walk: 1.12, strikeout: 1.15, confidence: 0.84 };
  }
}

function bestOutcome(args: {
  hit: number;
  extraBase: number;
  homeRun: number;
  walk: number;
  strikeout: number;
  phase: MlbPitchingPhase;
}): MlbPaBestOutcome {
  if (args.strikeout >= 0.31 && args.strikeout > args.hit + 0.04) return "STRIKEOUT_RISK";
  if (args.homeRun >= 0.075 || args.extraBase >= 0.18) return args.phase === "BULLPEN" || args.phase === "LATE_BULLPEN" ? "VOLATILE" : "POWER";
  if (args.walk >= 0.13 && args.walk >= args.extraBase) return "WALK";
  if (args.hit >= 0.29) return "CONTACT_PLUS";
  return "CONTACT";
}

function nodeNote(phase: MlbPitchingPhase, outcome: MlbPaBestOutcome) {
  const phaseText: Record<MlbPitchingPhase, string> = {
    STARTER_FRESH: "starter fresh",
    STARTER_SECOND_LOOK: "second look at starter",
    STARTER_FATIGUE: "starter fatigue window",
    BULLPEN: "bullpen handoff window",
    LATE_BULLPEN: "late bullpen volatility"
  };
  return `${phaseText[phase]} · ${outcome.toLowerCase().replace(/_/g, " ")}`;
}

function makeNode(args: {
  hitter: MlbHitterPerGameProjection;
  boxHitter: MlbSimulatedHitterBoxScore;
  paNumber: number;
  starterHandoffInning: number;
  runContext: number;
  rbiContext: number;
}): MlbPlateAppearanceNode {
  const phase = phaseForPa(args.paNumber, args.hitter.battingOrder, args.starterHandoffInning);
  const mult = phaseMultipliers(phase.phase, args.hitter);
  const basePa = Math.max(1, args.hitter.expectedPlateAppearances);
  const hitBase = args.hitter.expectedHits / basePa;
  const extraBaseBase = Math.max(0.01, (args.hitter.expectedTotalBases - args.hitter.expectedHits) / Math.max(1, basePa * 1.45));
  const homeRunBase = args.hitter.expectedHomeRuns / basePa;
  const walkBase = args.hitter.expectedWalks / basePa;
  const strikeoutBase = args.hitter.expectedStrikeouts / basePa;
  const probs = normalizeProbabilities({
    hit: hitBase * mult.hit,
    extraBase: extraBaseBase * mult.extraBase,
    homeRun: homeRunBase * mult.homeRun,
    walk: walkBase * mult.walk,
    strikeout: strikeoutBase * mult.strikeout
  });
  const outcome = bestOutcome({
    hit: probs.hitProbability,
    extraBase: probs.extraBaseHitProbability,
    homeRun: probs.homeRunProbability,
    walk: probs.walkProbability,
    strikeout: probs.strikeoutProbability,
    phase: phase.phase
  });
  return {
    paNumber: args.paNumber,
    inning: phase.inning,
    pitchingPhase: phase.phase,
    pitcherRole: phase.pitcherRole,
    bestOutcome: outcome,
    ...probs,
    runContext: round(args.runContext * (args.paNumber >= 4 ? 1.08 : 1), 3),
    rbiContext: round(args.rbiContext * (args.paNumber >= 3 ? 1.07 : 1), 3),
    confidence: round(clamp(args.boxHitter.confidence * mult.confidence, 0.25, 0.94), 3),
    note: nodeNote(phase.phase, outcome)
  };
}

function latePaChance(hitter: MlbHitterPerGameProjection, boxHitter: MlbSimulatedHitterBoxScore, teamRuns: number) {
  const lineupBoost = clamp((10 - hitter.battingOrder) / 10, 0.08, 0.9);
  const runBoost = clamp(teamRuns / 6.4, 0.25, 1.25);
  const paBoost = clamp(hitter.expectedPlateAppearances - 4, 0, 1.35);
  return round(clamp(0.08 + lineupBoost * 0.18 + runBoost * 0.18 + paBoost * 0.22 + boxHitter.confidence * 0.08, 0.04, 0.78), 4);
}

function pathScore(path: MlbHitterPlateAppearancePath) {
  return round(path.bestHitWindow.hitProbability * 38 + path.bestPowerWindow.homeRunProbability * 155 + path.bullpenExposureShare * 12 + path.latePaChance * 8, 3);
}

function buildHitterPath(args: {
  hitter: MlbHitterPerGameProjection;
  boxHitter: MlbSimulatedHitterBoxScore;
  teamRuns: number;
  starterHandoffInning: number;
}): MlbHitterPlateAppearancePath {
  const paCount = Math.max(3, Math.min(5, Math.round(args.hitter.expectedPlateAppearances + 0.15)));
  const lateChance = latePaChance(args.hitter, args.boxHitter, args.teamRuns);
  const finalPaCount = paCount >= 5 || lateChance >= 0.42 ? 5 : 4;
  const runContext = clamp(args.hitter.expectedRuns / Math.max(0.2, args.hitter.expectedPlateAppearances), 0.04, 0.38);
  const rbiContext = clamp(args.hitter.expectedRbi / Math.max(0.2, args.hitter.expectedPlateAppearances), 0.04, 0.42);
  const nodes = Array.from({ length: finalPaCount }, (_, index) => makeNode({
    hitter: args.hitter,
    boxHitter: args.boxHitter,
    paNumber: index + 1,
    starterHandoffInning: args.starterHandoffInning,
    runContext,
    rbiContext
  }));
  const bestHitWindow = [...nodes].sort((a, b) => b.hitProbability - a.hitProbability)[0];
  const bestPowerWindow = [...nodes].sort((a, b) => b.homeRunProbability - a.homeRunProbability || b.extraBaseHitProbability - a.extraBaseHitProbability)[0];
  const highestStrikeoutRiskWindow = [...nodes].sort((a, b) => b.strikeoutProbability - a.strikeoutProbability)[0];
  const bullpenExposureShare = round(nodes.filter((node) => node.pitcherRole === "BULLPEN").length / Math.max(1, nodes.length), 4);
  const summary = `${args.boxHitter.playerName}: best hit PA${bestHitWindow.paNumber} (${bestHitWindow.inning}th, ${bestHitWindow.pitchingPhase.toLowerCase()}), best power PA${bestPowerWindow.paNumber}, K risk peak PA${highestStrikeoutRiskWindow.paNumber}, late PA chance ${Math.round(lateChance * 100)}%.`;
  return {
    playerId: args.hitter.playerId,
    playerName: args.hitter.playerName,
    team: args.hitter.team,
    battingOrder: args.hitter.battingOrder,
    expectedPlateAppearances: round(args.hitter.expectedPlateAppearances, 2),
    latePaChance: lateChance,
    bestHitWindow,
    bestPowerWindow,
    highestStrikeoutRiskWindow,
    bullpenExposureShare,
    summary,
    plateAppearances: nodes
  };
}

function starterHandoffInning(pitching: MlbSimulatedTeamPitchingBoxScore) {
  const starterIp = pitching.starter?.expected.inningsPitched ?? Math.max(3.8, 9 - pitching.bullpen.expected.inningsPitched);
  return Math.max(4, Math.min(8, Math.ceil(starterIp + 0.25)));
}

function buildTeamPath(args: {
  team: string;
  opponentTeam: string;
  hitters: MlbHitterPerGameProjection[];
  boxHitters: MlbSimulatedHitterBoxScore[];
  teamRuns: number;
  opponentPitching: MlbSimulatedTeamPitchingBoxScore;
}): MlbTeamPlateAppearancePath {
  const boxById = new Map(args.boxHitters.map((hitter) => [hitter.playerId, hitter]));
  const handoff = starterHandoffInning(args.opponentPitching);
  const paths = args.hitters
    .map((hitter) => {
      const boxHitter = boxById.get(hitter.playerId);
      if (!boxHitter) return null;
      return buildHitterPath({ hitter, boxHitter, teamRuns: args.teamRuns, starterHandoffInning: handoff });
    })
    .filter(Boolean) as MlbHitterPlateAppearancePath[];
  const averageLatePaChance = round(paths.reduce((sum, path) => sum + path.latePaChance, 0) / Math.max(1, paths.length), 4);
  const bullpenExposureShare = round(paths.reduce((sum, path) => sum + path.bullpenExposureShare, 0) / Math.max(1, paths.length), 4);
  return {
    team: args.team,
    opponentTeam: args.opponentTeam,
    starterHandoffInning: handoff,
    bullpenExposureBeginsInning: handoff,
    averageLatePaChance,
    bullpenExposureShare,
    paths,
    latePaCandidates: [...paths].sort((a, b) => b.latePaChance - a.latePaChance).slice(0, 5),
    bullpenUpsideHitters: [...paths].sort((a, b) => b.bullpenExposureShare - a.bullpenExposureShare || b.bestPowerWindow.homeRunProbability - a.bestPowerWindow.homeRunProbability).slice(0, 5)
  };
}

export function buildMlbPlateAppearanceGameScript(args: BuildArgs): MlbGamePlateAppearanceScript {
  const awayTeam = buildTeamPath({
    team: args.projection.awayTeam,
    opponentTeam: args.projection.homeTeam,
    hitters: args.projection.awayHitters,
    boxHitters: args.boxScore.awayTeam.hitters,
    teamRuns: args.boxScore.awayTeam.totals.projectedRuns,
    opponentPitching: args.homePitching
  });
  const homeTeam = buildTeamPath({
    team: args.projection.homeTeam,
    opponentTeam: args.projection.awayTeam,
    hitters: args.projection.homeHitters,
    boxHitters: args.boxScore.homeTeam.hitters,
    teamRuns: args.boxScore.homeTeam.totals.projectedRuns,
    opponentPitching: args.awayPitching
  });
  const allPaths = [...awayTeam.paths, ...homeTeam.paths];
  const topPlateAppearancePaths = [...allPaths].sort((a, b) => pathScore(b) - pathScore(a)).slice(0, 10);
  const summary = `${args.projection.awayTeam} bats enter bullpen exposure around inning ${awayTeam.bullpenExposureBeginsInning}; ${args.projection.homeTeam} bats enter bullpen exposure around inning ${homeTeam.bullpenExposureBeginsInning}. Top PA paths rank late-PA chance, best hit window, and best power window.`;
  return {
    modelVersion: "mlb-plate-appearance-game-script-v1",
    awayTeam,
    homeTeam,
    topPlateAppearancePaths,
    summary
  };
}
