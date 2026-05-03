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

export type NbaPropProjectionPayloadSnapshotInput = {
  eventId: string;
  gameId?: string | null;
  playerId: string;
  playerName: string;
  team?: string | null;
  opponent?: string | null;
  statKey: string;
  marketLine?: number | null;
  marketOddsOver?: number | null;
  marketOddsUnder?: number | null;
  gameStartTime?: string | Date | null;
  projection: {
    meanValue: number;
    medianValue?: number;
    stdDev?: number;
    hitProbOver?: Record<string, number>;
    hitProbUnder?: Record<string, number>;
    metadata?: Record<string, unknown> | null;
  };
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

function firstMarketLine(hitProbOver: Record<string, number> | undefined, fallback?: number | null) {
  if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
  for (const key of Object.keys(hitProbOver ?? {})) {
    const parsed = Number(key);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function resultFor(actualValue: number, marketLine: number, predictedOverProbability: number) {
  if (actualValue === marketLine) return "PUSH";
  const actualOver = actualValue > marketLine;
  const modelOver = predictedOverProbability >= 0.5;
  return actualOver === modelOver ? "WIN" : "LOSS";
}

function jsonString(value: unknown) {
  return JSON.stringify(value ?? null);
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function insertSnapshot(args: {
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
  predictedMean: number;
  predictedMedian?: number | null;
  predictedStdDev?: number | null;
  predictedOverProbability: number;
  confidence: number;
  minutesConfidence?: number | null;
  lineupTruthStatus?: string | null;
  playerStatus?: string | null;
  propCalibrationStatus?: string | null;
  noBet?: boolean;
  blockerReasons?: unknown[];
  drivers?: unknown[];
  gameStartTime?: string | Date | null;
  metadata?: Record<string, unknown> | null;
}) {
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
      ${args.eventId ?? null},
      ${args.gameId ?? null},
      ${args.playerId ?? null},
      ${args.playerName},
      ${args.team ?? null},
      ${args.opponent ?? null},
      ${args.statKey},
      ${args.marketLine},
      ${args.marketOddsOver ?? null},
      ${args.marketOddsUnder ?? null},
      ${args.predictedMean},
      ${args.predictedMedian ?? null},
      ${args.predictedStdDev ?? null},
      ${args.predictedOverProbability},
      ${args.confidence},
      ${args.minutesConfidence ?? null},
      ${args.lineupTruthStatus ?? null},
      ${args.playerStatus ?? null},
      ${args.propCalibrationStatus ?? null},
      ${args.noBet ?? false},
      ${jsonString(args.blockerReasons ?? [])}::jsonb,
      ${jsonString(args.drivers ?? [])}::jsonb,
      ${toDate(args.gameStartTime)},
      ${jsonString(args.metadata ?? null)}::jsonb
    );
  `;
  return id;
}

export async function captureNbaPropPredictionSnapshot(input: NbaPropPredictionSnapshotInput) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, reason: "DATABASE_URL missing" };
  const statKey = normalizeNbaPropStatKey(input.statKey);
  if (!statKey) return { ok: false, reason: `unsupported stat ${input.statKey}` };
  if (!Number.isFinite(input.marketLine)) return { ok: false, reason: "invalid market line" };
  const overProbability = numberOrNull(input.sim.hitProbOver?.[String(input.marketLine)]);
  if (overProbability === null) return { ok: false, reason: "missing over probability for market line" };
  const safety = input.sim.nbaPropSafety;
  try {
    const id = await insertSnapshot({
      eventId: input.eventId,
      gameId: input.gameId,
      playerId: input.playerId,
      playerName: input.playerName,
      team: input.team,
      opponent: input.opponent,
      statKey,
      marketLine: input.marketLine,
      marketOddsOver: input.marketOddsOver,
      marketOddsUnder: input.marketOddsUnder,
      predictedMean: input.sim.meanValue,
      predictedMedian: input.sim.medianValue,
      predictedStdDev: input.sim.stdDev,
      predictedOverProbability: overProbability,
      confidence: safety?.confidence ?? input.sim.roleConfidence ?? 0,
      minutesConfidence: safety?.minutesConfidence ?? input.sim.roleConfidence ?? null,
      lineupTruthStatus: safety?.lineupTruthStatus ?? null,
      playerStatus: safety?.playerStatus ?? null,
      propCalibrationStatus: safety?.propCalibrationStatus ?? null,
      noBet: safety?.noBet ?? false,
      blockerReasons: safety?.blockerReasons ?? [],
      drivers: input.sim.drivers ?? [],
      gameStartTime: input.gameStartTime,
      metadata: input.metadata
    });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "capture failed" };
  }
}

export async function captureNbaPropProjectionPayloadSnapshot(input: NbaPropProjectionPayloadSnapshotInput) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, reason: "DATABASE_URL missing" };
  const statKey = normalizeNbaPropStatKey(input.statKey);
  if (!statKey) return { ok: false, reason: `unsupported stat ${input.statKey}` };
  const marketLine = firstMarketLine(input.projection.hitProbOver, input.marketLine);
  if (marketLine === null) return { ok: false, reason: "missing market line" };
  const predictedOverProbability = numberOrNull(input.projection.hitProbOver?.[String(marketLine)]);
  if (predictedOverProbability === null) return { ok: false, reason: "missing over probability for market line" };
  const metadata = getRecord(input.projection.metadata);
  const safety = getRecord(metadata.nbaPropSafety);
  const blockerReasons = Array.isArray(safety.blockerReasons) ? safety.blockerReasons : [];
  const drivers = Array.isArray(metadata.drivers) ? metadata.drivers : Array.isArray(input.metadata?.drivers) ? input.metadata.drivers : [];
  try {
    const id = await insertSnapshot({
      eventId: input.eventId,
      gameId: input.gameId,
      playerId: input.playerId,
      playerName: input.playerName,
      team: input.team,
      opponent: input.opponent,
      statKey,
      marketLine,
      marketOddsOver: input.marketOddsOver,
      marketOddsUnder: input.marketOddsUnder,
      predictedMean: input.projection.meanValue,
      predictedMedian: input.projection.medianValue ?? null,
      predictedStdDev: input.projection.stdDev ?? null,
      predictedOverProbability,
      confidence: numberFrom(safety.confidence) ?? numberFrom(metadata.confidence) ?? 0,
      minutesConfidence: numberFrom(safety.minutesConfidence) ?? numberFrom(metadata.minutesConfidence) ?? null,
      lineupTruthStatus: stringFrom(safety.lineupTruthStatus) ?? stringFrom(metadata.lineupTruthStatus),
      playerStatus: stringFrom(safety.playerStatus) ?? stringFrom(metadata.playerStatus),
      propCalibrationStatus: stringFrom(safety.propCalibrationStatus) ?? stringFrom(metadata.propCalibrationStatus),
      noBet: typeof safety.noBet === "boolean" ? safety.noBet : false,
      blockerReasons,
      drivers,
      gameStartTime: input.gameStartTime,
      metadata: {
        ...(input.metadata ?? {}),
        projectionMetadata: metadata
      }
    });
    return { ok: true, id };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "capture failed" };
  }
}

export async function gradeNbaPropPredictionSnapshots(input: NbaPropPredictionGradeInput) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, updated: 0, reason: "DATABASE_URL missing" };
  const statKey = normalizeNbaPropStatKey(input.statKey);
  if (!statKey) return { ok: false, updated: 0, reason: `unsupported stat ${input.statKey}` };
  if (!Number.isFinite(input.actualValue)) return { ok: false, updated: 0, reason: "invalid actual value" };
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
    return { ok: true, updated: Number(result) };
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
  resultFor,
  firstMarketLine
};
