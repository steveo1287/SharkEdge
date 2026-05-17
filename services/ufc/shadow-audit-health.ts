import { prisma } from "@/lib/db/prisma";

type StatusRow = {
  status: string | null;
  schema_version: string | null;
  row_count: bigint | number;
  latest_recorded_at: Date | string | null;
};

type RecentShadowRow = {
  id: string;
  fight_id: string;
  prediction_id: string | null;
  status: string | null;
  schema_version: string | null;
  recorded_at: Date | string | null;
  updated_at: Date | string | null;
  data_quality_grade: string | null;
  confidence_grade: string | null;
  promotion_status: string | null;
  payload_status: string | null;
  has_style_payload: boolean | null;
  has_settlement_payload: boolean | null;
  event_label: string | null;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
};

function toIso(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseUfcShadowAuditLimit(value: string | null, fallback = 25) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.round(parsed))) : fallback;
}

export async function getUfcShadowAuditHealth(args?: { modelVersion?: string; limit?: number }) {
  const modelVersion = args?.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(100, Math.round(args?.limit ?? 25)));

  const [statusRows, recentRows] = await Promise.all([
    prisma.$queryRaw<StatusRow[]>`
      SELECT
        COALESCE(status, 'UNKNOWN') AS status,
        COALESCE(payload_json->>'schemaVersion', 'legacy-or-missing') AS schema_version,
        COUNT(*) AS row_count,
        MAX(recorded_at) AS latest_recorded_at
      FROM ufc_shadow_predictions
      WHERE model_version = ${modelVersion}
      GROUP BY COALESCE(status, 'UNKNOWN'), COALESCE(payload_json->>'schemaVersion', 'legacy-or-missing')
      ORDER BY MAX(recorded_at) DESC NULLS LAST
    `,
    prisma.$queryRaw<RecentShadowRow[]>`
      SELECT
        s.id,
        s.fight_id,
        s.prediction_id,
        s.status,
        COALESCE(s.payload_json->>'schemaVersion', 'legacy-or-missing') AS schema_version,
        s.recorded_at,
        s.updated_at,
        s.data_quality_grade,
        s.confidence_grade,
        s.payload_json->'promotionGate'->>'status' AS promotion_status,
        s.payload_json->>'status' AS payload_status,
        (
          s.payload_json ? 'style'
          OR s.payload_json ? 'styleGenome'
          OR s.payload_json->'sim' ? 'styleGenome'
        ) AS has_style_payload,
        (s.payload_json ? 'settlement') AS has_settlement_payload,
        f.event_label,
        fa.full_name AS fighter_a_name,
        fb.full_name AS fighter_b_name
      FROM ufc_shadow_predictions s
      LEFT JOIN ufc_fights f ON f.id = s.fight_id
      LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
      LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
      WHERE s.model_version = ${modelVersion}
      ORDER BY s.recorded_at DESC NULLS LAST, s.updated_at DESC NULLS LAST
      LIMIT ${limit}
    `
  ]);

  const statusSummary = statusRows.map((row) => ({
    status: row.status ?? "UNKNOWN",
    schemaVersion: row.schema_version ?? "legacy-or-missing",
    rowCount: toNumber(row.row_count),
    latestRecordedAt: toIso(row.latest_recorded_at)
  }));

  const recent = recentRows.map((row) => ({
    id: row.id,
    fightId: row.fight_id,
    predictionId: row.prediction_id,
    status: row.status,
    schemaVersion: row.schema_version,
    recordedAt: toIso(row.recorded_at),
    updatedAt: toIso(row.updated_at),
    dataQualityGrade: row.data_quality_grade,
    confidenceGrade: row.confidence_grade,
    promotionStatus: row.promotion_status,
    payloadStatus: row.payload_status,
    hasStylePayload: Boolean(row.has_style_payload),
    hasSettlementPayload: Boolean(row.has_settlement_payload),
    eventLabel: row.event_label,
    fighterAName: row.fighter_a_name,
    fighterBName: row.fighter_b_name
  }));

  const activeV2PendingCount = statusSummary
    .filter((row) => row.status === "PENDING" && row.schemaVersion === "ufc-shadow-audit-v2")
    .reduce((sum, row) => sum + row.rowCount, 0);
  const supersededCount = statusSummary
    .filter((row) => row.status === "SUPERSEDED")
    .reduce((sum, row) => sum + row.rowCount, 0);
  const resolvedCount = statusSummary
    .filter((row) => row.status === "RESOLVED")
    .reduce((sum, row) => sum + row.rowCount, 0);

  return {
    ok: true,
    modelVersion,
    checkedAt: new Date().toISOString(),
    health: {
      activeV2PendingCount,
      supersededCount,
      resolvedCount,
      latestRecordedAt: statusSummary[0]?.latestRecordedAt ?? null,
      readyForSettlement: activeV2PendingCount > 0,
      needsAuthorizedPrecompute: activeV2PendingCount === 0
    },
    statusSummary,
    recent
  };
}
