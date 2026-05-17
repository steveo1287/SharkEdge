import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { classifyCombatSportsEnrichmentLane } from "@/services/ufc/enrichment-lane-classifier";

type LaneCandidateRow = {
  fighter_id: string;
  fighter_name: string;
  opponent_name: string | null;
  event_label: string | null;
  event_name: string | null;
  source_key: string | null;
  payload_json: unknown;
};

export type PersistEnrichmentLanesResult = {
  ok: boolean;
  mode: "dry-run" | "write";
  horizonDays: number;
  candidates: number;
  updated: number;
  laneCounts: Record<string, number>;
  sample: Array<{
    fighterId: string;
    fighterName: string;
    opponentName: string | null;
    eventLabel: string | null;
    lane: string;
    confidence: number;
    reason: string;
    recommendedSource: string;
  }>;
  errors: string[];
};

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function laneCandidates(horizonDays: number, limit: number) {
  return prisma.$queryRaw<LaneCandidateRow[]>`
    WITH scoped AS (
      SELECT DISTINCT ON (ftr.id)
        ftr.id AS fighter_id,
        ftr.full_name AS fighter_name,
        CASE WHEN f.fighter_a_id = ftr.id THEN opp_b.full_name ELSE opp_a.full_name END AS opponent_name,
        f.event_label,
        e.event_name,
        e.source_key,
        ftr.payload_json,
        f.fight_date
      FROM ufc_fighters ftr
      JOIN ufc_fights f ON f.fighter_a_id = ftr.id OR f.fighter_b_id = ftr.id
      LEFT JOIN ufc_fighters opp_a ON opp_a.id = f.fighter_a_id
      LEFT JOIN ufc_fighters opp_b ON opp_b.id = f.fighter_b_id
      LEFT JOIN ufc_events e ON e.id = f.event_id
      WHERE f.fight_date >= now() - interval '30 days'
        AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
        AND f.status NOT IN ('CANCELED', 'VOID')
        AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
      ORDER BY ftr.id, f.fight_date ASC
    )
    SELECT fighter_id, fighter_name, opponent_name, event_label, event_name, source_key, payload_json
    FROM scoped
    ORDER BY fight_date ASC, fighter_name ASC
    LIMIT ${Math.max(1, Math.min(1000, limit))};
  `;
}

async function writeLane(row: LaneCandidateRow, lane: ReturnType<typeof classifyCombatSportsEnrichmentLane>) {
  const payload = {
    enrichmentLane: lane.lane,
    enrichmentLaneConfidence: lane.confidence,
    enrichmentLaneReason: lane.reason,
    enrichmentLaneRecommendedSource: lane.recommendedSource,
    enrichmentLaneClassifiedAt: new Date().toISOString()
  };
  await prisma.$executeRaw`
    UPDATE ufc_fighters
    SET payload_json = COALESCE(payload_json, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
    WHERE id = ${row.fighter_id};
  `;
}

export async function persistUfcEnrichmentLanes(options: { dryRun?: boolean; horizonDays?: number; limit?: number } = {}): Promise<PersistEnrichmentLanesResult> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, mode: options.dryRun ? "dry-run" : "write", horizonDays: options.horizonDays ?? 180, candidates: 0, updated: 0, laneCounts: {}, sample: [], errors: ["No usable server database URL is configured."] };
  }
  const dryRun = Boolean(options.dryRun);
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const limit = Math.max(1, Math.min(1000, Math.floor(options.limit ?? 500)));
  const rows = await laneCandidates(horizonDays, limit);
  const laneCounts: Record<string, number> = {};
  const sample: PersistEnrichmentLanesResult["sample"] = [];
  const errors: string[] = [];
  let updated = 0;

  for (const row of rows) {
    const lane = classifyCombatSportsEnrichmentLane({
      fighterName: row.fighter_name,
      opponentName: row.opponent_name,
      eventLabel: row.event_label,
      eventName: row.event_name,
      sourceKey: row.source_key,
      existingPayload: row.payload_json
    });
    increment(laneCounts, lane.lane);
    sample.push({ fighterId: row.fighter_id, fighterName: row.fighter_name, opponentName: row.opponent_name, eventLabel: row.event_label, lane: lane.lane, confidence: lane.confidence, reason: lane.reason, recommendedSource: lane.recommendedSource });
    if (!dryRun) {
      try {
        await writeLane(row, lane);
        updated += 1;
      } catch (error) {
        errors.push(`${row.fighter_name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { ok: errors.length === 0, mode: dryRun ? "dry-run" : "write", horizonDays, candidates: rows.length, updated, laneCounts, sample: sample.slice(0, 100), errors: errors.slice(0, 50) };
}
