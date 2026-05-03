import { prisma } from "@/lib/db/prisma";
import { getUfcOperationalFeed, type UfcOperationalFeedCard } from "@/services/ufc/operational-feed";

export type UfcCardSummary = {
  eventId: string;
  eventLabel: string;
  eventDate: string;
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
  a_sig_strikes_absorbed_per_min: number | null;
  b_sig_strikes_absorbed_per_min: number | null;
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

function toIsoNullable(value: Date | string | null) {
  return value == null ? null : toIso(value);
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

export function buildUfcCardSummaries(fights: UfcOperationalFeedCard[]): UfcCardSummary[] {
  const groups = new Map<string, UfcOperationalFeedCard[]>();
  for (const fight of fights) {
    const eventId = cardIdForFight(fight);
    groups.set(eventId, [...(groups.get(eventId) ?? []), fight]);
  }
  return [...groups.entries()].map(([eventId, rows]) => ({
    eventId,
    eventLabel: cardLabel(eventId, rows),
    eventDate: rows.find((row) => row.eventDate)?.eventDate ?? rows[0]?.fightDate ?? `${eventId}T00:00:00.000Z`,
    fightCount: rows.length,
    simulatedFightCount: rows.filter((fight) => fight.simulationCount != null).length,
    dataQualityGrade: worstGrade(rows.map((fight) => fight.dataQualityGrade)),
    lastSimulatedAt: rows.map((fight) => fight.generatedAt).sort().at(-1) ?? null,
    shadowPendingCount: rows.filter((fight) => fight.shadowStatus === "PENDING").length,
    shadowResolvedCount: rows.filter((fight) => fight.shadowStatus === "RESOLVED").length,
    providerStatus: rows.some((fight) => fight.eventId) ? "event-linked" : rows.length ? "legacy-date" : "empty"
  })).sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
}

export async function getUfcCards(options: { modelVersion?: string; includePast?: boolean } = {}) {
  const fights = await getUfcOperationalFeed({ modelVersion: options.modelVersion, includePast: options.includePast ?? true, limit: 100 });
  return buildUfcCardSummaries(fights);
}

export async function getUfcCardDetail(eventId: string, options: { modelVersion?: string } = {}): Promise<UfcCardDetail | null> {
  const fights = await getUfcOperationalFeed({ modelVersion: options.modelVersion, includePast: true, limit: 100 });
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

function comparison(row: FightDetailRow): UfcFeatureComparisonRow[] {
  const aJson = row.a_feature_json ?? {};
  const bJson = row.b_feature_json ?? {};
  return [
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

export async function getUfcFightIqDetail(fightId: string, options: { modelVersion?: string } = {}): Promise<UfcFightIqDetail | null> {
  const [rows, feed] = await Promise.all([
    prisma.$queryRaw<FightDetailRow[]>`
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
        af.sig_strikes_absorbed_per_min AS a_sig_strikes_absorbed_per_min,
        bf.sig_strikes_absorbed_per_min AS b_sig_strikes_absorbed_per_min,
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
        af.feature_json AS a_feature_json,
        bf.feature_json AS b_feature_json
      FROM ufc_fights f
      LEFT JOIN ufc_events e ON e.id = f.event_id
      LEFT JOIN ufc_fighters fa ON fa.id = f.fighter_a_id
      LEFT JOIN ufc_fighters fb ON fb.id = f.fighter_b_id
      LEFT JOIN LATERAL (
        SELECT * FROM ufc_predictions p
        WHERE p.fight_id = f.id AND p.model_version = ${options.modelVersion ?? "ufc-fight-iq-v1"}
        ORDER BY p.generated_at DESC
        LIMIT 1
      ) p ON true
      LEFT JOIN ufc_shadow_predictions s ON s.prediction_id = p.id
      LEFT JOIN ufc_model_features af ON af.fight_id = f.id AND af.fighter_id = f.fighter_a_id AND af.model_version = ${options.modelVersion ?? "ufc-fight-iq-v1"}
      LEFT JOIN ufc_model_features bf ON bf.fight_id = f.id AND bf.fighter_id = f.fighter_b_id AND bf.model_version = ${options.modelVersion ?? "ufc-fight-iq-v1"}
      WHERE f.id = ${fightId}
      LIMIT 1
    `,
    getUfcOperationalFeed({ modelVersion: options.modelVersion, includePast: true, limit: 100 })
  ]);
  const row = rows[0];
  if (!row) return null;
  const prediction = findFeedPrediction(fightId, feed);
  const predictionJson = row.prediction_json ?? {};
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
    prediction,
    featureComparison: comparison(row),
    methodProbabilities: prediction?.methodProbabilities ?? null,
    roundFinishProbabilities: predictionJson.roundFinishProbabilities ?? {},
    pathSummary: Array.isArray(predictionJson.pathSummary) ? predictionJson.pathSummary : prediction?.pathSummary ?? [],
    dangerFlags: Array.isArray(predictionJson.dangerFlags) ? predictionJson.dangerFlags : prediction?.dangerFlags ?? [],
    activeEnsembleWeights: predictionJson.activeEnsembleWeights ?? null,
    sourceOutputs: predictionJson.sourceOutputs ?? null,
    dataQualityGrade: row.data_quality_grade,
    confidenceGrade: row.confidence_grade,
    shadowStatus: row.shadow_status
  };
}
