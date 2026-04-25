import assert from "node:assert/strict";
import { simulateContextualGame } from "@/services/simulation/contextual-game-sim";
import { markovRegimeClassifier } from "@/services/simulation/markov-regime-classifier";
import { enhanceSimulationWithRegime } from "@/services/simulation/advanced-mc-engine";
import { omegaSportsVarianceAnalyzer } from "@/services/simulation/omega-sports-variance-analyzer";

async function runTests() {
  console.log("=== Monte Carlo Simulation Engine Integration Tests ===\n");

  // Test 1: Baseline simulation runs and produces valid output
  console.log("Test 1: Baseline simulation");
  const baselineInput = {
    leagueKey: "NBA",
    home: {
      teamName: "Lakers",
      offense: 110,
      defense: 105,
      pace: 99
    },
    away: {
      teamName: "Celtics",
      offense: 115,
      defense: 103,
      pace: 99
    },
    marketAnchor: {
      spreadHome: -3,
      total: 218
    },
    samples: 500,
    seed: 12345
  };

  const baseline = simulateContextualGame(baselineInput);

  console.log(`  ✓ Home score: ${baseline.projectedHomeScore.toFixed(1)}`);
  console.log(`  ✓ Away score: ${baseline.projectedAwayScore.toFixed(1)}`);
  console.log(`  ✓ Total: ${baseline.projectedTotal.toFixed(1)}`);
  console.log(`  ✓ Spread: ${baseline.projectedSpreadHome.toFixed(1)}`);
  console.log(`  ✓ Win Prob (Home): ${(baseline.winProbHome * 100).toFixed(1)}%`);

  assert.ok(baseline.projectedHomeScore > 0, "Home score should be positive");
  assert.ok(baseline.projectedAwayScore > 0, "Away score should be positive");
  assert.ok(baseline.winProbHome > 0 && baseline.winProbHome < 1, "Win prob should be 0-1");
  assert.ok(
    Math.abs(baseline.winProbHome + baseline.winProbAway - 1) < 0.01,
    "Win probs should sum to ~1"
  );
  console.log("✅ PASS: Baseline simulation valid\n");

  // Test 2: Markov regime classification
  console.log("Test 2: Market regime classification");
  const regimeInput = {
    leagueKey: "NBA",
    home: {
      teamName: "Lakers",
      offense: 110,
      defense: 105,
      pace: 99,
      ratings: {
        confidence: 0.85,
        overall: 110,
        offense: 112,
        defense: 103,
        tempo: 99,
        volatility: 0.05,
        playerCount: 12,
        notes: [],
        source: "glicko" as const
      },
      style: null,
      coach: null,
      intangibles: null
    },
    away: {
      teamName: "Celtics",
      offense: 115,
      defense: 103,
      pace: 99,
      ratings: {
        confidence: 0.88,
        overall: 115,
        offense: 116,
        defense: 104,
        tempo: 100,
        volatility: 0.04,
        playerCount: 12,
        notes: [],
        source: "glicko" as const
      },
      style: null,
      coach: null,
      intangibles: null
    },
    ratingsPrior: {
      source: "glicko" as const,
      blendWeight: 0.5,
      confidence: 0.85,
      home: {
        confidence: 0.85,
        overall: 110,
        offense: 112,
        defense: 103,
        tempo: 99,
        volatility: 0.05,
        playerCount: 12,
        notes: [],
        source: "glicko" as const
      },
      away: {
        confidence: 0.88,
        overall: 115,
        offense: 116,
        defense: 104,
        tempo: 100,
        volatility: 0.04,
        playerCount: 12,
        notes: [],
        source: "glicko" as const
      },
      deltaOverall: 5,
      notes: []
    },
    marketAnchor: {
      spreadHome: -3,
      total: 218
    },
    samples: 500,
    seed: 12345
  };

  const baselineForRegime = simulateContextualGame(regimeInput as any);
  const regime = await markovRegimeClassifier.classifyRegime(regimeInput as any, baselineForRegime);

  console.log(`  ✓ Classification: ${regime.classification}`);
  console.log(`  ✓ Confidence: ${(regime.confidence * 100).toFixed(1)}%`);
  console.log(`  ✓ Reasoning: ${regime.reasoning[0]}`);
  console.log(`  ✓ Sharpness Score: ${regime.sharpnessScore}`);
  console.log(`  ✓ Conflict Score: ${regime.conflictScore}`);

  assert.ok(["SHARP", "SQUARE", "CONFLICT"].includes(regime.classification), "Invalid classification");
  assert.ok(regime.confidence >= 0 && regime.confidence <= 1, "Confidence out of range");
  assert.ok(regime.reasoning.length > 0, "Missing reasoning");
  console.log("✅ PASS: Regime classification works\n");

  // Test 3: Variance enhancement
  console.log("Test 3: Regime-aware variance enhancement");
  const enhanced = await enhanceSimulationWithRegime(baselineForRegime, regimeInput as any, regime, false);

  console.log(`  ✓ Baseline std dev: ${baselineForRegime.distribution.totalStdDev.toFixed(2)}`);
  console.log(`  ✓ Enhanced std dev: ${enhanced.distribution.totalStdDev.toFixed(2)}`);
  console.log(`  ✓ Variance adjustment: ${enhanced.adjustments.varianceAdjustment.toFixed(2)}x`);
  console.log(`  ✓ Adjustment reason: ${enhanced.adjustments.reason.substring(0, 50)}...`);

  assert.ok(enhanced.regime, "Missing regime info");
  assert.ok(enhanced.adjustments.varianceAdjustment > 0, "Invalid variance adjustment");
  console.log("✅ PASS: Enhancement applied successfully\n");

  // Test 4: Variance pattern tracking
  console.log("Test 4: League variance pattern learning");
  const analyzer = omegaSportsVarianceAnalyzer;

  analyzer.recordSimulationResult({
    league: "NBA",
    predictedTotal: 220,
    predictedSpread: -3,
    projectedHomeScore: 112,
    projectedAwayScore: 108,
    actualHomeScore: 115,
    actualAwayScore: 105,
    simulationStdDev: 12.5,
    regime: "SHARP"
  });

  analyzer.recordSimulationResult({
    league: "NBA",
    predictedTotal: 215,
    predictedSpread: 2.5,
    projectedHomeScore: 106,
    projectedAwayScore: 109,
    actualHomeScore: 108,
    actualAwayScore: 110,
    simulationStdDev: 12.5,
    regime: "SQUARE"
  });

  const summary = analyzer.getSummary();
  const confidence = analyzer.getPatternConfidence("NBA");

  console.log(`  ✓ Total samples: ${summary.totalSamplesRecorded}`);
  console.log(`  ✓ Leagues tracked: ${summary.leaguesTracked.join(", ")}`);
  console.log(`  ✓ Average accuracy: ${(summary.avgAccuracy * 100).toFixed(1)}%`);
  console.log(`  ✓ NBA confidence: ${(confidence * 100).toFixed(1)}%`);

  assert.ok(summary.totalSamplesRecorded >= 2, "Should have recorded samples");
  assert.ok(summary.leaguesTracked.includes("NBA"), "NBA should be tracked");
  console.log("✅ PASS: Variance patterns learning\n");

  // Test 5: Full pipeline integration
  console.log("Test 5: Full simulation pipeline");
  const pipeline1 = simulateContextualGame(regimeInput as any);
  const pipeline2 = await markovRegimeClassifier.classifyRegime(regimeInput as any, pipeline1);
  const pipeline3 = await enhanceSimulationWithRegime(pipeline1, regimeInput as any, pipeline2, false);

  console.log(`  ✓ Baseline home win prob: ${(pipeline1.winProbHome * 100).toFixed(1)}%`);
  console.log(`  ✓ Enhanced home win prob: ${(pipeline3.winProbHome * 100).toFixed(1)}%`);
  console.log(`  ✓ Regime detected: ${pipeline2.classification}`);
  console.log(`  ✓ Variance factor: ${pipeline3.adjustments.varianceAdjustment.toFixed(2)}x`);

  assert.ok(pipeline3.projectedHomeScore > 0, "Pipeline should produce valid output");
  console.log("✅ PASS: Full pipeline executed successfully\n");

  console.log("=== All Integration Tests Passed ===");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
