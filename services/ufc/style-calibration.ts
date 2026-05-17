export type UfcStyleCalibrationSide = "A" | "B";

export type UfcStyleCalibrationRow = {
  fightId: string;
  actualWinner: UfcStyleCalibrationSide;
  pickSide?: UfcStyleCalibrationSide | null;
  fighterAWinProbability: number;
  fighterBWinProbability?: number | null;
  styleMatchupFighterAWinProbability?: number | null;
  fighterAArchetype: string;
  fighterBArchetype: string;
  fighterASecondary?: string[];
  fighterBSecondary?: string[];
  styleWarnings?: string[];
  pathToVictoryA?: string[];
  pathToVictoryB?: string[];
  paceProjection?: number | null;
  wrestlingInitiativeEdgeA?: number | null;
  chaosIndex?: number | null;
  finishVolatility?: number | null;
  decisionReliability?: number | null;
};

export type UfcStyleBucketReport = {
  key: string;
  count: number;
  pickCount: number;
  pickAccuracyPct: number | null;
  winRatePct: number | null;
  avgModelProbability: number | null;
  avgStyleProbability: number | null;
  avgBrier: number | null;
};

export type UfcStylePathReport = {
  key: string;
  count: number;
  successCount: number;
  successRatePct: number | null;
};

export type UfcStyleCalibrationReport = {
  version: "ufc-style-calibration-v1";
  generatedAt: string;
  sampleCount: number;
  pickCount: number;
  pickAccuracyPct: number | null;
  stylePickAccuracyPct: number | null;
  avgBrier: number | null;
  avgStyleBrier: number | null;
  archetypes: UfcStyleBucketReport[];
  secondaryArchetypes: UfcStyleBucketReport[];
  warnings: UfcStyleBucketReport[];
  paths: UfcStylePathReport[];
  clashBuckets: {
    pace: UfcStyleBucketReport[];
    finishVolatility: UfcStyleBucketReport[];
    decisionReliability: UfcStyleBucketReport[];
    wrestlingInitiative: UfcStyleBucketReport[];
    chaos: UfcStyleBucketReport[];
  };
  flags: string[];
};

const VERSION = "ufc-style-calibration-v1" as const;

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function pct(value: number | null) {
  return value == null ? null : round(value * 100, 2);
}

function clampProbability(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0.001, Math.min(0.999, value));
}

function sideProbability(row: UfcStyleCalibrationRow, side: UfcStyleCalibrationSide, useStyle = false) {
  const pA = clampProbability(useStyle ? row.styleMatchupFighterAWinProbability : row.fighterAWinProbability);
  if (pA == null) return null;
  return side === "A" ? pA : 1 - pA;
}

function brier(row: UfcStyleCalibrationRow, useStyle = false) {
  const pA = clampProbability(useStyle ? row.styleMatchupFighterAWinProbability : row.fighterAWinProbability);
  if (pA == null) return null;
  const actualA = row.actualWinner === "A" ? 1 : 0;
  return (pA - actualA) ** 2;
}

function average(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function cleanKey(value: string | null | undefined) {
  return value?.trim() || "Unknown";
}

function normalizeList(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map(cleanKey).filter((value) => value !== "Unknown"))];
}

function valueBucket(value: number | null | undefined, lowLabel: string, midLabel: string, highLabel: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value >= 67) return highLabel;
  if (value <= 43) return lowLabel;
  return midLabel;
}

function signedBucket(value: number | null | undefined, negativeLabel: string, neutralLabel: string, positiveLabel: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "unknown";
  if (value >= 10) return positiveLabel;
  if (value <= -10) return negativeLabel;
  return neutralLabel;
}

type MutableBucket = {
  key: string;
  count: number;
  pickCount: number;
  pickCorrect: number;
  wins: number;
  modelProbabilities: number[];
  styleProbabilities: number[];
  briers: number[];
};

function ensureBucket(map: Map<string, MutableBucket>, key: string) {
  const safe = cleanKey(key);
  const existing = map.get(safe);
  if (existing) return existing;
  const created: MutableBucket = { key: safe, count: 0, pickCount: 0, pickCorrect: 0, wins: 0, modelProbabilities: [], styleProbabilities: [], briers: [] };
  map.set(safe, created);
  return created;
}

function addSideBucket(map: Map<string, MutableBucket>, key: string, row: UfcStyleCalibrationRow, side: UfcStyleCalibrationSide) {
  const bucket = ensureBucket(map, key);
  const modelProbability = sideProbability(row, side, false);
  const styleProbability = sideProbability(row, side, true);
  const actualWin = row.actualWinner === side;
  bucket.count += 1;
  bucket.wins += actualWin ? 1 : 0;
  if (row.pickSide === side) {
    bucket.pickCount += 1;
    bucket.pickCorrect += actualWin ? 1 : 0;
  }
  if (modelProbability != null) bucket.modelProbabilities.push(modelProbability);
  if (styleProbability != null) bucket.styleProbabilities.push(styleProbability);
  if (modelProbability != null) bucket.briers.push((modelProbability - (actualWin ? 1 : 0)) ** 2);
}

function addFightBucket(map: Map<string, MutableBucket>, key: string, row: UfcStyleCalibrationRow) {
  const bucket = ensureBucket(map, key);
  const pA = clampProbability(row.fighterAWinProbability);
  const styleA = clampProbability(row.styleMatchupFighterAWinProbability);
  const pickSide = row.pickSide ?? (pA != null ? (pA >= 0.5 ? "A" : "B") : null);
  bucket.count += 1;
  if (pickSide) {
    bucket.pickCount += 1;
    bucket.pickCorrect += pickSide === row.actualWinner ? 1 : 0;
  }
  bucket.wins += row.actualWinner === "A" ? 1 : 0;
  if (pA != null) bucket.modelProbabilities.push(pA);
  if (styleA != null) bucket.styleProbabilities.push(styleA);
  const fightBrier = brier(row, false);
  if (fightBrier != null) bucket.briers.push(fightBrier);
}

function finalizeBuckets(map: Map<string, MutableBucket>): UfcStyleBucketReport[] {
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).map((bucket) => ({
    key: bucket.key,
    count: bucket.count,
    pickCount: bucket.pickCount,
    pickAccuracyPct: bucket.pickCount ? pct(bucket.pickCorrect / bucket.pickCount) : null,
    winRatePct: bucket.count ? pct(bucket.wins / bucket.count) : null,
    avgModelProbability: average(bucket.modelProbabilities) == null ? null : round(average(bucket.modelProbabilities) as number, 4),
    avgStyleProbability: average(bucket.styleProbabilities) == null ? null : round(average(bucket.styleProbabilities) as number, 4),
    avgBrier: average(bucket.briers) == null ? null : round(average(bucket.briers) as number, 5)
  }));
}

type MutablePath = { key: string; count: number; successCount: number };

function addPath(map: Map<string, MutablePath>, key: string, success: boolean) {
  const safe = cleanKey(key);
  const current = map.get(safe) ?? { key: safe, count: 0, successCount: 0 };
  current.count += 1;
  current.successCount += success ? 1 : 0;
  map.set(safe, current);
}

function finalizePaths(map: Map<string, MutablePath>): UfcStylePathReport[] {
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).map((path) => ({
    key: path.key,
    count: path.count,
    successCount: path.successCount,
    successRatePct: path.count ? pct(path.successCount / path.count) : null
  }));
}

function stylePick(row: UfcStyleCalibrationRow) {
  const pA = clampProbability(row.styleMatchupFighterAWinProbability);
  if (pA == null) return null;
  return pA >= 0.5 ? "A" : "B";
}

export function calculateUfcStyleCalibrationReport(rows: UfcStyleCalibrationRow[], generatedAt = new Date().toISOString()): UfcStyleCalibrationReport {
  const archetypes = new Map<string, MutableBucket>();
  const secondaryArchetypes = new Map<string, MutableBucket>();
  const warningBuckets = new Map<string, MutableBucket>();
  const pathBuckets = new Map<string, MutablePath>();
  const paceBuckets = new Map<string, MutableBucket>();
  const finishBuckets = new Map<string, MutableBucket>();
  const decisionBuckets = new Map<string, MutableBucket>();
  const wrestlingBuckets = new Map<string, MutableBucket>();
  const chaosBuckets = new Map<string, MutableBucket>();
  let pickCount = 0;
  let pickCorrect = 0;
  let stylePickCount = 0;
  let stylePickCorrect = 0;
  const briers: number[] = [];
  const styleBriers: number[] = [];

  for (const row of rows) {
    const pickSide = row.pickSide ?? (row.fighterAWinProbability >= 0.5 ? "A" : "B");
    pickCount += 1;
    pickCorrect += pickSide === row.actualWinner ? 1 : 0;
    const styleSide = stylePick(row);
    if (styleSide) {
      stylePickCount += 1;
      stylePickCorrect += styleSide === row.actualWinner ? 1 : 0;
    }
    const rowBrier = brier(row, false);
    const rowStyleBrier = brier(row, true);
    if (rowBrier != null) briers.push(rowBrier);
    if (rowStyleBrier != null) styleBriers.push(rowStyleBrier);

    addSideBucket(archetypes, row.fighterAArchetype, row, "A");
    addSideBucket(archetypes, row.fighterBArchetype, row, "B");
    for (const archetype of normalizeList(row.fighterASecondary)) addSideBucket(secondaryArchetypes, archetype, row, "A");
    for (const archetype of normalizeList(row.fighterBSecondary)) addSideBucket(secondaryArchetypes, archetype, row, "B");
    for (const warning of normalizeList(row.styleWarnings)) addFightBucket(warningBuckets, warning, row);
    for (const path of normalizeList(row.pathToVictoryA)) addPath(pathBuckets, path, row.actualWinner === "A");
    for (const path of normalizeList(row.pathToVictoryB)) addPath(pathBuckets, path, row.actualWinner === "B");
    addFightBucket(paceBuckets, valueBucket(row.paceProjection, "low-pace", "medium-pace", "high-pace"), row);
    addFightBucket(finishBuckets, valueBucket(row.finishVolatility, "low-finish-volatility", "medium-finish-volatility", "high-finish-volatility"), row);
    addFightBucket(decisionBuckets, valueBucket(row.decisionReliability, "low-decision-reliability", "medium-decision-reliability", "high-decision-reliability"), row);
    addFightBucket(wrestlingBuckets, signedBucket(row.wrestlingInitiativeEdgeA, "fighter-b-wrestling-edge", "neutral-wrestling-edge", "fighter-a-wrestling-edge"), row);
    addFightBucket(chaosBuckets, valueBucket(row.chaosIndex, "low-chaos", "medium-chaos", "high-chaos"), row);
  }

  const flags: string[] = [];
  if (rows.length < 30) flags.push("thin-style-calibration-sample");
  if (stylePickCount < rows.length) flags.push("missing-style-matchup-probabilities");
  if (!warningBuckets.size) flags.push("no-style-warning-samples");
  if (!pathBuckets.size) flags.push("no-path-to-victory-samples");

  return {
    version: VERSION,
    generatedAt,
    sampleCount: rows.length,
    pickCount,
    pickAccuracyPct: pickCount ? pct(pickCorrect / pickCount) : null,
    stylePickAccuracyPct: stylePickCount ? pct(stylePickCorrect / stylePickCount) : null,
    avgBrier: average(briers) == null ? null : round(average(briers) as number, 5),
    avgStyleBrier: average(styleBriers) == null ? null : round(average(styleBriers) as number, 5),
    archetypes: finalizeBuckets(archetypes),
    secondaryArchetypes: finalizeBuckets(secondaryArchetypes),
    warnings: finalizeBuckets(warningBuckets),
    paths: finalizePaths(pathBuckets),
    clashBuckets: {
      pace: finalizeBuckets(paceBuckets),
      finishVolatility: finalizeBuckets(finishBuckets),
      decisionReliability: finalizeBuckets(decisionBuckets),
      wrestlingInitiative: finalizeBuckets(wrestlingBuckets),
      chaos: finalizeBuckets(chaosBuckets)
    },
    flags
  };
}
