import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import type { TrendBacktestSummary } from "./trend-backtester";
import type { TrendCandidateSystem } from "./trend-candidate-types";

export type GeneratedTrendPersistOptions = {
  minSample?: number;
  minRoiPct?: number;
  allowedGates?: Array<TrendBacktestSummary["qualityGate"]>;
  dryRun?: boolean;
};

export type GeneratedTrendPersistDecision = {
  candidateId: string;
  name: string;
  persisted: boolean;
  reason: string;
  sampleSize: number;
  roiPct: number | null;
  qualityGate: string;
};

export type GeneratedTrendPersistReport = {
  dryRun: boolean;
  attempted: number;
  persisted: number;
  skipped: number;
  decisions: GeneratedTrendPersistDecision[];
  sourceNote: string;
};

type CandidateWithSummary = {
  candidate: TrendCandidateSystem;
  summary: TrendBacktestSummary;
};

const DEFAULT_ALLOWED_GATES: Array<TrendBacktestSummary["qualityGate"]> = ["promote_candidate", "watch_candidate"];

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 180);
}

function snapshotId(systemId: string, generatedAt = new Date()) {
  return sanitizeId(`snap:${systemId}:${generatedAt.toISOString()}`);
}

function resultId(systemId: string, rowId: string) {
  return sanitizeId(`result:${systemId}:${rowId}`);
}

function shouldPersist(summary: TrendBacktestSummary, options: Required<Omit<GeneratedTrendPersistOptions, "dryRun">>) {
  if (summary.status !== "ready") return `Backtest status is ${summary.status}.`;
  if (summary.sampleSize < options.minSample) return `Sample below ${options.minSample}.`;
  if ((summary.roiPct ?? Number.NEGATIVE_INFINITY) < options.minRoiPct) return `ROI below ${options.minRoiPct}%.`;
  if (!options.allowedGates.includes(summary.qualityGate)) return `Gate ${summary.qualityGate} is not allowed for persistence.`;
  if (summary.blockers.length) return `Backtest has blockers: ${summary.blockers.slice(0, 2).join("; ")}.`;
  return null;
}

async function upsertSystem(candidate: TrendCandidateSystem, summary: TrendBacktestSummary) {
  await prisma.$executeRaw`
    INSERT INTO generated_trend_systems (
      id, name, league, market, side, filter_json, conditions_json, dedupe_key, related_key,
      description, generated_by, status, quality_gate, gate_reasons_json, blockers_json,
      preview_tags_json, last_backtested_at, updated_at
    ) VALUES (
      ${candidate.id}, ${candidate.name}, ${candidate.league}, ${candidate.market}, ${candidate.side},
      ${JSON.stringify(candidate.filters)}::jsonb, ${JSON.stringify(candidate.conditions)}::jsonb,
      ${candidate.dedupeKey}, ${candidate.relatedKey}, ${candidate.description}, ${candidate.generatedBy},
      'ACTIVE', ${summary.qualityGate}, ${JSON.stringify(summary.gateReasons)}::jsonb,
      ${JSON.stringify(summary.blockers)}::jsonb, ${JSON.stringify(candidate.previewTags)}::jsonb,
      now(), now()
    )
    ON CONFLICT (dedupe_key) DO UPDATE SET
      name = EXCLUDED.name,
      league = EXCLUDED.league,
      market = EXCLUDED.market,
      side = EXCLUDED.side,
      filter_json = EXCLUDED.filter_json,
      conditions_json = EXCLUDED.conditions_json,
      related_key = EXCLUDED.related_key,
      description = EXCLUDED.description,
      quality_gate = EXCLUDED.quality_gate,
      gate_reasons_json = EXCLUDED.gate_reasons_json,
      blockers_json = EXCLUDED.blockers_json,
      preview_tags_json = EXCLUDED.preview_tags_json,
      last_backtested_at = now(),
      updated_at = now()
  `;
}

async function insertSnapshot(candidate: TrendCandidateSystem, summary: TrendBacktestSummary) {
  const id = snapshotId(candidate.id);
  await prisma.$executeRaw`
    INSERT INTO generated_trend_system_snapshots (
      id, system_id, generated_at, sample_size, wins, losses, pushes, voids, pending,
      profit_units, roi_pct, win_rate_pct, clv_pct, average_price, last10, last30,
      current_streak, strength_score, grade, quality_gate, gate_reasons_json, blockers_json, source_note
    ) VALUES (
      ${id}, ${candidate.id}, now(), ${summary.sampleSize}, ${summary.wins}, ${summary.losses},
      ${summary.pushes}, ${summary.voids}, ${summary.pending}, ${summary.profitUnits}, ${summary.roiPct},
      ${summary.winRatePct}, ${summary.clvPct}, ${summary.averagePrice}, ${summary.last10}, ${summary.last30},
      ${summary.currentStreak}, NULL, ${summary.grade}, ${summary.qualityGate},
      ${JSON.stringify(summary.gateReasons)}::jsonb, ${JSON.stringify(summary.blockers)}::jsonb, ${summary.sourceNote}
    )
    ON CONFLICT (id) DO NOTHING
  `;
  return id;
}

async function insertHistoryRows(candidate: TrendCandidateSystem, summary: TrendBacktestSummary, snapshot: string) {
  for (const row of summary.historyRows) {
    await prisma.$executeRaw`
      INSERT INTO generated_trend_system_results (
        id, system_id, snapshot_id, source_event_id, game_date, matchup, side, price,
        closing_price, result, units, clv_pct, matched_filters_json, qualifying_reason, filter_match_json
      ) VALUES (
        ${resultId(candidate.id, row.id)}, ${candidate.id}, ${snapshot}, ${row.id}, ${new Date(row.date)},
        ${row.matchup}, ${row.side}, ${row.price}, ${row.closingPrice}, ${row.result}, ${row.units}, ${row.clvPct},
        ${JSON.stringify(row.matchedFilters)}::jsonb, ${row.qualifyingReason}, ${JSON.stringify({ candidateId: candidate.id, dedupeKey: candidate.dedupeKey })}::jsonb
      )
      ON CONFLICT DO NOTHING
    `;
  }
}

export async function persistGeneratedTrendSystems(items: CandidateWithSummary[], options: GeneratedTrendPersistOptions = {}): Promise<GeneratedTrendPersistReport> {
  const resolved = {
    minSample: options.minSample ?? 50,
    minRoiPct: options.minRoiPct ?? 0,
    allowedGates: options.allowedGates ?? DEFAULT_ALLOWED_GATES
  };
  const dryRun = options.dryRun ?? false;
  const decisions: GeneratedTrendPersistDecision[] = [];

  if (!hasUsableServerDatabaseUrl()) {
    return {
      dryRun: true,
      attempted: items.length,
      persisted: 0,
      skipped: items.length,
      decisions: items.map(({ candidate, summary }) => ({
        candidateId: candidate.id,
        name: candidate.name,
        persisted: false,
        reason: "DATABASE_URL unavailable.",
        sampleSize: summary.sampleSize,
        roiPct: summary.roiPct,
        qualityGate: summary.qualityGate
      })),
      sourceNote: "Generated trend persistence skipped because DATABASE_URL is unavailable."
    };
  }

  for (const item of items) {
    const rejection = shouldPersist(item.summary, resolved);
    if (rejection) {
      decisions.push({
        candidateId: item.candidate.id,
        name: item.candidate.name,
        persisted: false,
        reason: rejection,
        sampleSize: item.summary.sampleSize,
        roiPct: item.summary.roiPct,
        qualityGate: item.summary.qualityGate
      });
      continue;
    }

    if (!dryRun) {
      await upsertSystem(item.candidate, item.summary);
      const snapshot = await insertSnapshot(item.candidate, item.summary);
      await insertHistoryRows(item.candidate, item.summary, snapshot);
    }

    decisions.push({
      candidateId: item.candidate.id,
      name: item.candidate.name,
      persisted: true,
      reason: dryRun ? "Would persist; dry run enabled." : "Persisted generated system, snapshot, and qualifying result rows.",
      sampleSize: item.summary.sampleSize,
      roiPct: item.summary.roiPct,
      qualityGate: item.summary.qualityGate
    });
  }

  const persisted = decisions.filter((decision) => decision.persisted).length;
  return {
    dryRun,
    attempted: items.length,
    persisted,
    skipped: decisions.length - persisted,
    decisions,
    sourceNote: dryRun
      ? "Dry run complete. No generated trend rows were written."
      : "Persistence complete. Only gate-cleared generated systems were written."
  };
}
