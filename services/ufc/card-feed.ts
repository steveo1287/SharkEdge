import { prisma } from "@/lib/db/prisma";
import { buildUfcFighterSkillProfile, type UfcFighterSkillProfile, type UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import { getUfcOperationalFeed, type UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

export type UfcCardSummary = {
  eventId: string;
  eventLabel: string;
  eventDate: string;
  promotionKey: string | null;
  promotionName: string | null;
  combatSport: string | null;
  fightCount: number;
  simulatedFightCount: number;
  dataQualityGrade: string | null;
  lastSimulatedAt: string | null;
  shadowPendingCount: number;
  shadowResolvedCount: number;
  providerStatus: string;
};

export type UfcCardDetail = UfcCardSummary & {
  fights: UfcOperationalFeedCard[];
};

export type UfcFeatureComparisonRow = {
  label: string;
  fighterA: string | number | null;
  fighterB: string | number | null;
};

export type UfcFightIqDetail = {
  fightId: string;
  eventId: string;
  eventLabel: string;
  fightDate: string;
  scheduledRounds: number;
  fighters: {
    fighterA: { id: string; name: string | null };
    fighterB: { id: string; name: string | null };
  };
  prediction: UfcOperationalFeedCard | null;
  featureComparison: UfcFeatureComparisonRow[];
  methodProbabilities: UfcOperationalFeedCard["methodProbabilities"] | null;
  roundFinishProbabilities: Record<string, number>;
  pathSummary: string[];
  dangerFlags: string[];
  activeEnsembleWeights: any;
  sourceOutputs: any;
  fighterProfiles?: {
    fighterA: UfcFighterSkillProfile | null;
    fighterB: UfcFighterSkillProfile | null;
  };
  featureSnapshots?: {
    fighterA: UfcModelFeatureSnapshot | null;
    fighterB: UfcModelFeatureSnapshot | null;
  };
  dataQualityGrade: string | null;
  confidenceGrade: string | null;
  shadowStatus: string | null;
};

type FightDetailRow = {
  fight_id: string;
  event_id: string | null;
  event_name: string | null;
  event_date: Date | string | null;
  event_label: string;
  fight_date: Date | string;
  scheduled_rounds: number;
  fighter_a_id: string;
  fighter_b_id: string;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  prediction_json: any;
  data_quality_grade: string | null;
  confidence_grade: string | null;
  shadow_status: string | null;
  a_sig_strikes_landed_per_min: number | null;
  b_sig_strikes_landed_per_min: number | null;
  a_pro_fights: number | null;
  b_pro_fights: number | null;
  a_ufc_fights: number | null;
  b_ufc_fights: number | null;
  a_rounds_fought: number | null;
  b_rounds_fought: number | null;
  a_sig_strikes_absorbed_per_min: number | null;
  b_sig_strikes_absorbed_per_min: number | null;
  a_striking_differential: number | null;
  b_striking_differential: number | null;
  a_takedowns_per_15: number | null;
  b_takedowns_per_15: number | null;
  a_takedown_defense_pct: number | null;
  b_takedown_defense_pct: number | null;
  a_submission_attempts_per_15: number | null;
  b_submission_attempts_per_15: number | null;
  a_control_time_pct: number | null;
  b_control_time_pct: number | null;
  a_opponent_adjusted_strength: number | null;
  b_opponent_adjusted_strength: number | null;
  a_cold_start_active: boolean | null;
  b_cold_start_active: boolean | null;
  a_snapshot_at: Date | string | null;
  b_snapshot_at: Date | string | null;
  a_model_version: string | null;
  b_model_version: string | null;
  a_feature_json: any;
  b_feature_json: any;
};

export function ufcCardIdFromDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-card";
  return date.toISOString().slice(0, 10);
}

function cardIdForFight(fight: Pick<UfcOperationalFeedCard, "eventId" | "fightDate">) {
  return fight.eventId ?? ufcCardIdFromDate(fight.fightDate);
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function gradeRank(grade: string | null | undefined) {
  if (grade === "A") return 4;
  if (grade === "B") return 3;
  if (grade === "C") return 2;
  if (grade === "D") return 1;
  return 0;
}

function worstGrade(grades: Array<string | null>) {
  const present = grades.filter((grade): grade is string => Boolean(grade));
  if (!present.length) return null;
  return present.sort((a, b) => gradeRank(a) - gradeRank(b))[0] ?? null;
}

function cardLabel(eventId: string, rows: UfcOperationalFeedCard[]) {
  const eventName = rows.find((row) => row.eventName)?.eventName;
  if (eventName) return eventName;
  const date = new Date(`${eventId}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return "UFC Card";
  return `UFC Card · ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function cardPromotion(rows: UfcOperationalFeedCard[]) {
  const first = rows.find((row) => row.promotionKey || row.promotionName || row.combatSport);
  return {
    promotionKey: first?.promotionKey ?? null,
    promotionName: first?.promotionName ?? null,
    combatSport: first?.combatSport ?? null
  };
}

export function buildUfcCardSummaries(fights: UfcOperationalFeedCard[]): UfcCardSummary[] {
  const groups = new Map<string, UfcOperationalFeedCard[]>();
  for (const fight of fights) {
    const eventId = cardIdForFight(fight);
    groups.set(eventId, [...(groups.get(eventId) ?? []), fight]);
  }
  return [...groups.entries()].map(([eventId, rows]) => {
    const promotion = cardPromotion(rows);
    return {
      eventId,
      eventLabel: cardLabel(eventId, rows),
      eventDate: rows.find((row) => row.eventDate)?.eventDate ?? rows[0]?.fightDate ?? `${eventId}T00:00:00.000Z`,
      ...promotion,
      fightCount: rows.length,
      simulatedFightCount: rows.filter((fight) => fight.hasPrediction && fight.simulationCount != null).length,
      dataQualityGrade: worstGrade(rows.map((fight) => fight.dataQualityGrade)),
      lastSimulatedAt: rows.filter((fight) => fight.hasPrediction).map((fight) => fight.generatedAt).sort().at(-1) ?? null,
      shadowPendingCount: rows.filter((fight) => fight.shadowStatus === "PENDING").length,
      shadowResolvedCount: rows.filter((fight) => fight.shadowStatus === "RESOLVED").length,
      providerStatus: rows.some((fight) => fight.eventId) ? `${promotion.promotionKey ?? "event"}-linked` : rows.length ? "legacy-date" : "empty"
    };
  }).sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
}

export async function getUfcCards(options: { modelVersion?: string; includePast?: boolean } = {}) {
  const fights = await getUfcOperationalFeed({ modelVersion: options.modelVersion, includePast: options.includePast ?? true, limit: 200 });
  return buildUfcCardSummaries(fights);
}

export async function getUfcCardDetail(eventId: string, options: { modelVersion?: string } = {}): Promise<UfcCardDetail | null> {
  const fights = await getUfcOperationalFeed({ modelVersion: options.modelVersion, includePast: true, limit: 200 });
  const cardFights = fights.filter((fight) => cardIdForFight(fight) === eventId);
  if (!cardFights.length) return null;
  const summary = buildUfcCardSummaries(cardFights)[0];
  return summary ? { ...summary, fights: cardFights } : null;
}

function fmtPercent(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : null;
}

function featureNumber(json: any, ...keys: string[]) {
  for (const key of keys) {
    const value = json?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function featureText(json: any, ...keys: string[]) {
  for (const key of keys) {
    const value = json?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function compactFeatureSnapshot(row: FightDetailRow, side: "a" | "b"): UfcModelFeatureSnapshot | null {
  const snapshotAt = side === "a" ? row.a_snapshot_at : row.b_snapshot_at;
  const modelVersion = side === "a" ? row.a_model_version : row.b_model_version;
  if (!snapshotAt || !modelVersion) return null;
  const json = side === "a" ? row.a_feature_json ?? {} : row.b_feature_json ?? {};
  return {
    fightId: row.fight_id,
    fightDate: toIso(row.fight_date),
    fighterId: side === "a" ? row.fighter_a_id : row.fighter_b_id,
    opponentFighterId: side === "a" ? row.fighter_b_id : row.fighter_a_id,
    snapshotAt: toIso(snapshotAt),
    modelVersion,
    age: featureNumber(json, "age"),
    reachInches: featureNumber(json, "reachInches", "reach_inches"),
    heightInches: featureNumber(json, "heightInches", "height_inches"),
    stance: featureText(json, "stance"),
    weightClass: featureText(json, "weightClass", "weight_class"),
    daysSinceLastFight: featureNumber(json, "daysSinceLastFight", "days_since_last_fight"),
    proFights: side === "a" ? row.a_pro_fights : row.b_pro_fights,
    ufcFights: side === "a" ? row.a_ufc_fights : row.b_ufc_fights,
    roundsFought: side === "a" ? row.a_rounds_fought : row.b_rounds_fought,
    sigStrikesLandedPerMin: side === "a" ? row.a_sig_strikes_landed_per_min : row.b_sig_strikes_landed_per_min,
    sigStrikesAbsorbedPerMin: side === "a" ? row.a_sig_strikes_absorbed_per_min : row.b_sig_strikes_absorbed_per_min,
    strikingDifferential: side === "a" ? row.a_striking_differential : row.b_striking_differential,
    sigStrikeAccuracyPct: featureNumber(json, "sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"),
    sigStrikeDefensePct: featureNumber(json, "sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"),
    knockdownsPer15: featureNumber(json, "knockdownsPer15", "knockdowns_per_15"),
    takedownsPer15: side === "a" ? row.a_takedowns_per_15 : row.b_takedowns_per_15,
    takedownAccuracyPct: featureNumber(json, "takedownAccuracyPct", "takedown_accuracy_pct"),
    takedownDefensePct: side === "a" ? row.a_takedown_defense_pct : row.b_takedown_defense_pct,
    submissionAttemptsPer15: side === "a" ? row.a_submission_attempts_per_15 : row.b_submission_attempts_per_15,
    controlTimePct: side === "a" ? row.a_control_time_pct : row.b_control_time_pct,
    recentFormScore: featureNumber(json, "recentFormScore", "recent_form_score"),
    finishRate: featureNumber(json, "finishRate", "finish_rate"),
    lateRoundPerformance: featureNumber(json, "lateRoundPerformance", "late_round_performance"),
    opponentAdjustedStrength: side === "a" ? row.a_opponent_adjusted_strength : row.b_opponent_adjusted_strength,
    coldStartActive: side === "a" ? row.a_cold_start_active : row.b_cold_start_active,
    feature: json
  };
}

function buildProfile(snapshot: UfcModelFeatureSnapshot | null) {
  if (!snapshot) return null;
  try {
    return buildUfcFighterSkillProfile({ feature: snapshot });
  } catch {
    return null;
  }
}

function comparison(row: FightDetailRow): UfcFeatureComparisonRow[] {
  const aJson = row.a_feature_json ?? {};
  const bJson = row.b_feature_json ?? {};
  return [
    { label: "Profile Source", fighterA: featureText(aJson, "autoBuiltFrom", "source", "rawSource"), fighterB: featureText(bJson, "autoBuiltFrom", "source", "rawSource") },
    { label: "FightMatrix Rank", fighterA: featureNumber(aJson, "fightMatrixRank"), fighterB: featureNumber(bJson, "fightMatrixRank") },
    { label: "Amateur Signal", fighterA: featureNumber(aJson, "amateurSignal"), fighterB: featureNumber(bJson, "amateurSignal") },
    { label: "Promotion Tier", fighterA: featureNumber(aJson, "promotionTierSignal"), fighterB: featureNumber(bJson, "promotionTierSignal") },
    { label: "Recent Form", fighterA: featureNumber(aJson, "recentFormScore", "recent_form_score"), fighterB: featureNumber(bJson, "recentFormScore", "recent_form_score") },
    { label: "Finish Rate", fighterA: fmtPercent(featureNumber(aJson, "finishRate", "finish_rate") != null ? Number(featureNumber(aJson, "finishRate", "finish_rate")) * 100 : null), fighterB: fmtPercent(featureNumber(bJson, "finishRate", "finish_rate") != null ? Number(featureNumber(bJson, "finishRate", "finish_rate")) * 100 : null) },
    { label: "Reach", fighterA: featureNumber(aJson, "reachInches", "reach_inches"), fighterB: featureNumber(bJson, "reachInches", "reach_inches") },
    { label: "Age", fighterA: featureNumber(aJson, "age"), fighterB: featureNumber(bJson, "age") },
    { label: "Stance", fighterA: featureText(aJson, "stance"), fighterB: featureText(bJson, "stance") },
    { label: "SLpM", fighterA: row.a_sig_strikes_landed_per_min, fighterB: row.b_sig_strikes_landed_per_min },
    { label: "SApM", fighterA: row.a_sig_strikes_absorbed_per_min, fighterB: row.b_sig_strikes_absorbed_per_min },
    { label: "Strike Accuracy", fighterA: fmtPercent(featureNumber(aJson, "sigStrikeAccuracyPct", "strikeAccuracyPct")), fighterB: fmtPercent(featureNumber(bJson, "sigStrikeAccuracyPct", "strikeAccuracyPct")) },
    { label: "Strike Defense", fighterA: fmtPercent(featureNumber(aJson, "sigStrikeDefensePct", "strikeDefensePct")), fighterB: fmtPercent(featureNumber(bJson, "sigStrikeDefensePct", "strikeDefensePct")) },
    { label: "TD Avg", fighterA: row.a_takedowns_per_15, fighterB: row.b_takedowns_per_15 },
    { label: "TD Accuracy", fighterA: fmtPercent(featureNumber(aJson, "takedownAccuracyPct")), fighterB: fmtPercent(featureNumber(bJson, "takedownAccuracyPct")) },
    { label: "TD Defense", fighterA: fmtPercent(row.a_takedown_defense_pct), fighterB: fmtPercent(row.b_takedown_defense_pct) },
    { label: "Sub Avg", fighterA: row.a_submission_attempts_per_15, fighterB: row.b_submission_attempts_per_15 },
    { label: "Control", fighterA: fmtPercent(row.a_control_time_pct), fighterB: fmtPercent(row.b_control_time_pct) },
    { label: "Opponent Strength", fighterA: row.a_opponent_adjusted_strength, fighterB: row.b_opponent_adjusted_strength }
  ];
}

function findFeedPrediction(fightId: string, fights: UfcOperationalFeedCard[]) {
  return fights.find((fight) => fight.fightId === fightId) ?? null;
}

function detailFromFeedOnly(fightId: string, feed: UfcOperationalFeedCard[]): UfcFightIqDetail | null {
  const prediction = findFeedPrediction(fightId, feed);
  if (!prediction) return null;
  const predictionJson = (prediction as any).predictionJson ?? {};
  return {
    fightId,
    eventId: prediction.eventId ?? ufcCardIdFromDate(prediction.fightDate),
    eventLabel: prediction.eventName ?? cardLabel(ufcCardIdFromDate(prediction.fightDate), []),
    fightDate: prediction.fightDate,
    scheduledRounds: prediction.scheduledRounds,
    fighters: {
      fighterA: { id: prediction.fighterAId, name: prediction.fighterAName },
      fighterB: { id: prediction.fighterBId, name: prediction.fighterBName }
    },
    prediction,
    featureComparison: [],
    methodProbabilities: prediction.methodProbabilities,
    roundFinishProbabilities: predictionJson.roundFinishProbabilities ?? {},
    pathSummary: prediction.pathSummary,
    dangerFlags: prediction.dangerFlags,
    activeEnsembleWeights: predictionJson.activeEnsembleWeights ?? null,
    sourceOutputs: predictionJson.sourceOutputs ?? null,
    fighterProfiles: {
      fighterA: predictionJson.fighterSkillProfiles?.fighterA ?? null,
      fighterB: predictionJson.fighterSkillProfiles?.fighterB ?? null
    },
    featureSnapshots: {
      fighterA: predictionJson.featureSnapshots?.fighterA ?? null,
      fighterB: predictionJson.featureSnapshots?.fighterB ?? null
    },
    dataQualityGrade: prediction.dataQualityGrade,
    confidenceGrade: prediction.confidenceGrade,
    shadowStatus: prediction.shadowStatus
  };
}

export async function getUfcFightIqDetail(fightId: string, options: { modelVersion?: string } = {}): Promise<UfcFightIqDetail | null> {
  const modelVersion = options.modelVersion ?? "ufc-fight-iq-v1";
  const feed = await getUfcOperationalFeed({ modelVersion: options.modelVersion, includePast: true, limit: 200 });
  try {
    const rows = await prisma.$queryRaw<FightDetailRow[]>`
      SELECT f.id AS fight_id, e.id AS event_id, e.event_name, e.event_date, f.event_label, f.fight_date, f.scheduled_rounds,
        f.fighter_a_id, f.fighter_b_id,
        fa.full_name AS fighter_a_name,
        fb.full_name AS fighter_b_name,
        p.prediction_json,
        s.data_quality_grade,
        s.confidence_grade,
        s.status AS shadow_status,
        af.sig_strikes_landed_per_min AS a_sig_strikes_landed_per_min,
        bf.sig_strikes_landed_per_min AS b_sig_strikes_landed_per_min,
        af.pro_fights AS a_pro_fights,
        bf.pro_fights AS b_pro_fights,
        af.ufc_fights AS a_ufc_fights,
        bf.ufc_fights AS b_ufc_fights,
        af.rounds_fought AS a_rounds_fought,
        bf.rounds_fought AS b_rounds_fought,
        af.sig_strikes_absorbed_per_min AS a_sig_strikes_absorbed_per_min,
        bf.sig_strikes_absorbed_per_min AS b_sig_strikes_absorbed_per_min,
        af.striking_differential AS a_striking_differential,
        bf.striking_differential AS b_striking_differential,
        af.takedowns_per_15 AS a_takedowns_per_15,
        bf.takedowns_per_15 AS b_takedowns_per_15,
        af.takedown_defense_pct AS a_takedown_defense_pct,
        bf.takedown_defense_pct AS b_takedown_defense_pct,
        af.submission_attempts_per_15 AS a_submission_attempts_per_15,
        bf.submission_attempts_per_15 AS b_submission_attempts_per_15,
        af.control_time_pct AS a_control_time_pct,
        bf.control_time_pct AS b_control_time_pct,
        af.opponent_adjusted_strength AS a_opponent_adjusted_strength,
        bf.opponent_adjusted_strength AS b_opponent_adjusted_strength,
        af.cold_start_active AS a_cold_start_active,
        bf.cold_start_active AS b_cold_start_active,
        af.snapshot_at AS a_snapshot_at,
        bf.snapshot_at AS b_snapshot_at,
        af.model_version AS a_model_version,
        bf.model_version AS b_model_version,
        af.feature_json AS a_feature_json,
        bf.feature_json AS b_feature_json
      FROM ufc_fights f
      LEFT JOIN ufc_events e ON e.id = f.event_id
      LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
      LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
      LEFT JOIN LATERAL (
        SELECT * FROM ufc_predictions p
        WHERE p.fight_id = f.id AND p.model_version = ${modelVersion}
        ORDER BY p.generated_at DESC
        LIMIT 1
      ) p ON true
      LEFT JOIN ufc_shadow_predictions s ON s.prediction_id = p.id
      LEFT JOIN LATERAL (
        SELECT * FROM ufc_model_features af
        WHERE af.fight_id = f.id AND af.fighter_id = f.fighter_a_id AND af.model_version = ${modelVersion} AND af.snapshot_at <= f.fight_date
        ORDER BY af.snapshot_at DESC
        LIMIT 1
      ) af ON true
      LEFT JOIN LATERAL (
        SELECT * FROM ufc_model_features bf
        WHERE bf.fight_id = f.id AND bf.fighter_id = f.fighter_b_id AND bf.model_version = ${modelVersion} AND bf.snapshot_at <= f.fight_date
        ORDER BY bf.snapshot_at DESC
        LIMIT 1
      ) bf ON true
      WHERE f.id = ${fightId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return detailFromFeedOnly(fightId, feed);
    const prediction = findFeedPrediction(fightId, feed);
    const predictionJson = row.prediction_json ?? {};
    const aSnapshot = compactFeatureSnapshot(row, "a") ?? predictionJson.featureSnapshots?.fighterA ?? null;
    const bSnapshot = compactFeatureSnapshot(row, "b") ?? predictionJson.featureSnapshots?.fighterB ?? null;
    const aProfile = predictionJson.fighterSkillProfiles?.fighterA ?? buildProfile(aSnapshot);
    const bProfile = predictionJson.fighterSkillProfiles?.fighterB ?? buildProfile(bSnapshot);
    return {
      fightId,
      eventId: row.event_id ?? ufcCardIdFromDate(row.fight_date),
      eventLabel: row.event_name ?? cardLabel(ufcCardIdFromDate(row.fight_date), []),
      fightDate: toIso(row.fight_date),
      scheduledRounds: row.scheduled_rounds,
      fighters: {
        fighterA: { id: row.fighter_a_id, name: row.fighter_a_name },
        fighterB: { id: row.fighter_b_id, name: row.fighter_b_name }
      },
      prediction: prediction ?? detailFromFeedOnly(fightId, feed)?.prediction ?? null,
      featureComparison: comparison(row).filter((item) => item.fighterA != null || item.fighterB != null),
      methodProbabilities: prediction?.methodProbabilities ?? null,
      roundFinishProbabilities: predictionJson.roundFinishProbabilities ?? {},
      pathSummary: Array.isArray(predictionJson.pathSummary) ? predictionJson.pathSummary : prediction?.pathSummary ?? [],
      dangerFlags: Array.isArray(predictionJson.dangerFlags) ? predictionJson.dangerFlags : prediction?.dangerFlags ?? [],
      activeEnsembleWeights: predictionJson.activeEnsembleWeights ?? null,
      sourceOutputs: predictionJson.sourceOutputs ?? null,
      fighterProfiles: {
        fighterA: aProfile,
        fighterB: bProfile
      },
      featureSnapshots: {
        fighterA: aSnapshot,
        fighterB: bSnapshot
      },
      dataQualityGrade: row.data_quality_grade,
      confidenceGrade: row.confidence_grade,
      shadowStatus: row.shadow_status
    };
  } catch {
    return detailFromFeedOnly(fightId, feed);
  }
}
