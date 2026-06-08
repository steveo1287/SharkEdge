import type { MlbGamePlateAppearanceScript, MlbHitterPlateAppearancePath, MlbPlateAppearanceNode } from "@/services/simulation/mlb-plate-appearance-game-script";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

export type MlbLineupRole = "LEADOFF_ENGINE" | "TABLE_SETTER" | "MIDDLE_ORDER_DRIVER" | "CLEANUP_POWER" | "LOWER_ORDER_TURNOVER" | "LOW_SIGNAL_DEPTH_BAT";
export type MlbContextLabel = "HIGH" | "MEDIUM" | "LOW";

export type MlbBaseStateWindow = {
  paNumber: number;
  inning: number;
  pitchingPhase: MlbPlateAppearanceNode["pitchingPhase"];
  basesEmptyProbability: number;
  runnerOnFirstProbability: number;
  runnerInScoringPositionProbability: number;
  basesLoadedProbability: number;
  twoOutRbiPressure: number;
  rbiLeverage: MlbContextLabel;
  runLeverage: MlbContextLabel;
  summary: string;
};

export type MlbHitterBaseStateContext = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  lineupRole: MlbLineupRole;
  rbiOpportunityScore: number;
  runScoringOpportunityScore: number;
  lineupProtectionScore: number;
  aheadOnBaseSupport: number;
  behindPowerSupport: number;
  expectedRunsBeforeContext: number;
  expectedRunsAfterContext: number;
  expectedRbiBeforeContext: number;
  expectedRbiAfterContext: number;
  runContextMultiplier: number;
  rbiContextMultiplier: number;
  baseStateWindows: MlbBaseStateWindow[];
  bestRbiWindow: MlbBaseStateWindow;
  bestRunWindow: MlbBaseStateWindow;
  isRbiTrap: boolean;
  summary: string;
  drivers: string[];
};

export type MlbBaseStateTeamContext = {
  team: string;
  contexts: MlbHitterBaseStateContext[];
  bestRbiWindows: MlbHitterBaseStateContext[];
  bestRunWindows: MlbHitterBaseStateContext[];
  lineupProtectionBoosts: MlbHitterBaseStateContext[];
  tableSetterBoosts: MlbHitterBaseStateContext[];
  rbiTrapBats: MlbHitterBaseStateContext[];
};

export type MlbBaseStateRunRbiEngine = {
  modelVersion: "mlb-base-state-run-rbi-engine-v1";
  awayTeam: MlbBaseStateTeamContext;
  homeTeam: MlbBaseStateTeamContext;
  bestRbiWindows: MlbHitterBaseStateContext[];
  bestRunWindows: MlbHitterBaseStateContext[];
  lineupProtectionBoosts: MlbHitterBaseStateContext[];
  tableSetterBoosts: MlbHitterBaseStateContext[];
  rbiTrapBats: MlbHitterBaseStateContext[];
  summary: string;
};

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function label(value: number, high: number, medium: number): MlbContextLabel { return value >= high ? "HIGH" : value >= medium ? "MEDIUM" : "LOW"; }

function role(order: number, box: MlbSimulatedHitterBoxScore): MlbLineupRole {
  if (order === 1) return "LEADOFF_ENGINE";
  if (order <= 3 && box.expected.walks + box.expected.hits >= 1.25) return "TABLE_SETTER";
  if (order === 4 && (box.expected.homeRuns >= 0.12 || box.expected.rbi >= 0.65)) return "CLEANUP_POWER";
  if (order >= 3 && order <= 6) return "MIDDLE_ORDER_DRIVER";
  if (order >= 8 && box.confidence < 0.55) return "LOW_SIGNAL_DEPTH_BAT";
  return "LOWER_ORDER_TURNOVER";
}

function boxMap(boxScore: MlbSimulatedGameBoxScore) {
  return new Map([...boxScore.awayTeam.hitters, ...boxScore.homeTeam.hitters].map((hitter) => [hitter.playerId, hitter]));
}

function pathMap(script: MlbGamePlateAppearanceScript) {
  return new Map([...script.awayTeam.paths, ...script.homeTeam.paths].map((path) => [path.playerId, path]));
}

function supportRows(teamHitters: MlbSimulatedHitterBoxScore[], order: number) {
  const sorted = [...teamHitters].sort((a, b) => a.battingOrder - b.battingOrder);
  const ahead = sorted.filter((h) => h.battingOrder < order).slice(-3);
  const behind = sorted.filter((h) => h.battingOrder > order).slice(0, 3);
  return { ahead, behind };
}

function aheadSupport(rows: MlbSimulatedHitterBoxScore[]) {
  return round(clamp(rows.reduce((sum, h) => sum + h.probabilities.hit1Plus * 0.58 + h.expected.walks * 0.32, 0) / Math.max(1, rows.length), 0.08, 0.86), 4);
}

function behindSupport(rows: MlbSimulatedHitterBoxScore[]) {
  return round(clamp(rows.reduce((sum, h) => sum + h.expected.totalBases * 0.16 + h.probabilities.homeRun * 1.15 + h.expected.rbi * 0.18, 0) / Math.max(1, rows.length), 0.05, 0.9), 4);
}

function baseWindow(pa: MlbPlateAppearanceNode, path: MlbHitterPlateAppearancePath, order: number, ahead: number, behind: number): MlbBaseStateWindow {
  const orderTraffic = order <= 2 ? 0.14 : order <= 5 ? 0.24 : order <= 7 ? 0.18 : 0.12;
  const phaseBoost = pa.pitchingPhase === "STARTER_FATIGUE" ? 0.045 : pa.pitchingPhase.includes("BULLPEN") ? 0.055 : 0;
  const lateBoost = pa.paNumber >= 4 ? path.latePaChance * 0.08 : 0;
  const runnerOn = clamp(orderTraffic + ahead * 0.48 + phaseBoost + lateBoost, 0.08, 0.76);
  const risp = clamp(runnerOn * (0.32 + ahead * 0.34 + (order >= 3 && order <= 5 ? 0.1 : 0)), 0.03, 0.46);
  const loaded = clamp(risp * (0.09 + ahead * 0.1), 0.005, 0.11);
  const twoOut = clamp(0.18 + pa.paNumber * 0.025 + (pa.inning >= 7 ? 0.04 : 0), 0.12, 0.42);
  const basesEmpty = clamp(1 - runnerOn, 0.18, 0.9);
  const rbiScore = risp * 1.35 + loaded * 2.3 + runnerOn * 0.25 + pa.hitProbability * 0.42 + pa.extraBaseHitProbability * 0.55;
  const runScore = basesEmpty * 0.25 + behind * 0.82 + pa.walkProbability * 0.34 + pa.hitProbability * 0.38 + (pa.inning >= 7 ? 0.05 : 0);
  return {
    paNumber: pa.paNumber,
    inning: pa.inning,
    pitchingPhase: pa.pitchingPhase,
    basesEmptyProbability: round(basesEmpty),
    runnerOnFirstProbability: round(clamp(runnerOn - risp, 0.02, 0.58)),
    runnerInScoringPositionProbability: round(risp),
    basesLoadedProbability: round(loaded),
    twoOutRbiPressure: round(twoOut),
    rbiLeverage: label(rbiScore, 0.62, 0.42),
    runLeverage: label(runScore, 0.62, 0.42),
    summary: `PA${pa.paNumber} inning ${pa.inning}: RISP ${Math.round(risp * 100)}%, runner on ${Math.round(runnerOn * 100)}%, RBI ${label(rbiScore, 0.62, 0.42).toLowerCase()}, run ${label(runScore, 0.62, 0.42).toLowerCase()}.`
  };
}

function drivers(ctx: Omit<MlbHitterBaseStateContext, "drivers" | "summary">) {
  const out: string[] = [];
  if (ctx.aheadOnBaseSupport >= 0.46) out.push("traffic ahead");
  if (ctx.behindPowerSupport >= 0.42) out.push("protection behind");
  if (ctx.lineupRole === "LEADOFF_ENGINE" || ctx.lineupRole === "TABLE_SETTER") out.push("run-scoring role");
  if (ctx.lineupRole === "MIDDLE_ORDER_DRIVER" || ctx.lineupRole === "CLEANUP_POWER") out.push("RBI role");
  if (ctx.isRbiTrap) out.push("RBI trap risk");
  if (ctx.bestRbiWindow.rbiLeverage === "HIGH") out.push(`PA${ctx.bestRbiWindow.paNumber} RBI window`);
  return out.length ? out : ["neutral base-state context"];
}

function contextFor(path: MlbHitterPlateAppearancePath, box: MlbSimulatedHitterBoxScore, teamHitters: MlbSimulatedHitterBoxScore[]): MlbHitterBaseStateContext {
  const support = supportRows(teamHitters, box.battingOrder);
  const ahead = aheadSupport(support.ahead);
  const behind = behindSupport(support.behind);
  const lineupRole = role(box.battingOrder, box);
  const windows = path.plateAppearances.map((pa) => baseWindow(pa, path, box.battingOrder, ahead, behind));
  const bestRbiWindow = [...windows].sort((a, b) => (b.runnerInScoringPositionProbability + b.basesLoadedProbability * 2) - (a.runnerInScoringPositionProbability + a.basesLoadedProbability * 2))[0];
  const bestRunWindow = [...windows].sort((a, b) => (b.basesEmptyProbability * 0.2 + behind * 0.8 + b.runnerOnFirstProbability * 0.1) - (a.basesEmptyProbability * 0.2 + behind * 0.8 + a.runnerOnFirstProbability * 0.1))[0];
  const roleRbiBoost = lineupRole === "CLEANUP_POWER" ? 1.18 : lineupRole === "MIDDLE_ORDER_DRIVER" ? 1.12 : lineupRole === "LEADOFF_ENGINE" ? 0.78 : lineupRole === "TABLE_SETTER" ? 0.9 : 0.96;
  const roleRunBoost = lineupRole === "LEADOFF_ENGINE" ? 1.22 : lineupRole === "TABLE_SETTER" ? 1.14 : lineupRole === "LOWER_ORDER_TURNOVER" ? 0.92 : 1;
  const rbiOpportunityScore = round(clamp(ahead * 0.72 + bestRbiWindow.runnerInScoringPositionProbability * 0.7 + bestRbiWindow.basesLoadedProbability * 1.6, 0, 1.35), 4);
  const runScoringOpportunityScore = round(clamp(behind * 0.78 + box.probabilities.hit1Plus * 0.22 + box.expected.walks * 0.18, 0, 1.25), 4);
  const lineupProtectionScore = round(clamp(behind * 1.12 + box.confidence * 0.16, 0, 1.2), 4);
  const rbiContextMultiplier = round(clamp(roleRbiBoost * (0.86 + rbiOpportunityScore * 0.32), 0.68, 1.34), 4);
  const runContextMultiplier = round(clamp(roleRunBoost * (0.86 + runScoringOpportunityScore * 0.28), 0.72, 1.32), 4);
  const expectedRunsAfterContext = round(box.expected.runs * runContextMultiplier, 3);
  const expectedRbiAfterContext = round(box.expected.rbi * rbiContextMultiplier, 3);
  const isRbiTrap = box.expected.rbi >= 0.48 && rbiOpportunityScore < 0.28 && box.battingOrder <= 6;
  const base = {
    playerId: box.playerId,
    playerName: box.playerName,
    team: box.team,
    battingOrder: box.battingOrder,
    lineupRole,
    rbiOpportunityScore,
    runScoringOpportunityScore,
    lineupProtectionScore,
    aheadOnBaseSupport: ahead,
    behindPowerSupport: behind,
    expectedRunsBeforeContext: box.expected.runs,
    expectedRunsAfterContext,
    expectedRbiBeforeContext: box.expected.rbi,
    expectedRbiAfterContext,
    runContextMultiplier,
    rbiContextMultiplier,
    baseStateWindows: windows,
    bestRbiWindow,
    bestRunWindow,
    isRbiTrap
  };
  return {
    ...base,
    summary: `${box.playerName}: ${lineupRole.toLowerCase().replace(/_/g, " ")}; runs ${box.expected.runs.toFixed(2)}→${expectedRunsAfterContext.toFixed(2)}, RBI ${box.expected.rbi.toFixed(2)}→${expectedRbiAfterContext.toFixed(2)}; best RBI PA${bestRbiWindow.paNumber}.`,
    drivers: drivers(base)
  };
}

function buildTeam(team: string, hitters: MlbSimulatedHitterBoxScore[], paths: Map<string, MlbHitterPlateAppearancePath>): MlbBaseStateTeamContext {
  const contexts = hitters.flatMap((box) => {
    const path = paths.get(box.playerId);
    return path ? [contextFor(path, box, hitters)] : [];
  }).sort((a, b) => a.battingOrder - b.battingOrder);
  return {
    team,
    contexts,
    bestRbiWindows: [...contexts].sort((a, b) => b.rbiOpportunityScore - a.rbiOpportunityScore).slice(0, 5),
    bestRunWindows: [...contexts].sort((a, b) => b.runScoringOpportunityScore - a.runScoringOpportunityScore).slice(0, 5),
    lineupProtectionBoosts: [...contexts].sort((a, b) => b.lineupProtectionScore - a.lineupProtectionScore).slice(0, 5),
    tableSetterBoosts: [...contexts].filter((c) => c.lineupRole === "LEADOFF_ENGINE" || c.lineupRole === "TABLE_SETTER").sort((a, b) => b.runContextMultiplier - a.runContextMultiplier).slice(0, 5),
    rbiTrapBats: [...contexts].filter((c) => c.isRbiTrap).sort((a, b) => a.rbiOpportunityScore - b.rbiOpportunityScore).slice(0, 5)
  };
}

export function buildMlbBaseStateRunRbiEngine(args: { boxScore: MlbSimulatedGameBoxScore; plateAppearanceScript: MlbGamePlateAppearanceScript }): MlbBaseStateRunRbiEngine {
  const paths = pathMap(args.plateAppearanceScript);
  const awayTeam = buildTeam(args.boxScore.awayTeam.team, args.boxScore.awayTeam.hitters, paths);
  const homeTeam = buildTeam(args.boxScore.homeTeam.team, args.boxScore.homeTeam.hitters, paths);
  const all = [...awayTeam.contexts, ...homeTeam.contexts];
  const bestRbiWindows = [...all].sort((a, b) => b.rbiOpportunityScore - a.rbiOpportunityScore).slice(0, 8);
  const bestRunWindows = [...all].sort((a, b) => b.runScoringOpportunityScore - a.runScoringOpportunityScore).slice(0, 8);
  const lineupProtectionBoosts = [...all].sort((a, b) => b.lineupProtectionScore - a.lineupProtectionScore).slice(0, 8);
  const tableSetterBoosts = [...all].filter((c) => c.lineupRole === "LEADOFF_ENGINE" || c.lineupRole === "TABLE_SETTER").sort((a, b) => b.runContextMultiplier - a.runContextMultiplier).slice(0, 8);
  const rbiTrapBats = [...all].filter((c) => c.isRbiTrap).sort((a, b) => a.rbiOpportunityScore - b.rbiOpportunityScore).slice(0, 8);
  return {
    modelVersion: "mlb-base-state-run-rbi-engine-v1",
    awayTeam,
    homeTeam,
    bestRbiWindows,
    bestRunWindows,
    lineupProtectionBoosts,
    tableSetterBoosts,
    rbiTrapBats,
    summary: bestRbiWindows.length ? `Base-state layer: best RBI context ${bestRbiWindows[0].playerName}; best run context ${bestRunWindows[0]?.playerName ?? "—"}; ${rbiTrapBats.length} RBI trap bats flagged.` : "Base-state layer unavailable."
  };
}
