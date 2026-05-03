import { prisma } from "@/lib/db/prisma";

export type UfcPipelineStatus = {
  ok: boolean;
  upcomingEventCount: number;
  upcomingFightCount: number;
  simulatedFightCount: number;
  pendingSimCount: number;
  missingFeaturePairCount: number;
  featureReadyFightCount: number;
  lastCardSeenAt: string | null;
  nextEventName: string | null;
  nextEventDate: string | null;
  errors: string[];
};

type StatusRow = {
  upcoming_event_count: number | bigint;
  upcoming_fight_count: number | bigint;
  simulated_fight_count: number | bigint;
  pending_sim_count: number | bigint;
  missing_feature_pair_count: number | bigint;
  feature_ready_fight_count: number | bigint;
  last_card_seen_at: Date | string | null;
  next_event_name: string | null;
  next_event_date: Date | string | null;
};

function count(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return 0;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getUfcPipelineStatus(modelVersion = "ufc-fight-iq-v1"): Promise<UfcPipelineStatus> {
  try {
    const rows = await prisma.$queryRaw<StatusRow[]>`
      WITH upcoming_fights AS (
        SELECT
          f.id,
          f.event_id,
          f.fight_date,
          f.last_seen_at,
          e.event_name,
          e.event_date,
          COUNT(DISTINCT p.id) AS prediction_count,
          COUNT(DISTINCT af.id) AS fighter_a_feature_count,
          COUNT(DISTINCT bf.id) AS fighter_b_feature_count
        FROM ufc_fights f
        LEFT JOIN ufc_events e ON e.id = f.event_id
        LEFT JOIN ufc_predictions p ON p.fight_id = f.id AND p.model_version = ${modelVersion}
        LEFT JOIN ufc_model_features af ON af.fight_id = f.id AND af.fighter_id = f.fighter_a_id AND af.model_version = ${modelVersion} AND af.snapshot_at <= f.fight_date
        LEFT JOIN ufc_model_features bf ON bf.fight_id = f.id AND bf.fighter_id = f.fighter_b_id AND bf.model_version = ${modelVersion} AND bf.snapshot_at <= f.fight_date
        WHERE f.fight_date >= now() - interval '12 hours'
        GROUP BY f.id, f.event_id, f.fight_date, f.last_seen_at, e.event_name, e.event_date
      ), next_event AS (
        SELECT event_name, event_date
        FROM upcoming_fights
        ORDER BY fight_date ASC
        LIMIT 1
      )
      SELECT
        COUNT(DISTINCT event_id) FILTER (WHERE event_id IS NOT NULL) AS upcoming_event_count,
        COUNT(*) AS upcoming_fight_count,
        COUNT(*) FILTER (WHERE prediction_count > 0) AS simulated_fight_count,
        COUNT(*) FILTER (WHERE prediction_count = 0) AS pending_sim_count,
        COUNT(*) FILTER (WHERE fighter_a_feature_count = 0 OR fighter_b_feature_count = 0) AS missing_feature_pair_count,
        COUNT(*) FILTER (WHERE fighter_a_feature_count > 0 AND fighter_b_feature_count > 0) AS feature_ready_fight_count,
        MAX(last_seen_at) AS last_card_seen_at,
        (SELECT event_name FROM next_event) AS next_event_name,
        (SELECT event_date FROM next_event) AS next_event_date
      FROM upcoming_fights
    `;
    const row = rows[0];
    return {
      ok: true,
      upcomingEventCount: count(row?.upcoming_event_count),
      upcomingFightCount: count(row?.upcoming_fight_count),
      simulatedFightCount: count(row?.simulated_fight_count),
      pendingSimCount: count(row?.pending_sim_count),
      missingFeaturePairCount: count(row?.missing_feature_pair_count),
      featureReadyFightCount: count(row?.feature_ready_fight_count),
      lastCardSeenAt: iso(row?.last_card_seen_at),
      nextEventName: row?.next_event_name ?? null,
      nextEventDate: iso(row?.next_event_date),
      errors: []
    };
  } catch (error) {
    return {
      ok: false,
      upcomingEventCount: 0,
      upcomingFightCount: 0,
      simulatedFightCount: 0,
      pendingSimCount: 0,
      missingFeaturePairCount: 0,
      featureReadyFightCount: 0,
      lastCardSeenAt: null,
      nextEventName: null,
      nextEventDate: null,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}
