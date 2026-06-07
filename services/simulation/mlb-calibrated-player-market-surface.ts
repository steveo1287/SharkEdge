import {
  applyMlbPlayerMarketCalibration,
  DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE,
  type MlbPlayerMarketCalibrationProfile,
  type MlbPlayerMarketCalibrationSource
} from "@/services/simulation/mlb-player-prop-inning-calibration";
import {
  buildMlbInningProjectionRows,
  buildMlbPlayerPropProjectionRows,
  type MlbInningProjectionRow,
  type MlbPlayerPropProjectionRow
} from "@/services/simulation/mlb-player-prop-inning-ledgers";
import type { MlbInningMarketProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbCalibratedPlayerMarketDecision = "PROMOTE" | "WATCH" | "PASS";

export type MlbCalibratedPlayerMarket = {
  source: MlbPlayerMarketCalibrationSource;
  market: string;
  label: string;
  gameId: string;
  eventLabel: string;
  team: string | null;
  playerId: string | null;
  playerName: string | null;
  side: string;
  line: number | null;
  projectedValue: number;
  rawProbability: number;
  calibratedProbability: number;
  confidence: number;
  minEdgeRequired: number;
  edgeVsBaseline: number;
  calibrationStatus: "LEARNED" | "SAMPLE_TOO_SMALL" | "UNTRAINED";
  decision: MlbCalibratedPlayerMarketDecision;
  reason: string;
  projectionJson?: unknown;
};

export type MlbCalibratedPlayerMarketSurface = {
  modelVersion: "mlb-calibrated-player-market-surface-v1";
  profileStatus: MlbPlayerMarketCalibrationProfile["status"];
  profileSampleSize: number;
  profileTrainedAt: string | null;
  marketCount: number;
  promotedCount: number;
  watchCount: number;
  passCount: number;
  markets: MlbCalibratedPlayerMarket[];
  promoted: MlbCalibratedPlayerMarket[];
  warnings: string[];
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function confidenceDecision(args: {
  calibrationStatus: "LEARNED" | "SAMPLE_TOO_SMALL" | "UNTRAINED";
  confidence: number;
  edge: number;
  minEdgeRequired: number;
}) {
  if (args.calibrationStatus !== "LEARNED") return { decision: "PASS" as const, reason: `Market ${args.calibrationStatus.toLowerCase().replace(/_/g, " ")}; not eligible for promotion.` };
  if (args.confidence < 0.45) return { decision: "PASS" as const, reason: `Confidence ${args.confidence.toFixed(2)} below 0.45 promotion floor.` };
  if (args.edge < args.minEdgeRequired) return { decision: "WATCH" as const, reason: `Edge ${args.edge.toFixed(3)} below learned threshold ${args.minEdgeRequired.toFixed(3)}.` };
  if (args.calibrationStatus === "LEARNED" && args.confidence >= 0.55 && args.edge >= args.minEdgeRequired * 1.35) {
    return { decision: "PROMOTE" as const, reason: `Learned market clears confidence and edge threshold.` };
  }
  return { decision: "WATCH" as const, reason: `Learned market clears minimum edge but not strong-promotion threshold.` };
}

function labelForPlayerRow(row: MlbPlayerPropProjectionRow) {
  const marketLabel = row.market
    .replace(/^hitter_/, "")
    .replace(/^pitcher_/, "")
    .replace(/_/g, " ");
  return `${row.playerName} over ${row.line} ${marketLabel}`;
}

function labelForInningRow(row: MlbInningProjectionRow) {
  if (row.market === "nrfi") return "No run first inning";
  if (row.market === "yrfi") return "Run first inning";
  if (row.market === "first_five_total") return `First five ${row.side.toLowerCase()} ${row.line}`;
  if (row.market === "first_five_home_ml") return "First five home moneyline";
  if (row.market === "first_five_away_ml") return "First five away moneyline";
  return row.market.replace(/_/g, " ");
}

function itemFromPlayerRow(row: MlbPlayerPropProjectionRow, profile: MlbPlayerMarketCalibrationProfile): MlbCalibratedPlayerMarket {
  const raw = row.probabilityOver ?? 0.5;
  const calibrated = applyMlbPlayerMarketCalibration({ source: "player_prop", market: row.market, probability: raw, confidence: row.confidence, profile });
  const edge = Math.max(0, calibrated.calibratedProbability - 0.5);
  const decision = confidenceDecision({ calibrationStatus: calibrated.status, confidence: calibrated.confidence, edge, minEdgeRequired: calibrated.minEdgeRequired });
  return {
    source: "player_prop",
    market: row.market,
    label: labelForPlayerRow(row),
    gameId: row.gameId,
    eventLabel: row.eventLabel,
    team: row.team,
    playerId: row.playerId,
    playerName: row.playerName,
    side: "OVER",
    line: row.line,
    projectedValue: row.projectedValue,
    rawProbability: calibrated.rawProbability,
    calibratedProbability: calibrated.calibratedProbability,
    confidence: calibrated.confidence,
    minEdgeRequired: calibrated.minEdgeRequired,
    edgeVsBaseline: round(edge, 4),
    calibrationStatus: calibrated.status,
    decision: decision.decision,
    reason: decision.reason,
    projectionJson: row.projectionJson
  };
}

function itemFromInningRow(row: MlbInningProjectionRow, profile: MlbPlayerMarketCalibrationProfile): MlbCalibratedPlayerMarket {
  const calibrated = applyMlbPlayerMarketCalibration({ source: "inning_market", market: row.market, probability: row.probability, confidence: row.confidence, profile });
  const edge = Math.max(0, calibrated.calibratedProbability - 0.5);
  const decision = confidenceDecision({ calibrationStatus: calibrated.status, confidence: calibrated.confidence, edge, minEdgeRequired: calibrated.minEdgeRequired });
  return {
    source: "inning_market",
    market: row.market,
    label: labelForInningRow(row),
    gameId: row.gameId,
    eventLabel: row.eventLabel,
    team: null,
    playerId: null,
    playerName: null,
    side: row.side,
    line: row.line,
    projectedValue: row.projectedValue,
    rawProbability: calibrated.rawProbability,
    calibratedProbability: calibrated.calibratedProbability,
    confidence: calibrated.confidence,
    minEdgeRequired: calibrated.minEdgeRequired,
    edgeVsBaseline: round(edge, 4),
    calibrationStatus: calibrated.status,
    decision: decision.decision,
    reason: decision.reason,
    projectionJson: row.projectionJson
  };
}

export function buildMlbCalibratedPlayerMarketSurface(args: {
  gameId: string;
  eventLabel: string;
  startTime: Date | string;
  playerStatProjections?: MlbPlayerStatProjectionGame | null;
  inningProjection?: MlbInningMarketProjection | null;
  profile?: MlbPlayerMarketCalibrationProfile | null;
}): MlbCalibratedPlayerMarketSurface {
  const profile = args.profile ?? DEFAULT_MLB_PLAYER_MARKET_CALIBRATION_PROFILE;
  const warnings: string[] = [];
  const markets: MlbCalibratedPlayerMarket[] = [];

  if (args.playerStatProjections) {
    markets.push(...buildMlbPlayerPropProjectionRows({ gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, projections: args.playerStatProjections }).map((row) => itemFromPlayerRow(row, profile)));
  } else {
    warnings.push("Player stat projections unavailable; player prop surface skipped.");
  }

  if (args.inningProjection) {
    markets.push(...buildMlbInningProjectionRows({ gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, projection: args.inningProjection }).map((row) => itemFromInningRow(row, profile)));
  } else {
    warnings.push("Inning projection unavailable; F5/NRFI surface skipped.");
  }

  const sorted = markets.sort((a, b) => {
    const decisionRank = { PROMOTE: 0, WATCH: 1, PASS: 2 } as Record<MlbCalibratedPlayerMarketDecision, number>;
    return decisionRank[a.decision] - decisionRank[b.decision] || b.edgeVsBaseline - a.edgeVsBaseline || b.confidence - a.confidence;
  });
  const promoted = sorted.filter((market) => market.decision === "PROMOTE");
  const watchCount = sorted.filter((market) => market.decision === "WATCH").length;
  const passCount = sorted.filter((market) => market.decision === "PASS").length;

  if (profile.status !== "LEARNED") warnings.push(`Player market calibration profile is ${profile.status}; promotions will be conservative.`);

  return {
    modelVersion: "mlb-calibrated-player-market-surface-v1",
    profileStatus: profile.status,
    profileSampleSize: profile.sampleSize,
    profileTrainedAt: profile.trainedAt,
    marketCount: sorted.length,
    promotedCount: promoted.length,
    watchCount,
    passCount,
    markets: sorted,
    promoted,
    warnings
  };
}
