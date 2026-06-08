import type { MlbGamePlateAppearanceScript, MlbHitterPlateAppearancePath, MlbPlateAppearanceNode } from "@/services/simulation/mlb-plate-appearance-game-script";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

export type MlbPaWindowRankingCategory =
  | "OVERALL"
  | "BEST_HIT_WINDOW"
  | "BEST_POWER_WINDOW"
  | "BULLPEN_EXPOSURE"
  | "LATE_PA_UPSIDE"
  | "K_RISK_TRAP"
  | "SAFEST_CONTACT";

export type MlbPaWindowRankingRow = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  category: MlbPaWindowRankingCategory;
  score: number;
  rank: number;
  boxImpactScore: number;
  confidence: number;
  volatility: number;
  latePaChance: number;
  bullpenExposureShare: number;
  bestHitWindow: MlbPlateAppearanceNode;
  bestPowerWindow: MlbPlateAppearanceNode;
  highestStrikeoutRiskWindow: MlbPlateAppearanceNode;
  safestContactWindow: MlbPlateAppearanceNode;
  summary: string;
  drivers: string[];
};

export type MlbPaWindowRanking = {
  modelVersion: "mlb-pa-window-ranking-v1";
  overall: MlbPaWindowRankingRow[];
  bestHitWindows: MlbPaWindowRankingRow[];
  bestPowerWindows: MlbPaWindowRankingRow[];
  bullpenExposureUpside: MlbPaWindowRankingRow[];
  latePaUpside: MlbPaWindowRankingRow[];
  kRiskTraps: MlbPaWindowRankingRow[];
  safestContact: MlbPaWindowRankingRow[];
  summary: string;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function boxHitterMap(boxScore: MlbSimulatedGameBoxScore) {
  const rows = [...boxScore.awayTeam.hitters, ...boxScore.homeTeam.hitters];
  return new Map(rows.map((row) => [row.playerId, row]));
}

function safestContactWindow(path: MlbHitterPlateAppearancePath) {
  return [...path.plateAppearances].sort((a, b) => {
    const aScore = a.hitProbability + a.walkProbability - a.strikeoutProbability * 0.9;
    const bScore = b.hitProbability + b.walkProbability - b.strikeoutProbability * 0.9;
    return bScore - aScore;
  })[0] ?? path.bestHitWindow;
}

function phaseBoost(node: MlbPlateAppearanceNode) {
  if (node.pitchingPhase === "STARTER_FATIGUE") return 0.08;
  if (node.pitchingPhase === "BULLPEN") return 0.1;
  if (node.pitchingPhase === "LATE_BULLPEN") return 0.14;
  if (node.pitchingPhase === "STARTER_SECOND_LOOK") return 0.04;
  return 0;
}

function categoryScore(category: MlbPaWindowRankingCategory, path: MlbHitterPlateAppearancePath, box: MlbSimulatedHitterBoxScore) {
  const safeWindow = safestContactWindow(path);
  const boxImpact = clamp(box.impactScore / 65, 0, 1.35);
  const confidence = clamp(box.confidence, 0.2, 0.95);
  const volatility = clamp(box.volatility / 2.2, 0.25, 1.25);
  const hitScore = path.bestHitWindow.hitProbability * 2.6 + path.bestHitWindow.extraBaseHitProbability * 0.7 + phaseBoost(path.bestHitWindow);
  const powerScore = path.bestPowerWindow.homeRunProbability * 5.8 + path.bestPowerWindow.extraBaseHitProbability * 1.7 + phaseBoost(path.bestPowerWindow) + volatility * 0.12;
  const bullpenScore = path.bullpenExposureShare * 1.45 + path.bestPowerWindow.homeRunProbability * 3.4 + path.bestHitWindow.hitProbability * 0.8;
  const lateScore = path.latePaChance * 1.8 + path.bullpenExposureShare * 0.85 + boxImpact * 0.35;
  const kRiskScore = path.highestStrikeoutRiskWindow.strikeoutProbability * 2.4 + (1 - confidence) * 0.45 + path.highestStrikeoutRiskWindow.hitProbability * -0.7;
  const safeScore = safeWindow.hitProbability * 2.1 + safeWindow.walkProbability * 1.2 - safeWindow.strikeoutProbability * 1.5 + confidence * 0.4;
  const overall = boxImpact * 0.85 + hitScore * 0.55 + powerScore * 0.5 + lateScore * 0.35 + bullpenScore * 0.25 + confidence * 0.28 - kRiskScore * 0.18;
  switch (category) {
    case "OVERALL": return overall;
    case "BEST_HIT_WINDOW": return hitScore + confidence * 0.25 + boxImpact * 0.18;
    case "BEST_POWER_WINDOW": return powerScore + boxImpact * 0.22;
    case "BULLPEN_EXPOSURE": return bullpenScore + lateScore * 0.25;
    case "LATE_PA_UPSIDE": return lateScore + safeScore * 0.1;
    case "K_RISK_TRAP": return kRiskScore;
    case "SAFEST_CONTACT": return safeScore + boxImpact * 0.1;
  }
}

function driverList(category: MlbPaWindowRankingCategory, path: MlbHitterPlateAppearancePath, box: MlbSimulatedHitterBoxScore) {
  const drivers: string[] = [];
  if (box.impactScore >= 42) drivers.push("high box-score impact");
  if (path.bestHitWindow.hitProbability >= 0.29) drivers.push(`PA${path.bestHitWindow.paNumber} hit window`);
  if (path.bestPowerWindow.homeRunProbability >= 0.055) drivers.push(`PA${path.bestPowerWindow.paNumber} power window`);
  if (path.bullpenExposureShare >= 0.4) drivers.push("heavy bullpen exposure");
  if (path.latePaChance >= 0.38) drivers.push("late PA upside");
  if (path.highestStrikeoutRiskWindow.strikeoutProbability >= 0.28) drivers.push("strikeout trap risk");
  if (category === "SAFEST_CONTACT") drivers.push("contact/survival profile");
  return drivers.length ? drivers : ["balanced PA-window profile"];
}

function rowFor(category: MlbPaWindowRankingCategory, path: MlbHitterPlateAppearancePath, box: MlbSimulatedHitterBoxScore): Omit<MlbPaWindowRankingRow, "rank"> {
  const safeWindow = safestContactWindow(path);
  const score = round(categoryScore(category, path, box), 5);
  return {
    playerId: path.playerId,
    playerName: path.playerName,
    team: path.team,
    battingOrder: path.battingOrder,
    category,
    score,
    boxImpactScore: box.impactScore,
    confidence: box.confidence,
    volatility: box.volatility,
    latePaChance: path.latePaChance,
    bullpenExposureShare: path.bullpenExposureShare,
    bestHitWindow: path.bestHitWindow,
    bestPowerWindow: path.bestPowerWindow,
    highestStrikeoutRiskWindow: path.highestStrikeoutRiskWindow,
    safestContactWindow: safeWindow,
    summary: `${path.playerName}: ${category.toLowerCase().replace(/_/g, " ")} score ${score.toFixed(3)}; best hit PA${path.bestHitWindow.paNumber}, power PA${path.bestPowerWindow.paNumber}, late PA ${Math.round(path.latePaChance * 100)}%.`,
    drivers: driverList(category, path, box)
  };
}

function rankCategory(category: MlbPaWindowRankingCategory, paths: MlbHitterPlateAppearancePath[], boxes: Map<string, MlbSimulatedHitterBoxScore>, limit = 10): MlbPaWindowRankingRow[] {
  return paths
    .flatMap((path) => {
      const box = boxes.get(path.playerId);
      return box ? [rowFor(category, path, box)] : [];
    })
    .sort((a, b) => b.score - a.score || b.boxImpactScore - a.boxImpactScore || a.battingOrder - b.battingOrder)
    .slice(0, limit)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildMlbPaWindowRanking(args: {
  boxScore: MlbSimulatedGameBoxScore;
  plateAppearanceScript: MlbGamePlateAppearanceScript;
}): MlbPaWindowRanking {
  const boxes = boxHitterMap(args.boxScore);
  const paths = [...args.plateAppearanceScript.awayTeam.paths, ...args.plateAppearanceScript.homeTeam.paths];
  const overall = rankCategory("OVERALL", paths, boxes, 12);
  const bestHitWindows = rankCategory("BEST_HIT_WINDOW", paths, boxes, 8);
  const bestPowerWindows = rankCategory("BEST_POWER_WINDOW", paths, boxes, 8);
  const bullpenExposureUpside = rankCategory("BULLPEN_EXPOSURE", paths, boxes, 8);
  const latePaUpside = rankCategory("LATE_PA_UPSIDE", paths, boxes, 8);
  const kRiskTraps = rankCategory("K_RISK_TRAP", paths, boxes, 8);
  const safestContact = rankCategory("SAFEST_CONTACT", paths, boxes, 8);
  const summary = overall.length
    ? `PA-window ranking favors ${overall[0].playerName} overall; best hit window ${bestHitWindows[0]?.playerName ?? "—"}; best power window ${bestPowerWindows[0]?.playerName ?? "—"}; safest contact ${safestContact[0]?.playerName ?? "—"}.`
    : "PA-window ranking unavailable because no hitter PA paths matched box-score hitters.";
  return {
    modelVersion: "mlb-pa-window-ranking-v1",
    overall,
    bestHitWindows,
    bestPowerWindows,
    bullpenExposureUpside,
    latePaUpside,
    kRiskTraps,
    safestContact,
    summary
  };
}
