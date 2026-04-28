import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  getCachedModelEvaluationReports,
  rebuildModelEvaluationReport
} from "@/services/evaluation/model-evaluation-service";

type JsonRecord = Record<string, unknown>;

type EvaluatedPropRecord = {
  statKey: string;
  result: "WIN" | "LOSS" | "PUSH" | "NO_LINE";
  modelEdgeProbability: number | null;
  clvLine: number | null;
  brier: number | null;
  absoluteError: number;
  confidence: number | null;
};

type EvaluationReportLike = {
  generatedAt: string;
  leagueKey: string | null;
  lookbackDays: number;
  playerProps: {
    sample: number;
    hitRate: number | null;
    brier: number | null;
    avgClvLine: number | null;
    records: EvaluatedPropRecord[];
  };
};

export type ModelTuningRule = {
  statKey: string;
  sample: number;
  settledSample: number;
  hitRate: number | null;
  avgClvLine: number | null;
  brier: number | null;
  mae: number | null;
  trustScore: number;
  minPlayableEdge: number;
  marketBlendAdjustment: number;
  confidenceAdjustment: number;
  stdDevMultiplier: number;
  action: "TRUST" | "STANDARD" | "CAUTION" | "PASS_ONLY";
  reasons: string[];
};

export type ModelTuningProfile = {
  generatedAt: string;
  sourceReportGeneratedAt: string | null;
  leagueKey: string | null;
  lookbackDays: number;
  profileKey: string;
  defaultRule: ModelTuningRule;
  rules: Record<string, ModelTuningRule>;
  guardrails: {
    warnings: string[];
    minimumSamplesPerStat: number;
    minimumSettledPerStat: number;
  };
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function asEvaluationReport(value: unknown): EvaluationReportLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Partial<EvaluationReportLike>;
  if (!report.playerProps || !Array.isArray(report.playerProps.records)) return null;
  return report as EvaluationReportLike;
}

function scoreHitRate(hitRate: number | null) {
  if (hitRate === null) return 0.5;
  return clamp((hitRate - 0.46) / 0.14, 0, 1);
}

function scoreClv(avgClvLine: number | null) {
  if (avgClvLine === null) return 0.45;
  return clamp(0.5 + avgClvLine / 1.5, 0, 1);
}

function scoreBrier(brier: number | null) {
  if (brier === null) return 0.45;
  return clamp(1 - (brier - 0.18) / 0.18, 0, 1);
}

function scoreMae(mae: number | null, statKey: string) {
  if (mae === null) return 0.45;
  const baseline = statKey === "player_points" ? 7 : statKey === "player_rebounds" ? 3.5 : statKey === "player_assists" ? 3 : statKey === "player_threes" ? 1.6 : 5;
  return clamp(1 - mae / baseline, 0, 1);
}

function buildRule(statKey: string, records: EvaluatedPropRecord[]): ModelTuningRule {
  const settled = records.filter((record) => record.result === "WIN" || record.result === "LOSS");
  const hitRate = settled.length ? settled.filter((record) => record.result === "WIN").length / settled.length : null;
  const avgClvLine = average(records.map((record) => record.clvLine));
  const brier = average(records.map((record) => record.brier));
  const mae = average(records.map((record) => record.absoluteError));
  const sampleScore = clamp(records.length / 80, 0, 1);
  const settledScore = clamp(settled.length / 60, 0, 1);
  const trustScore = clamp(
    scoreHitRate(hitRate) * 0.27 +
    scoreClv(avgClvLine) * 0.24 +
    scoreBrier(brier) * 0.2 +
    scoreMae(mae, statKey) * 0.14 +
    sampleScore * 0.08 +
    settledScore * 0.07,
    0,
    1
  );
  const reasons: string[] = [];

  if (records.length < 40) reasons.push(`Thin sample: ${records.length}/40.`);
  if (settled.length < 30) reasons.push(`Thin settled sample: ${settled.length}/30.`);
  if (hitRate !== null && hitRate < 0.5) reasons.push(`Hit rate below breakeven watchline: ${(hitRate * 100).toFixed(1)}%.`);
  if (avgClvLine !== null && avgClvLine < 0) reasons.push(`Negative average CLV line: ${avgClvLine.toFixed(2)}.`);
  if (brier !== null && brier > 0.26) reasons.push(`Weak probability calibration: Brier ${brier.toFixed(3)}.`);
  if (trustScore >= 0.72) reasons.push("Model bucket is earning more freedom versus market.");
  if (trustScore <= 0.38) reasons.push("Model bucket is underperforming; force heavier market respect.");

  const action: ModelTuningRule["action"] =
    records.length < 20 || settled.length < 15
      ? "CAUTION"
      : trustScore >= 0.72
        ? "TRUST"
        : trustScore >= 0.52
          ? "STANDARD"
          : trustScore >= 0.34
            ? "CAUTION"
            : "PASS_ONLY";

  const minPlayableEdge =
    action === "TRUST" ? 0.035 :
    action === "STANDARD" ? 0.045 :
    action === "CAUTION" ? 0.065 :
    0.095;

  const marketBlendAdjustment =
    action === "TRUST" ? -0.04 :
    action === "STANDARD" ? 0 :
    action === "CAUTION" ? 0.09 :
    0.18;

  const confidenceAdjustment =
    action === "TRUST" ? 0.05 :
    action === "STANDARD" ? 0 :
    action === "CAUTION" ? -0.08 :
    -0.18;

  const stdDevMultiplier =
    action === "TRUST" ? 0.98 :
    action === "STANDARD" ? 1 :
    action === "CAUTION" ? 1.08 :
    1.16;

  return {
    statKey,
    sample: records.length,
    settledSample: settled.length,
    hitRate: readNumber(hitRate),
    avgClvLine: readNumber(avgClvLine),
    brier: readNumber(brier),
    mae: readNumber(mae),
    trustScore: Number(trustScore.toFixed(4)),
    minPlayableEdge,
    marketBlendAdjustment,
    confidenceAdjustment,
    stdDevMultiplier,
    action,
    reasons
  };
}

function defaultRule(records: EvaluatedPropRecord[]): ModelTuningRule {
  const rule = buildRule("default", records);
  return {
    ...rule,
    minPlayableEdge: Math.max(0.045, rule.minPlayableEdge),
    marketBlendAdjustment: clamp(rule.marketBlendAdjustment, -0.02, 0.12),
    confidenceAdjustment: clamp(rule.confidenceAdjustment, -0.12, 0.03),
    stdDevMultiplier: clamp(rule.stdDevMultiplier, 1, 1.12)
  };
}

function buildProfile(report: EvaluationReportLike): ModelTuningProfile {
  const grouped = new Map<string, EvaluatedPropRecord[]>();
  for (const record of report.playerProps.records ?? []) {
    grouped.set(record.statKey, [...(grouped.get(record.statKey) ?? []), record]);
  }

  const rules: Record<string, ModelTuningRule> = {};
  for (const [statKey, records] of grouped.entries()) {
    rules[statKey] = buildRule(statKey, records);
  }

  const warnings: string[] = [];
  if ((report.playerProps.records ?? []).length < 250) {
    warnings.push(`Tuning sample is thin (${report.playerProps.records.length}/250). Keep adjustments conservative.`);
  }
  for (const rule of Object.values(rules)) {
    if (rule.sample < 40) warnings.push(`${rule.statKey} sample below tuning target (${rule.sample}/40).`);
    if (rule.settledSample < 30) warnings.push(`${rule.statKey} settled sample below tuning target (${rule.settledSample}/30).`);
  }

  const profileKey = `model_tuning_profile:${report.leagueKey ?? "all"}:${report.lookbackDays}`;
  return {
    generatedAt: new Date().toISOString(),
    sourceReportGeneratedAt: report.generatedAt ?? null,
    leagueKey: report.leagueKey ?? null,
    lookbackDays: report.lookbackDays,
    profileKey,
    defaultRule: defaultRule(report.playerProps.records ?? []),
    rules,
    guardrails: {
      warnings,
      minimumSamplesPerStat: 40,
      minimumSettledPerStat: 30
    }
  };
}

export async function rebuildModelTuningProfile(args: {
  leagueKey?: string | null;
  lookbackDays?: number;
  rebuildEvaluation?: boolean;
} = {}) {
  const leagueKey = args.leagueKey ?? null;
  const lookbackDays = Math.max(1, Math.min(365, args.lookbackDays ?? 90));
  const report = args.rebuildEvaluation
    ? await rebuildModelEvaluationReport({ leagueKey, lookbackDays })
    : (await getCachedModelEvaluationReports()).find((candidate) => candidate.leagueKey === leagueKey && candidate.lookbackDays === lookbackDays)
      ?? await rebuildModelEvaluationReport({ leagueKey, lookbackDays });
  const parsedReport = asEvaluationReport(report);
  if (!parsedReport) {
    throw new Error("No usable evaluation report available for tuning.");
  }

  const profile = buildProfile(parsedReport);
  await prisma.trendCache.upsert({
    where: { cacheKey: profile.profileKey },
    update: {
      scope: "model_tuning_profile",
      filterJson: toJson({ leagueKey, lookbackDays }),
      payloadJson: toJson(profile),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey: profile.profileKey,
      scope: "model_tuning_profile",
      filterJson: toJson({ leagueKey, lookbackDays }),
      payloadJson: toJson(profile),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  return profile;
}

export async function getCachedModelTuningProfile(args: { leagueKey?: string | null; lookbackDays?: number } = {}) {
  const leagueKey = args.leagueKey ?? null;
  const lookbackDays = Math.max(1, Math.min(365, args.lookbackDays ?? 90));
  const cacheKey = `model_tuning_profile:${leagueKey ?? "all"}:${lookbackDays}`;
  const cached = await prisma.trendCache.findFirst({
    where: {
      cacheKey,
      scope: "model_tuning_profile",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as ModelTuningProfile | null;
}

export async function getLatestModelTuningProfile(leagueKey?: string | null) {
  const cached = await prisma.trendCache.findFirst({
    where: {
      scope: "model_tuning_profile",
      ...(leagueKey ? { filterJson: { path: ["leagueKey"], equals: leagueKey } } : {}),
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as ModelTuningProfile | null;
}
