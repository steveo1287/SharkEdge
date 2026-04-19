import {
  getPersistedSimCalibrationReports,
  getSimCalibrationHistoryReports,
  type LeagueCalibrationPayload
} from "@/services/simulation/sim-calibration-report-service";

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function filterWindow(reports: LeagueCalibrationPayload[], leagueKey: string, days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return reports.filter(
    (report) => report.leagueKey === leagueKey && new Date(report.generatedAt).getTime() >= cutoff
  );
}

export async function getSimQualityDashboard() {
  const [latestReports, historyReports] = await Promise.all([
    getPersistedSimCalibrationReports(),
    getSimCalibrationHistoryReports()
  ]);

  const leagues = latestReports.map((report) => {
    const history30 = filterWindow(historyReports, report.leagueKey, 30);
    const history90 = filterWindow(historyReports, report.leagueKey, 90);
    const oldest30 = history30[0] ?? report;
    const latest30 = history30[history30.length - 1] ?? report;

    return {
      leagueKey: report.leagueKey,
      latest: report,
      marketVsModel: {
        moneylineBrierDelta:
          report.metrics.marketBrier !== null
            ? round(report.metrics.modelBrier - report.metrics.marketBrier)
            : null,
        moneylineLogLossDelta:
          report.metrics.marketLogLoss !== null
            ? round(report.metrics.modelLogLoss - report.metrics.marketLogLoss)
            : null,
        modelBeatsMarket:
          report.metrics.marketBrier !== null
            ? report.metrics.modelBrier < report.metrics.marketBrier
            : null
      },
      rollingValidation: {
        last30dRuns: history30.length,
        last90dRuns: history90.length,
        avgModelBrier30d: average(history30.map((item) => item.metrics.modelBrier)),
        avgMarketBrier30d: average(
          history30
            .map((item) => item.metrics.marketBrier)
            .filter((value): value is number => typeof value === "number")
        ),
        avgModelLogLoss30d: average(history30.map((item) => item.metrics.modelLogLoss))
      },
      coefficientDrift: {
        neutralShrinkDelta30d: round(report.profile.neutralShrink - oldest30.profile.neutralShrink),
        marketBlendDelta30d: round(report.profile.marketBlend - oldest30.profile.marketBlend),
        spreadDeltaShrinkDelta30d: round(report.profile.spreadDeltaShrink - oldest30.profile.spreadDeltaShrink),
        totalDeltaShrinkDelta30d: round(report.profile.totalDeltaShrink - oldest30.profile.totalDeltaShrink),
        propProbShrinkDelta30d: round(report.profile.propProbShrink - oldest30.profile.propProbShrink)
      },
      suppressed: !report.guardrails.eligible
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      leagueCount: leagues.length,
      suppressedLeagueCount: leagues.filter((league) => league.suppressed).length,
      modelBeatsMarketCount: leagues.filter((league) => league.marketVsModel.modelBeatsMarket).length
    },
    suppressedAlerts: leagues
      .filter((league) => league.suppressed)
      .map((league) => ({
        leagueKey: league.leagueKey,
        warnings: league.latest.guardrails.warnings
      })),
    leagues
  };
}
