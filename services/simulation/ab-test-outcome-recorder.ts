/**
 * A/B Test Outcome Recorder
 *
 * Records actual game outcomes and calculates verdict accuracy
 * for the regime-aware-variance-v1 A/B test.
 */

import { abTestingFramework } from "./ab-testing-framework";

export type GameOutcome = {
  eventId: string;
  homeScore: number;
  awayScore: number;
  completedAt: string;
};

/**
 * Record actual game outcome and update test verdict accuracy
 */
export async function recordGameOutcome(outcome: GameOutcome): Promise<void> {
  try {
    await abTestingFramework.recordOutcome(
      outcome.eventId,
      outcome.homeScore,
      outcome.awayScore
    );
    console.log(`[ABTestOutcome] Recorded outcome for event ${outcome.eventId}: ${outcome.homeScore}-${outcome.awayScore}`);
  } catch (error) {
    console.error(
      "[ABTestOutcome] Failed to record outcome:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Get A/B test summary and metrics
 */
export async function getABTestMetrics(testName: string = "regime-aware-variance-v1"): Promise<{
  totalTests: number;
  resolved: number;
  treatmentWinRate: number;
  avgControlAccuracy: number;
  avgTreatmentAccuracy: number;
  recommendedAction: string;
}> {
  const summary = await abTestingFramework.getTestSummary(testName);

  let recommendedAction = "CONTINUE_TEST";
  if (summary.resolved >= 500) {
    if (summary.treatmentWinRate > 0.55) {
      recommendedAction = "PROMOTE_TREATMENT";
    } else if (summary.treatmentWinRate < 0.45) {
      recommendedAction = "ROLLBACK_TREATMENT";
    } else {
      recommendedAction = "INCONCLUSIVE_RETEST";
    }
  }

  return {
    ...summary,
    recommendedAction
  };
}
