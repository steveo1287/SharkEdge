import { getMlbIntelV7HealthReport, type MlbIntelV7HealthStatus } from "@/services/simulation/mlb-intel-v7-health";
import { getActiveMlbV8PlayerImpactProfile, type MlbV8PlayerImpactProfile } from "@/services/simulation/mlb-v8-player-impact-profile";
import { mainBrainLabel } from "@/services/simulation/main-sim-brain";

export type MainSimBrainStatus = "GREEN" | "YELLOW" | "RED";

export type MainSimBrainStatusInput = {
  mlbHealthStatus: MlbIntelV7HealthStatus;
  canPublishAttackPicks: boolean;
  rowCount: number;
  gameCount: number;
  warningCount: number;
  profileStatus: MlbV8PlayerImpactProfile["status"];
  profileSampleSize: number;
  profileReliability?: number | null;
};

export type MainSimBrainStatusReport = MainSimBrainStatusInput & {
  status: MainSimBrainStatus;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
};

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function metricNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function classifyMainSimBrainStatus(input: MainSimBrainStatusInput): MainSimBrainStatusReport {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (input.rowCount <= 0) blockers.push("Main sim brain has no active MLB rows.");
  if (input.mlbHealthStatus === "RED") blockers.push("MLB v7/v8 health gate is RED.");
  if (!input.canPublishAttackPicks) warnings.push("Attack-pick publishing is currently blocked by the MLB health gate.");
  if (input.warningCount > 0) warnings.push(`Main brain source reported ${input.warningCount} warnings.`);

  if (input.profileStatus === "DEFAULT") {
    warnings.push("Player-impact profile is using default weights.");
    recommendations.push("Let the MLB v8 profile cron fit from settled snapshot rows before relying on aggressive attack picks.");
  }

  if (input.profileStatus === "SAMPLE_TOO_SMALL") {
    warnings.push(`Player-impact profile sample is too small at ${input.profileSampleSize} rows.`);
    recommendations.push("Keep MLB v8 outputs in WATCH/PASS more often until the player-impact sample grows.");
  }

  if (input.profileStatus === "LEARNED" && input.profileSampleSize < 250) {
    warnings.push(`Learned profile exists but sample is still thin at ${input.profileSampleSize} rows.`);
  }

  if (typeof input.profileReliability === "number" && input.profileReliability < 0.5) {
    warnings.push(`Learned profile reliability is only ${pct(input.profileReliability)}.`);
  }

  if (input.mlbHealthStatus === "YELLOW") recommendations.push("Use the main brain but publish fewer ATTACK picks until coverage/calibration improves.");
  if (input.profileSampleSize < 500) recommendations.push("Target 500+ settled MLB v8 snapshot rows before treating learned weights as stable.");

  const status: MainSimBrainStatus = blockers.length ? "RED" : warnings.length ? "YELLOW" : "GREEN";

  return {
    ...input,
    status,
    blockers,
    warnings,
    recommendations
  };
}

export async function getMainSimBrainStatusReport(limit = 60) {
  const [mlbHealth, profile] = await Promise.all([
    getMlbIntelV7HealthReport(limit),
    getActiveMlbV8PlayerImpactProfile()
  ]);
  const profileReliability = metricNumber(profile.metrics.reliability);
  const input: MainSimBrainStatusInput = {
    mlbHealthStatus: mlbHealth.health.status,
    canPublishAttackPicks: mlbHealth.health.canPublishAttackPicks,
    rowCount: mlbHealth.board.rowCount,
    gameCount: mlbHealth.board.gameCount,
    warningCount: mlbHealth.board.warnings.length,
    profileStatus: profile.status,
    profileSampleSize: profile.sampleSize,
    profileReliability
  };

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    mainBrain: {
      MLB: mainBrainLabel("MLB"),
      NBA: mainBrainLabel("NBA"),
      default: mainBrainLabel("NHL")
    },
    status: classifyMainSimBrainStatus(input),
    mlbHealth,
    playerImpactProfile: profile
  };
}
