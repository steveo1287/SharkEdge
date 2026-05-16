import { prisma } from "@/lib/db/prisma";

export type UfcOperationalFeedCard = {
  fightId: string;
  eventId: string | null;
  eventName: string | null;
  eventDate: string | null;
  eventSourceKey: string | null;
  promotionKey: string | null;
  promotionName: string | null;
  combatSport: string | null;
  eventLabel: string;
  fightDate: string;
  scheduledRounds: number;
  fighterAId: string;
  fighterBId: string;
  fighterAName: string | null;
  fighterBName: string | null;
  hasPrediction: boolean;
  sourceStatus: string | null;
  cardSection: string | null;
  boutOrder: number | null;
  pickFighterId: string | null;
  pickName: string | null;
  fighterAWinProbability: number | null;
  fighterBWinProbability: number | null;
  fairOddsAmerican: number | null;
  sportsbookOddsAmerican: number | null;
  edgePct: number | null;
  methodProbabilities: { KO_TKO: number | null; SUBMISSION: number | null; DECISION: number | null };
  rawMethodProbabilities?: { KO_TKO: number | null; SUBMISSION: number | null; DECISION: number | null };
  methodCalibration?: { sampleSize: number | null; quality: string | null; corrections: Record<string, number> | null };
  simInputAudit?: {
    score: number | null;
    grade: string | null;
    fighterA: { score: number | null; grade: string | null; missingCritical: string[]; missingUseful: string[]; coldStartActive: boolean | null };
    fighterB: { score: number | null; grade: string | null; missingCritical: string[]; missingUseful: string[]; coldStartActive: boolean | null };
    market: { hasTwoSidedMarket: boolean | null; score: number | null; missing: string[] };
    engineReadiness: { roundByRoundReady: boolean | null; exchangeReady: boolean | null; skillReady: boolean | null; score: number | null; blockers: string[] };
    blockers: string[];
    warnings: string[];
  };
  marketAware?: {
    hasRealMarket: boolean | null;
    noMarketEdge: boolean | null;
    modelWeight: number | null;
    marketWeight: number | null;
    edgePct: number | null;
    confidenceBand: { low: number | null; high: number | null; width: number | null; crossesMarket: boolean | null };
    reasonCodes: string[];
  };
  promotionGate?: { status: string; grade: string | null; reasons: string[]; confidenceCap: string | null };
  isPromotable?: boolean;
  isWatchlist?: boolean;
  isShadowOnly?: boolean;
  dataQualityGrade: string | null;
  confidenceGrade: string | null;
  simulationCount: number | null;
  generatedAt: string;
  pathSummary: string[];
  dangerFlags: string[];
  shadowStatus: string | null;
};

type FeedRow = {
  fight_id: string; event_id: string | null; event_name: string | null; event_date: Date | string | null; event_source_key: string | null; event_payload_json: any; event_label: string; fight_date: Date | string; scheduled_rounds: number; fighter_a_id: string; fighter_b_id: string; fighter_a_name: string | null; fighter_b_name: string | null; has_prediction: boolean; source_status: string | null; card_section: string | null; bout_order: number | null; pick_fighter_id: string | null; pick_name: string | null; fighter_a_win_probability: number | null; fighter_b_win_probability: number | null; fair_odds_american: number | null; sportsbook_odds_american: number | null; edge_pct: number | null; ko_tko_probability: number | null; submission_probability: number | null; decision_probability: number | null; prediction_json: any; generated_at: Date | string; data_quality_grade: string | null; confidence_grade: string | null; simulation_count: number | null; shadow_status: string | null;
};

const UFC_NAV_TEXT = new Set([
  "skip to main content", "ufc", "events", "upcoming", "past", "tickets", "vip experiences", "group sales", "ufc travel deals", "road to ufc", "athletes", "rankings", "watch", "shop", "news", "connect", "more", "espn", "fight pass", "main content"
]);

function toIso(value: Date | string) { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function toIsoNullable(value: Date | string | null) { return value == null ? null : toIso(value); }
function asArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function stringOrNull(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberOrNull(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function booleanOrNull(value: unknown) { return typeof value === "boolean" ? value : null; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function normalizedName(value: string | null | undefined) { return (value ?? "").trim().toLowerCase().replace(/\s+/g, " "); }
function hasLikelyPersonName(value: string | null | undefined) { const name = normalizedName(value); if (!name || UFC_NAV_TEXT.has(name)) return false; const parts = name.split(" ").filter(Boolean); return parts.length >= 2 && parts.every((part) => /^[a-z.'-]+$/.test(part)); }
function isLikelyFakeUfcNavigationRow(row: FeedRow) {
  if (row.event_source_key !== "ufc.com") return false;
  const a = normalizedName(row.fighter_a_name);
  const b = normalizedName(row.fighter_b_name);
  if (UFC_NAV_TEXT.has(a) || UFC_NAV_TEXT.has(b)) return true;
  if (!hasLikelyPersonName(row.fighter_a_name) || !hasLikelyPersonName(row.fighter_b_name)) return true;
  return false;
}

function gateFromPrediction(row: FeedRow) {
  const prediction = asRecord(row.prediction_json);
  const gate = asRecord(prediction.promotionGate);
  const status = stringOrNull(gate.status) ?? (row.shadow_status === "SHADOW_ONLY" ? "SHADOW_ONLY" : row.has_prediction ? "WATCHLIST" : "SHADOW_ONLY");
  return { status, grade: stringOrNull(gate.grade) ?? row.data_quality_grade, reasons: asArray(gate.reasons), confidenceCap: stringOrNull(gate.confidenceCap) ?? row.confidence_grade };
}
function methodCalibrationFromPrediction(row: FeedRow) { const calibration = asRecord(asRecord(row.prediction_json).methodCalibration); const corrections = asRecord(calibration.corrections); const correctionNumbers = Object.fromEntries(Object.entries(corrections).filter(([, value]) => typeof value === "number")) as Record<string, number>; return { sampleSize: numberOrNull(calibration.sampleSize), quality: stringOrNull(calibration.quality), corrections: Object.keys(correctionNumbers).length ? correctionNumbers : null }; }
function rawMethodProbabilitiesFromPrediction(row: FeedRow) { const raw = asRecord(asRecord(row.prediction_json).rawMethodProbabilities); return { KO_TKO: numberOrNull(raw.KO_TKO) ?? row.ko_tko_probability, SUBMISSION: numberOrNull(raw.SUBMISSION) ?? row.submission_probability, DECISION: numberOrNull(raw.DECISION) ?? row.decision_probability }; }
function marketAwareFromPrediction(row: FeedRow) { const marketAware = asRecord(asRecord(row.prediction_json).marketAware); const confidenceBand = asRecord(marketAware.confidenceBand); return { hasRealMarket: booleanOrNull(marketAware.hasRealMarket), noMarketEdge: booleanOrNull(marketAware.noMarketEdge), modelWeight: numberOrNull(marketAware.modelWeight), marketWeight: numberOrNull(marketAware.marketWeight), edgePct: numberOrNull(marketAware.edgePct), confidenceBand: { low: numberOrNull(confidenceBand.low), high: numberOrNull(confidenceBand.high), width: numberOrNull(confidenceBand.width), crossesMarket: booleanOrNull(confidenceBand.crossesMarket) }, reasonCodes: asArray(marketAware.reasonCodes) }; }
function fighterAuditFromRecord(value: unknown) { const record = asRecord(value); return { score: numberOrNull(record.score), grade: stringOrNull(record.grade), missingCritical: asArray(record.missingCritical), missingUseful: asArray(record.missingUseful), coldStartActive: booleanOrNull(record.coldStartActive) }; }
function simInputAuditFromPrediction(row: FeedRow) { const audit = asRecord(asRecord(row.prediction_json).simInputAudit); const market = asRecord(audit.market); const engineReadiness = asRecord(audit.engineReadiness); return { score: numberOrNull(audit.score), grade: stringOrNull(audit.grade), fighterA: fighterAuditFromRecord(audit.fighterA), fighterB: fighterAuditFromRecord(audit.fighterB), market: { hasTwoSidedMarket: booleanOrNull(market.hasTwoSidedMarket), score: numberOrNull(market.score), missing: asArray(market.missing) }, engineReadiness: { roundByRoundReady: booleanOrNull(engineReadiness.roundByRoundReady), exchangeReady: booleanOrNull(engineReadiness.exchangeReady), skillReady: booleanOrNull(engineReadiness.skillReady), score: numberOrNull(engineReadiness.score), blockers: asArray(engineReadiness.blockers) }, blockers: asArray(audit.blockers), warnings: asArray(audit.warnings) }; }

function mapRows(rows: FeedRow[]): UfcOperationalFeedCard[] {
  return rows.filter((row) => !isLikelyFakeUfcNavigationRow(row)).map((row) => {
    const gate = gateFromPrediction(row);
    const methodCalibration = methodCalibrationFromPrediction(row);
    const rawMethodProbabilities = rawMethodProbabilitiesFromPrediction(row);
    const simInputAudit = simInputAuditFromPrediction(row);
    const marketAware = marketAwareFromPrediction(row);
    return {
      fightId: row.fight_id,
      eventId: row.event_id,
      eventName: row.event_name,
      eventDate: toIsoNullable(row.event_date),
      eventSourceKey: row.event_source_key,
      promotionKey: stringOrNull(row.event_payload_json?.promotionKey) ?? row.event_source_key,
      promotionName: stringOrNull(row.event_payload_json?.promotionName) ?? (row.event_source_key === "mvp" ? "Most Valuable Promotions" : row.event_source_key === "ufc" ? "UFC" : null),
      combatSport: stringOrNull(row.event_payload_json?.combatSport),
      eventLabel: row.event_label,
      fightDate: toIso(row.fight_date),
      scheduledRounds: row.scheduled_rounds,
      fighterAId: row.fighter_a_id,
      fighterBId: row.fighter_b_id,
      fighterAName: row.fighter_a_name,
      fighterBName: row.fighter_b_name,
      hasPrediction: Boolean(row.has_prediction),
      sourceStatus: row.source_status,
      cardSection: row.card_section,
      boutOrder: row.bout_order,
      pickFighterId: row.pick_fighter_id,
      pickName: row.pick_name,
      fighterAWinProbability: row.fighter_a_win_probability,
      fighterBWinProbability: row.fighter_b_win_probability,
      fairOddsAmerican: row.fair_odds_american,
      sportsbookOddsAmerican: row.sportsbook_odds_american,
      edgePct: row.edge_pct,
      methodProbabilities: { KO_TKO: row.ko_tko_probability, SUBMISSION: row.submission_probability, DECISION: row.decision_probability },
      rawMethodProbabilities,
      methodCalibration,
      simInputAudit,
      marketAware,
      promotionGate: gate,
      isPromotable: gate.status === "PROMOTABLE",
      isWatchlist: gate.status === "WATCHLIST",
      isShadowOnly: gate.status === "SHADOW_ONLY",
      dataQualityGrade: gate.grade ?? row.data_quality_grade,
      confidenceGrade: gate.confidenceCap ?? row.confidence_grade,
      simulationCount: row.simulation_count,
      generatedAt: toIso(row.generated_at),
      pathSummary: asArray(row.prediction_json?.pathSummary),
      dangerFlags: asArray(row.prediction_json?.dangerFlags),
      shadowStatus: row.shadow_status
    };
  });
}

async function queryEventLinkedFeed(modelVersion: string, limit: number, includePast: boolean, promotionStatus: string | null) {
  return prisma.$queryRaw<FeedRow[]>`
    SELECT f.id AS fight_id, e.id AS event_id, e.event_name, e.event_date, e.source_key AS event_source_key, e.payload_json AS event_payload_json, f.event_label, f.fight_date, f.scheduled_rounds, f.fighter_a_id, f.fighter_b_id, fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name, (p.id IS NOT NULL) AS has_prediction, f.source_status, f.card_section, f.bout_order, p.pick_fighter_id, fp.full_name AS pick_name, p.fighter_a_win_probability, p.fighter_b_win_probability, p.fair_odds_american, p.sportsbook_odds_american, p.edge_pct, p.ko_tko_probability, p.submission_probability, p.decision_probability, p.prediction_json, COALESCE(p.generated_at, f.last_seen_at, f.updated_at, f.created_at) AS generated_at, COALESCE(p.prediction_json->'promotionGate'->>'grade', s.data_quality_grade) AS data_quality_grade, COALESCE(p.prediction_json->'promotionGate'->>'confidenceCap', s.confidence_grade) AS confidence_grade, r.simulation_count, s.status AS shadow_status
    FROM ufc_fights f
    LEFT JOIN ufc_events e ON e.id = f.event_id
    LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    LEFT JOIN LATERAL (SELECT * FROM ufc_predictions p WHERE p.fight_id = f.id AND p.model_version = ${modelVersion} ORDER BY p.generated_at DESC LIMIT 1) p ON true
    LEFT JOIN ufc_fighters fp ON fp.id = p.pick_fighter_id
    LEFT JOIN ufc_shadow_predictions s ON s.prediction_id = p.id
    LEFT JOIN ufc_sim_runs r ON r.prediction_id = p.id
    WHERE (${includePast}::boolean OR f.fight_date >= now() - interval '12 hours')
      AND (${promotionStatus}::text IS NULL OR COALESCE(p.prediction_json->'promotionGate'->>'status', s.status, 'SHADOW_ONLY') = ${promotionStatus})
    ORDER BY e.event_date NULLS LAST, f.fight_date, f.bout_order NULLS LAST, f.event_label
    LIMIT ${limit}
  `;
}

async function queryLegacyFeed(modelVersion: string, limit: number, includePast: boolean, promotionStatus: string | null) {
  return prisma.$queryRaw<FeedRow[]>`
    SELECT DISTINCT ON (p.fight_id) f.id AS fight_id, null::text AS event_id, null::text AS event_name, null::timestamptz AS event_date, null::text AS event_source_key, '{}'::jsonb AS event_payload_json, f.event_label, f.fight_date, f.scheduled_rounds, f.fighter_a_id, f.fighter_b_id, fa.full_name AS fighter_a_name, fb.full_name AS fighter_b_name, true AS has_prediction, null::text AS source_status, null::text AS card_section, null::integer AS bout_order, p.pick_fighter_id, fp.full_name AS pick_name, p.fighter_a_win_probability, p.fighter_b_win_probability, p.fair_odds_american, p.sportsbook_odds_american, p.edge_pct, p.ko_tko_probability, p.submission_probability, p.decision_probability, p.prediction_json, p.generated_at, COALESCE(p.prediction_json->'promotionGate'->>'grade', s.data_quality_grade) AS data_quality_grade, COALESCE(p.prediction_json->'promotionGate'->>'confidenceCap', s.confidence_grade) AS confidence_grade, r.simulation_count, s.status AS shadow_status
    FROM ufc_predictions p
    JOIN ufc_fights f ON f.id = p.fight_id
    LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
    LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
    LEFT JOIN ufc_fighters fp ON fp.id = p.pick_fighter_id
    LEFT JOIN ufc_shadow_predictions s ON s.prediction_id = p.id
    LEFT JOIN ufc_sim_runs r ON r.prediction_id = p.id
    WHERE p.model_version = ${modelVersion}
      AND (${includePast}::boolean OR f.fight_date >= now() - interval '12 hours')
      AND (${promotionStatus}::text IS NULL OR COALESCE(p.prediction_json->'promotionGate'->>'status', s.status, 'SHADOW_ONLY') = ${promotionStatus})
    ORDER BY p.fight_id, p.generated_at DESC
    LIMIT ${limit}
  `;
}

export async function getUfcOperationalFeed(options: { modelVersion?: string; limit?: number; includePast?: boolean; promotionStatus?: string | null } = {}): Promise<UfcOperationalFeedCard[]> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 100)));
  const includePast = Boolean(options.includePast);
  const rawStatus = typeof options.promotionStatus === "string" ? options.promotionStatus.toUpperCase() : null;
  const promotionStatus = rawStatus === "PROMOTABLE" || rawStatus === "WATCHLIST" || rawStatus === "SHADOW_ONLY" ? rawStatus : null;
  try { return mapRows(await queryEventLinkedFeed(modelVersion, limit, includePast, promotionStatus)); }
  catch { try { return mapRows(await queryLegacyFeed(modelVersion, limit, includePast, promotionStatus)); } catch { return []; } }
}
