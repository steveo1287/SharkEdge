export type NbaMinutesUsageInput = {
  player: string;
  position?: string | null;
  starter?: boolean | null;
  seasonMinutes?: number | null;
  last5Minutes?: number | null;
  last10Minutes?: number | null;
  seasonUsageRate?: number | null;
  last5UsageRate?: number | null;
  last10UsageRate?: number | null;
  injuryStatus?: "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | null;
  teammateUsageVacatedPct?: number | null;
  blowoutRisk?: number | null; // 0-1
  backToBack?: boolean | null;
  restDays?: number | null;
  pace?: number | null;
  gameTotal?: number | null;
  spreadAbs?: number | null;
  foulRisk?: number | null; // 0-1
  rotationStability?: number | null; // 0-1
};

export type NbaMinutesUsageProjection = {
  projectedMinutes: number;
  projectedUsageRate: number;
  minutesConfidence: number;
  usageConfidence: number;
  roleTier: "OUT" | "LOW" | "BENCH" | "STARTER" | "HIGH_USAGE";
  minutesReasons: string[];
  usageReasons: string[];
  riskFlags: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safe(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function weightedAverage(parts: Array<[number, number]>) {
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight <= 0) return 0;
  return parts.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function defaultMinutesForRole(input: NbaMinutesUsageInput) {
  if (input.starter) return 32;
  const position = String(input.position ?? "").toUpperCase();
  if (["PG", "SG", "SF", "PF", "C"].includes(position)) return 24;
  return 22;
}

function defaultUsageForRole(input: NbaMinutesUsageInput) {
  if (input.starter) return 0.22;
  return 0.18;
}

export function buildNbaMinutesUsageProjection(input: NbaMinutesUsageInput): NbaMinutesUsageProjection {
  const minutesReasons: string[] = [];
  const usageReasons: string[] = [];
  const riskFlags: string[] = [];

  if (input.injuryStatus === "OUT") {
    return {
      projectedMinutes: 0,
      projectedUsageRate: 0,
      minutesConfidence: 0.98,
      usageConfidence: 0.98,
      roleTier: "OUT",
      minutesReasons: ["Player marked OUT"],
      usageReasons: ["No usage projection for inactive player"],
      riskFlags: ["Player out"]
    };
  }

  const seasonMinutes = safe(input.seasonMinutes, defaultMinutesForRole(input));
  const last10Minutes = safe(input.last10Minutes, seasonMinutes);
  const last5Minutes = safe(input.last5Minutes, last10Minutes);

  let projectedMinutes = weightedAverage([
    [seasonMinutes, 0.35],
    [last10Minutes, 0.3],
    [last5Minutes, 0.35]
  ]);

  const minutesTrend = last5Minutes - seasonMinutes;
  if (Math.abs(minutesTrend) >= 2.5) {
    minutesReasons.push(`Recent minutes ${minutesTrend > 0 ? "up" : "down"} ${Math.abs(minutesTrend).toFixed(1)} vs season`);
  }

  if (input.starter) {
    projectedMinutes += 1.2;
    minutesReasons.push("Starter role minute bump");
  }

  if (input.injuryStatus === "QUESTIONABLE") {
    projectedMinutes *= 0.88;
    riskFlags.push("Questionable status reduces minutes confidence");
  }

  if (input.injuryStatus === "DOUBTFUL") {
    projectedMinutes *= 0.45;
    riskFlags.push("Doubtful status severely suppresses minutes");
  }

  const blowoutRisk = clamp(safe(input.blowoutRisk, safe(input.spreadAbs, 0) / 18), 0, 1);
  if (blowoutRisk > 0.45) {
    projectedMinutes *= 1 - blowoutRisk * 0.08;
    riskFlags.push("Blowout risk trims closing rotation minutes");
  }

  if (input.backToBack) {
    projectedMinutes *= 0.975;
    riskFlags.push("Back-to-back minutes volatility");
  }

  if (typeof input.restDays === "number") {
    if (input.restDays >= 2) projectedMinutes *= 1.01;
    if (input.restDays === 0) projectedMinutes *= 0.985;
  }

  const foulRisk = clamp(safe(input.foulRisk, 0), 0, 1);
  if (foulRisk > 0.35) {
    projectedMinutes *= 1 - foulRisk * 0.06;
    riskFlags.push("Foul-risk minutes drag");
  }

  projectedMinutes = clamp(projectedMinutes, 0, 42);

  const seasonUsage = safe(input.seasonUsageRate, defaultUsageForRole(input));
  const last10Usage = safe(input.last10UsageRate, seasonUsage);
  const last5Usage = safe(input.last5UsageRate, last10Usage);

  let projectedUsageRate = weightedAverage([
    [seasonUsage, 0.45],
    [last10Usage, 0.25],
    [last5Usage, 0.3]
  ]);

  const usageTrend = last5Usage - seasonUsage;
  if (Math.abs(usageTrend) >= 0.025) {
    usageReasons.push(`Recent usage ${usageTrend > 0 ? "up" : "down"} ${(Math.abs(usageTrend) * 100).toFixed(1)} pts`);
  }

  if (typeof input.teammateUsageVacatedPct === "number") {
    const vacated = clamp(input.teammateUsageVacatedPct / 100, -0.04, 0.12);
    projectedUsageRate += vacated * 0.55;
    if (vacated > 0.01) usageReasons.push("Vacated teammate usage raises projection");
  }

  const pace = safe(input.pace, 100);
  if (pace > 102.5) {
    projectedUsageRate *= 1.01;
    usageReasons.push("Fast pace supports usage volume");
  } else if (pace < 97.5) {
    projectedUsageRate *= 0.99;
    usageReasons.push("Slow pace suppresses usage volume");
  }

  if (typeof input.gameTotal === "number") {
    if (input.gameTotal >= 230) projectedUsageRate *= 1.01;
    if (input.gameTotal <= 214) projectedUsageRate *= 0.99;
  }

  if (input.injuryStatus === "QUESTIONABLE") projectedUsageRate *= 0.95;
  if (input.injuryStatus === "DOUBTFUL") projectedUsageRate *= 0.75;

  projectedUsageRate = clamp(projectedUsageRate, 0.05, 0.42);

  const rotationStability = clamp(safe(input.rotationStability, 0.68), 0, 1);
  const minutesConfidence = clamp(0.48 + rotationStability * 0.28 + (input.starter ? 0.08 : 0) - riskFlags.length * 0.035, 0.2, 0.92);
  const usageConfidence = clamp(0.5 + rotationStability * 0.2 - Math.abs(usageTrend) * 0.8 - riskFlags.length * 0.025, 0.2, 0.9);

  const roleTier = projectedMinutes <= 0
    ? "OUT"
    : projectedMinutes < 18
      ? "LOW"
      : projectedMinutes < 28
        ? "BENCH"
        : projectedUsageRate >= 0.27
          ? "HIGH_USAGE"
          : "STARTER";

  if (!minutesReasons.length) minutesReasons.push("Minutes blended from season, last 10, and last 5 role data");
  if (!usageReasons.length) usageReasons.push("Usage blended from season, last 10, and last 5 touch profile");

  return {
    projectedMinutes: Number(projectedMinutes.toFixed(2)),
    projectedUsageRate: Number(projectedUsageRate.toFixed(4)),
    minutesConfidence: Number(minutesConfidence.toFixed(4)),
    usageConfidence: Number(usageConfidence.toFixed(4)),
    roleTier,
    minutesReasons,
    usageReasons,
    riskFlags
  };
}
