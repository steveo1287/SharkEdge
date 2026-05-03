import type { NbaStatKey } from "./nba-player-stat-profile";

export type NbaPropCalibrationStatus = "HEALTHY" | "WATCH" | "POOR" | "INSUFFICIENT";

export type NbaPropCalibrationRow = {
  statKey: NbaStatKey | string;
  confidence: number;
  predictedOverProbability: number;
  marketLine: number;
  actualValue: number;
  closingLine?: number | null;
  noBet?: boolean | null;
};

export type NbaPropCalibrationBucket = {
  statKey: NbaStatKey;
  bucket: string;
  count: number;
  avgPredictedOver: number;
  actualOverRate: number;
  brier: number;
  hitRate: number;
  avgEdgeToClose: number | null;
  status: NbaPropCalibrationStatus;
  blockers: string[];
};

export type NbaPropCalibrationLookup = {
  status: NbaPropCalibrationStatus;
  bucket: NbaPropCalibrationBucket | null;
  blockerReasons: string[];
};

const KNOWN_STATS = new Set<NbaStatKey>(["points", "rebounds", "assists", "threes", "steals", "blocks", "turnovers", "pra"]);

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function normalizeNbaPropStatKey(value: string): NbaStatKey | null {
  switch (value) {
    case "player_points":
    case "points":
      return "points";
    case "player_rebounds":
    case "rebounds":
      return "rebounds";
    case "player_assists":
    case "assists":
      return "assists";
    case "player_threes":
    case "threes":
    case "3pm":
      return "threes";
    case "player_steals":
    case "steals":
      return "steals";
    case "player_blocks":
    case "blocks":
      return "blocks";
    case "player_turnovers":
    case "turnovers":
      return "turnovers";
    case "player_pra":
    case "pra":
      return "pra";
    default:
      return KNOWN_STATS.has(value as NbaStatKey) ? value as NbaStatKey : null;
  }
}

export function nbaPropConfidenceBucket(confidence: number) {
  if (!Number.isFinite(confidence)) return "unknown";
  if (confidence < 0.55) return "0.00-0.55";
  if (confidence < 0.62) return "0.55-0.62";
  if (confidence < 0.68) return "0.62-0.68";
  if (confidence < 0.74) return "0.68-0.74";
  if (confidence < 0.8) return "0.74-0.80";
  return "0.80-1.00";
}

function bucketStatus(args: { count: number; avgPredictedOver: number; actualOverRate: number; brier: number; avgEdgeToClose: number | null }): { status: NbaPropCalibrationStatus; blockers: string[] } {
  const blockers: string[] = [];
  if (args.count < 30) blockers.push(`only ${args.count}/30 graded prop samples`);
  if (args.avgPredictedOver - args.actualOverRate >= 0.14) blockers.push(`overconfidence ${(args.avgPredictedOver - args.actualOverRate).toFixed(3)}`);
  if (args.brier >= 0.29) blockers.push(`Brier ${args.brier.toFixed(3)} >= 0.290`);
  if (args.avgEdgeToClose !== null && args.avgEdgeToClose < -0.35) blockers.push(`negative closing-line edge ${args.avgEdgeToClose.toFixed(2)}`);

  if (args.count < 30) return { status: "INSUFFICIENT", blockers };
  if (blockers.some((blocker) => blocker.includes("Brier") || blocker.includes("overconfidence") || blocker.includes("negative"))) return { status: "POOR", blockers };
  if (args.count < 75 || args.brier >= 0.24 || (args.avgEdgeToClose !== null && args.avgEdgeToClose < 0)) {
    return { status: "WATCH", blockers: blockers.length ? blockers : ["bucket is not strong enough for unrestricted prop action"] };
  }
  return { status: "HEALTHY", blockers: [] };
}

export function summarizeNbaPropCalibrationBuckets(rows: NbaPropCalibrationRow[]): NbaPropCalibrationBucket[] {
  const grouped = new Map<string, {
    statKey: NbaStatKey;
    bucket: string;
    predicted: number[];
    outcomes: number[];
    briers: number[];
    hits: number[];
    closeEdges: number[];
  }>();

  for (const row of rows) {
    if (row.noBet) continue;
    const statKey = normalizeNbaPropStatKey(String(row.statKey));
    if (!statKey) continue;
    if (!Number.isFinite(row.confidence) || !Number.isFinite(row.predictedOverProbability) || !Number.isFinite(row.marketLine) || !Number.isFinite(row.actualValue)) continue;
    const predicted = Math.max(0.01, Math.min(0.99, row.predictedOverProbability));
    const actualOver = row.actualValue > row.marketLine ? 1 : 0;
    const push = row.actualValue === row.marketLine;
    const bucket = nbaPropConfidenceBucket(row.confidence);
    const key = `${statKey}:${bucket}`;
    const current = grouped.get(key) ?? { statKey, bucket, predicted: [], outcomes: [], briers: [], hits: [], closeEdges: [] };
    current.predicted.push(predicted);
    current.outcomes.push(actualOver);
    current.briers.push((predicted - actualOver) ** 2);
    if (!push) current.hits.push((predicted >= 0.5 && actualOver === 1) || (predicted < 0.5 && actualOver === 0) ? 1 : 0);
    if (typeof row.closingLine === "number" && Number.isFinite(row.closingLine)) {
      const modelSide = predicted >= 0.5 ? "over" : "under";
      const edgeToClose = modelSide === "over" ? row.closingLine - row.marketLine : row.marketLine - row.closingLine;
      current.closeEdges.push(edgeToClose);
    }
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((group) => {
      const count = group.predicted.length;
      const avgPredictedOver = round(group.predicted.reduce((sum, value) => sum + value, 0) / Math.max(1, count), 4);
      const actualOverRate = round(group.outcomes.reduce((sum, value) => sum + value, 0) / Math.max(1, group.outcomes.length), 4);
      const brier = round(group.briers.reduce((sum, value) => sum + value, 0) / Math.max(1, group.briers.length), 4);
      const hitRate = round(group.hits.reduce((sum, value) => sum + value, 0) / Math.max(1, group.hits.length), 4);
      const avgEdgeToClose = group.closeEdges.length ? round(group.closeEdges.reduce((sum, value) => sum + value, 0) / group.closeEdges.length, 4) : null;
      const status = bucketStatus({ count, avgPredictedOver, actualOverRate, brier, avgEdgeToClose });
      return {
        statKey: group.statKey,
        bucket: group.bucket,
        count,
        avgPredictedOver,
        actualOverRate,
        brier,
        hitRate,
        avgEdgeToClose,
        status: status.status,
        blockers: status.blockers
      };
    })
    .sort((left, right) => left.statKey.localeCompare(right.statKey) || left.bucket.localeCompare(right.bucket));
}

export function lookupNbaPropCalibration(args: {
  buckets: NbaPropCalibrationBucket[];
  statKey: string;
  confidence: number;
}): NbaPropCalibrationLookup {
  const statKey = normalizeNbaPropStatKey(args.statKey);
  if (!statKey) {
    return { status: "INSUFFICIENT", bucket: null, blockerReasons: [`unsupported NBA prop stat ${args.statKey}`] };
  }
  const bucketName = nbaPropConfidenceBucket(args.confidence);
  const bucket = args.buckets.find((entry) => entry.statKey === statKey && entry.bucket === bucketName) ?? null;
  if (!bucket) {
    return { status: "INSUFFICIENT", bucket: null, blockerReasons: [`no NBA prop calibration bucket for ${statKey} ${bucketName}`] };
  }
  return {
    status: bucket.status,
    bucket,
    blockerReasons: bucket.status === "HEALTHY" ? [] : bucket.blockers.length ? bucket.blockers : [`NBA prop calibration bucket ${statKey} ${bucketName} is ${bucket.status}`]
  };
}
