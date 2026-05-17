import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type CoverageRow = {
  fight_id: string;
  event_label: string;
  fight_date: Date | string;
  fighter_id: string;
  fighter_name: string;
  opponent_id: string;
  opponent_name: string;
  side: string;
  has_ufcstats_payload: boolean;
  ufcstats_url: string | null;
  pro_fights: number | null;
  ufc_fights: number | null;
  rounds_fought: number | null;
  slpm: number | null;
  sapm: number | null;
  takedown_defense_pct: number | null;
  feature_source: string | null;
  cold_start_active: boolean | null;
  feature_updated_at: Date | string | null;
};

type CountMap = Record<string, number>;

type FighterCoverage = {
  fightId: string;
  eventLabel: string;
  fightDate: string;
  side: string;
  fighterId: string;
  fighterName: string;
  opponentId: string;
  opponentName: string;
  grade: "A" | "B" | "C" | "D";
  score: number;
  hasUfcStatsPayload: boolean;
  ufcStatsUrl: string | null;
  featureSource: string | null;
  coldStartActive: boolean | null;
  fields: {
    proFights: number | null;
    ufcFights: number | null;
    roundsFought: number | null;
    slpm: number | null;
    sapm: number | null;
    takedownDefensePct: number | null;
  };
  missingCritical: string[];
  missingUseful: string[];
  recommendedNextSource: string;
};

export type UfcProfileCoverageReport = {
  ok: boolean;
  modelVersion: string;
  horizonDays: number;
  fightCount: number;
  fighterSides: number;
  gradeCounts: CountMap;
  sourceCounts: CountMap;
  ufcStatsPayloadCounts: CountMap;
  coldStartCounts: CountMap;
  remainingDCount: number;
  blockedFightCount: number;
  blockedFights: Array<{
    fightId: string;
    eventLabel: string;
    fightDate: string;
    fighterA: { name: string; grade: string; score: number } | null;
    fighterB: { name: string; grade: string; score: number } | null;
    blocker: string;
  }>;
  worstFighters: FighterCoverage[];
  coverage: FighterCoverage[];
};

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countBy(values: string[]) {
  return values.reduce<CountMap>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function featureScore(row: CoverageRow) {
  const missingCritical: string[] = [];
  const missingUseful: string[] = [];
  if (row.pro_fights == null) missingCritical.push("proFights");
  if (row.ufc_fights == null) missingCritical.push("ufcFights");
  if (row.rounds_fought == null) missingCritical.push("roundsFought");
  if (row.slpm == null) missingCritical.push("sigStrikesLandedPerMin");
  if (row.sapm == null) missingCritical.push("sigStrikesAbsorbedPerMin");
  if (row.takedown_defense_pct == null) missingUseful.push("takedownDefensePct");
  if (!row.has_ufcstats_payload) missingUseful.push("ufcStatsPayload");
  if (!row.feature_source) missingCritical.push("modelFeatureSource");

  let score = 100;
  score -= missingCritical.length * 18;
  score -= missingUseful.length * 7;
  if (row.cold_start_active) score -= 12;
  if (row.pro_fights != null && row.pro_fights < 4) score -= 8;
  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : "D";
  return { score, grade: grade as "A" | "B" | "C" | "D", missingCritical, missingUseful };
}

function recommendedSource(row: CoverageRow, missingCritical: string[], missingUseful: string[]) {
  if (!row.has_ufcstats_payload) return "UFCStats exact-name profile backfill first";
  if (missingCritical.includes("proFights") || missingCritical.includes("ufcFights")) return "Tapology/Sherdog/FightMatrix record enrichment";
  if (missingCritical.includes("roundsFought")) return "historical bout/round-stat warehouse backfill";
  if (missingCritical.includes("sigStrikesLandedPerMin") || missingCritical.includes("sigStrikesAbsorbedPerMin")) return "UFCStats profile parser repair";
  if (missingUseful.includes("takedownDefensePct")) return "UFCStats grappling stat repair";
  return "monitor only";
}

function mapCoverage(row: CoverageRow): FighterCoverage {
  const score = featureScore(row);
  return {
    fightId: row.fight_id,
    eventLabel: row.event_label,
    fightDate: iso(row.fight_date),
    side: row.side,
    fighterId: row.fighter_id,
    fighterName: row.fighter_name,
    opponentId: row.opponent_id,
    opponentName: row.opponent_name,
    grade: score.grade,
    score: score.score,
    hasUfcStatsPayload: row.has_ufcstats_payload,
    ufcStatsUrl: row.ufcstats_url,
    featureSource: row.feature_source,
    coldStartActive: row.cold_start_active,
    fields: {
      proFights: row.pro_fights,
      ufcFights: row.ufc_fights,
      roundsFought: row.rounds_fought,
      slpm: row.slpm,
      sapm: row.sapm,
      takedownDefensePct: row.takedown_defense_pct
    },
    missingCritical: score.missingCritical,
    missingUseful: score.missingUseful,
    recommendedNextSource: recommendedSource(row, score.missingCritical, score.missingUseful)
  };
}

async function queryCoverage(modelVersion: string, horizonDays: number, limit: number) {
  return prisma.$queryRaw<CoverageRow[]>`
    WITH fight_scope AS (
      SELECT f.id, f.event_label, f.fight_date, f.fighter_a_id, f.fighter_b_id
      FROM ufc_fights f
      WHERE f.fight_date >= now() - interval '12 hours'
        AND f.fight_date <= now() + (${horizonDays}::text || ' days')::interval
        AND f.status NOT IN ('CANCELED', 'VOID')
        AND COALESCE(f.payload_json->>'matchupQuality', '') <> 'FAKE_NAVIGATION'
      ORDER BY f.fight_date ASC, f.bout_order NULLS LAST, f.event_label ASC
      LIMIT ${Math.max(1, Math.min(500, limit))}
    ), sides AS (
      SELECT fs.id AS fight_id, fs.event_label, fs.fight_date, 'A'::text AS side,
        fs.fighter_a_id AS fighter_id, fs.fighter_b_id AS opponent_id
      FROM fight_scope fs
      UNION ALL
      SELECT fs.id AS fight_id, fs.event_label, fs.fight_date, 'B'::text AS side,
        fs.fighter_b_id AS fighter_id, fs.fighter_a_id AS opponent_id
      FROM fight_scope fs
    )
    SELECT s.fight_id, s.event_label, s.fight_date, s.fighter_id, ftr.full_name AS fighter_name,
      s.opponent_id, opp.full_name AS opponent_name, s.side,
      (ftr.payload_json ? 'stats') AS has_ufcstats_payload,
      ftr.payload_json->>'ufcStatsUrl' AS ufcstats_url,
      mf.pro_fights,
      mf.ufc_fights,
      mf.rounds_fought,
      mf.sig_strikes_landed_per_min AS slpm,
      mf.sig_strikes_absorbed_per_min AS sapm,
      mf.takedown_defense_pct,
      mf.feature_json->>'source' AS feature_source,
      mf.cold_start_active,
      mf.updated_at AS feature_updated_at
    FROM sides s
    JOIN ufc_fighters ftr ON ftr.id = s.fighter_id
    JOIN ufc_fighters opp ON opp.id = s.opponent_id
    LEFT JOIN LATERAL (
      SELECT *
      FROM ufc_model_features mf
      WHERE mf.fight_id = s.fight_id
        AND mf.fighter_id = s.fighter_id
        AND mf.model_version = ${modelVersion}
        AND mf.snapshot_at <= mf.fight_date
      ORDER BY mf.updated_at DESC, mf.snapshot_at DESC
      LIMIT 1
    ) mf ON true
    ORDER BY s.fight_date ASC, s.event_label ASC, s.side ASC;
  `;
}

export async function getUfcProfileCoverageReport(options: { modelVersion?: string; horizonDays?: number; limit?: number } = {}): Promise<UfcProfileCoverageReport> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: false,
      modelVersion: options.modelVersion ?? "ufc-fight-iq-v1",
      horizonDays: options.horizonDays ?? 180,
      fightCount: 0,
      fighterSides: 0,
      gradeCounts: {},
      sourceCounts: {},
      ufcStatsPayloadCounts: {},
      coldStartCounts: {},
      remainingDCount: 0,
      blockedFightCount: 0,
      blockedFights: [],
      worstFighters: [],
      coverage: []
    };
  }

  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const horizonDays = Math.max(1, Math.min(365, Math.floor(options.horizonDays ?? 180)));
  const limit = Math.max(1, Math.min(500, Math.floor(options.limit ?? 200)));
  const rows = await queryCoverage(modelVersion, horizonDays, limit);
  const coverage = rows.map(mapCoverage);
  const byFight = new Map<string, FighterCoverage[]>();
  for (const item of coverage) {
    const list = byFight.get(item.fightId) ?? [];
    list.push(item);
    byFight.set(item.fightId, list);
  }
  const blockedFights = [...byFight.entries()].flatMap(([fightId, items]) => {
    const weak = items.filter((item) => item.grade === "D" || item.score < 55);
    if (!weak.length) return [];
    const a = items.find((item) => item.side === "A") ?? null;
    const b = items.find((item) => item.side === "B") ?? null;
    return [{
      fightId,
      eventLabel: items[0]?.eventLabel ?? fightId,
      fightDate: items[0]?.fightDate ?? "",
      fighterA: a ? { name: a.fighterName, grade: a.grade, score: a.score } : null,
      fighterB: b ? { name: b.fighterName, grade: b.grade, score: b.score } : null,
      blocker: weak.map((item) => `${item.fighterName}:${item.grade}/${item.score}`).join(", ")
    }];
  });

  const worstFighters = coverage
    .filter((item) => item.grade === "D" || item.score < 70)
    .sort((a, b) => a.score - b.score || a.fighterName.localeCompare(b.fighterName))
    .slice(0, 75);

  return {
    ok: true,
    modelVersion,
    horizonDays,
    fightCount: byFight.size,
    fighterSides: coverage.length,
    gradeCounts: countBy(coverage.map((item) => item.grade)),
    sourceCounts: countBy(coverage.map((item) => item.featureSource ?? "NONE")),
    ufcStatsPayloadCounts: countBy(coverage.map((item) => item.hasUfcStatsPayload ? "has_ufcstats_payload" : "missing_ufcstats_payload")),
    coldStartCounts: countBy(coverage.map((item) => item.coldStartActive ? "cold_start" : "not_cold_start")),
    remainingDCount: coverage.filter((item) => item.grade === "D").length,
    blockedFightCount: blockedFights.length,
    blockedFights: blockedFights.slice(0, 50),
    worstFighters,
    coverage: coverage.slice(0, 200)
  };
}
