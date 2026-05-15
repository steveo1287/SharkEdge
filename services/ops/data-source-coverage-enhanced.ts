import { getDataSourceCoverageReport, type DataSourceCoverageGroup, type DataSourceCoverageReport, type DataSourceCoverageRow, type SourceCoverageStatus } from "@/services/ops/data-source-coverage";
import { getMarketArchiveHints } from "@/services/ops/market-archive-hints";
import { getPlayerTendencyCoverageReport, type TendencyCoverageLane, type TendencyCoverageStatus } from "@/services/ops/player-tendency-coverage";

function scoreStatus(status: SourceCoverageStatus) {
  if (status === "LIVE") return 1;
  if (status === "CONFIGURED") return 0.75;
  if (status === "FALLBACK") return 0.45;
  if (status === "STALE") return 0.35;
  if (status === "PAID_REQUIRED") return 0.2;
  return 0;
}

function sourceStatusFromTendency(status: TendencyCoverageStatus): SourceCoverageStatus {
  if (status === "ELITE") return "LIVE";
  if (status === "USABLE") return "CONFIGURED";
  if (status === "THIN") return "FALLBACK";
  return "MISSING";
}

function sourceStatusFromPct(pct: number | null | undefined): SourceCoverageStatus {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return "MISSING";
  if (pct >= 0.8) return "LIVE";
  if (pct >= 0.5) return "CONFIGURED";
  if (pct > 0.05) return "FALLBACK";
  return "MISSING";
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

function metricPct(lane: TendencyCoverageLane | undefined, key: string) {
  return lane?.metrics.find((metric) => metric.key === key)?.pct ?? null;
}

function metricEvidence(lane: TendencyCoverageLane | undefined, key: string) {
  const metric = lane?.metrics.find((item) => item.key === key);
  return metric ? `${metric.label}: ${metric.count}/${metric.total} (${metric.pct == null ? "—" : `${(metric.pct * 100).toFixed(1)}%`})` : null;
}

function applyMlbPlayerTendencies(rows: DataSourceCoverageRow[], mlbLane: TendencyCoverageLane | undefined) {
  if (!mlbLane) return rows;
  let nextRows = rows;
  const statcastPct = Math.max(
    metricPct(mlbLane, "mlb_statcast_profiles") ?? 0,
    metricPct(mlbLane, "mlb_xwoba") ?? 0,
    metricPct(mlbLane, "mlb_hard_hit") ?? 0
  );
  const pitcherPct = Math.max(
    metricPct(mlbLane, "mlb_pitch_mix") ?? 0,
    metricPct(mlbLane, "mlb_pitcher_context") ?? 0
  );
  const bullpenPct = Math.max(
    metricPct(mlbLane, "mlb_bullpen_usage") ?? 0,
    metricPct(mlbLane, "mlb_probable_pitchers") ?? 0
  );

  nextRows = updateRow(nextRows, "mlb-statcast-splits", {
    status: sourceStatusFromPct(statcastPct),
    runtimeEvidence: [metricEvidence(mlbLane, "mlb_statcast_profiles"), metricEvidence(mlbLane, "mlb_xwoba"), metricEvidence(mlbLane, "mlb_hard_hit")].filter(Boolean).join("; ") || null,
    nextAction: statcastPct >= 0.8
      ? "Statcast-style player tendency coverage is strong. Keep it fresh and feed it into matchup features."
      : "Increase Statcast-style tendency coverage: xwOBA, hard-hit rate, barrel rate, chase/contact, and platoon split quality."
  });

  nextRows = updateRow(nextRows, "mlb-fangraphs-player-feed", {
    status: sourceStatusFromTendency(mlbLane.status),
    runtimeEvidence: `MLB profile score: ${mlbLane.score}; player rows: ${mlbLane.sample.playerStatRows ?? "—"}; roster players: ${mlbLane.sample.playerCount ?? "—"}`,
    nextAction: mlbLane.score >= 80
      ? "MLB player profile/tendency depth is strong enough to support matchup modeling. Keep source freshness healthy."
      : "Improve MLB player profile depth: roster identity, recent stat rows, pitcher context, plate discipline, and opponent-quality tendencies."
  });

  nextRows = updateRow(nextRows, "mlb-probable-starters", {
    status: sourceStatusFromPct(metricPct(mlbLane, "mlb_probable_pitchers")),
    runtimeEvidence: metricEvidence(mlbLane, "mlb_probable_pitchers"),
    nextAction: "Promotions should require confirmed or high-confidence probable starters from team context or a starter feed."
  });

  nextRows = updateRow(nextRows, "mlb-bullpen-fatigue", {
    status: sourceStatusFromPct(bullpenPct),
    runtimeEvidence: [metricEvidence(mlbLane, "mlb_bullpen_usage"), metricEvidence(mlbLane, "mlb_probable_pitchers")].filter(Boolean).join("; ") || null,
    nextAction: "Track bullpen usage over the last 3 games, high-leverage availability, closer status, and starter length tendency."
  });

  if (pitcherPct > 0.05) {
    nextRows = updateRow(nextRows, "mlb-team-boxscores", {
      runtimeEvidence: [rows.find((row) => row.key === "mlb-team-boxscores")?.runtimeEvidence, metricEvidence(mlbLane, "mlb_pitcher_context")].filter(Boolean).join("; ") || null
    });
  }

  return nextRows;
}

function applyMmaPlayerTendencies(rows: DataSourceCoverageRow[], mmaLane: TendencyCoverageLane | undefined) {
  if (!mmaLane) return rows;
  let nextRows = rows;
  const bioPct = Math.max(metricPct(mmaLane, "mma_bio_profiles") ?? 0, metricPct(mmaLane, "mma_reach_stance") ?? 0);
  const historyPct = Math.max(metricPct(mmaLane, "mma_fight_history") ?? 0, metricPct(mmaLane, "mma_opponent_strength") ?? 0, metricPct(mmaLane, "mma_finish_profile") ?? 0);
  const advancedPct = Math.max(metricPct(mmaLane, "mma_striking_tendencies") ?? 0, metricPct(mmaLane, "mma_grappling_tendencies") ?? 0);
  const status = sourceStatusFromTendency(mmaLane.status);

  nextRows = updateRow(nextRows, "mma-fighter-profiles", {
    status: sourceStatusFromPct(bioPct),
    runtimeEvidence: [metricEvidence(mmaLane, "mma_bio_profiles"), metricEvidence(mmaLane, "mma_reach_stance"), `fighter count: ${mmaLane.sample.fighterCount ?? "—"}`].filter(Boolean).join("; ") || null,
    nextAction: bioPct >= 0.8
      ? "Fighter bio/profile coverage is strong. Keep it fresh before fight-week modeling."
      : "Wire fighter profiles: age, reach, stance, camp, weight class, layoff, and weight-cut context."
  });

  nextRows = updateRow(nextRows, "mma-fight-history", {
    status: sourceStatusFromPct(historyPct),
    runtimeEvidence: [metricEvidence(mmaLane, "mma_fight_history"), metricEvidence(mmaLane, "mma_opponent_strength"), metricEvidence(mmaLane, "mma_finish_profile")].filter(Boolean).join("; ") || null,
    nextAction: historyPct >= 0.8
      ? "Fight history and opponent-strength coverage is strong. Use it for quality-adjusted fighter form."
      : "Wire fight history: opponent strength, ranked wins, recent form, layoff, finish/decision profile, and short-notice context."
  });

  nextRows = updateRow(nextRows, "mma-striking-grappling", {
    status: sourceStatusFromPct(advancedPct),
    runtimeEvidence: [metricEvidence(mmaLane, "mma_striking_tendencies"), metricEvidence(mmaLane, "mma_grappling_tendencies")].filter(Boolean).join("; ") || null,
    nextAction: advancedPct >= 0.8
      ? "Advanced striking/grappling tendencies are strong. Feed them into style-clash and finish-path models."
      : "Wire advanced UFC stats: SLpM, SApM, accuracy, defense, takedowns, TD defense, submissions, and control time."
  });

  nextRows = updateRow(nextRows, "mma-weigh-ins", {
    status: sourceStatusFromPct(metricPct(mmaLane, "mma_layoff_short_notice")),
    runtimeEvidence: metricEvidence(mmaLane, "mma_layoff_short_notice"),
    nextAction: "Add fight-week risk profile: weigh-in misses, short notice, camp change, layoff days, and bad weight-cut flags."
  });

  if (status !== "MISSING") {
    nextRows = updateRow(nextRows, "mma-event-card", {
      runtimeEvidence: [rows.find((row) => row.key === "mma-event-card")?.runtimeEvidence, `MMA profile score: ${mmaLane.score}`].filter(Boolean).join("; ") || null
    });
  }

  return nextRows;
}

export async function getEnhancedDataSourceCoverageReport(): Promise<DataSourceCoverageReport> {
  const [report, archive, tendencies] = await Promise.all([
    getDataSourceCoverageReport(),
    getMarketArchiveHints(7).catch(() => null),
    getPlayerTendencyCoverageReport().catch(() => null)
  ]);

  const mlbTendencyLane = tendencies?.lanes.find((lane) => lane.sport === "MLB");
  const mmaTendencyLane = tendencies?.lanes.find((lane) => lane.sport === "MMA");

  const groups = report.groups.map((group) => {
    if (group.sport === "MLB") {
      let rows = applyMlbPlayerTendencies(group.rows, mlbTendencyLane);
      const mlbArchiveStatus = archive ? archiveStatus(archive.mlb.snapshotCount, archive.mlb.freshnessMinutes) : "MISSING";
      if (archive?.mlb.snapshotCount && archive.mlb.snapshotCount > 0) {
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
        runtimeEvidence: archive && archive.mlb.snapshotCount > 0
          ? `Internal archive snapshots: ${archive.mlb.snapshotCount}; latest age min: ${archive.mlb.freshnessMinutes ?? "—"}`
          : group.rows.find((row) => row.key === "mlb-market-freshness")?.runtimeEvidence ?? null,
        nextAction: archive && archive.mlb.snapshotCount > 0
          ? "Use internal market snapshot cadence as the free freshness monitor while paid historical odds are unavailable."
          : "Start writing EventMarketSnapshot rows from each odds refresh so freshness and closing evidence are local."
      });
      return rebuildGroup({ ...group, rows });
    }

    if (group.sport === "MMA") {
      let rows = applyMmaPlayerTendencies(group.rows, mmaTendencyLane);
      if (archive?.mma.snapshotCount && archive.mma.snapshotCount > 0) {
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
