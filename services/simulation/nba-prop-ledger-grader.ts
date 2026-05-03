import type { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { normalizeNbaPropStatKey } from "./nba-prop-calibration";

export type NbaPropLedgerGradeResult = {
  ok: true;
  generatedAt: string;
  scanned: number;
  graded: number;
  skipped: number;
  failures: string[];
};

type OpenSnapshotRow = {
  id: string;
  event_id: string | null;
  game_id: string | null;
  player_id: string | null;
  player_name: string;
  stat_key: string;
  market_line: number;
  predicted_over_probability: number;
  game_start_time: Date | null;
};

type CandidateStatRow = {
  game_id: string;
  player_id: string;
  stats_json: Prisma.JsonValue;
  minutes: number | null;
  outcome_status: string;
};

type ClosingLineRow = {
  closing_line: number | null;
  closing_odds_over: number | null;
  closing_odds_under: number | null;
};

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

export function actualValueForNbaProp(statKey: string, statsJson: unknown): number | null {
  const normalized = normalizeNbaPropStatKey(statKey);
  if (!normalized) return null;
  const record = asRecord(statsJson);
  switch (normalized) {
    case "points":
      return firstNumber(record, ["points", "PTS"]);
    case "rebounds":
      return firstNumber(record, ["rebounds", "REB", "totalRebounds", "total_rebounds"]);
    case "assists":
      return firstNumber(record, ["assists", "AST"]);
    case "threes":
      return firstNumber(record, ["threes", "FG3M", "3PM", "threePointMade", "threePointersMade"]);
    case "steals":
      return firstNumber(record, ["steals", "STL"]);
    case "blocks":
      return firstNumber(record, ["blocks", "BLK"]);
    case "turnovers":
      return firstNumber(record, ["turnovers", "TO", "TOV"]);
    case "pra": {
      const points = firstNumber(record, ["points", "PTS"]);
      const rebounds = firstNumber(record, ["rebounds", "REB", "totalRebounds", "total_rebounds"]);
      const assists = firstNumber(record, ["assists", "AST"]);
      if (points === null || rebounds === null || assists === null) return null;
      return points + rebounds + assists;
    }
  }
}

export function resultForProp(actualValue: number, marketLine: number, predictedOverProbability: number) {
  if (actualValue === marketLine) return "PUSH";
  const actualOver = actualValue > marketLine;
  const modelOver = predictedOverProbability >= 0.5;
  return actualOver === modelOver ? "WIN" : "LOSS";
}

async function getOpenSnapshots(limit: number) {
  return prisma.$queryRaw<OpenSnapshotRow[]>`
    SELECT
      id,
      event_id,
      game_id,
      player_id,
      player_name,
      stat_key,
      market_line,
      predicted_over_probability,
      game_start_time
    FROM nba_prop_prediction_snapshots
    WHERE graded_at IS NULL
      AND player_id IS NOT NULL
      AND market_line IS NOT NULL
      AND predicted_over_probability IS NOT NULL
      AND COALESCE(game_start_time, captured_at) <= NOW() - INTERVAL '90 minutes'
    ORDER BY captured_at ASC
    LIMIT ${limit};
  `;
}

async function getCandidateStat(snapshot: OpenSnapshotRow) {
  if (!snapshot.player_id) return null;
  const rows = await prisma.$queryRaw<CandidateStatRow[]>`
    SELECT
      pgs.game_id,
      pgs.player_id,
      pgs.stats_json,
      pgs.minutes,
      pgs.outcome_status
    FROM player_game_stats pgs
    JOIN games g ON g.id = pgs.game_id
    LEFT JOIN events e ON e.id = ${snapshot.event_id ?? null}
    WHERE pgs.player_id = ${snapshot.player_id}
      AND (
        (${snapshot.game_id ?? null} IS NOT NULL AND pgs.game_id = ${snapshot.game_id ?? null})
        OR (${snapshot.event_id ?? null} IS NOT NULL AND e.external_event_id IS NOT NULL AND g.external_event_id = e.external_event_id)
        OR (${snapshot.game_start_time ?? null} IS NOT NULL AND g.start_time BETWEEN ${snapshot.game_start_time ?? null}::timestamp - INTERVAL '6 hours' AND ${snapshot.game_start_time ?? null}::timestamp + INTERVAL '6 hours')
      )
    ORDER BY
      CASE WHEN ${snapshot.game_id ?? null} IS NOT NULL AND pgs.game_id = ${snapshot.game_id ?? null} THEN 0 ELSE 1 END,
      g.start_time DESC
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

async function getClosingLine(snapshot: OpenSnapshotRow) {
  if (!snapshot.event_id || !snapshot.player_id) return null;
  const normalized = normalizeNbaPropStatKey(snapshot.stat_key);
  if (!normalized) return null;
  const rows = await prisma.$queryRaw<ClosingLineRow[]>`
    SELECT
      em.closing_line,
      MAX(CASE WHEN LOWER(COALESCE(em.side, em.selection)) = 'over' THEN em.closing_odds END)::integer AS closing_odds_over,
      MAX(CASE WHEN LOWER(COALESCE(em.side, em.selection)) = 'under' THEN em.closing_odds END)::integer AS closing_odds_under
    FROM event_markets em
    WHERE em.event_id = ${snapshot.event_id}
      AND em.player_id = ${snapshot.player_id}
      AND em.market_type = ${normalized}
    GROUP BY em.closing_line
    ORDER BY em.closing_line NULLS LAST
    LIMIT 1;
  `;
  return rows[0] ?? null;
}

async function gradeSnapshot(snapshot: OpenSnapshotRow) {
  const stat = await getCandidateStat(snapshot);
  if (!stat) return { graded: false, reason: "no matching player_game_stats row" };
  const actualValue = actualValueForNbaProp(snapshot.stat_key, stat.stats_json);
  if (actualValue === null) return { graded: false, reason: `actual stat missing for ${snapshot.stat_key}` };
  const result = resultForProp(actualValue, snapshot.market_line, snapshot.predicted_over_probability);
  const closing = await getClosingLine(snapshot);

  await prisma.$executeRaw`
    UPDATE nba_prop_prediction_snapshots
    SET
      game_id = COALESCE(game_id, ${stat.game_id}),
      actual_value = ${actualValue},
      closing_line = ${closing?.closing_line ?? null},
      closing_odds_over = ${closing?.closing_odds_over ?? null},
      closing_odds_under = ${closing?.closing_odds_under ?? null},
      result = ${result},
      graded_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${snapshot.id};
  `;
  return { graded: true, reason: result };
}

export async function gradeOpenNbaPropPredictionSnapshots(args: { limit?: number } = {}): Promise<NbaPropLedgerGradeResult> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: true, generatedAt: new Date().toISOString(), scanned: 0, graded: 0, skipped: 0, failures: ["DATABASE_URL missing"] };
  }

  const snapshots = await getOpenSnapshots(Math.max(1, Math.min(1000, args.limit ?? 250)));
  let graded = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const snapshot of snapshots) {
    try {
      const result = await gradeSnapshot(snapshot);
      if (result.graded) graded += 1;
      else {
        skipped += 1;
        failures.push(`${snapshot.player_name} ${snapshot.stat_key}: ${result.reason}`);
      }
    } catch (error) {
      skipped += 1;
      failures.push(`${snapshot.player_name} ${snapshot.stat_key}: ${error instanceof Error ? error.message : "grade failed"}`);
    }
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    scanned: snapshots.length,
    graded,
    skipped,
    failures
  };
}

export const __nbaPropLedgerGraderTestHooks = {
  actualValueForNbaProp,
  resultForProp
};
