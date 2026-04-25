import { describe, it, expect } from "vitest";
import { simulateContextualGame } from "../contextual-game-sim";
import { markovRegimeClassifier } from "../markov-regime-classifier";
import { enhanceSimulationWithRegime } from "../advanced-mc-engine";
import { omegaSportsVarianceAnalyzer } from "../omega-sports-variance-analyzer";

describe("Monte Carlo Simulation Engine", () => {
  it("should run baseline simulation", () => {
    const input = {
      leagueKey: "NBA",
      home: {
        teamName: "Lakers",
        offense: 110,
        defense: 105,
        pace: 99,
        ratings: null,
        style: null,
        coach: null,
        intangibles: null
      },
      away: {
        teamName: "Celtics",
        offense: 115,
        defense: 103,
        pace: 99,
        ratings: null,
        style: null,
        coach: null,
        intangibles: null
      },
      ratingsPrior: null,
      marketAnchor: {
        spreadHome: -3,
        total: 218
      },
      samples: 100,
      seed: 12345
    };

    const baseline = simulateContextualGame(input);

    expect(baseline).toBeDefined();
    expect(baseline.projectedHomeScore).toBeGreaterThan(0);
    expect(baseline.projectedAwayScore).toBeGreaterThan(0);
    expect(baseline.winProbHome).toBeGreaterThan(0);
    expect(baseline.winProbHome).toBeLessThan(1);
  });

  it("should classify market regimes", async () => {
    const input = {
      leagueKey: "NBA",
      home: {
        teamName: "Lakers",
        offense: 110,
        defense: 105,
        pace: 99,
        ratings: { confidence: 0.8, overall: 110, offense: 112, defense: 103, tempo: 99, volatility: 0.05, playerCount: 12, notes: [], source: "glicko" as const },
        style: null,
        coach: null,
        intangibles: null
      },
      away: {
        teamName: "Celtics",
        offense: 115,
        defense: 103,
        pace: 99,
        ratings: { confidence: 0.85, overall: 115, offense: 116, defense: 104, tempo: 100, volatility: 0.04, playerCount: 12, notes: [], source: "glicko" as const },
        style: null,
        coach: null,
        intangibles: null
      },
      ratingsPrior: {
        source: "glicko" as const,
        blendWeight: 0.5,
        confidence: 0.8,
        home: { confidence: 0.8, overall: 110, offense: 112, defense: 103, tempo: 99, volatility: 0.05, playerCount: 12, notes: [], source: "glicko" as const },
        away: { confidence: 0.85, overall: 115, offense: 116, defense: 104, tempo: 100, volatility: 0.04, playerCount: 12, notes: [], source: "glicko" as const },
        deltaOverall: 5,
        notes: []
      },
      marketAnchor: {
        spreadHome: -3,
        total: 218
      },
      samples: 100,
      seed: 12345
    };

    const baseline = simulateContextualGame(input);
    const regime = await markovRegimeClassifier.classifyRegime(input, baseline);

    expect(regime).toBeDefined();
    expect(["SHARP", "SQUARE", "CONFLICT"]).toContain(regime.classification);
    expect(regime.confidence).toBeGreaterThan(0);
    expect(regime.confidence).toBeLessThanOrEqual(1);
    expect(regime.reasoning.length).toBeGreaterThan(0);
  });

  it("should enhance simulation with regime adjustments", async () => {
    const input = {
      leagueKey: "NBA",
      home: {
        teamName: "Lakers",
        offense: 110,
        defense: 105,
        pace: 99,
        ratings: { confidence: 0.8, overall: 110, offense: 112, defense: 103, tempo: 99, volatility: 0.05, playerCount: 12, notes: [], source: "glicko" as const },
        style: null,
        coach: null,
        intangibles: null
      },
      away: {
        teamName: "Celtics",
        offense: 115,
        defense: 103,
        pace: 99,
        ratings: { confidence: 0.85, overall: 115, offense: 116, defense: 104, tempo: 100, volatility: 0.04, playerCount: 12, notes: [], source: "glicko" as const },
        style: null,
        coach: null,
        intangibles: null
      },
      ratingsPrior: {
        source: "glicko" as const,
        blendWeight: 0.5,
        confidence: 0.8,
        home: { confidence: 0.8, overall: 110, offense: 112, defense: 103, tempo: 99, volatility: 0.05, playerCount: 12, notes: [], source: "glicko" as const },
        away: { confidence: 0.85, overall: 115, offense: 116, defense: 104, tempo: 100, volatility: 0.04, playerCount: 12, notes: [], source: "glicko" as const },
        deltaOverall: 5,
        notes: []
      },
      marketAnchor: {
        spreadHome: -3,
        total: 218
      },
      samples: 100,
      seed: 12345
    };

    const baseline = simulateContextualGame(input);
    const regime = await markovRegimeClassifier.classifyRegime(input, baseline);
    const enhanced = await enhanceSimulationWithRegime(baseline, input, regime, false);

    expect(enhanced).toBeDefined();
    expect(enhanced.regime).toBeDefined();
    expect(enhanced.regime.classification).toBe(regime.classification);
    expect(enhanced.adjustments).toBeDefined();
    expect(enhanced.adjustments.varianceAdjustment).toBeGreaterThan(0);
  });

  it("should track variance patterns", () => {
    const analyzer = omegaSportsVarianceAnalyzer;

    analyzer.recordSimulationResult({
      league: "NBA",
      predictedTotal: 220,
      predictedSpread: -3,
      projectedHomeScore: 112,
      projectedAwayScore: 108,
      actualHomeScore: 115,
      actualAwayScore: 105,
      simulationStdDev: 12,
      regime: "SHARP"
    });

    const summary = analyzer.getSummary();
    expect(summary.totalSamplesRecorded).toBeGreaterThan(0);
    expect(summary.leaguesTracked).toContain("NBA");
  });
});
