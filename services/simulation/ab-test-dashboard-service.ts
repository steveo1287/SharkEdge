/**
 * A/B Test Dashboard Service
 *
 * Provides aggregated A/B test metrics and performance analytics
 * for the regime-aware-variance-v1 test across leagues and markets.
 */

import { prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";

export type ABTestMetrics = {
  testName: string;
  totalTests: number;
  resolvedTests: number;
  pendingTests: number;
  treatmentWinRate: number;
  controlAvgError: number;
  treatmentAvgError: number;
  improvementPct: number;
  recommendedAction: string;
  confidenceLevel: string;
};

export type ABTestLeagueMetrics = {
  leagueKey: LeagueKey;
  totalTests: number;
  resolvedTests: number;
  treatmentWinRate: number;
  avgControlError: number;
  avgTreatmentError: number;
  regimeBreakdown: {
    regime: string;
    tests: number;
    treatmentWins: number;
    winRate: number;
  }[];
};

export type ABTestDashboard = {
  generatedAt: string;
  overall: ABTestMetrics;
  byLeague: ABTestLeagueMetrics[];
  recentTests: {
    eventId: string;
    testName: string;
    variant: "control" | "treatment";
    regime: string | null;
    controlError: number | null;
    treatmentError: number | null;
    winner: "control" | "treatment" | "tie" | "pending";
    resolvedAt: string | null;
  }[];
  alerts: {
    type: "low_sample" | "inconclusive" | "high_variance" | "data_quality";
    message: string;
    severity: "info" | "warning" | "critical";
  }[];
};

type VerdictAbTestRow = {
  id: string;
  eventId: string;
  variant: string;
  metadataJson: unknown;
  controlVerdict: unknown;
  treatmentVerdict: unknown;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  verdictAccuracy: number | null;
  totalAccuracy: number | null;
  winnerVariant: string | null;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
};

function getVerdictAbTestDelegate() {
  return (prisma as unknown as { verdictAbTest?: { findMany: (args: unknown) => Promise<VerdictAbTestRow[]> } })
    .verdictAbTest;
}

export async function getABTestDashboard(): Promise<ABTestDashboard> {
  try {
    const testName = "regime-aware-variance-v1";
    const delegate = getVerdictAbTestDelegate();
    if (!delegate) {
      throw new Error("verdictAbTest delegate is unavailable in this runtime.");
    }

    const allTests = await delegate.findMany({
      where: { testName },
      select: {
        id: true,
        eventId: true,
        variant: true,
        metadataJson: true,
        controlVerdict: true,
        treatmentVerdict: true,
        actualHomeScore: true,
        actualAwayScore: true,
        verdictAccuracy: true,
        totalAccuracy: true,
        winnerVariant: true,
        resolved: true,
        resolvedAt: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" },
      take: 1000
    });

    const resolved = allTests.filter((t: VerdictAbTestRow) => t.resolved);
    const pending = allTests.filter((t: VerdictAbTestRow) => !t.resolved);

    const controlTests = resolved.filter((t: VerdictAbTestRow) => t.variant === "control");
    const treatmentTests = resolved.filter((t: VerdictAbTestRow) => t.variant === "treatment");

    const controlErrors = controlTests
      .map((t: VerdictAbTestRow) => t.totalAccuracy ?? 0)
      .filter((e: number) => typeof e === "number");
    const treatmentErrors = treatmentTests
      .map((t: VerdictAbTestRow) => t.totalAccuracy ?? 0)
      .filter((e: number) => typeof e === "number");

    const controlAvgError =
      controlErrors.length > 0
        ? controlErrors.reduce((a: number, b: number) => a + b, 0) / controlErrors.length
        : 0;
    const treatmentAvgError =
      treatmentErrors.length > 0
        ? treatmentErrors.reduce((a: number, b: number) => a + b, 0) / treatmentErrors.length
        : 0;

    const treatmentWins = resolved.filter((t: VerdictAbTestRow) => t.winnerVariant === "treatment").length;
    const treatmentWinRate = resolved.length > 0 ? treatmentWins / resolved.length : 0;

    const improvementPct =
      controlAvgError > 0
        ? ((controlAvgError - treatmentAvgError) / controlAvgError) * 100
        : 0;

    let recommendedAction = "CONTINUE_TEST";
    let confidenceLevel = "INSUFFICIENT";

    if (resolved.length >= 500) {
      if (treatmentWinRate > 0.55) {
        recommendedAction = "PROMOTE_TREATMENT";
        confidenceLevel = "HIGH";
      } else if (treatmentWinRate < 0.45) {
        recommendedAction = "ROLLBACK_TREATMENT";
        confidenceLevel = "HIGH";
      } else {
        recommendedAction = "INCONCLUSIVE_RETEST";
        confidenceLevel = "MEDIUM";
      }
    } else if (resolved.length >= 100) {
      confidenceLevel = "MEDIUM";
    }

    const overallMetrics: ABTestMetrics = {
      testName,
      totalTests: allTests.length,
      resolvedTests: resolved.length,
      pendingTests: pending.length,
      treatmentWinRate: Math.round(treatmentWinRate * 100) / 100,
      controlAvgError: Math.round(controlAvgError * 1000) / 1000,
      treatmentAvgError: Math.round(treatmentAvgError * 1000) / 1000,
      improvementPct: Math.round(improvementPct * 10) / 10,
      recommendedAction,
      confidenceLevel
    };

    const leagueMetricsMap = new Map<LeagueKey, ABTestLeagueMetrics>();

    for (const test of resolved) {
      const metadata = (test.metadataJson ?? {}) as Record<string, unknown>;
      const regime = metadata?.regime ?? "UNKNOWN";
      const eventId = test.eventId;

      const leagueKey = (eventId.split(":")[0]?.toUpperCase() || "UNKNOWN") as LeagueKey;

      if (!leagueMetricsMap.has(leagueKey)) {
        leagueMetricsMap.set(leagueKey, {
          leagueKey,
          totalTests: 0,
          resolvedTests: 0,
          treatmentWinRate: 0,
          avgControlError: 0,
          avgTreatmentError: 0,
          regimeBreakdown: []
        });
      }

      const metrics = leagueMetricsMap.get(leagueKey)!;
      metrics.totalTests++;
      metrics.resolvedTests++;

      if (test.variant === "treatment" && test.winnerVariant === "treatment") {
        // Count towards treatment wins
      }
    }

    const byLeague = Array.from(leagueMetricsMap.values()).sort(
      (a, b) => b.resolvedTests - a.resolvedTests
    );

    const recentTests = allTests.slice(0, 50).map((t: VerdictAbTestRow) => ({
      eventId: t.eventId,
      testName,
      variant: t.variant as "control" | "treatment",
      regime: (((t.metadataJson as Record<string, unknown> | null)?.regime as string | undefined) ?? null) as string | null,
      controlError: t.controlVerdict && t.actualHomeScore !== null ? (t.totalAccuracy as number) : null,
      treatmentError: t.treatmentVerdict && t.actualHomeScore !== null ? (t.totalAccuracy as number) : null,
      winner: (!t.resolved ? "pending" : t.verdictAccuracy === 0.5 ? "tie" : (t.winnerVariant as "control" | "treatment")) as "control" | "treatment" | "pending" | "tie",
      resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null
    }));

    const alerts: ABTestDashboard["alerts"] = [];

    if (allTests.length < 100) {
      alerts.push({
        type: "low_sample",
        message: `Only ${allTests.length} events in test. Target: 1000.`,
        severity: "info"
      });
    }

    if (resolved.length >= 100 && treatmentWinRate > 0.45 && treatmentWinRate < 0.55) {
      alerts.push({
        type: "inconclusive",
        message: `Treatment win rate at ${(treatmentWinRate * 100).toFixed(1)}%. Results inconclusive at this sample size.`,
        severity: "warning"
      });
    }

    if (resolved.length > 50 && Math.abs(improvementPct) > 25) {
      alerts.push({
        type: "high_variance",
        message: `Large improvement variance detected (${improvementPct.toFixed(1)}%). Monitor for stability.`,
        severity: treatmentWinRate > 0.55 ? "info" : "warning"
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      overall: overallMetrics,
      byLeague,
      recentTests,
      alerts
    };
  } catch (error) {
    console.error("[ABTestDashboard]", error);
    return {
      generatedAt: new Date().toISOString(),
      overall: {
        testName: "regime-aware-variance-v1",
        totalTests: 0,
        resolvedTests: 0,
        pendingTests: 0,
        treatmentWinRate: 0,
        controlAvgError: 0,
        treatmentAvgError: 0,
        improvementPct: 0,
        recommendedAction: "ERROR",
        confidenceLevel: "INSUFFICIENT"
      },
      byLeague: [],
      recentTests: [],
      alerts: [
        {
          type: "data_quality",
          message: "Failed to load A/B test metrics. Check database connection.",
          severity: "critical"
        }
      ]
    };
  }
}
