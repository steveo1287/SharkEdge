import { getSimModelEdgeLab } from "@/services/sim/model-edge-lab";

export type ModelTrustGrade = "A" | "B" | "C" | "D" | "F";

export type ModelTrustSnapshot = {
  grade: ModelTrustGrade;
  source: "model-edge-lab" | "fallback";
  benchmarkScore: number | null;
  brierScoreAvg: number | null;
  logLossAvg: number | null;
  clvAvgPct: number | null;
  calibrationErrorAvg: number | null;
  sampleSize: number;
  warnings: string[];
  summary: string;
};

function toTrustGrade(score: number | null, sampleSize: number): ModelTrustGrade {
  if (sampleSize < 10) return "F";
  if (sampleSize < 30) return "C";
  if (typeof score !== "number" || !Number.isFinite(score)) return "D";
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  if (score >= 42) return "D";
  return "F";
}

function fallbackTrust(league: string, market: string, modelVersion: string): ModelTrustSnapshot {
  return {
    grade: "D",
    source: "fallback",
    benchmarkScore: null,
    brierScoreAvg: null,
    logLossAvg: null,
    clvAvgPct: null,
    calibrationErrorAvg: null,
    sampleSize: 0,
    warnings: ["No settled calibration scorecard found for this league/market/model version yet."],
    summary: `${league} ${market} ${modelVersion} is in audit mode until the calibration ledger has settled rows.`
  };
}

export async function getModelTrustGrade(args: {
  league: string;
  market?: string | null;
  modelVersion?: string | null;
  windowDays?: number | null;
}): Promise<ModelTrustSnapshot> {
  const market = args.market || "moneyline";
  const modelVersion = args.modelVersion || "sim-projection-engine";
  const lab = await getSimModelEdgeLab({
    league: args.league,
    market,
    modelVersion,
    windowDays: args.windowDays ?? 365
  });

  if (!lab.ok) return fallbackTrust(args.league, market, modelVersion);

  const row = lab.rows.find((item) =>
    item.league.toUpperCase() === args.league.toUpperCase() &&
    item.market.toLowerCase() === market.toLowerCase() &&
    item.modelVersion === modelVersion
  ) ?? lab.rows.find((item) =>
    item.league.toUpperCase() === args.league.toUpperCase() &&
    item.market.toLowerCase() === market.toLowerCase()
  ) ?? lab.rows.find((item) => item.league.toUpperCase() === args.league.toUpperCase());

  if (!row) return fallbackTrust(args.league, market, modelVersion);

  const warnings = [...row.weaknesses];
  if (row.sampleWarning) warnings.unshift(row.sampleWarning);

  return {
    grade: toTrustGrade(row.benchmarkScore, row.settledCount),
    source: "model-edge-lab",
    benchmarkScore: row.benchmarkScore,
    brierScoreAvg: row.brierScoreAvg,
    logLossAvg: row.logLossAvg,
    clvAvgPct: row.clvAvgPct,
    calibrationErrorAvg: row.calibrationErrorAvg,
    sampleSize: row.settledCount,
    warnings,
    summary: row.summary
  };
}
