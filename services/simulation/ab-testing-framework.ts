/**
 * A/B Testing Framework for Simulation Engine Verdicts
 *
 * Manages feature flags, variant selection, and outcome tracking
 * for testing enhanced simulations against baseline verdicts.
 */

import { prisma } from "@/lib/db/prisma";
import type { ContextualGameSimulationInput, ContextualGameSimulationSummary } from "./contextual-game-sim";
import type { MarkovRegimeState } from "./markov-regime-classifier";
import { enhanceSimulationWithRegime } from "./advanced-mc-engine";
import { mcWorkerPool } from "./mc-worker-pool";

export type ABTestVariant = "control" | "treatment";

export type ABTestConfig = {
  testName: string;
  enabled: boolean;
  trafficAllocation: {
    control: number; // 0-100
    treatment: number; // 0-100
  };
  maxDuration?: number; // days
  targetSampleSize?: number;
};

export type ABTestResult = {
  eventId: string;
  testName: string;
  variant: ABTestVariant;
  verdict: unknown; // Serialized verdict object
  confidence: number;
};

/**
 * Manages A/B tests for simulation engine improvements
 */
export class ABTestingFramework {
  private configs = new Map<string, ABTestConfig>();
  private readonly trafficHashSalt = "simulation-ab-test";

  constructor(initialConfigs?: ABTestConfig[]) {
    if (initialConfigs) {
      for (const config of initialConfigs) {
        this.registerTest(config);
      }
    }
  }

  /**
   * Register a new A/B test configuration
   */
  registerTest(config: ABTestConfig): void {
    if (!this.isValidConfig(config)) {
      throw new Error("Invalid A/B test configuration");
    }
    this.configs.set(config.testName, config);
  }

  /**
   * Determine variant for an event using deterministic hashing
   */
  assignVariant(testName: string, eventId: string): ABTestVariant | null {
    const config = this.configs.get(testName);
    if (!config || !config.enabled) {
      return null;
    }

    // Use deterministic hash to assign variant
    const hash = this.hashEvent(eventId);
    const normalized = hash % 100;

    if (normalized < config.trafficAllocation.control) {
      return "control";
    } else if (normalized < config.trafficAllocation.control + config.trafficAllocation.treatment) {
      return "treatment";
    }

    return null;
  }

  /**
   * Get verdict with appropriate test variant
   */
  async getTestVerdict(
    eventId: string,
    testName: string,
    controlVerdict: {
      projectedHomeScore: number;
      projectedAwayScore: number;
      projectedSpread: number;
      winProbHome: number;
    },
    input?: ContextualGameSimulationInput,
    baselineSimulation?: ContextualGameSimulationSummary,
    regime?: MarkovRegimeState
  ): Promise<{
    variant: ABTestVariant;
    verdict: unknown;
    confidence: number;
    isTest: boolean;
  }> {
    const variant = this.assignVariant(testName, eventId);

    // If not in test or explicitly control, return baseline
    if (variant !== "treatment") {
      return {
        variant: "control",
        verdict: controlVerdict,
        confidence: 0.5,
        isTest: false
      };
    }

    // Treatment variant: use enhanced simulation if available
    if (!input || !baselineSimulation || !regime) {
      return {
        variant: "control",
        verdict: controlVerdict,
        confidence: 0.5,
        isTest: false
      };
    }

    try {
      const enhanced = await enhanceSimulationWithRegime(baselineSimulation, input, regime, false);

      // Store test result for analysis
      await this.recordTestResult({
        eventId,
        testName,
        variant: "treatment",
        controlVerdict,
        controlConfidence: 0.5,
        treatmentVerdict: {
          projectedHomeScore: enhanced.projectedHomeScore,
          projectedAwayScore: enhanced.projectedAwayScore,
          projectedSpread: enhanced.projectedSpreadHome,
          winProbHome: enhanced.winProbHome
        },
        treatmentConfidence: regime.confidence,
        regime: regime.classification
      });

      return {
        variant: "treatment",
        verdict: {
          projectedHomeScore: enhanced.projectedHomeScore,
          projectedAwayScore: enhanced.projectedAwayScore,
          projectedSpread: enhanced.projectedSpreadHome,
          winProbHome: enhanced.winProbHome,
          regimeAdjusted: true,
          regime: regime.classification,
          varianceAdjustment: enhanced.adjustments.varianceAdjustment
        },
        confidence: regime.confidence,
        isTest: true
      };
    } catch (error) {
      // Fallback to control on error
      console.error(`Failed to compute treatment verdict for event ${eventId}:`, error);
      return {
        variant: "control",
        verdict: controlVerdict,
        confidence: 0.5,
        isTest: false
      };
    }
  }

  /**
   * Record test result in database
   */
  private async recordTestResult(data: {
    eventId: string;
    testName: string;
    variant: ABTestVariant;
    controlVerdict: unknown;
    controlConfidence: number;
    treatmentVerdict: unknown;
    treatmentConfidence: number;
    regime: string;
  }): Promise<void> {
    try {
      await prisma.verdictAbTest.create({
        data: {
          eventId: data.eventId,
          testName: data.testName,
          variant: data.variant,
          controlVerdict: data.controlVerdict,
          controlConfidence: data.controlConfidence,
          treatmentVerdict: data.treatmentVerdict,
          treatmentConfidence: data.treatmentConfidence,
          metadataJson: {
            regime: data.regime
          }
        }
      });
    } catch (error) {
      // Non-fatal: test can continue if recording fails
      console.error("Failed to record test result:", error);
    }
  }

  /**
   * Record actual game outcome for test resolution
   */
  async recordOutcome(
    eventId: string,
    homeScore: number,
    awayScore: number
  ): Promise<void> {
    try {
      // Find all unresolved tests for this event
      const tests = await prisma.verdictAbTest.findMany({
        where: { eventId, resolved: false }
      });

      for (const test of tests) {
        const control = test.controlVerdict as any;
        const treatment = test.treatmentVerdict as any;

        // Calculate accuracy metrics
        const actualTotal = homeScore + awayScore;
        const actualSpread = homeScore - awayScore;

        const controlTotalError = Math.abs(control.projectedHomeScore + control.projectedAwayScore - actualTotal);
        const treatmentTotalError = Math.abs(
          treatment.projectedHomeScore + treatment.projectedAwayScore - actualTotal
        );

        const controlSpreadError = Math.abs(control.projectedSpread - actualSpread);
        const treatmentSpreadError = Math.abs(treatment.projectedSpread - actualSpread);

        // Update test with outcomes
        await prisma.verdictAbTest.update({
          where: { id: test.id },
          data: {
            actualHomeScore: homeScore,
            actualAwayScore: awayScore,
            verdictAccuracy:
              controlTotalError < treatmentTotalError ? 0.5 : treatmentTotalError < controlTotalError ? 1.0 : 0.75,
            totalAccuracy: treatmentTotalError,
            spreadAccuracy: treatmentSpreadError,
            resolved: true,
            resolvedAt: new Date(),
            winnerVariant:
              treatmentTotalError < controlTotalError && treatmentSpreadError < controlSpreadError ? "treatment" : "control"
          }
        });
      }
    } catch (error) {
      console.error("Failed to record outcome:", error);
    }
  }

  /**
   * Get test results summary
   */
  async getTestSummary(testName: string): Promise<{
    totalTests: number;
    resolved: number;
    treatmentWinRate: number;
    avgControlAccuracy: number;
    avgTreatmentAccuracy: number;
  }> {
    const tests = await prisma.verdictAbTest.findMany({
      where: { testName, resolved: true }
    });

    const treatmentWins = tests.filter((t) => t.winnerVariant === "treatment").length;
    const controlAccuracies = tests
      .filter((t) => t.variant === "control")
      .map((t) => t.totalAccuracy ?? 0);
    const treatmentAccuracies = tests
      .filter((t) => t.variant === "treatment")
      .map((t) => t.totalAccuracy ?? 0);

    return {
      totalTests: tests.length,
      resolved: tests.filter((t) => t.resolved).length,
      treatmentWinRate: tests.length ? treatmentWins / tests.length : 0,
      avgControlAccuracy:
        controlAccuracies.length
          ? controlAccuracies.reduce((a, b) => a + b) / controlAccuracies.length
          : 0,
      avgTreatmentAccuracy:
        treatmentAccuracies.length
          ? treatmentAccuracies.reduce((a, b) => a + b) / treatmentAccuracies.length
          : 0
    };
  }

  /**
   * Disable test for future events (but keep existing data)
   */
  disableTest(testName: string): void {
    const config = this.configs.get(testName);
    if (config) {
      config.enabled = false;
    }
  }

  private isValidConfig(config: ABTestConfig): boolean {
    const { trafficAllocation } = config;
    const total = trafficAllocation.control + trafficAllocation.treatment;
    return total <= 100 && trafficAllocation.control >= 0 && trafficAllocation.treatment >= 0;
  }

  private hashEvent(eventId: string): number {
    // Simple deterministic hash for variant assignment
    let hash = 0;
    const str = `${eventId}${this.trafficHashSalt}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Default A/B tests
const DEFAULT_AB_TESTS: ABTestConfig[] = [
  {
    testName: "regime-aware-variance-v1",
    enabled: true,
    trafficAllocation: {
      control: 50,
      treatment: 50
    },
    maxDuration: 30,
    targetSampleSize: 1000
  }
];

// Export singleton instance
export const abTestingFramework = new ABTestingFramework(DEFAULT_AB_TESTS);
