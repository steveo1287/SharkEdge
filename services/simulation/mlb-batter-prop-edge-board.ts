import {
  evaluateMlbBatterPropEdges,
  type MlbBatterBookPropQuote,
  type MlbBatterPropEdgeCandidate,
  type MlbBatterPropEdgeConfig,
  type MlbBatterPropEdgeReport
} from "@/services/simulation/mlb-batter-prop-edge";
import type { MlbBatterPropProbabilityCalibration } from "@/services/simulation/mlb-batter-prop-probability-calibration";
import type {
  MlbHitterPerGameProjection,
  MlbPlayerStatProjectionGame
} from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbBatterBookPropQuoteWithPlayer = MlbBatterBookPropQuote & {
  playerId?: string | null;
  playerName?: string | null;
  team?: string | null;
};

export type MlbBatterPropEdgeBoardCandidate = MlbBatterPropEdgeCandidate & {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  expectedPlateAppearances: number;
  expectedHits: number;
  expectedTotalBases: number;
  expectedHomeRuns: number;
  expectedWalks: number;
  expectedStrikeouts: number;
};

export type MlbBatterPropEdgeBoardPlayer = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  quoteCount: number;
  hitterArchetype: string;
  pitcherArchetype: string;
  matchupClusterKey: string;
  edgeReport: MlbBatterPropEdgeReport;
  projectionSummary: {
    expectedPlateAppearances: number;
    expectedHits: number;
    expectedTotalBases: number;
    expectedHomeRuns: number;
    expectedWalks: number;
    expectedStrikeouts: number;
    confidence: number;
  };
};

export type MlbBatterPropEdgeBoard = {
  modelVersion: "mlb-batter-prop-edge-board-v1";
  awayTeam: string;
  homeTeam: string;
  evaluatedPlayers: number;
  quoteCount: number;
  calibrationApplied: boolean;
  calibrationSampleSize: number;
  players: MlbBatterPropEdgeBoardPlayer[];
  candidates: MlbBatterPropEdgeBoardCandidate[];
  passes: MlbBatterPropEdgeBoardCandidate[];
  warnings: string[];
};

function playerKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function quoteKey(quote: MlbBatterBookPropQuoteWithPlayer) {
  const id = playerKey(quote.playerId);
  if (id) return `id:${id}`;
  const name = playerKey(quote.playerName);
  const team = playerKey(quote.team);
  if (name && team) return `name-team:${name}:${team}`;
  if (name) return `name:${name}`;
  return "";
}

function hitterKeys(hitter: MlbHitterPerGameProjection) {
  return [
    `id:${playerKey(hitter.playerId)}`,
    `name-team:${playerKey(hitter.playerName)}:${playerKey(hitter.team)}`,
    `name:${playerKey(hitter.playerName)}`
  ];
}

function hitterArchetype(hitter: MlbHitterPerGameProjection) {
  if (hitter.expectedHomeRuns >= 0.18 || hitter.batterStatProfile.iso >= 0.22) return "POWER";
  if (hitter.expectedHits >= 1.08 && hitter.expectedStrikeouts <= 0.9) return "CONTACT";
  if (hitter.expectedWalks >= 0.48) return "DISCIPLINE";
  if (hitter.statDistribution.homeRunProbability >= 0.11 || hitter.statDistribution.totalBases4PlusProbability >= 0.2) return "VOLATILE_POWER";
  return "BALANCED";
}

function pitcherArchetype(hitter: MlbHitterPerGameProjection) {
  if (hitter.plateAppearanceOutcome.pitcherSuppressionScore >= 8) return "SUPPRESSOR";
  if (hitter.plateAppearanceOutcome.pitcherSuppressionScore <= -8) return "VULNERABLE";
  if (hitter.plateAppearanceOutcome.strikeoutRate >= 0.27) return "WHIFF";
  if (hitter.plateAppearanceOutcome.homeRunRate >= 0.055) return "HR_RISK";
  return "NEUTRAL";
}

function matchupClusterKey(hitter: MlbHitterPerGameProjection) {
  return `${hitterArchetype(hitter)}_vs_${pitcherArchetype(hitter)}`;
}

function toPlainQuote(quote: MlbBatterBookPropQuoteWithPlayer): MlbBatterBookPropQuote {
  return {
    book: quote.book,
    market: quote.market,
    line: quote.line,
    side: quote.side,
    americanOdds: quote.americanOdds,
    available: quote.available,
    updatedAt: quote.updatedAt
  };
}

function enrichCandidate(hitter: MlbHitterPerGameProjection, candidate: MlbBatterPropEdgeCandidate): MlbBatterPropEdgeBoardCandidate {
  return {
    ...candidate,
    playerId: hitter.playerId,
    playerName: hitter.playerName,
    team: hitter.team,
    battingOrder: hitter.battingOrder,
    expectedPlateAppearances: hitter.expectedPlateAppearances,
    expectedHits: hitter.expectedHits,
    expectedTotalBases: hitter.expectedTotalBases,
    expectedHomeRuns: hitter.expectedHomeRuns,
    expectedWalks: hitter.expectedWalks,
    expectedStrikeouts: hitter.expectedStrikeouts
  };
}

export function buildMlbBatterPropEdgeBoard(args: {
  projection: MlbPlayerStatProjectionGame;
  quotes: MlbBatterBookPropQuoteWithPlayer[];
  config?: MlbBatterPropEdgeConfig;
  calibration?: MlbBatterPropProbabilityCalibration | null;
}): MlbBatterPropEdgeBoard {
  const warnings: string[] = [];
  const hitters = [...args.projection.awayHitters, ...args.projection.homeHitters];
  const quotesByKey = new Map<string, MlbBatterBookPropQuoteWithPlayer[]>();
  for (const quote of args.quotes) {
    const key = quoteKey(quote);
    if (!key) {
      warnings.push(`Quote from ${quote.book} is missing playerId/playerName.`);
      continue;
    }
    const bucket = quotesByKey.get(key) ?? [];
    bucket.push(quote);
    quotesByKey.set(key, bucket);
  }

  const matchedQuoteKeys = new Set<string>();
  const players = hitters.flatMap((hitter) => {
    const keys = hitterKeys(hitter);
    const playerQuotes: MlbBatterBookPropQuoteWithPlayer[] = [];
    for (const key of keys) {
      const bucket = quotesByKey.get(key);
      if (!bucket?.length) continue;
      matchedQuoteKeys.add(key);
      playerQuotes.push(...bucket);
    }
    if (!playerQuotes.length) return [];

    const ha = hitterArchetype(hitter);
    const pa = pitcherArchetype(hitter);
    const cluster = `${ha}_vs_${pa}`;
    const edgeReport = evaluateMlbBatterPropEdges({
      surface: hitter.propSurface,
      quotes: playerQuotes.map(toPlainQuote),
      config: args.config,
      calibration: args.calibration,
      calibrationContext: {
        playerId: hitter.playerId,
        hitterArchetype: ha,
        pitcherArchetype: pa,
        matchupClusterKey: cluster
      }
    });
    warnings.push(...edgeReport.warnings.map((warning) => `${hitter.playerName}: ${warning}`));

    return [{
      playerId: hitter.playerId,
      playerName: hitter.playerName,
      team: hitter.team,
      battingOrder: hitter.battingOrder,
      quoteCount: playerQuotes.length,
      hitterArchetype: ha,
      pitcherArchetype: pa,
      matchupClusterKey: cluster,
      edgeReport,
      projectionSummary: {
        expectedPlateAppearances: hitter.expectedPlateAppearances,
        expectedHits: hitter.expectedHits,
        expectedTotalBases: hitter.expectedTotalBases,
        expectedHomeRuns: hitter.expectedHomeRuns,
        expectedWalks: hitter.expectedWalks,
        expectedStrikeouts: hitter.expectedStrikeouts,
        confidence: hitter.confidence
      }
    }];
  });

  for (const [key, bucket] of quotesByKey.entries()) {
    if (!matchedQuoteKeys.has(key)) warnings.push(`No projected hitter matched ${bucket.length} quote(s) for ${key}.`);
  }

  const candidates = players
    .flatMap((player) => player.edgeReport.candidates.map((candidate) => {
      const hitter = hitters.find((row) => row.playerId === player.playerId)!;
      return enrichCandidate(hitter, candidate);
    }))
    .sort((a, b) => (b.expectedValuePerUnit * b.confidence) - (a.expectedValuePerUnit * a.confidence));

  const passes = players
    .flatMap((player) => player.edgeReport.passes.map((candidate) => {
      const hitter = hitters.find((row) => row.playerId === player.playerId)!;
      return enrichCandidate(hitter, candidate);
    }))
    .sort((a, b) => (b.expectedValuePerUnit * b.confidence) - (a.expectedValuePerUnit * a.confidence));

  if (!args.quotes.length) warnings.push("No book quotes supplied for batter prop edge board.");
  if (!passes.length) warnings.push("No batter prop candidates cleared edge-board gates.");

  return {
    modelVersion: "mlb-batter-prop-edge-board-v1",
    awayTeam: args.projection.awayTeam,
    homeTeam: args.projection.homeTeam,
    evaluatedPlayers: players.length,
    quoteCount: args.quotes.length,
    calibrationApplied: Boolean(args.calibration && args.calibration.sampleSize > 0),
    calibrationSampleSize: args.calibration?.sampleSize ?? 0,
    players,
    candidates,
    passes,
    warnings
  };
}
