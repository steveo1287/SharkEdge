import { getDataSourceCoverageReport, type DataSourceCoverageGroup, type DataSourceCoverageReport, type DataSourceCoverageRow, type SourceCoverageStatus } from "@/services/ops/data-source-coverage";
import { getMarketArchiveHints } from "@/services/ops/market-archive-hints";

function scoreStatus(status: SourceCoverageStatus) {
  if (status === "LIVE") return 1;
  if (status === "CONFIGURED") return 0.75;
  if (status === "FALLBACK") return 0.45;
  if (status === "STALE") return 0.35;
  if (status === "PAID_REQUIRED") return 0.2;
  return 0;
}

function statusFromScore(score: number, criticalMissing: number) {
  if (criticalMissing > 0) return "BLOCKED" as const;
  if (score >= 85) return "ELITE" as const;
  if (score >= 70) return "USABLE" as const;
  if (score >= 45) return "WEAK" as const;
  return "BLOCKED" as const;
}

function updateRow(rows: DataSourceCoverageRow[], key: string, patch: Partial<DataSourceCoverageRow>) {
  return rows.map((row) => row.key === key ? { ...row, ...patch, configured: patch.status ? patch.status !== "MISSING" && patch.status !== "PAID_REQUIRED" : row.configured } : row);
}

function rebuildGroup(group: DataSourceCoverageGroup): DataSourceCoverageGroup {
  const possible = group.rows.reduce((sum, source) => sum + source.scoreImpact, 0);
  const actual = group.rows.reduce((sum, source) => sum + source.scoreImpact * scoreStatus(source.status), 0);
  const criticalMissing = group.rows.filter((source) => source.priority === "critical" && (source.status === "MISSING" || source.status === "PAID_REQUIRED" || source.status === "STALE")).length;
  const score = Math.round((actual / Math.max(1, possible)) * 100);
  return { ...group, score, criticalMissing, status: statusFromScore(score, criticalMissing) };
}

function rebuildReport(report: DataSourceCoverageReport, groups: DataSourceCoverageGroup[]): DataSourceCoverageReport {
  const rows = groups.flatMap((group) => group.rows);
  const possible = groups.reduce((sum, group) => sum + group.rows.reduce((inner, source) => inner + source.scoreImpact, 0), 0);
  const actual = rows.reduce((sum, source) => sum + source.scoreImpact * scoreStatus(source.status), 0);
  const criticalMissing = rows.filter((source) => source.priority === "critical" && (source.status === "MISSING" || source.status === "PAID_REQUIRED" || source.status === "STALE")).length;
  const score = Math.round((actual / Math.max(1, possible)) * 100);
  const status = statusFromScore(score, criticalMissing);
  const blockers = rows
    .filter((source) => source.priority === "critical" && (source.status === "MISSING" || source.status === "PAID_REQUIRED" || source.status === "STALE"))
    .map((source) => `${source.sport}: ${source.label} is ${source.status}`);
  const nextActions = rows
    .filter((source) => source.status !== "LIVE")
    .sort((a, b) => b.scoreImpact - a.scoreImpact)
    .map((source) => `${source.sport}: ${source.nextAction} (${source.envKeys.length ? source.envKeys.join(" / ") : "none"})`)
    .slice(0, 12);

  return {
    ...report,
    score,
    status,
    eliteReady: status === "ELITE" || status === "USABLE",
    criticalMissing,
    configuredCount: rows.filter((source) => source.configured).length,
    liveCount: rows.filter((source) => source.status === "LIVE").length,
    missingCount: rows.filter((source) => source.status === "MISSING").length,
    paidRequiredCount: rows.filter((source) => source.status === "PAID_REQUIRED").length,
    staleCount: rows.filter((source) => source.status === "STALE").length,
    groups,
    blockers,
    nextActions
  };
}

function archiveStatus(snapshotCount: number, freshnessMinutes: number | null): SourceCoverageStatus {
  if (snapshotCount <= 0) return "MISSING";
  if (freshnessMinutes == null) return "FALLBACK";
  if (freshnessMinutes <= 90) return "LIVE";
  if (freshnessMinutes <= 720) return "FALLBACK";
  return "STALE";
}

export async function getEnhancedDataSourceCoverageReport(): Promise<DataSourceCoverageReport> {
  const [report, archive] = await Promise.all([
    getDataSourceCoverageReport(),
    getMarketArchiveHints(7).catch(() => null)
  ]);

  if (!archive) return report;

  const groups = report.groups.map((group) => {
    if (group.sport === "MLB") {
      let rows = group.rows;
      const mlbArchiveStatus = archiveStatus(archive.mlb.snapshotCount, archive.mlb.freshnessMinutes);
      if (archive.mlb.snapshotCount > 0) {
        rows = updateRow(rows, "mlb-closing-lines", {
          status: archive.mlb.closingLineCount > 0 ? "LIVE" : "FALLBACK",
          runtimeEvidence: `Snapshots: ${archive.mlb.snapshotCount}; closing lines: ${archive.mlb.closingLineCount}; latest archive age min: ${archive.mlb.freshnessMinutes ?? "—"}`,
          nextAction: archive.mlb.closingLineCount > 0
            ? "Internal event-market snapshots are providing closing-line evidence. Keep snapshot cadence healthy."
            : "Internal event-market snapshots exist, but explicit closing odds are not being stamped yet. Stamp closing odds from the last pregame snapshot."
        });
      }
      rows = updateRow(rows, "mlb-market-freshness", {
        status: mlbArchiveStatus,
        runtimeEvidence: archive.mlb.snapshotCount > 0
          ? `Internal archive snapshots: ${archive.mlb.snapshotCount}; latest age min: ${archive.mlb.freshnessMinutes ?? "—"}`
          : group.rows.find((row) => row.key === "mlb-market-freshness")?.runtimeEvidence ?? null,
        nextAction: archive.mlb.snapshotCount > 0
          ? "Use internal market snapshot cadence as the free freshness monitor while paid historical odds are unavailable."
          : "Start writing EventMarketSnapshot rows from each odds refresh so freshness and closing evidence are local."
      });
      return rebuildGroup({ ...group, rows });
    }

    if (group.sport === "MMA") {
      let rows = group.rows;
      if (archive.mma.snapshotCount > 0) {
        rows = updateRow(rows, "mma-closing-lines", {
          status: archive.mma.closingLineCount > 0 ? "LIVE" : "FALLBACK",
          runtimeEvidence: `Snapshots: ${archive.mma.snapshotCount}; closing lines: ${archive.mma.closingLineCount}; latest archive age min: ${archive.mma.freshnessMinutes ?? "—"}`,
          nextAction: archive.mma.closingLineCount > 0
            ? "Internal fight-market snapshots are providing closing-line evidence. Keep snapshot cadence healthy."
            : "Fight-market snapshots exist, but explicit closing odds are not being stamped yet. Stamp closing odds from the final pre-fight snapshot."
        });
      }
      return rebuildGroup({ ...group, rows });
    }

    return group;
  });

  return rebuildReport(report, groups);
}
