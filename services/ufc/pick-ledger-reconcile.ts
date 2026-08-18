import { prisma } from "@/lib/db/prisma";

export type UfcPickLedgerReconcileOptions = {
  modelVersion?: string;
  horizonDays?: number;
  lockGraceMinutes?: number;
  targetCardDate?: string;
};

type CardRecordRow = {
  settled_count: number | bigint;
  win_count: number | bigint;
  loss_count: number | bigint;
  pending_count: number | bigint;
};

type LedgerCoverageRow = {
  completed_fights: number | bigint;
  counted_fights: number | bigint;
  missing_fights: number | bigint;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";
const DEFAULT_TARGET_CARD_DATE = "2026-08-15";

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value as number)));
}

function validDateOnly(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function count(value: number | bigint | null | undefined) {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

export async function reconcileUfcPickLedger(options: UfcPickLedgerReconcileOptions = {}) {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const horizonDays = clampInteger(options.horizonDays, 365, 7, 730);
  const lockGraceMinutes = clampInteger(options.lockGraceMinutes, 2, 0, 15);
  const targetCardDate = validDateOnly(options.targetCardDate, DEFAULT_TARGET_CARD_DATE);
  const startedAt = new Date().toISOString();

  const invalidatedPostStart = Number(await prisma.$executeRaw`
    UPDATE ufc_shadow_predictions s
    SET status = 'INVALID_POST_START',
        actual_winner_fighter_id = NULL,
        result_correct = NULL,
        payload_json = COALESCE(s.payload_json, '{}'::jsonb) || jsonb_build_object(
          'invalidatedAt', now(),
          'invalidReason', 'recorded_after_prefight_lock_deadline'
        ),
        updated_at = now()
    FROM ufc_fights f
    WHERE s.fight_id = f.id
      AND s.model_version = ${modelVersion}
      AND f.fight_date < now()
      AND s.recorded_at > f.fight_date + (${lockGraceMinutes}::text || ' minutes')::interval
      AND s.status IN ('PENDING', 'RESOLVED', 'SETTLED')
  ` ?? 0);

  const settledExisting = Number(await prisma.$executeRaw`
    UPDATE ufc_shadow_predictions s
    SET actual_winner_fighter_id = f.winner_fighter_id,
        result_correct = CASE
          WHEN s.pick_fighter_id IS NULL OR f.winner_fighter_id IS NULL THEN NULL
          ELSE s.pick_fighter_id = f.winner_fighter_id
        END,
        status = 'RESOLVED',
        payload_json = COALESCE(s.payload_json, '{}'::jsonb) || jsonb_build_object(
          'settledAt', now(),
          'settlementSource', 'ufc-pick-ledger-reconcile',
          'settlement', jsonb_build_object(
            'status', 'RESOLVED',
            'actualWinnerFighterId', f.winner_fighter_id,
            'resultCorrect', CASE
              WHEN s.pick_fighter_id IS NULL OR f.winner_fighter_id IS NULL THEN NULL
              ELSE s.pick_fighter_id = f.winner_fighter_id
            END
          )
        ),
        updated_at = now()
    FROM ufc_fights f
    WHERE s.fight_id = f.id
      AND s.model_version = ${modelVersion}
      AND f.winner_fighter_id IS NOT NULL
      AND s.recorded_at <= f.fight_date + (${lockGraceMinutes}::text || ' minutes')::interval
      AND s.status = 'PENDING'
  ` ?? 0);

  const backfilledFromPredictions = Number(await prisma.$executeRaw`
    WITH latest_pre_fight AS (
      SELECT DISTINCT ON (f.id)
        f.id AS fight_id,
        f.fight_date,
        f.winner_fighter_id,
        p.id AS prediction_id,
        p.model_version,
        p.generated_at,
        p.fighter_a_win_probability,
        p.fighter_b_win_probability,
        p.pick_fighter_id,
        COALESCE(p.prediction_json->'promotionGate'->>'grade', 'C') AS data_quality_grade,
        COALESCE(p.prediction_json->'promotionGate'->>'confidenceCap', 'MEDIUM') AS confidence_grade
      FROM ufc_fights f
      JOIN ufc_predictions p
        ON p.fight_id = f.id
       AND p.model_version = ${modelVersion}
      WHERE f.fight_date >= now() - (${horizonDays}::text || ' days')::interval
        AND f.fight_date < now()
        AND f.winner_fighter_id IS NOT NULL
        AND p.generated_at <= f.fight_date + (${lockGraceMinutes}::text || ' minutes')::interval
        AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
      ORDER BY f.id, p.generated_at DESC
    )
    INSERT INTO ufc_shadow_predictions (
      id,
      fight_id,
      prediction_id,
      model_version,
      recorded_at,
      fighter_a_win_probability,
      fighter_b_win_probability,
      pick_fighter_id,
      actual_winner_fighter_id,
      result_correct,
      data_quality_grade,
      confidence_grade,
      status,
      payload_json,
      updated_at
    )
    SELECT
      'ufclock_' || substr(md5(c.fight_id || ':' || c.model_version || ':prefight-backfill'), 1, 24),
      c.fight_id,
      c.prediction_id,
      c.model_version,
      c.generated_at,
      c.fighter_a_win_probability,
      c.fighter_b_win_probability,
      c.pick_fighter_id,
      c.winner_fighter_id,
      CASE
        WHEN c.pick_fighter_id IS NULL OR c.winner_fighter_id IS NULL THEN NULL
        ELSE c.pick_fighter_id = c.winner_fighter_id
      END,
      c.data_quality_grade,
      c.confidence_grade,
      'RESOLVED',
      jsonb_build_object(
        'schemaVersion', 'ufc-lock-ledger-v1',
        'status', 'RESOLVED',
        'lock', jsonb_build_object(
          'kind', 'PREFIGHT_BACKFILL',
          'source', 'ufc_predictions',
          'lockedAt', c.generated_at,
          'fightDate', c.fight_date,
          'immutableAfterStart', true
        ),
        'settlement', jsonb_build_object(
          'status', 'RESOLVED',
          'source', 'ufc-pick-ledger-reconcile',
          'actualWinnerFighterId', c.winner_fighter_id,
          'resultCorrect', CASE
            WHEN c.pick_fighter_id IS NULL OR c.winner_fighter_id IS NULL THEN NULL
            ELSE c.pick_fighter_id = c.winner_fighter_id
          END
        )
      ),
      now()
    FROM latest_pre_fight c
    WHERE NOT EXISTS (
      SELECT 1
      FROM ufc_shadow_predictions s
      JOIN ufc_fights existing_fight ON existing_fight.id = s.fight_id
      WHERE s.fight_id = c.fight_id
        AND s.model_version = c.model_version
        AND s.status IN ('PENDING', 'RESOLVED', 'SETTLED')
        AND s.recorded_at <= existing_fight.fight_date + (${lockGraceMinutes}::text || ' minutes')::interval
    )
    ON CONFLICT (id) DO NOTHING
  ` ?? 0);

  const supersededDuplicates = Number(await prisma.$executeRaw`
    WITH ranked AS (
      SELECT
        s.id,
        row_number() OVER (
          PARTITION BY s.fight_id, s.model_version
          ORDER BY
            CASE WHEN s.payload_json ? 'lock' THEN 0 ELSE 1 END,
            s.recorded_at DESC,
            s.id DESC
        ) AS row_rank
      FROM ufc_shadow_predictions s
      JOIN ufc_fights f ON f.id = s.fight_id
      WHERE s.model_version = ${modelVersion}
        AND s.status IN ('PENDING', 'RESOLVED', 'SETTLED')
        AND s.recorded_at <= f.fight_date + (${lockGraceMinutes}::text || ' minutes')::interval
    )
    UPDATE ufc_shadow_predictions s
    SET status = 'SUPERSEDED_DUPLICATE',
        actual_winner_fighter_id = NULL,
        result_correct = NULL,
        payload_json = COALESCE(s.payload_json, '{}'::jsonb) || jsonb_build_object(
          'supersededAt', now(),
          'supersededReason', 'duplicate_active_prefight_pick'
        ),
        updated_at = now()
    WHERE s.id IN (SELECT id FROM ranked WHERE row_rank > 1)
  ` ?? 0);

  const [cardRecordRows, coverageRows] = await Promise.all([
    prisma.$queryRaw<CardRecordRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE s.status IN ('RESOLVED', 'SETTLED') AND s.result_correct IS NOT NULL) AS settled_count,
        COUNT(*) FILTER (WHERE s.status IN ('RESOLVED', 'SETTLED') AND s.result_correct IS TRUE) AS win_count,
        COUNT(*) FILTER (WHERE s.status IN ('RESOLVED', 'SETTLED') AND s.result_correct IS FALSE) AS loss_count,
        COUNT(*) FILTER (WHERE s.status = 'PENDING') AS pending_count
      FROM ufc_shadow_predictions s
      JOIN ufc_fights f ON f.id = s.fight_id
      LEFT JOIN ufc_events e ON e.id = f.event_id
      WHERE s.model_version = ${modelVersion}
        AND (COALESCE(e.event_date, f.fight_date) AT TIME ZONE 'America/Chicago')::date = ${targetCardDate}::date
        AND s.status IN ('PENDING', 'RESOLVED', 'SETTLED')
    `,
    prisma.$queryRaw<LedgerCoverageRow[]>`
      WITH completed AS (
        SELECT f.id
        FROM ufc_fights f
        LEFT JOIN ufc_events e ON e.id = f.event_id
        WHERE f.winner_fighter_id IS NOT NULL
          AND (COALESCE(e.event_date, f.fight_date) AT TIME ZONE 'America/Chicago')::date = ${targetCardDate}::date
          AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
      ), counted AS (
        SELECT DISTINCT s.fight_id
        FROM ufc_shadow_predictions s
        JOIN completed c ON c.id = s.fight_id
        WHERE s.model_version = ${modelVersion}
          AND s.status IN ('RESOLVED', 'SETTLED')
          AND s.result_correct IS NOT NULL
      )
      SELECT
        (SELECT COUNT(*) FROM completed) AS completed_fights,
        (SELECT COUNT(*) FROM counted) AS counted_fights,
        (SELECT COUNT(*) FROM completed) - (SELECT COUNT(*) FROM counted) AS missing_fights
    `
  ]);

  const card = cardRecordRows[0];
  const coverage = coverageRows[0];
  const cardRecord = {
    date: targetCardDate,
    settledCount: count(card?.settled_count),
    wins: count(card?.win_count),
    losses: count(card?.loss_count),
    pending: count(card?.pending_count),
    completedFights: count(coverage?.completed_fights),
    countedFights: count(coverage?.counted_fights),
    missingFights: count(coverage?.missing_fights)
  };

  return {
    ok: cardRecord.missingFights === 0 && cardRecord.pending === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    modelVersion,
    horizonDays,
    lockGraceMinutes,
    invalidatedPostStart,
    settledExisting,
    backfilledFromPredictions,
    supersededDuplicates,
    cardRecord,
    expectedSaturdayRecord: { date: DEFAULT_TARGET_CARD_DATE, wins: 9, losses: 3 },
    recordMatchesExpectedSaturday:
      targetCardDate !== DEFAULT_TARGET_CARD_DATE ||
      (cardRecord.wins === 9 && cardRecord.losses === 3)
  };
}
