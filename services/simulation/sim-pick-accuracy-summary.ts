import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";

import { simPickProbabilityBucket } from "@/services/simulation/sim-accuracy-buckets";

type GuardLeague = Extract<LeagueKey, "NBA" | "MLB">;

export type SimPickAccuracyBucket = {
  league: GuardLeague;
  bucket: string;
  count: number;
  avgPredicted: number;
  actualRate: number;
  brier: number;
};

type SnapshotRow = {
  league: string;
  model_home_win_pct: number;
  model_away_win_pct: number;
  home_won: boolean;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function pickedHome(row: SnapshotRow) {
  return row.model_home_win_pct >= row.model_away_win_pct;
}

function pickWon(row: SnapshotRow) {
  return pickedHome(row) === row.home_won;
}

function pickProbability(row: SnapshotRow) {
  return Math.max(row.model_home_win_pct, row.model_away_win_pct);
}

export function summarizePickAccuracyBuckets(rows: SnapshotRow[]): SimPickAccuracyBucket[] {
  const grouped = new Map<string, { league: GuardLeague; bucket: string; predicted: number[]; outcomes: number[]; briers: number[] }>();

  for (const row of rows) {
    if (row.league !== "NBA" && row.league !== "MLB") continue;
    if (!Number.isFinite(row.model_home_win_pct) || !Number.isFinite(row.model_away_win_pct)) continue;
    const probability = pickProbability(row);
    const outcome = pickWon(row) ? 1 : 0;
    const bucket = simPickProbabilityBucket(row.model_home_win_pct, row.model_away_win_pct);
    const key = `${row.league}:${bucket}`;
    const current = grouped.get(key) ?? { league: row.league as GuardLeague, bucket, predicted: [], outcomes: [], briers: [] };
    current.predicted.push(probability);
    current.outcomes.push(outcome);
    current.briers.push((probability - outcome) ** 2);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((group) => ({
      league: group.league,
      bucket: group.bucket,
      count: group.predicted.length,
      avgPredicted: round(group.predicted.reduce((total, value) => total + value, 0) / Math.max(1, group.predicted.length), 3),
      actualRate: round(group.outcomes.reduce((total, value) => total + value, 0) / Math.max(1, group.outcomes.length), 3),
      brier: round(group.briers.reduce((total, value) => total + value, 0) / Math.max(1, group.briers.length), 4)
    }))
    .sort((left, right) => left.league.localeCompare(right.league) || left.bucket.localeCompare(right.bucket));
}

export async function getSimPickAccuracyBucketSummary(): Promise<SimPickAccuracyBucket[]> {
  if (!hasUsableServerDatabaseUrl()) return [];
  try {
    const rows = await prisma.$queryRaw<SnapshotRow[]>`
      SELECT league, model_home_win_pct, model_away_win_pct, home_won
      FROM sim_prediction_snapshots
      WHERE graded_at IS NOT NULL
        AND home_won IS NOT NULL
        AND league IN ('NBA', 'MLB')
      ORDER BY captured_at DESC
      LIMIT 5000;
    `;
    return summarizePickAccuracyBuckets(rows);
  } catch {
    return [];
  }
}
