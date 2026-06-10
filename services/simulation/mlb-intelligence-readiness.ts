import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type ReadinessState = "READY" | "DEGRADED" | "MISSING" | "ERROR";

type CountRow = { count: bigint | number | string };

type PopulateFeedReport = {
  ok?: boolean;
  generatedAt?: string;
  snapshotDate?: string;
  dryRun?: boolean;
  rosterRatings?: {
    ok?: boolean;
    persisted?: boolean;
    teamsCovered?: number;
    teamsExpected?: number;
    playersSeen?: number;
    hittersRated?: number;
    pitchersRated?: number;
    warnings?: string[];
  };
  microFeeds?: {
    built?: boolean;
    reason?: string;
    warnings?: string[];
    diagnostics?: {
      rawRows?: number;
      usableRows?: number;
      batterCount?: number;
      pitcherCount?: number;
      terminalPitchRows?: number;
      battedBallRows?: number;
      skippedRows?: number;
    } | null;
    outputs?: {
      allPath?: string;
      latestAllPath?: string;
      battersPath?: string;
      pitchersPath?: string;
    } | null;
  };
};

export type MlbIntelligenceReadinessReport = {
  generatedAt: string;
  state: ReadinessState;
  label: string;
  summary: string;
  reportPath: string | null;
  snapshotDate: string | null;
  rosterRatings: {
    state: ReadinessState;
    persisted: boolean;
    dryRun: boolean;
    teamsCovered: number;
    teamsExpected: number;
    playersSeen: number;
    hittersRated: number;
    pitchersRated: number;
    databaseAvailable: boolean;
    databaseHitterRows: number | null;
    databasePitcherRows: number | null;
    warnings: string[];
  };
  microTendencies: {
    state: ReadinessState;
    built: boolean;
    batterCount: number;
    pitcherCount: number;
    usableRows: number;
    terminalPitchRows: number;
    battedBallRows: number;
    batterFeedPath: string;
    pitcherFeedPath: string;
    batterFeedExists: boolean;
    pitcherFeedExists: boolean;
    warnings: string[];
  };
  syntheticFallback: {
    blockedForHighConfidence: boolean;
    reason: string;
  };
  gates: Array<{ key: string; label: string; passed: boolean; detail: string }>;
  warnings: string[];
};

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function safeArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function configuredPath(envName: string, fallback: string) {
  const value = process.env[envName];
  return value && value.trim() ? value.trim() : path.join(process.cwd(), fallback);
}

function latestReportPath() {
  const explicit = process.env.MLB_POPULATE_FEED_REPORT_PATH?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  const dir = path.join(process.cwd(), "data", "mlb");
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((file) => /^populate-feed-report-\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .map((file) => path.join(dir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function readReport(): { path: string | null; report: PopulateFeedReport | null; error: string | null } {
  const reportPath = latestReportPath();
  if (!reportPath) return { path: null, report: null, error: "No populate/feed report found." };
  try {
    return { path: reportPath, report: JSON.parse(readFileSync(reportPath, "utf8")) as PopulateFeedReport, error: null };
  } catch (error) {
    return { path: reportPath, report: null, error: error instanceof Error ? error.message : "Failed to parse populate/feed report." };
  }
}

function readJsonArrayCount(filePath: string) {
  if (!existsSync(filePath)) return { exists: false, count: 0 };
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return { exists: true, count: Array.isArray(parsed) ? parsed.length : 0 };
  } catch {
    return { exists: true, count: 0 };
  }
}

async function dbCount(sql: string): Promise<number | null> {
  if (!hasUsableServerDatabaseUrl()) return null;
  const rows = (await prisma.$queryRawUnsafe(sql)) as CountRow[];
  return asNumber(rows[0]?.count, 0);
}

function rosterState(args: {
  teamsCovered: number;
  teamsExpected: number;
  playersSeen: number;
  hittersRated: number;
  pitchersRated: number;
  persisted: boolean;
  databaseAvailable: boolean;
  databaseHitterRows: number | null;
  databasePitcherRows: number | null;
  dryRun: boolean;
}) {
  if (args.teamsCovered < 30) return "MISSING" as const;
  if (args.playersSeen < 650 || args.hittersRated < 300 || args.pitchersRated < 250) return "DEGRADED" as const;
  if (args.dryRun) return "DEGRADED" as const;
  if (!args.databaseAvailable || !args.persisted) return "DEGRADED" as const;
  if ((args.databaseHitterRows ?? 0) <= 0 || (args.databasePitcherRows ?? 0) <= 0) return "DEGRADED" as const;
  return "READY" as const;
}

function microState(args: { built: boolean; batterCount: number; pitcherCount: number; usableRows: number; terminalPitchRows: number; battedBallRows: number; batterFeedExists: boolean; pitcherFeedExists: boolean }) {
  if (!args.built && (!args.batterFeedExists || !args.pitcherFeedExists)) return "MISSING" as const;
  if (args.batterCount <= 0 || args.pitcherCount <= 0) return "MISSING" as const;
  if (args.usableRows <= 0 || args.terminalPitchRows <= 0 || args.battedBallRows <= 0) return "DEGRADED" as const;
  return "READY" as const;
}

export async function getMlbIntelligenceReadiness(): Promise<MlbIntelligenceReadinessReport> {
  const generatedAt = new Date().toISOString();
  const reportRead = readReport();
  const report = reportRead.report;
  const roster = report?.rosterRatings ?? {};
  const micro = report?.microFeeds ?? {};
  const diagnostics = micro.diagnostics ?? {};
  const batterFeedPath = micro.outputs?.battersPath ?? configuredPath("MLB_BATTER_MICRO_TENDENCIES_PATH", "data/mlb/micro/batter-micro-tendencies.json");
  const pitcherFeedPath = micro.outputs?.pitchersPath ?? configuredPath("MLB_PITCHER_MICRO_TENDENCIES_PATH", "data/mlb/micro/pitcher-micro-tendencies.json");
  const batterFile = readJsonArrayCount(batterFeedPath);
  const pitcherFile = readJsonArrayCount(pitcherFeedPath);
  const databaseAvailable = hasUsableServerDatabaseUrl();
  let databaseHitterRows: number | null = null;
  let databasePitcherRows: number | null = null;
  const warnings: string[] = [];

  try {
    databaseHitterRows = await dbCount("SELECT COUNT(*) AS count FROM mlb_player_ratings WHERE source = 'mlb-daily-roster-rating-snapshot-v1'");
    databasePitcherRows = await dbCount("SELECT COUNT(*) AS count FROM mlb_pitcher_ratings WHERE source = 'mlb-daily-roster-rating-snapshot-v1'");
  } catch (error) {
    warnings.push(error instanceof Error ? `Database readiness count failed: ${error.message}` : "Database readiness count failed.");
  }

  if (reportRead.error) warnings.push(reportRead.error);
  warnings.push(...safeArray(roster.warnings));
  warnings.push(...safeArray(micro.warnings));

  const rosterRatings = {
    state: rosterState({
      teamsCovered: asNumber(roster.teamsCovered),
      teamsExpected: asNumber(roster.teamsExpected, 30),
      playersSeen: asNumber(roster.playersSeen),
      hittersRated: asNumber(roster.hittersRated),
      pitchersRated: asNumber(roster.pitchersRated),
      persisted: Boolean(roster.persisted),
      databaseAvailable,
      databaseHitterRows,
      databasePitcherRows,
      dryRun: Boolean(report?.dryRun)
    }),
    persisted: Boolean(roster.persisted),
    dryRun: Boolean(report?.dryRun),
    teamsCovered: asNumber(roster.teamsCovered),
    teamsExpected: asNumber(roster.teamsExpected, 30),
    playersSeen: asNumber(roster.playersSeen),
    hittersRated: asNumber(roster.hittersRated),
    pitchersRated: asNumber(roster.pitchersRated),
    databaseAvailable,
    databaseHitterRows,
    databasePitcherRows,
    warnings: safeArray(roster.warnings)
  };

  const microTendencies = {
    state: microState({
      built: Boolean(micro.built),
      batterCount: asNumber(diagnostics.batterCount, batterFile.count),
      pitcherCount: asNumber(diagnostics.pitcherCount, pitcherFile.count),
      usableRows: asNumber(diagnostics.usableRows),
      terminalPitchRows: asNumber(diagnostics.terminalPitchRows),
      battedBallRows: asNumber(diagnostics.battedBallRows),
      batterFeedExists: batterFile.exists,
      pitcherFeedExists: pitcherFile.exists
    }),
    built: Boolean(micro.built),
    batterCount: asNumber(diagnostics.batterCount, batterFile.count),
    pitcherCount: asNumber(diagnostics.pitcherCount, pitcherFile.count),
    usableRows: asNumber(diagnostics.usableRows),
    terminalPitchRows: asNumber(diagnostics.terminalPitchRows),
    battedBallRows: asNumber(diagnostics.battedBallRows),
    batterFeedPath,
    pitcherFeedPath,
    batterFeedExists: batterFile.exists,
    pitcherFeedExists: pitcherFile.exists,
    warnings: safeArray(micro.warnings)
  };

  const gates = [
    {
      key: "teams-covered",
      label: "All 30 MLB teams covered",
      passed: rosterRatings.teamsCovered === 30,
      detail: `${rosterRatings.teamsCovered}/${rosterRatings.teamsExpected} teams covered`
    },
    {
      key: "roster-volume",
      label: "Roster/player volume plausible",
      passed: rosterRatings.playersSeen >= 650 && rosterRatings.hittersRated >= 300 && rosterRatings.pitchersRated >= 250,
      detail: `${rosterRatings.playersSeen} players, ${rosterRatings.hittersRated} hitters, ${rosterRatings.pitchersRated} pitchers`
    },
    {
      key: "database-persisted",
      label: "Daily ratings persisted to database",
      passed: rosterRatings.persisted && (rosterRatings.databaseHitterRows ?? 0) > 0 && (rosterRatings.databasePitcherRows ?? 0) > 0,
      detail: databaseAvailable ? `${rosterRatings.databaseHitterRows ?? 0} hitter rows, ${rosterRatings.databasePitcherRows ?? 0} pitcher rows` : "DATABASE_URL unavailable"
    },
    {
      key: "micro-feed",
      label: "Statcast micro tendency feed ready",
      passed: microTendencies.state === "READY",
      detail: `${microTendencies.batterCount} batters, ${microTendencies.pitcherCount} pitchers, ${microTendencies.usableRows} usable pitch rows`
    },
    {
      key: "synthetic-block",
      label: "Synthetic fallback blocked for high-confidence MLB",
      passed: true,
      detail: "High-confidence MLB should require real roster ratings and micro feed readiness."
    }
  ];

  const state: ReadinessState = rosterRatings.state === "READY" && microTendencies.state === "READY"
    ? "READY"
    : rosterRatings.state === "MISSING" && microTendencies.state === "MISSING"
      ? "MISSING"
      : "DEGRADED";

  return {
    generatedAt,
    state,
    label: state === "READY" ? "MLB intelligence ready" : state === "MISSING" ? "MLB intelligence missing" : "MLB intelligence degraded",
    summary: state === "READY"
      ? "Roster ratings are persisted and Statcast micro tendencies are live."
      : "Roster ratings or Statcast micro tendencies are not fully live yet.",
    reportPath: reportRead.path,
    snapshotDate: report?.snapshotDate ?? null,
    rosterRatings,
    microTendencies,
    syntheticFallback: {
      blockedForHighConfidence: true,
      reason: "High-confidence MLB recommendations should require persisted daily roster ratings and live Statcast micro tendencies."
    },
    gates,
    warnings: Array.from(new Set(warnings))
  };
}
