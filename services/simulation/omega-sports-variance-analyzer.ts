/**
 * OmegaSports Variance Analyzer
 *
 * Learns league-specific variance patterns from historical simulations.
 * Tracks prediction accuracy, distribution shapes, and market behavior by sport.
 *
 * Provides league-specific variance multipliers to refine simulation engine accuracy.
 * Updates patterns continuously as new simulations and outcomes arrive.
 */

export type VariancePattern = {
  league: string;
  sampleSize: number;
  avgStdDev: number; // average standard deviation across games
  avgTotalStdDev: number; // specific to total score variance
  avgSpreadStdDev: number; // specific to spread variance
  percentileCalibration: {
    p10: number; // how well 10th percentile performed
    p50: number; // how well 50th percentile (median) performed
    p90: number; // how well 90th percentile performed
  };
  regimeVarMultipliers: {
    SHARP: number; // variance multiplier for sharp regimes
    SQUARE: number; // variance multiplier for square regimes
    CONFLICT: number; // variance multiplier for conflict regimes
  };
  lastUpdated: string;
  historicalAccuracy: number; // 0-1 how well predictions match outcomes
};

export type LeagueVarianceLibrary = {
  [leagueKey: string]: VariancePattern;
};

/**
 * Default variance patterns for each league based on inherent sport properties
 */
const DEFAULT_VARIANCE_PATTERNS: LeagueVarianceLibrary = {
  NBA: {
    league: "NBA",
    sampleSize: 0,
    avgStdDev: 12.5,
    avgTotalStdDev: 13.2,
    avgSpreadStdDev: 5.8,
    percentileCalibration: { p10: 0.92, p50: 0.95, p90: 0.91 },
    regimeVarMultipliers: { SHARP: 1.0, SQUARE: 0.75, CONFLICT: 1.3 },
    lastUpdated: new Date().toISOString(),
    historicalAccuracy: 0.55
  },
  NFL: {
    league: "NFL",
    sampleSize: 0,
    avgStdDev: 9.6,
    avgTotalStdDev: 10.2,
    avgSpreadStdDev: 4.2,
    percentileCalibration: { p10: 0.88, p50: 0.92, p90: 0.87 },
    regimeVarMultipliers: { SHARP: 1.0, SQUARE: 0.8, CONFLICT: 1.25 },
    lastUpdated: new Date().toISOString(),
    historicalAccuracy: 0.53
  },
  NCAAF: {
    league: "NCAAF",
    sampleSize: 0,
    avgStdDev: 11.4,
    avgTotalStdDev: 12.1,
    avgSpreadStdDev: 5.0,
    percentileCalibration: { p10: 0.87, p50: 0.91, p90: 0.86 },
    regimeVarMultipliers: { SHARP: 1.0, SQUARE: 0.78, CONFLICT: 1.28 },
    lastUpdated: new Date().toISOString(),
    historicalAccuracy: 0.52
  },
  NHL: {
    league: "NHL",
    sampleSize: 0,
    avgStdDev: 1.55,
    avgTotalStdDev: 1.62,
    avgSpreadStdDev: 0.85,
    percentileCalibration: { p10: 0.90, p50: 0.94, p90: 0.89 },
    regimeVarMultipliers: { SHARP: 1.0, SQUARE: 0.72, CONFLICT: 1.35 },
    lastUpdated: new Date().toISOString(),
    historicalAccuracy: 0.54
  },
  MLB: {
    league: "MLB",
    sampleSize: 0,
    avgStdDev: 2.2,
    avgTotalStdDev: 2.3,
    avgSpreadStdDev: 1.1,
    percentileCalibration: { p10: 0.91, p50: 0.96, p90: 0.90 },
    regimeVarMultipliers: { SHARP: 1.0, SQUARE: 0.7, CONFLICT: 1.4 },
    lastUpdated: new Date().toISOString(),
    historicalAccuracy: 0.56
  }
};

export class OmegaSportsVarianceAnalyzer {
  private patterns: LeagueVarianceLibrary;
  private readonly DECAY_FACTOR = 0.95; // exponential decay for older samples in rolling average
  private readonly MIN_SAMPLE_THRESHOLD = 20; // minimum samples before using learned patterns

  constructor(initialPatterns?: LeagueVarianceLibrary) {
    this.patterns = initialPatterns || structuredClone(DEFAULT_VARIANCE_PATTERNS);
  }

  /**
   * Get variance multiplier for a specific league and regime
   * Falls back to defaults if insufficient data
   */
  getRegimeVarianceMultiplier(
    league: string,
    regime: "SHARP" | "SQUARE" | "CONFLICT"
  ): number {
    const pattern = this.patterns[league] || DEFAULT_VARIANCE_PATTERNS[league];
    if (!pattern) return 1.0;

    // Use learned multiplier if enough samples, otherwise default
    if (pattern.sampleSize >= this.MIN_SAMPLE_THRESHOLD) {
      return pattern.regimeVarMultipliers[regime];
    } else {
      return DEFAULT_VARIANCE_PATTERNS[league]?.regimeVarMultipliers[regime] ?? 1.0;
    }
  }

  /**
   * Get average standard deviation for a league
   * Useful for context on expected variance
   */
  getLeagueAvgStdDev(league: string): number {
    const pattern = this.patterns[league];
    return pattern?.avgStdDev ?? DEFAULT_VARIANCE_PATTERNS[league]?.avgStdDev ?? 10;
  }

  /**
   * Record a simulation result to update patterns
   * Called after game outcome is known to refine accuracy metrics
   */
  recordSimulationResult(args: {
    league: string;
    predictedTotal: number;
    predictedSpread: number;
    projectedHomeScore: number;
    projectedAwayScore: number;
    actualHomeScore: number;
    actualAwayScore: number;
    simulationStdDev: number;
    regime: "SHARP" | "SQUARE" | "CONFLICT";
  }): void {
    const pattern = this.patterns[args.league] || DEFAULT_VARIANCE_PATTERNS[args.league];
    if (!pattern) return;

    // Calculate actual total
    const actualTotal = args.actualHomeScore + args.actualAwayScore;

    // Update pattern with exponential decay
    const newSampleWeight = 1 / (pattern.sampleSize + 1);
    const oldSampleWeight = (pattern.sampleSize) / (pattern.sampleSize + 1) * this.DECAY_FACTOR;

    // Update average standard deviation
    pattern.avgStdDev =
      oldSampleWeight * pattern.avgStdDev +
      newSampleWeight * args.simulationStdDev;

    // Calculate prediction accuracy for this result
    const totalError = Math.abs(args.predictedTotal - actualTotal);
    const spreadError = Math.abs(
      args.predictedSpread - (args.actualHomeScore - args.actualAwayScore)
    );

    // Estimate if prediction was "accurate" (within 1 std dev)
    const isAccurate = totalError <= args.simulationStdDev;
    const accuracyUpdate = isAccurate ? 1 : 0;

    pattern.historicalAccuracy =
      oldSampleWeight * pattern.historicalAccuracy +
      newSampleWeight * accuracyUpdate;

    // Update percentile calibrations (simplified)
    // In production, would track actual percentile hits
    const deviationRatio = totalError / args.simulationStdDev;
    const calibrationFactor = Math.max(0.5, Math.min(1.5, 1 / deviationRatio));

    pattern.percentileCalibration.p50 =
      oldSampleWeight * pattern.percentileCalibration.p50 +
      newSampleWeight * calibrationFactor;

    pattern.sampleSize++;
    pattern.lastUpdated = new Date().toISOString();
  }

  /**
   * Get all learned patterns for export/persistence
   */
  getPatterns(): LeagueVarianceLibrary {
    return structuredClone(this.patterns);
  }

  /**
   * Load pre-computed patterns (e.g., from database)
   */
  loadPatterns(patterns: LeagueVarianceLibrary): void {
    this.patterns = structuredClone(patterns);
  }

  /**
   * Get pattern quality score for a league
   * 0-1 where 1 is highly confident in learned patterns
   */
  getPatternConfidence(league: string): number {
    const pattern = this.patterns[league];
    if (!pattern) return 0;

    // Confidence based on sample size and accuracy
    const sampleConfidence = Math.min(
      pattern.sampleSize / (this.MIN_SAMPLE_THRESHOLD * 10),
      1
    );
    const accuracyConfidence = pattern.historicalAccuracy;

    return (sampleConfidence + accuracyConfidence) / 2;
  }

  /**
   * Get summary of learned patterns for monitoring
   */
  getSummary(): {
    totalSamplesRecorded: number;
    leaguesTracked: string[];
    avgAccuracy: number;
    mostConfidentLeague: string | null;
  } {
    const leagues = Object.keys(this.patterns);
    const samples = Object.values(this.patterns).reduce((sum, p) => sum + p.sampleSize, 0);
    const avgAccuracy =
      Object.values(this.patterns).reduce((sum, p) => sum + p.historicalAccuracy, 0) /
      leagues.length;
    const mostConfident = leagues.reduce<{ league: string; confidence: number } | null>(
      (best, league) => {
        const conf = this.getPatternConfidence(league);
        return !best || conf > best.confidence ? { league, confidence: conf } : best;
      },
      null
    );

    return {
      totalSamplesRecorded: samples,
      leaguesTracked: leagues,
      avgAccuracy,
      mostConfidentLeague: mostConfident?.league ?? null
    };
  }
}

export const omegaSportsVarianceAnalyzer = new OmegaSportsVarianceAnalyzer();
