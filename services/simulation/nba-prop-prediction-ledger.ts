import { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import type { NbaElitePlayerPropSimulationSummary } from "./player-prop-sim-nba-elite";
import { normalizeNbaPropStatKey } from "./nba-prop-calibration";

export type NbaPropPredictionSnapshotInput = {
  eventId?: string | null;
  gameId?: string | null;
  playerId?: string | null;
  playerName: string;
  team?: string | null;
  opponent?: string | null;
  statKey: string;
  marketLine: number;
  marketOddsOver?: number | null;
  marketOddsUnder?: number | null;
  gameStartTime?: string | Date | null;
  sim: NbaElitePlayerPropSimulationSummary;
  metadata?: Record<string, unknown> | null;
};

export type NbaPropPredictionGradeInput = {
  eventId?: string | null;
  gameId?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  statKey: string;
  actualValue: number;
  closingLine?: number | null;
  closingOddsOver?: number | null;
  closingOddsUnder?: number | null;
};

function cuidLike() {
  return `nba_prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resultFor(actualValue: number, marketLine: number, predictedOverProbability: number) {
  if (actualValue === marketLine) return "PUSH";
  const actualOver = actualValue > marketLine;
  const modelOver = predictedOverProbability >= 0.5;
  return actualOver === modelOver ? "WIN" : "LOSS";
}

export async function captureNbaPropPredictionSnapshot(input: NbaPropPredictionSnapshotInput) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, reason: "DATABASE_URL missing" };
  const statKey = normalizeNbaPropStatKey(input.statKey);
  if (!statKey) return { ok: false, reason: `unsupported stat ${input.statKey}` };
  const overProbability = numberOrNull(input.sim.hitProbOver?.[String(input.marketLine)]);
  if (overProbability === null) return { ok: false, reason: "missing over probability for market line" };
  const safety = input.sim.nbaPropSafety;
  try {
    const id = cuidLike();
    await prisma.$executeRaw`
      INSERT INTO nba_prop_prediction_snapshots (
        id,
        event_id,
        game_id,
        player_id,
        player_name,
        team,
        opponent,
        stat_key,
        market_line,
        market_odds_over,
        market_odds_under,
        predicted_mean,
        predicted_median,
        predicted_std_dev,
        predicted_over_probability,
        confidence,
        minutes_confidence,
        lineup_truth_status,
        player_status,
        prop_calibration_status,
        no_bet,
        blocker_reasons,
        drivers,
        game_start_time,
        metadata_json
      ) VALUES (
        ${id},
        ${input.eventId ?? null},
        ${input.gameId ?? null},
        ${input.playerId ?? null},
        ${input.playerName},
        ${input.team ?? null},
        ${input.opponent ?? null},
        ${statKey},
        ${input.marketLine},
        ${input.marketOddsOver ?? null},
        ${input.marketOddsUnder ?? null},
        ${input.sim.meanValue},
        ${input.sim.medianValue},
        ${input.sim.stdDev},
        ${overProbability},
        ${safety?.confidence ?? input.sim.roleConfidence ?? 0},
        ${safety?.minutesConfidence ?? input.sim.roleConfidence ?? null},
        ${safety?.lineupTruthStatus ?? null},
        ${safety?.playerStatus ?? null},
        ${safety?.propCalibrationStatus ?? null},
        ${safety?.noBet ?? false},
        ${JSON.stringify(safety?.blockerReasons ?? [])}::jsonb,
        ${JSON.stringify(input.sim.drivers ?? [])}::jsonb,
        ${toDate(input.gameStartTime)},
        ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb
      );
    `;
    return { ok: true, id };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "capture failed" };
  }
}

export async function gradeNbaPropPredictionSnapshots(input: NbaPropPredictionGradeInput) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, updated: 0, reason: "DATABASE_URL missing" };
  const statKey = normalizeNbaPropStatKey(input.statKey);
  if (!statKey) return { ok: false, updated: 0, reason: `unsupported stat ${input.statKey}` };
  try {
    const result = await prisma.$executeRaw`
      UPDATE nba_prop_prediction_snapshots
      SET
        actual_value = ${input.actualValue},
        closing_line = ${input.closingLine ?? null},
        closing_odds_over = ${input.closingOddsOver ?? null},
        closing_odds_under = ${input.closingOddsUnder ?? null},
        result = CASE
          WHEN ${input.actualValue} = market_line THEN 'PUSH'
          WHEN (${input.actualValue} > market_line AND predicted_over_probability >= 0.5)
            OR (${input.actualValue} < market_line AND predicted_over_probability < 0.5) THEN 'WIN'
          ELSE 'LOSS'
        END,
        graded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE stat_key = ${statKey}
        AND graded_at IS NULL
        AND (${input.eventId ?? null} IS NULL OR event_id = ${input.eventId ?? null})
        AND (${input.gameId ?? null} IS NULL OR game_id = ${input.gameId ?? null})
        AND (${input.playerId ?? null} IS NULL OR player_id = ${input.playerId ?? null})
        AND (${input.playerName ?? null} IS NULL OR player_name = ${input.playerName ?? null});
    `;
    return { ok: true, updated: Number(result), result: resultFor(input.actualValue, 0, 0.5) };
  } catch (error) {
    return { ok: false, updated: 0, reason: error instanceof Error ? error.message : "grade failed" };
  }
}

export async function getOpenNbaPropPredictionSnapshotCount() {
  if (!hasUsableServerDatabaseUrl()) return 0;
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM nba_prop_prediction_snapshots
      WHERE graded_at IS NULL;
    `;
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export const __nbaPropPredictionLedgerTestHooks = {
  resultFor
};
