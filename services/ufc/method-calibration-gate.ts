import { prisma } from "@/lib/db/prisma";

export type UfcMethodProbabilities = { KO_TKO: number; SUBMISSION: number; DECISION: number };

export type UfcMethodCalibration = {
  modelVersion: string;
  sampleSize: number;
  quality: "A" | "B" | "C" | "D";
  actualRates: UfcMethodProbabilities;
  predictedAverages: UfcMethodProbabilities;
  corrections: UfcMethodProbabilities;
  maxCorrection: number;
  generatedAt: string;
};

export type UfcPromotionGate = {
  status: "PROMOTABLE" | "WATCHLIST" | "SHADOW_ONLY";
  grade: "A" | "B" | "C" | "D";
  reasons: string[];
  confidenceCap: "HIGH" | "MEDIUM_HIGH" | "MEDIUM" | "LOW";
};

type CalibrationRow = {
  actual_method: string | null;
  ko_tko_probability: number | null;
  submission_probability: number | null;
  decision_probability: number | null;
};

const ZERO_METHODS: UfcMethodProbabilities = { KO_TKO: 0, SUBMISSION: 0, DECISION: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function methodKey(value: string | null | undefined): keyof UfcMethodProbabilities | null {
  const method = String(value ?? "").toUpperCase();
  if (method.includes("KO") || method.includes("TKO")) return "KO_TKO";
  if (method.includes("SUB")) return "SUBMISSION";
  if (method.includes("DEC")) return "DECISION";
  return null;
}

function normalize(methods: UfcMethodProbabilities): UfcMethodProbabilities {
  const ko = Math.max(0.001, methods.KO_TKO);
  const sub = Math.max(0.001, methods.SUBMISSION);
  const dec = Math.max(0.001, methods.DECISION);
  const total = ko + sub + dec;
  return { KO_TKO: round(ko / total), SUBMISSION: round(sub / total), DECISION: round(dec / total) };
}

function qualityForSample(sampleSize: number): UfcMethodCalibration["quality"] {
  if (sampleSize >= 75) return "A";
  if (sampleSize >= 35) return "B";
  if (sampleSize >= 12) return "C";
  return "D";
}

function confidenceRank(grade: string) {
  if (grade === "HIGH") return 4;
  if (grade === "MEDIUM_HIGH") return 3;
  if (grade === "MEDIUM") return 2;
  return 1;
}

function weakerConfidence(left: UfcPromotionGate["confidenceCap"], right: UfcPromotionGate["confidenceCap"]) {
  return confidenceRank(left) <= confidenceRank(right) ? left : right;
}

function gradeRank(grade: string) {
  if (grade === "A") return 4;
  if (grade === "B") return 3;
  if (grade === "C") return 2;
  return 1;
}

async function loadCalibrationRows(modelVersion: string, limit: number) {
  return prisma.$queryRaw<CalibrationRow[]>`
    SELECT
      COALESCE(f.payload_json->>'methodKind', f.payload_json->>'method', f.payload_json->>'resultMethod') AS actual_method,
      p.ko_tko_probability,
      p.submission_probability,
      p.decision_probability
    FROM ufc_shadow_predictions s
    JOIN ufc_fights f ON f.id = s.fight_id
    LEFT JOIN ufc_predictions p ON p.id = s.prediction_id
    WHERE s.model_version = ${modelVersion}
      AND COALESCE(s.status, '') = 'RESOLVED'
      AND f.winner_fighter_id IS NOT NULL
      AND COALESCE(f.payload_json->>'methodKind', f.payload_json->>'method', f.payload_json->>'resultMethod') IS NOT NULL
      AND p.ko_tko_probability IS NOT NULL
      AND p.submission_probability IS NOT NULL
      AND p.decision_probability IS NOT NULL
    ORDER BY s.recorded_at DESC
    LIMIT ${limit}
  `;
}

export async function getUfcMethodCalibration(modelVersion: string, options: { limit?: number } = {}): Promise<UfcMethodCalibration> {
  const limit = Math.max(10, Math.min(500, Math.floor(options.limit ?? 150)));
  const rows = await loadCalibrationRows(modelVersion, limit);
  const actual = { ...ZERO_METHODS };
  const predicted = { ...ZERO_METHODS };
  let used = 0;

  for (const row of rows) {
    const actualKey = methodKey(row.actual_method);
    if (!actualKey) continue;
    const ko = typeof row.ko_tko_probability === "number" ? row.ko_tko_probability : null;
    const sub = typeof row.submission_probability === "number" ? row.submission_probability : null;
    const dec = typeof row.decision_probability === "number" ? row.decision_probability : null;
    if (ko == null || sub == null || dec == null) continue;
    actual[actualKey] += 1;
    predicted.KO_TKO += ko;
    predicted.SUBMISSION += sub;
    predicted.DECISION += dec;
    used += 1;
  }

  const sampleSize = used;
  const quality = qualityForSample(sampleSize);
  const actualRates = sampleSize > 0
    ? { KO_TKO: round(actual.KO_TKO / sampleSize), SUBMISSION: round(actual.SUBMISSION / sampleSize), DECISION: round(actual.DECISION / sampleSize) }
    : { KO_TKO: 0.33, SUBMISSION: 0.22, DECISION: 0.45 };
  const predictedAverages = sampleSize > 0
    ? normalize({ KO_TKO: predicted.KO_TKO / sampleSize, SUBMISSION: predicted.SUBMISSION / sampleSize, DECISION: predicted.DECISION / sampleSize })
    : { KO_TKO: 0.33, SUBMISSION: 0.22, DECISION: 0.45 };
  const strength = quality === "A" ? 0.45 : quality === "B" ? 0.35 : quality === "C" ? 0.22 : 0;
  const maxCorrection = quality === "A" ? 0.09 : quality === "B" ? 0.07 : quality === "C" ? 0.045 : 0;
  const corrections = {
    KO_TKO: round(clamp((actualRates.KO_TKO - predictedAverages.KO_TKO) * strength, -maxCorrection, maxCorrection)),
    SUBMISSION: round(clamp((actualRates.SUBMISSION - predictedAverages.SUBMISSION) * strength, -maxCorrection, maxCorrection)),
    DECISION: round(clamp((actualRates.DECISION - predictedAverages.DECISION) * strength, -maxCorrection, maxCorrection))
  };

  return { modelVersion, sampleSize, quality, actualRates, predictedAverages, corrections, maxCorrection, generatedAt: new Date().toISOString() };
}

export function applyUfcMethodCalibration(methods: UfcMethodProbabilities, calibration: UfcMethodCalibration): UfcMethodProbabilities {
  if (calibration.quality === "D") return normalize(methods);
  return normalize({
    KO_TKO: methods.KO_TKO + calibration.corrections.KO_TKO,
    SUBMISSION: methods.SUBMISSION + calibration.corrections.SUBMISSION,
    DECISION: methods.DECISION + calibration.corrections.DECISION
  });
}

export function buildUfcPromotionGate(input: {
  dataQualityGrade: string;
  confidenceGrade: string;
  edgePct: number | null;
  pickProbability: number;
  profileFeatureScore?: number | null;
  methodCalibration: UfcMethodCalibration;
  hasLearningSignal: boolean;
  hasPriorSignal: boolean;
}): UfcPromotionGate {
  const reasons: string[] = [];
  let grade: UfcPromotionGate["grade"] = "A";
  let confidenceCap: UfcPromotionGate["confidenceCap"] = "HIGH";

  if (gradeRank(input.dataQualityGrade) <= 1) {
    grade = "D";
    confidenceCap = weakerConfidence(confidenceCap, "LOW");
    reasons.push("Data quality D: cold-start or fallback-heavy fighter profile.");
  } else if (gradeRank(input.dataQualityGrade) === 2) {
    grade = gradeRank(grade) > 2 ? "C" : grade;
    confidenceCap = weakerConfidence(confidenceCap, "MEDIUM");
    reasons.push("Data quality C: limited profile depth.");
  }

  if (input.methodCalibration.quality === "D") {
    grade = gradeRank(grade) > 2 ? "C" : grade;
    confidenceCap = weakerConfidence(confidenceCap, "MEDIUM");
    reasons.push(`Method calibration sample too small (${input.methodCalibration.sampleSize}).`);
  } else if (input.methodCalibration.quality === "C") {
    grade = gradeRank(grade) > 3 ? "B" : grade;
    confidenceCap = weakerConfidence(confidenceCap, "MEDIUM_HIGH");
    reasons.push(`Method calibration still maturing (${input.methodCalibration.sampleSize} settled fights).`);
  }

  if (typeof input.profileFeatureScore === "number" && input.profileFeatureScore < 65) {
    grade = gradeRank(grade) > 2 ? "C" : grade;
    confidenceCap = weakerConfidence(confidenceCap, "MEDIUM");
    reasons.push(`MMA profile feature health below elite threshold (${input.profileFeatureScore}/100).`);
  }

  if (!input.hasLearningSignal) {
    grade = gradeRank(grade) > 3 ? "B" : grade;
    reasons.push("No post-fight outcome-learning signal applied.");
  }

  if (input.edgePct == null) {
    grade = gradeRank(grade) > 2 ? "C" : grade;
    confidenceCap = weakerConfidence(confidenceCap, "MEDIUM");
    reasons.push("No market odds/edge available; cannot promote as bet edge.");
  } else if (input.edgePct < 1.5) {
    grade = gradeRank(grade) > 2 ? "C" : grade;
    reasons.push(`Edge below promotion threshold (${input.edgePct}%).`);
  }

  if (input.pickProbability < 0.555) {
    grade = gradeRank(grade) > 2 ? "C" : grade;
    reasons.push(`Pick probability too close to coin flip (${Math.round(input.pickProbability * 1000) / 10}%).`);
  }

  const finalConfidence = weakerConfidence(confidenceCap, input.confidenceGrade as UfcPromotionGate["confidenceCap"]);
  const status = grade === "D" || finalConfidence === "LOW"
    ? "SHADOW_ONLY"
    : grade === "A" && finalConfidence !== "MEDIUM" && input.edgePct != null && input.edgePct >= 1.5 && input.pickProbability >= 0.555
      ? "PROMOTABLE"
      : "WATCHLIST";

  return { status, grade, reasons: reasons.length ? reasons : ["Promotion gate passed."], confidenceCap: finalConfidence };
}
