import { backtestTrendCandidates } from "./trend-backtester";
import { buildTrendFactoryPreview } from "./trend-factory";
import { persistGeneratedTrendSystems } from "./generated-trend-store";
import { loadHistoricalTrendRows } from "./historical-trend-source";
import type { TrendFactoryDepth, TrendFactoryLeague, TrendFactoryMarket } from "./trend-candidate-types";

export type GeneratedTrendRunnerOptions = {
  league?: TrendFactoryLeague | "ALL";
  market?: TrendFactoryMarket | "ALL";
  depth?: TrendFactoryDepth;
  limit?: number;
  minSample?: number;
  minRoiPct?: number;
  historyLimit?: number;
  startDate?: string;
  endDate?: string;
  dryRun?: boolean;
};

export type GeneratedTrendRunnerSummary = {
  generatedAt: string;
  dryRun: boolean;
  options: Required<Omit<GeneratedTrendRunnerOptions, "startDate" | "endDate">> & { startDate: string | null; endDate: string | null };
  factory: {
    totalCandidates: number;
    returnedCandidates: number;
    gateCounts: Record<string, number>;
  };
  historicalSource: {
    connected: boolean;
    rowsLoaded: number;
    rowsSkipped: number;
    note: string;
  };
  backtest: {
    ready: number;
    insufficientSample: number;
    noRows: number;
    noMatches: number;
    topCandidates: Array<{
      candidateId: string;
      name: string;
      sampleSize: number;
      roiPct: number | null;
      profitUnits: number;
      grade: string;
      qualityGate: string;
      blockers: string[];
    }>;
  };
  persistence: Awaited<ReturnType<typeof persistGeneratedTrendSystems>>;
  notes: string[];
};

function resolvedOptions(options: GeneratedTrendRunnerOptions) {
  return {
    league: options.league ?? "ALL",
    market: options.market ?? "ALL",
    depth: options.depth ?? "core",
    limit: options.limit ?? 250,
    minSample: options.minSample ?? 50,
    minRoiPct: options.minRoiPct ?? 0,
    historyLimit: options.historyLimit ?? 100,
    dryRun: options.dryRun ?? true,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null
  };
}

export async function runGeneratedTrendDiscovery(options: GeneratedTrendRunnerOptions = {}): Promise<GeneratedTrendRunnerSummary> {
  const resolved = resolvedOptions(options);
  const factory = buildTrendFactoryPreview({
    league: resolved.league,
    market: resolved.market,
    depth: resolved.depth,
    limit: resolved.limit
  });

  const historicalSource = await loadHistoricalTrendRows({
    league: resolved.league,
    startDate: resolved.startDate ?? undefined,
    endDate: resolved.endDate ?? undefined,
    limit: Math.max(5000, resolved.limit * 100)
  });

  const summaries = backtestTrendCandidates(factory.candidates, historicalSource.rows, {
    minSample: resolved.minSample,
    historyLimit: resolved.historyLimit
  });

  const persistence = await persistGeneratedTrendSystems(
    factory.candidates.map((candidate, index) => ({ candidate, summary: summaries[index] })),
    {
      minSample: resolved.minSample,
      minRoiPct: resolved.minRoiPct,
      dryRun: resolved.dryRun
    }
  );

  const ready = summaries.filter((summary) => summary.status === "ready");
  const topCandidates = ready
    .slice()
    .sort((left, right) => (right.roiPct ?? 0) - (left.roiPct ?? 0) || right.profitUnits - left.profitUnits || right.sampleSize - left.sampleSize)
    .slice(0, 12)
    .map((summary) => ({
      candidateId: summary.candidateId,
      name: summary.candidateName,
      sampleSize: summary.sampleSize,
      roiPct: summary.roiPct,
      profitUnits: summary.profitUnits,
      grade: summary.grade,
      qualityGate: summary.qualityGate,
      blockers: summary.blockers
    }));

  return {
    generatedAt: new Date().toISOString(),
    dryRun: resolved.dryRun,
    options: resolved,
    factory: {
      totalCandidates: factory.totalCandidates,
      returnedCandidates: factory.returnedCandidates,
      gateCounts: factory.gateCounts
    },
    historicalSource: {
      connected: historicalSource.sourceConnected,
      rowsLoaded: historicalSource.stats.rowsLoaded,
      rowsSkipped: historicalSource.stats.rowsSkipped,
      note: historicalSource.sourceNote
    },
    backtest: {
      ready: ready.length,
      insufficientSample: summaries.filter((summary) => summary.status === "insufficient_sample").length,
      noRows: summaries.filter((summary) => summary.status === "no_rows").length,
      noMatches: summaries.filter((summary) => summary.status === "no_matches").length,
      topCandidates
    },
    persistence,
    notes: [
      "Runner executes factory → historical source → backtest → quality-gated persistence.",
      "Dry-run is enabled by default. Set dryRun=false only when historical rows are verified and persistence is intended.",
      "Main SharkTrends promotion remains separate; this runner only discovers and stores gate-cleared generated systems."
    ]
  };
}
