import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import { buildGeneratedSystemAttachments } from "./generated-system-attachments";

export type TrendVerificationOptions = {
  league?: string | "ALL";
  market?: string | "ALL";
  limit?: number;
  requireCurrentAttachment?: boolean;
};

export type TrendVerificationGrade = "A" | "B" | "C" | "D" | "P";
export type TrendOverfitRisk = "low" | "medium" | "high";
export type TrendSourceRisk = "low" | "medium" | "high";

export type TrendVerificationResult = {
  systemId: string;
  name: string;
  league: string;
  market: string;
  side: string;
  verified: boolean;
  grade: TrendVerificationGrade;
  verificationScore: number;
  overfitRisk: TrendOverfitRisk;
  sourceRisk: TrendSourceRisk;
  hasCurrentAttachment: boolean;
  sampleSize: number;
  record: string;
  profitUnits: number;
  roiPct: number | null;
  winRatePct: number | null;
  clvPct: number | null;
  last10: string | null;
  last30: string | null;
  currentStreak: string | null;
  resultRows: number;
  qualityGate: string;
  conditionsCount: number;
  reasons: string[];
  blockers: string[];
};

export type TrendVerificationPayload = {
  generatedAt: string;
  sourceNote: string;
  results: TrendVerificationResult[];
  stats: {
    systemsScanned: number;
    verified: number;
    gradeA: number;
    gradeB: number;
    gradeC: number;
    highOverfitRisk: number;
    highSourceRisk: number;
    attached: number;
  };
};

type PersistedSystemRow = {
  id: string;
  name: string;
  league: string;
  market: string;
  side: string;
  quality_gate: string;
  conditions_json: unknown;
  blockers_json: unknown;
  sample_size: number | null;
  wins: number | null;
  losses: number | null;
  pushes: number | null;
  profit_units: number | null;
  roi_pct: number | null;
  win_rate_pct: number | null;
  clv_pct: number | null;
  last10: string | null;
  last30: string | null;
  current_streak: string | null;
  snapshot_grade: string | null;
  result_rows: number | null;
};

function numberValue(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function conditionsCount(row: PersistedSystemRow) {
  return asArray(row.conditions_json).length;
}

function baseBlockers(row: PersistedSystemRow) {
  return asArray(row.blockers_json).map((item) => String(item)).filter(Boolean);
}

function overfitRisk(row: PersistedSystemRow): TrendOverfitRisk {
  const sample = numberValue(row.sample_size);
  const roi = numberValue(row.roi_pct);
  const conditions = conditionsCount(row);
  const resultRows = numberValue(row.result_rows);
  if (sample < 50 || resultRows < 25 || conditions >= 6) return "high";
  if ((roi >= 25 && sample < 100) || conditions >= 4 || sample < 100) return "medium";
  return "low";
}

function sourceRisk(row: PersistedSystemRow): TrendSourceRisk {
  const sample = numberValue(row.sample_size);
  const resultRows = numberValue(row.result_rows);
  if (!resultRows || !sample) return "high";
  if (resultRows < sample * 0.5 || sample < 100) return "medium";
  return "low";
}

function scoreVerification(row: PersistedSystemRow, hasCurrentAttachment: boolean) {
  let score = 0;
  const sample = numberValue(row.sample_size);
  const roi = numberValue(row.roi_pct);
  const profit = numberValue(row.profit_units);
  const win = numberValue(row.win_rate_pct);
  const clv = row.clv_pct;
  const resultRows = numberValue(row.result_rows);

  score += Math.min(25, sample / 8);
  score += Math.min(20, Math.max(0, roi) * 1.5);
  score += Math.min(14, Math.max(0, profit) * 0.4);
  score += win >= 56 ? 10 : win >= 53 ? 6 : win >= 50 ? 2 : 0;
  score += clv == null ? 0 : clv >= 0 ? 10 : -12;
  score += resultRows >= sample ? 8 : resultRows >= sample * 0.5 ? 4 : 0;
  score += row.quality_gate === "promote_candidate" ? 10 : row.quality_gate === "watch_candidate" ? 5 : 0;
  score += hasCurrentAttachment ? 8 : 0;
  score -= baseBlockers(row).length * 10;
  score -= overfitRisk(row) === "high" ? 18 : overfitRisk(row) === "medium" ? 8 : 0;
  score -= sourceRisk(row) === "high" ? 18 : sourceRisk(row) === "medium" ? 8 : 0;
  return Math.max(0, Math.round(score));
}

function gradeFromScore(score: number, blockers: string[]): TrendVerificationGrade {
  if (blockers.length) {
    if (score >= 75) return "B";
    if (score >= 55) return "C";
    return "D";
  }
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "P";
}

function verifyRow(row: PersistedSystemRow, attachedIds: Set<string>, requireCurrentAttachment: boolean): TrendVerificationResult {
  const blockers = [...baseBlockers(row)];
  const reasons: string[] = [];
  const sample = numberValue(row.sample_size);
  const roi = row.roi_pct;
  const profit = numberValue(row.profit_units);
  const clv = row.clv_pct;
  const resultRows = numberValue(row.result_rows);
  const attached = attachedIds.has(row.id);
  const risk = overfitRisk(row);
  const source = sourceRisk(row);

  if (sample >= 100) reasons.push("Sample clears strong verification floor.");
  else if (sample >= 50) reasons.push("Sample clears minimum verification floor.");
  else blockers.push("Sample is below verification floor.");

  if ((roi ?? 0) > 0) reasons.push("ROI is positive.");
  else blockers.push("ROI is not positive.");

  if (profit > 0) reasons.push("Profit units are positive.");
  else blockers.push("Profit units are not positive.");

  if (clv == null) reasons.push("CLV is not available, so verification remains conservative.");
  else if (clv >= 0) reasons.push("CLV is non-negative.");
  else blockers.push("CLV is negative.");

  if (resultRows >= sample && sample > 0) reasons.push("Stored result rows cover the sample.");
  else if (resultRows > 0) blockers.push("Stored result rows only partially cover the sample.");
  else blockers.push("No stored result rows are available.");

  if (risk === "low") reasons.push("Overfit risk is low.");
  else blockers.push(`Overfit risk is ${risk}.`);

  if (source === "low") reasons.push("Source risk is low.");
  else blockers.push(`Source risk is ${source}.`);

  if (attached) reasons.push("System is currently attached to a game.");
  else if (requireCurrentAttachment) blockers.push("No current game attachment.");

  const verificationScore = scoreVerification(row, attached);
  const grade = gradeFromScore(verificationScore, blockers);
  const verified = blockers.length === 0 && verificationScore >= 70 && (grade === "A" || grade === "B");
  const wins = numberValue(row.wins);
  const losses = numberValue(row.losses);
  const pushes = numberValue(row.pushes);

  return {
    systemId: row.id,
    name: row.name,
    league: row.league,
    market: row.market,
    side: row.side,
    verified,
    grade,
    verificationScore,
    overfitRisk: risk,
    sourceRisk: source,
    hasCurrentAttachment: attached,
    sampleSize: sample,
    record: `${wins}-${losses}${pushes ? `-${pushes}` : ""}`,
    profitUnits: profit,
    roiPct: row.roi_pct,
    winRatePct: row.win_rate_pct,
    clvPct: row.clv_pct,
    last10: row.last10,
    last30: row.last30,
    currentStreak: row.current_streak,
    resultRows,
    qualityGate: row.quality_gate,
    conditionsCount: conditionsCount(row),
    reasons,
    blockers: Array.from(new Set(blockers))
  };
}

async function fetchPersistedSystems(options: Required<Omit<TrendVerificationOptions, "requireCurrentAttachment">>) {
  const rows = await prisma.$queryRaw<PersistedSystemRow[]>`
    WITH latest_snapshots AS (
      SELECT DISTINCT ON (system_id)
        system_id,
        sample_size,
        wins,
        losses,
        pushes,
        profit_units,
        roi_pct,
        win_rate_pct,
        clv_pct,
        last10,
        last30,
        current_streak,
        grade AS snapshot_grade,
        generated_at
      FROM generated_trend_system_snapshots
      ORDER BY system_id, generated_at DESC
    ),
    result_counts AS (
      SELECT system_id, COUNT(*)::int AS result_rows
      FROM generated_trend_system_results
      GROUP BY system_id
    )
    SELECT
      s.id,
      s.name,
      s.league,
      s.market,
      s.side,
      s.quality_gate,
      s.conditions_json,
      s.blockers_json,
      ls.sample_size,
      ls.wins,
      ls.losses,
      ls.pushes,
      ls.profit_units,
      ls.roi_pct,
      ls.win_rate_pct,
      ls.clv_pct,
      ls.last10,
      ls.last30,
      ls.current_streak,
      ls.snapshot_grade,
      COALESCE(rc.result_rows, 0)::int AS result_rows
    FROM generated_trend_systems s
    LEFT JOIN latest_snapshots ls ON ls.system_id = s.id
    LEFT JOIN result_counts rc ON rc.system_id = s.id
    WHERE s.status = 'ACTIVE'
      AND (${options.league} = 'ALL' OR s.league = ${options.league})
      AND (${options.market} = 'ALL' OR s.market = ${options.market})
    ORDER BY COALESCE(ls.sample_size, 0) DESC, COALESCE(ls.roi_pct, 0) DESC
    LIMIT ${options.limit}
  `;
  return rows;
}

export async function buildTrendVerificationPayload(options: TrendVerificationOptions = {}): Promise<TrendVerificationPayload> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Trend verification unavailable because DATABASE_URL is not configured.",
      results: [],
      stats: { systemsScanned: 0, verified: 0, gradeA: 0, gradeB: 0, gradeC: 0, highOverfitRisk: 0, highSourceRisk: 0, attached: 0 }
    };
  }

  const resolved = {
    league: (options.league ?? "ALL").toUpperCase(),
    market: (options.market ?? "ALL").toLowerCase(),
    limit: options.limit ?? 250,
    requireCurrentAttachment: options.requireCurrentAttachment ?? false
  };

  try {
    const [systems, attachments] = await Promise.all([
      fetchPersistedSystems(resolved),
      buildGeneratedSystemAttachments({ league: resolved.league, topSystemsPerGame: 10, includeResearch: false })
    ]);
    const attachedIds = new Set(attachments.games.flatMap((game) => game.topSystems.map((system) => system.systemId)));
    const results = systems
      .map((row) => verifyRow(row, attachedIds, resolved.requireCurrentAttachment))
      .sort((left, right) => Number(right.verified) - Number(left.verified) || right.verificationScore - left.verificationScore || right.sampleSize - left.sampleSize);

    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Verification uses persisted generated systems, latest snapshots, stored result rows, and current generated-system attachments.",
      results,
      stats: {
        systemsScanned: systems.length,
        verified: results.filter((item) => item.verified).length,
        gradeA: results.filter((item) => item.grade === "A").length,
        gradeB: results.filter((item) => item.grade === "B").length,
        gradeC: results.filter((item) => item.grade === "C").length,
        highOverfitRisk: results.filter((item) => item.overfitRisk === "high").length,
        highSourceRisk: results.filter((item) => item.sourceRisk === "high").length,
        attached: results.filter((item) => item.hasCurrentAttachment).length
      }
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: error instanceof Error ? `Trend verification unavailable: ${error.message}` : "Trend verification unavailable.",
      results: [],
      stats: { systemsScanned: 0, verified: 0, gradeA: 0, gradeB: 0, gradeC: 0, highOverfitRisk: 0, highSourceRisk: 0, attached: 0 }
    };
  }
}
