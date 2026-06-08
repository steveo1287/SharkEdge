import type { MlbBaseStateRunRbiEngine, MlbHitterBaseStateContext } from "@/services/simulation/mlb-base-state-run-rbi-engine";
import type { MlbMatchupTraitEngine, MlbMatchupTraitRow } from "@/services/simulation/mlb-matchup-trait-engine";
import type { MlbPaWindowRanking, MlbPaWindowRankingRow } from "@/services/simulation/mlb-pa-window-ranking";
import type { MlbGamePlateAppearanceScript, MlbHitterPlateAppearancePath } from "@/services/simulation/mlb-plate-appearance-game-script";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

export type MlbEliteBatterGrade = "A_PLUS" | "A" | "B_PLUS" | "B" | "WATCH" | "FADE";
export type MlbEliteBatterTag = "CORE_BAT" | "POWER_CEILING" | "CONTACT_FLOOR" | "RUN_RBI_ENGINE" | "LATE_PA_UPSIDE" | "BULLPEN_ATTACK" | "MATCHUP_EDGE" | "RISK_TRAP";

export type MlbEliteBatterScoreRow = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  rank: number;
  grade: MlbEliteBatterGrade;
  score: number;
  confidence: number;
  tags: MlbEliteBatterTag[];
  componentScores: {
    boxScore: number;
    matchupTrait: number;
    plateAppearance: number;
    baseState: number;
    confidence: number;
    riskPenalty: number;
  };
  expectedLine: MlbSimulatedHitterBoxScore["expected"];
  matchupTrait: Pick<MlbMatchupTraitRow, "traitLabel" | "traitScore" | "pitchTypeScore" | "platoonScore" | "deltas" | "drivers" | "summary"> | null;
  plateAppearance: Pick<MlbHitterPlateAppearancePath, "latePaChance" | "bullpenExposureShare" | "bestHitWindow" | "bestPowerWindow" | "highestStrikeoutRiskWindow" | "summary"> | null;
  baseState: Pick<MlbHitterBaseStateContext, "lineupRole" | "rbiOpportunityScore" | "runScoringOpportunityScore" | "lineupProtectionScore" | "expectedRunsAfterContext" | "expectedRbiAfterContext" | "bestRbiWindow" | "bestRunWindow" | "isRbiTrap" | "drivers" | "summary"> | null;
  paRanking: Pick<MlbPaWindowRankingRow, "score" | "drivers" | "summary"> | null;
  drivers: string[];
  warnings: string[];
  summary: string;
};

export type MlbEliteBatterIntelligenceScore = {
  modelVersion: "mlb-elite-batter-intelligence-score-v1";
  overall: MlbEliteBatterScoreRow[];
  coreBats: MlbEliteBatterScoreRow[];
  powerCeiling: MlbEliteBatterScoreRow[];
  contactFloor: MlbEliteBatterScoreRow[];
  runRbiEngines: MlbEliteBatterScoreRow[];
  latePaUpside: MlbEliteBatterScoreRow[];
  matchupEdges: MlbEliteBatterScoreRow[];
  riskTraps: MlbEliteBatterScoreRow[];
  summary: string;
};

function round(value: number, digits = 3) { return Number(value.toFixed(digits)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function hitterRows(boxScore: MlbSimulatedGameBoxScore) {
  return [...boxScore.awayTeam.hitters, ...boxScore.homeTeam.hitters];
}

function mapById<T extends { playerId: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.playerId, row]));
}

function paRankMap(ranking: MlbPaWindowRanking) {
  const out = new Map<string, MlbPaWindowRankingRow>();
  for (const row of ranking.overall) out.set(row.playerId, row);
  return out;
}

function grade(score: number, riskPenalty: number): MlbEliteBatterGrade {
  if (riskPenalty >= 18 && score < 72) return "FADE";
  if (score >= 88) return "A_PLUS";
  if (score >= 80) return "A";
  if (score >= 72) return "B_PLUS";
  if (score >= 62) return "B";
  return riskPenalty >= 14 ? "FADE" : "WATCH";
}

function boxScoreComponent(box: MlbSimulatedHitterBoxScore) {
  return clamp(box.impactScore * 1.25 + box.probabilities.hit1Plus * 12 + box.probabilities.totalBases2Plus * 9 + box.probabilities.homeRun * 30 - box.probabilities.strikeout2Plus * 7, 0, 100);
}

function matchupComponent(row: MlbMatchupTraitRow | undefined) {
  if (!row) return 46;
  return clamp(50 + row.traitScore * 1.25 + row.pitchTypeScore * 0.42 + row.platoonScore * 0.6 + (row.powerMultiplier - 1) * 32 + (1 - row.strikeoutMultiplier) * 22, 0, 100);
}

function paComponent(path: MlbHitterPlateAppearancePath | undefined, rank: MlbPaWindowRankingRow | undefined) {
  if (!path) return 45;
  return clamp(42 + path.bestHitWindow.hitProbability * 72 + path.bestPowerWindow.homeRunProbability * 190 + path.bullpenExposureShare * 24 + path.latePaChance * 18 + (rank?.score ?? 0) * 3, 0, 100);
}

function baseStateComponent(ctx: MlbHitterBaseStateContext | undefined) {
  if (!ctx) return 45;
  return clamp(42 + ctx.rbiOpportunityScore * 20 + ctx.runScoringOpportunityScore * 18 + ctx.lineupProtectionScore * 14 + (ctx.expectedRunsAfterContext - ctx.expectedRunsBeforeContext) * 8 + (ctx.expectedRbiAfterContext - ctx.expectedRbiBeforeContext) * 10, 0, 100);
}

function confidenceComponent(box: MlbSimulatedHitterBoxScore, matchup: MlbMatchupTraitRow | undefined) {
  return clamp((box.confidence * 0.62 + (matchup?.confidence ?? 0.55) * 0.38) * 100, 18, 95);
}

function riskPenalty(box: MlbSimulatedHitterBoxScore, matchup: MlbMatchupTraitRow | undefined, path: MlbHitterPlateAppearancePath | undefined, base: MlbHitterBaseStateContext | undefined) {
  let penalty = 0;
  penalty += Math.max(0, box.probabilities.strikeout2Plus - 0.28) * 24;
  penalty += Math.max(0, box.volatility - 1.35) * 7;
  if (matchup?.traitLabel === "AVOID") penalty += 15;
  if (matchup?.traitLabel === "RISK") penalty += 8;
  if (matchup && matchup.strikeoutMultiplier >= 1.12) penalty += 7;
  if (path && path.highestStrikeoutRiskWindow.strikeoutProbability >= 0.32) penalty += 5;
  if (base?.isRbiTrap) penalty += 7;
  if (box.confidence < 0.52) penalty += 8;
  return clamp(penalty, 0, 34);
}

function tags(args: { box: MlbSimulatedHitterBoxScore; matchup?: MlbMatchupTraitRow; path?: MlbHitterPlateAppearancePath; base?: MlbHitterBaseStateContext; grade: MlbEliteBatterGrade; risk: number }): MlbEliteBatterTag[] {
  const out: MlbEliteBatterTag[] = [];
  if (["A_PLUS", "A"].includes(args.grade) && args.risk < 16) out.push("CORE_BAT");
  if (args.box.probabilities.homeRun >= 0.1 || args.box.expected.totalBases >= 1.9 || (args.matchup?.deltas.totalBases ?? 0) > 0.15) out.push("POWER_CEILING");
  if (args.box.probabilities.hit1Plus >= 0.66 || args.box.expected.strikeouts <= 0.75) out.push("CONTACT_FLOOR");
  if ((args.base?.rbiOpportunityScore ?? 0) >= 0.45 || (args.base?.runScoringOpportunityScore ?? 0) >= 0.48) out.push("RUN_RBI_ENGINE");
  if ((args.path?.latePaChance ?? 0) >= 0.38) out.push("LATE_PA_UPSIDE");
  if ((args.path?.bullpenExposureShare ?? 0) >= 0.35) out.push("BULLPEN_ATTACK");
  if (args.matchup?.traitLabel === "ELITE_EDGE" || args.matchup?.traitLabel === "ADVANTAGE") out.push("MATCHUP_EDGE");
  if (args.risk >= 16 || args.matchup?.traitLabel === "AVOID" || args.base?.isRbiTrap) out.push("RISK_TRAP");
  return Array.from(new Set(out.length ? out : ["CONTACT_FLOOR"]));
}

function driverMerge(...groups: Array<string[] | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group ?? []))).slice(0, 8);
}

function warnings(args: { risk: number; matchup?: MlbMatchupTraitRow; base?: MlbHitterBaseStateContext; box: MlbSimulatedHitterBoxScore }) {
  const out: string[] = [];
  if (args.risk >= 16) out.push("elevated volatility/risk penalty");
  if (args.matchup?.traitLabel === "AVOID") out.push("matchup trait avoid spot");
  if (args.matchup && args.matchup.strikeoutMultiplier >= 1.12) out.push("strikeout multiplier elevated");
  if (args.base?.isRbiTrap) out.push("RBI context trap");
  if (args.box.confidence < 0.55) out.push("thin confidence profile");
  return out;
}

function buildRow(args: { box: MlbSimulatedHitterBoxScore; matchup?: MlbMatchupTraitRow; path?: MlbHitterPlateAppearancePath; base?: MlbHitterBaseStateContext; paRank?: MlbPaWindowRankingRow }): Omit<MlbEliteBatterScoreRow, "rank"> {
  const boxScore = boxScoreComponent(args.box);
  const matchupTrait = matchupComponent(args.matchup);
  const plateAppearance = paComponent(args.path, args.paRank);
  const baseState = baseStateComponent(args.base);
  const confidence = confidenceComponent(args.box, args.matchup);
  const risk = riskPenalty(args.box, args.matchup, args.path, args.base);
  const score = round(clamp(boxScore * 0.28 + matchupTrait * 0.22 + plateAppearance * 0.2 + baseState * 0.18 + confidence * 0.12 - risk, 0, 100), 3);
  const rowGrade = grade(score, risk);
  const rowTags = tags({ box: args.box, matchup: args.matchup, path: args.path, base: args.base, grade: rowGrade, risk });
  const rowWarnings = warnings({ risk, matchup: args.matchup, base: args.base, box: args.box });
  const rowDrivers = driverMerge(args.box.reasons, args.matchup?.drivers, args.base?.drivers, args.paRank?.drivers, args.path ? [args.path.summary] : undefined);
  return {
    playerId: args.box.playerId,
    playerName: args.box.playerName,
    team: args.box.team,
    battingOrder: args.box.battingOrder,
    grade: rowGrade,
    score,
    confidence: round(confidence / 100, 3),
    tags: rowTags,
    componentScores: {
      boxScore: round(boxScore),
      matchupTrait: round(matchupTrait),
      plateAppearance: round(plateAppearance),
      baseState: round(baseState),
      confidence: round(confidence),
      riskPenalty: round(risk)
    },
    expectedLine: args.box.expected,
    matchupTrait: args.matchup ? { traitLabel: args.matchup.traitLabel, traitScore: args.matchup.traitScore, pitchTypeScore: args.matchup.pitchTypeScore, platoonScore: args.matchup.platoonScore, deltas: args.matchup.deltas, drivers: args.matchup.drivers, summary: args.matchup.summary } : null,
    plateAppearance: args.path ? { latePaChance: args.path.latePaChance, bullpenExposureShare: args.path.bullpenExposureShare, bestHitWindow: args.path.bestHitWindow, bestPowerWindow: args.path.bestPowerWindow, highestStrikeoutRiskWindow: args.path.highestStrikeoutRiskWindow, summary: args.path.summary } : null,
    baseState: args.base ? { lineupRole: args.base.lineupRole, rbiOpportunityScore: args.base.rbiOpportunityScore, runScoringOpportunityScore: args.base.runScoringOpportunityScore, lineupProtectionScore: args.base.lineupProtectionScore, expectedRunsAfterContext: args.base.expectedRunsAfterContext, expectedRbiAfterContext: args.base.expectedRbiAfterContext, bestRbiWindow: args.base.bestRbiWindow, bestRunWindow: args.base.bestRunWindow, isRbiTrap: args.base.isRbiTrap, drivers: args.base.drivers, summary: args.base.summary } : null,
    paRanking: args.paRank ? { score: args.paRank.score, drivers: args.paRank.drivers, summary: args.paRank.summary } : null,
    drivers: rowDrivers,
    warnings: rowWarnings,
    summary: `${args.box.playerName}: ${rowGrade.replace(/_/g, "+")} elite score ${score.toFixed(1)}; ${rowTags.slice(0, 3).map((tag) => tag.toLowerCase().replace(/_/g, " ")).join(", ")}; risk ${risk.toFixed(1)}.`
  };
}

function topBy(rows: MlbEliteBatterScoreRow[], predicate: (row: MlbEliteBatterScoreRow) => boolean, limit = 8) {
  return rows.filter(predicate).sort((a, b) => b.score - a.score || a.battingOrder - b.battingOrder).slice(0, limit);
}

export function buildMlbEliteBatterIntelligenceScore(args: {
  boxScore: MlbSimulatedGameBoxScore;
  matchupTraitContext: MlbMatchupTraitEngine;
  plateAppearanceScript: MlbGamePlateAppearanceScript;
  paWindowRanking: MlbPaWindowRanking;
  baseStateContext: MlbBaseStateRunRbiEngine;
}): MlbEliteBatterIntelligenceScore {
  const matchups = mapById([...args.matchupTraitContext.awayTeam.rows, ...args.matchupTraitContext.homeTeam.rows]);
  const paths = mapById([...args.plateAppearanceScript.awayTeam.paths, ...args.plateAppearanceScript.homeTeam.paths]);
  const bases = mapById([...args.baseStateContext.awayTeam.contexts, ...args.baseStateContext.homeTeam.contexts]);
  const paRanks = paRankMap(args.paWindowRanking);
  const overall = hitterRows(args.boxScore)
    .map((box) => buildRow({ box, matchup: matchups.get(box.playerId), path: paths.get(box.playerId), base: bases.get(box.playerId), paRank: paRanks.get(box.playerId) }))
    .sort((a, b) => b.score - a.score || b.componentScores.confidence - a.componentScores.confidence || a.battingOrder - b.battingOrder)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const coreBats = topBy(overall, (row) => row.tags.includes("CORE_BAT"), 8);
  const powerCeiling = topBy(overall, (row) => row.tags.includes("POWER_CEILING"), 8);
  const contactFloor = topBy(overall, (row) => row.tags.includes("CONTACT_FLOOR"), 8);
  const runRbiEngines = topBy(overall, (row) => row.tags.includes("RUN_RBI_ENGINE"), 8);
  const latePaUpside = topBy(overall, (row) => row.tags.includes("LATE_PA_UPSIDE") || row.tags.includes("BULLPEN_ATTACK"), 8);
  const matchupEdges = topBy(overall, (row) => row.tags.includes("MATCHUP_EDGE"), 8);
  const riskTraps = overall.filter((row) => row.tags.includes("RISK_TRAP") || row.warnings.length).sort((a, b) => b.componentScores.riskPenalty - a.componentScores.riskPenalty || a.score - b.score).slice(0, 8);
  return {
    modelVersion: "mlb-elite-batter-intelligence-score-v1",
    overall,
    coreBats,
    powerCeiling,
    contactFloor,
    runRbiEngines,
    latePaUpside,
    matchupEdges,
    riskTraps,
    summary: overall.length ? `Elite batter board: ${overall[0].playerName} leads at ${overall[0].score.toFixed(1)}; ${coreBats.length} core bats; ${riskTraps.length} risk traps flagged.` : "Elite batter board unavailable because no hitter rows matched."
  };
}
