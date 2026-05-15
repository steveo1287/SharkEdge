import { getEnhancedDataSourceCoverageReport } from "@/services/ops/data-source-coverage-enhanced";
import { getPlayerTendencyCoverageReport } from "@/services/ops/player-tendency-coverage";
import { buildMlbRosterIntelligenceFromStats } from "@/services/simulation/mlb-roster-intelligence-auto-builder";
import { buildUfcModelFeaturesFromWarehouse } from "@/services/ufc/fighter-feature-auto-builder";

export type StatsPipelineRunOptions = {
  runMlb?: boolean;
  runUfc?: boolean;
  mlbLookbackDays?: number;
  mlbLimit?: number;
  includeLineups?: boolean;
  ufcLimit?: number;
  modelVersion?: string;
};

type PipelineJobResult = {
  key: "mlb-roster-intelligence" | "ufc-model-features";
  label: string;
  ok: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  result: unknown;
  error: string | null;
};

function positiveInt(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

function modelVersion(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "ufc-fight-iq-v1";
}

function shouldRun(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return !["0", "false", "no", "off"].includes(value.toLowerCase());
  return fallback;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown pipeline error";
}

async function runJob<T>(key: PipelineJobResult["key"], label: string, fn: () => Promise<T>): Promise<PipelineJobResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  try {
    const result = await fn();
    const maybeOk = typeof result === "object" && result !== null && "ok" in result ? Boolean((result as { ok?: unknown }).ok) : true;
    return {
      key,
      label,
      ok: maybeOk,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      result,
      error: null
    };
  } catch (error) {
    return {
      key,
      label,
      ok: false,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      result: null,
      error: safeError(error)
    };
  }
}

async function safePlayerReport() {
  try {
    return { ok: true as const, report: await getPlayerTendencyCoverageReport(), error: null };
  } catch (error) {
    return { ok: false as const, report: null, error: safeError(error) };
  }
}

async function safeSourceReport() {
  try {
    return { ok: true as const, report: await getEnhancedDataSourceCoverageReport(), error: null };
  } catch (error) {
    return { ok: false as const, report: null, error: safeError(error) };
  }
}

export async function getStatsPipelineRunCenterSnapshot() {
  const [players, sources] = await Promise.all([safePlayerReport(), safeSourceReport()]);
  return {
    ok: players.ok && sources.ok,
    generatedAt: new Date().toISOString(),
    players,
    sources,
    links: {
      page: "/accuracy/data/pipeline",
      players: "/accuracy/data/players",
      sources: "/accuracy/data/sources",
      playersJson: "/api/accuracy/data/players",
      sourcesJson: "/api/accuracy/data/sources"
    }
  };
}

export async function runStatsPipelineRunCenter(options: StatsPipelineRunOptions = {}) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const normalized = {
    runMlb: shouldRun(options.runMlb, true),
    runUfc: shouldRun(options.runUfc, true),
    mlbLookbackDays: positiveInt(options.mlbLookbackDays, 45, 1, 365),
    mlbLimit: positiveInt(options.mlbLimit, 1500, 50, 5000),
    includeLineups: shouldRun(options.includeLineups, true),
    ufcLimit: positiveInt(options.ufcLimit, 50, 1, 200),
    modelVersion: modelVersion(options.modelVersion)
  };

  const before = await getStatsPipelineRunCenterSnapshot();
  const jobs: PipelineJobResult[] = [];

  if (normalized.runMlb) {
    jobs.push(await runJob("mlb-roster-intelligence", "MLB roster intelligence auto-build", () => buildMlbRosterIntelligenceFromStats({
      lookbackDays: normalized.mlbLookbackDays,
      limit: normalized.mlbLimit,
      includeLineups: normalized.includeLineups
    })));
  }

  if (normalized.runUfc) {
    jobs.push(await runJob("ufc-model-features", "UFC model feature auto-build", () => buildUfcModelFeaturesFromWarehouse({
      limit: normalized.ufcLimit,
      modelVersion: normalized.modelVersion
    })));
  }

  const after = await getStatsPipelineRunCenterSnapshot();
  const beforePlayerScore = before.players.report?.score ?? null;
  const afterPlayerScore = after.players.report?.score ?? null;
  const beforeSourceScore = before.sources.report?.score ?? null;
  const afterSourceScore = after.sources.report?.score ?? null;

  return {
    ok: jobs.every((job) => job.ok) && after.ok,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    options: normalized,
    jobs,
    before,
    after,
    deltas: {
      playerTendencyScore: beforePlayerScore == null || afterPlayerScore == null ? null : afterPlayerScore - beforePlayerScore,
      sourceCoverageScore: beforeSourceScore == null || afterSourceScore == null ? null : afterSourceScore - beforeSourceScore
    }
  };
}
