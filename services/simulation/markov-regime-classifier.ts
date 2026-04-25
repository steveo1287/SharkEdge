/**
 * Markov Regime Classifier for SharkEdge Monte Carlo Simulation Engine
 *
 * Detects market regimes (SHARP vs SQUARE vs CONFLICT) by analyzing:
 * - Spread between consensus lines and market-implied probabilities
 * - Variability in bookmaker agreement on same market
 * - Deviation of team ratings from historical patterns
 *
 * Regime Classification:
 * - SHARP: Professional money dominant, tight consensus, high complexity
 * - SQUARE: Public money dominant, wide line variance, predictable patterns
 * - CONFLICT: Mixed signals, bookmaker disagreement, uncertainty regime
 */

import type { ContextualGameSimulationInput, ContextualGameSimulationSummary } from "./contextual-game-sim";

export type MarkovRegimeClassification = "SHARP" | "SQUARE" | "CONFLICT";

export type MarkovRegimeState = {
  classification: MarkovRegimeClassification;
  confidence: number; // 0-1, higher = more confident in classification
  reasoning: string[];
  sharpnessScore: number; // 0-100, 0=square, 100=sharp
  conflictScore: number; // 0-100, 0=no conflict, 100=high conflict
  sharpnessIndicators: {
    consensusWidth: number; // spread between best lines
    lineMovementVelocity: number; // how fast lines moved (inferred from market)
    bookmakerDisagreement: number; // standard deviation of odds across books
    priorDeviation: number; // how far team ratings deviate from expectation
  };
  squarenessIndicators: {
    publicPricingPattern: number; // tendency toward round numbers, key numbers
    linestickyness: number; // lines not moving much = square market
    massMarketPatterns: number; // moneyline/spread correlation patterns
  };
  conflictIndicators: {
    marketOddsDeviation: number; // consensus vs model disagreement
    bookmakerDivergence: number; // different books pricing differently
    ratingUnconfidence: number; // uncertainty in team ratings
  };
  metadata: {
    eventsInWindow: number;
    windowLengthDays: number;
    lastUpdated: string;
  };
};

export class MarkovRegimeClassifier {
  private readonly WINDOW_SIZE_DAYS = 30; // historical window for regime detection
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.6;
  private regimeCache = new Map<string, { state: MarkovRegimeState; timestamp: number }>();
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Classify market regime for a given game/matchup
   * Determines if professional or public money dominates, influencing MC simulation depth
   */
  async classifyRegime(
    input: ContextualGameSimulationInput,
    baselineSimulation: ContextualGameSimulationSummary
  ): Promise<MarkovRegimeState> {
    const cacheKey = this.buildCacheKey(input);
    const cached = this.regimeCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.state;
    }

    const regime = this.computeRegime(input, baselineSimulation);
    this.regimeCache.set(cacheKey, { state: regime, timestamp: Date.now() });
    return regime;
  }

  private computeRegime(
    input: ContextualGameSimulationInput,
    sim: ContextualGameSimulationSummary
  ): MarkovRegimeState {
    const sharpnessIndicators = this.analyzeSharpness(input, sim);
    const squarenessIndicators = this.analyzeSquareness(input, sim);
    const conflictIndicators = this.analyzeConflict(input, sim);

    const sharpnessScore = this.calculateScore(sharpnessIndicators);
    const squarenessScore = this.calculateScore(squarenessIndicators);
    const conflictScore = this.calculateScore(conflictIndicators);

    // Classification logic
    let classification: MarkovRegimeClassification;
    let confidence: number;
    const reasoning: string[] = [];

    if (conflictScore > 65) {
      classification = "CONFLICT";
      confidence = Math.min(conflictScore / 100, 1);
      reasoning.push(
        `High market disagreement (conflict score: ${conflictScore})`,
        `Bookmakers pricing differently (divergence: ${conflictIndicators.bookmakerDivergence.toFixed(1)})`,
        `Rating uncertainty present (${(conflictIndicators.ratingUnconfidence * 100).toFixed(1)}%)`
      );
    } else if (sharpnessScore > squarenessScore + 10) {
      classification = "SHARP";
      confidence = Math.min((sharpnessScore - squarenessScore) / 100, 1);
      reasoning.push(
        `Professional money evident (sharpness: ${sharpnessScore})`,
        `Consensus lines tight (width: ${sharpnessIndicators.consensusWidth.toFixed(2)})`,
        `Fast line movement (velocity: ${sharpnessIndicators.lineMovementVelocity.toFixed(2)})`
      );
    } else if (squarenessScore > sharpnessScore + 10) {
      classification = "SQUARE";
      confidence = Math.min((squarenessScore - sharpnessScore) / 100, 1);
      reasoning.push(
        `Public money dominant (squareness: ${squarenessScore})`,
        `Sticky lines (${sharpnessIndicators.linestickyness.toFixed(2)})`,
        `Mass market patterns present (${squarenessIndicators.massMarketPatterns.toFixed(2)})`
      );
    } else {
      // Indifferent regime - treat as slight square bias
      classification = "SQUARE";
      confidence = Math.min((squarenessScore + sharpnessScore) / 200, 0.8);
      reasoning.push(
        `Mixed regime (sharp: ${sharpnessScore}, square: ${squarenessScore})`,
        `Insufficient clear signals for sharp classification`
      );
    }

    return {
      classification,
      confidence: Math.max(confidence, 0),
      reasoning,
      sharpnessScore: Math.round(sharpnessScore),
      conflictScore: Math.round(conflictScore),
      sharpnessIndicators,
      squarenessIndicators,
      conflictIndicators,
      metadata: {
        eventsInWindow: 0, // would be filled from historical data
        windowLengthDays: this.WINDOW_SIZE_DAYS,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  private analyzeSharpness(
    input: ContextualGameSimulationInput,
    sim: ContextualGameSimulationSummary
  ): MarkovRegimeState["sharpnessIndicators"] {
    // Consensus width: how tight are the consensus lines across books?
    // Proxy: if market anchor spread is very narrow, sharp money tightening it
    const spreadWidth = Math.abs(
      (input.marketAnchor?.spreadHome ?? 0) - (sim.projectedSpread ?? 0)
    );
    const consensusWidth = Math.max(0, 3 - spreadWidth); // tight lines = high value

    // Line movement velocity: sharp money creates fast line movement
    // Proxy: model confidence (if model is very certain, sharp money moved lines to it)
    const modelConfidence = sim.confidence ?? 0.5;
    const lineMovementVelocity = modelConfidence > 0.7 ? 1.5 : modelConfidence < 0.4 ? 0.3 : 0.8;

    // Bookmaker disagreement (lower = sharper, more consensus)
    // Proxy: use ratings std dev as proxy for market disagreement
    const homeRating = input.home.ratings?.expectedValue ?? 50;
    const awayRating = input.away.ratings?.expectedValue ?? 50;
    const ratingDiff = Math.abs(homeRating - awayRating);
    const bookmakerDisagreement = Math.max(0, 15 - ratingDiff) / 15; // normalized 0-1

    // Prior deviation: sharp markets should align with ratings priors
    const priorDeviation = Math.abs(
      (input.ratingsPrior?.expectedHomeWinProbability ?? 0.5) -
        (sim.homeWinProbability ?? 0.5)
    );

    return {
      consensusWidth: Math.min(consensusWidth, 3),
      lineMovementVelocity,
      bookmakerDisagreement: bookmakerDisagreement * 10,
      priorDeviation: priorDeviation * 10
    };
  }

  private analyzeSquareness(
    input: ContextualGameSimulationInput,
    sim: ContextualGameSimulationSummary
  ): MarkovRegimeState["squarenessIndicators"] {
    // Public pricing pattern: betting on round numbers, key numbers
    // Proxy: if market anchor is at typical round spread/total (.5, .0 endings)
    const spreadRemainder = Math.abs((input.marketAnchor?.spreadHome ?? 0) % 1);
    const totalRemainder = Math.abs((input.marketAnchor?.total ?? 0) % 1);
    const publicPricingPattern =
      (spreadRemainder < 0.2 || spreadRemainder > 0.8 ? 1 : 0.3) *
      (totalRemainder < 0.2 || totalRemainder > 0.8 ? 1 : 0.3);

    // Linestickiness: lines not moving = square market
    // Proxy: if model is uncertain, lines aren't moving (public setting prices)
    const modelUncertainty = 1 - (sim.confidence ?? 0.5);
    const linestickyness = modelUncertainty > 0.5 ? 8 : modelUncertainty > 0.3 ? 4 : 2;

    // Mass market patterns: moneyline/spread correlation
    // Square markets show predictable correlations (favorites favored on both lines)
    const mlFavorite = (sim.homeWinProbability ?? 0.5) > 0.55;
    const spreadFavorite = (input.marketAnchor?.spreadHome ?? 0) < -1;
    const massMarketPatterns = mlFavorite === spreadFavorite ? 8 : 3;

    return {
      publicPricingPattern: publicPricingPattern * 10,
      linestickyness,
      massMarketPatterns
    };
  }

  private analyzeConflict(
    input: ContextualGameSimulationInput,
    sim: ContextualGameSimulationSummary
  ): MarkovRegimeState["conflictIndicators"] {
    // Market vs model disagreement
    const marketImpliedML = this.getMarketImpliedWinProb(input);
    const modelML = sim.homeWinProbability ?? 0.5;
    const marketOddsDeviation = Math.abs(marketImpliedML - modelML) * 10;

    // Bookmaker divergence: different books price differently
    // Proxy: use rating uncertainty as proxy
    const homeUncertainty = input.home.ratings?.uncertainty ?? 0.1;
    const awayUncertainty = input.away.ratings?.uncertainty ?? 0.1;
    const bookmakerDivergence = (homeUncertainty + awayUncertainty) * 5;

    // Rating unconfidence: low confidence in team ratings = conflicted market
    const ratingConfidence = sim.confidence ?? 0.5;
    const ratingUnconfidence = 1 - ratingConfidence;

    return {
      marketOddsDeviation: Math.min(marketOddsDeviation, 10),
      bookmakerDivergence: Math.min(bookmakerDivergence, 10),
      ratingUnconfidence: ratingUnconfidence
    };
  }

  private calculateScore(indicators: Record<string, number>): number {
    const values = Object.values(indicators);
    return values.length ? (values.reduce((a, b) => a + b, 0) / values.length) * 10 : 50;
  }

  private getMarketImpliedWinProb(input: ContextualGameSimulationInput): number {
    // Convert spread to implied win probability (simplified)
    const spread = input.marketAnchor?.spreadHome ?? 0;
    // Rough: 3-point spread ≈ 60% implied win prob
    return 0.5 + spread / 6 / 100;
  }

  private buildCacheKey(input: ContextualGameSimulationInput): string {
    return `${input.leagueKey}:${input.home.teamName}:${input.away.teamName}:${Date.now() / (60 * 60 * 1000) | 0}`;
  }
}

export const markovRegimeClassifier = new MarkovRegimeClassifier();
