import { prisma } from "@/lib/db/prisma";
import { runUfcOperationalSkillSim } from "@/services/ufc/operational-sim";

export type UfcPickLockOptions = {
  modelVersion?: string;
  windowMinutes?: number;
  limit?: number;
  simulations?: number;
  seed?: number;
};

type LockCandidate = {
  fight_id: string;
  event_label: string;
  fight_date: Date | string;
  fighter_a_id: string;
  fighter_b_id: string;
};

const DEFAULT_MODEL_VERSION = "ufc-fight-iq-v1";

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value as number)));
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function lockUpcomingUfcPicks(options: UfcPickLockOptions = {}) {
  const modelVersion = options.modelVersion ?? DEFAULT_MODEL_VERSION;
  const windowMinutes = clampInteger(options.windowMinutes, 15, 3, 60);
  const limit = clampInteger(options.limit, 40, 1, 100);
  const simulations = clampInteger(options.simulations, 10_000, 1_000, 50_000);
  const seed = clampInteger(options.seed, 1287, 1, 2_147_483_647);
  const startedAt = new Date().toISOString();

  const candidates = await prisma.$queryRaw<LockCandidate[]>`
    SELECT
      f.id AS fight_id,
      f.event_label,
      f.fight_date,
      f.fighter_a_id,
      f.fighter_b_id
    FROM ufc_fights f
    WHERE f.fight_date >= now()
      AND f.fight_date <= now() + (${windowMinutes}::text || ' minutes')::interval
      AND COALESCE(f.status, 'SCHEDULED') NOT IN ('COMPLETED', 'CANCELLED', 'POSTPONED')
      AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
    ORDER BY f.fight_date ASC, f.bout_order NULLS LAST, f.event_label
    LIMIT ${limit}
  `;

  const locked: Array<{
    fightId: string;
    shadowPredictionId: string;
    predictionId: string;
    pickFighterId: string;
    fightDate: string;
  }> = [];
  const skipped: Array<{ fightId: string; reason: string }> = [];

  for (const candidate of candidates) {
    try {
      const result = await runUfcOperationalSkillSim(candidate.fight_id, {
        modelVersion,
        simulations,
        seed,
        recordShadow: true
      });

      if (!result.shadowPredictionId) {
        skipped.push({ fightId: candidate.fight_id, reason: "simulation did not create a shadow prediction" });
        continue;
      }

      const lockedAt = new Date().toISOString();
      const fightDate = toIso(candidate.fight_date);
      const lockPayload = {
        kind: "PREFIGHT",
        source: "ufc-pick-lock",
        lockedAt,
        fightDate,
        windowMinutes,
        simulations,
        seed,
        immutableAfterStart: true
      };

      await prisma.$executeRaw`
        UPDATE ufc_shadow_predictions
        SET payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object('lock', ${JSON.stringify(lockPayload)}::jsonb),
            updated_at = now()
        WHERE id = ${result.shadowPredictionId}
      `;

      await prisma.$executeRaw`
        UPDATE ufc_fights
        SET payload_json = COALESCE(payload_json, '{}'::jsonb) || jsonb_build_object('pickLock', ${JSON.stringify({
          shadowPredictionId: result.shadowPredictionId,
          predictionId: result.predictionId,
          pickFighterId: result.pickFighterId,
          lockedAt,
          fightDate,
          modelVersion
        })}::jsonb),
            updated_at = now()
        WHERE id = ${candidate.fight_id}
      `;

      locked.push({
        fightId: candidate.fight_id,
        shadowPredictionId: result.shadowPredictionId,
        predictionId: result.predictionId,
        pickFighterId: result.pickFighterId,
        fightDate
      });
    } catch (error) {
      skipped.push({
        fightId: candidate.fight_id,
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    ok: skipped.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    modelVersion,
    windowMinutes,
    simulations,
    candidateCount: candidates.length,
    lockedCount: locked.length,
    skippedCount: skipped.length,
    locked,
    skipped
  };
}
