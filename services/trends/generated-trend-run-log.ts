import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import type { GeneratedTrendRunnerSummary } from "./generated-trend-runner";

export type GeneratedTrendRunMode = "manual" | "cron" | "api";

export type GeneratedTrendRunLogResult = {
  stored: boolean;
  id: string | null;
  reason: string;
};

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 180);
}

function runLogId(mode: GeneratedTrendRunMode, generatedAt: string) {
  return sanitizeId(`generated-run:${mode}:${generatedAt}`);
}

export async function recordGeneratedTrendRun(summary: GeneratedTrendRunnerSummary, mode: GeneratedTrendRunMode): Promise<GeneratedTrendRunLogResult> {
  const id = runLogId(mode, summary.generatedAt);

  if (!hasUsableServerDatabaseUrl()) {
    return { stored: false, id: null, reason: "DATABASE_URL unavailable; run log was not stored." };
  }

  try {
    await prisma.$executeRaw`
      INSERT INTO generated_trend_run_logs (
        id,
        mode,
        dry_run,
        league,
        market,
        depth,
        limit_count,
        min_sample,
        min_roi_pct,
        history_limit,
        start_date,
        end_date,
        source_connected,
        rows_loaded,
        rows_skipped,
        total_candidates,
        returned_candidates,
        ready_count,
        insufficient_sample_count,
        no_rows_count,
        no_matches_count,
        persisted_count,
        skipped_count,
        status,
        source_note,
        summary_json
      ) VALUES (
        ${id},
        ${mode},
        ${summary.dryRun},
        ${summary.options.league},
        ${summary.options.market},
        ${summary.options.depth},
        ${summary.options.limit},
        ${summary.options.minSample},
        ${summary.options.minRoiPct},
        ${summary.options.historyLimit},
        ${summary.options.startDate},
        ${summary.options.endDate},
        ${summary.historicalSource.connected},
        ${summary.historicalSource.rowsLoaded},
        ${summary.historicalSource.rowsSkipped},
        ${summary.factory.totalCandidates},
        ${summary.factory.returnedCandidates},
        ${summary.backtest.ready},
        ${summary.backtest.insufficientSample},
        ${summary.backtest.noRows},
        ${summary.backtest.noMatches},
        ${summary.persistence.persisted},
        ${summary.persistence.skipped},
        'completed',
        ${summary.historicalSource.note},
        ${JSON.stringify(summary)}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `;

    return { stored: true, id, reason: "Generated trend run log stored." };
  } catch (error) {
    return {
      stored: false,
      id,
      reason: error instanceof Error ? `Run log unavailable: ${error.message}` : "Run log unavailable."
    };
  }
}
