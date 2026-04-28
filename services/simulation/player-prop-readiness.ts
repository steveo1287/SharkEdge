type ProjectionLike = {
  playerId: string;
  statKey: string;
  metadata?: Record<string, unknown> | null;
};

type PlayerStatLike = {
  minutes: number | null;
  starter: boolean;
  outcomeStatus: string;
  statsJson?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

type ReadinessReason =
  | "HAS_MARKET_LINE"
  | "STABLE_ROTATION_ROLE"
  | "STARTER_ROLE"
  | "INSUFFICIENT_ROLE_DATA"
  | "RECENT_DNP_RISK"
  | "LOW_MINUTES_ROLE";

export type PlayerProjectionReadinessResult<T extends ProjectionLike> = {
  projection: T;
  eligible: boolean;
  reason: ReadinessReason;
  roleProfile: {
    sampleSize: number;
    playedSampleSize: number;
    minutesSampleSize: number;
    avgMinutes: number | null;
    avgMinutesLast5: number | null;
    weightedMinutes: number | null;
    minutesStdDev: number | null;
    played12PlusLast5: number;
    startedLast5: number;
    dnpLast5: number;
    starterRate: number;
    roleConfidence: number;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getMinutes(stat: PlayerStatLike) {
  if (typeof stat.minutes === "number" && Number.isFinite(stat.minutes)) {
    return stat.minutes;
  }
  const statsJson = asRecord(stat.statsJson);
  return readNumber(statsJson.minutes ?? statsJson.MIN ?? statsJson.MP ?? statsJson.minutesPlayed);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = average(values) ?? 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function weightedAverage(values: number[], decay = 0.86) {
  if (!values.length) return null;
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isDnp(stat: PlayerStatLike) {
  const status = String(stat.outcomeStatus ?? "").toUpperCase();
  return status.includes("DNP") || status.includes("OUT") || status.includes("INACTIVE");
}

function buildRoleProfile(stats: PlayerStatLike[]) {
  const sortedStats = [...stats].sort((left, right) => {
    const leftDate = left.createdAt instanceof Date ? left.createdAt.getTime() : 0;
    const rightDate = right.createdAt instanceof Date ? right.createdAt.getTime() : 0;
    return rightDate - leftDate;
  });
  const recent = sortedStats.slice(0, 12);
  const last5 = sortedStats.slice(0, 5);
  const minutes = recent
    .map(getMinutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0.25);
  const last5Minutes = last5
    .map(getMinutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0.25);
  const playedSampleSize = recent.filter((stat) => !isDnp(stat) && (getMinutes(stat) ?? 0) > 0.25).length;
  const avgMinutes = average(minutes);
  const avgMinutesLast5 = average(last5Minutes);
  const weightedMinutes = weightedAverage(minutes);
  const minutesStdDev = standardDeviation(minutes);
  const startedLast5 = last5.filter((stat) => stat.starter).length;
  const dnpLast5 = last5.filter(isDnp).length;
  const starterRate = recent.length ? recent.filter((stat) => stat.starter).length / recent.length : 0;
  const played12PlusLast5 = last5Minutes.filter((value) => value >= 12).length;
  const sampleConfidence = clamp(recent.length / 12, 0, 1);
  const minuteConfidence = clamp(minutes.length / 10, 0, 1);
  const rotationConfidence = clamp((avgMinutesLast5 ?? avgMinutes ?? 0) / 28, 0, 1);
  const stability = minutesStdDev === null || avgMinutes === null
    ? 0.35
    : clamp(1 - minutesStdDev / Math.max(6, avgMinutes), 0.1, 1);
  const starterConfidence = clamp(starterRate * 0.85 + startedLast5 / 5 * 0.15, 0, 1);
  const dnpPenalty = clamp(dnpLast5 / 3, 0, 1);
  const roleConfidence = clamp(
    sampleConfidence * 0.22 +
    minuteConfidence * 0.23 +
    rotationConfidence * 0.24 +
    stability * 0.18 +
    starterConfidence * 0.13 -
    dnpPenalty * 0.28,
    0.02,
    0.98
  );

  return {
    sampleSize: recent.length,
    playedSampleSize,
    minutesSampleSize: minutes.length,
    avgMinutes,
    avgMinutesLast5,
    weightedMinutes,
    minutesStdDev,
    played12PlusLast5,
    startedLast5,
    dnpLast5,
    starterRate,
    roleConfidence
  };
}

function hasMarketLine(metadata: Record<string, unknown>) {
  return typeof metadata.marketLine === "number" && Number.isFinite(metadata.marketLine);
}

function determineEligibility(metadata: Record<string, unknown>, profile: ReturnType<typeof buildRoleProfile>) {
  const marketBacked = hasMarketLine(metadata);

  if (marketBacked) {
    return {
      eligible: true,
      reason: "HAS_MARKET_LINE" as const
    };
  }

  if (profile.dnpLast5 >= 3 && profile.played12PlusLast5 === 0) {
    return {
      eligible: false,
      reason: "RECENT_DNP_RISK" as const
    };
  }

  if (profile.startedLast5 >= 2 && profile.minutesSampleSize >= 4 && (profile.avgMinutesLast5 ?? 0) >= 18) {
    return {
      eligible: true,
      reason: "STARTER_ROLE" as const
    };
  }

  if (profile.played12PlusLast5 >= 3 && profile.minutesSampleSize >= 6 && profile.roleConfidence >= 0.45) {
    return {
      eligible: true,
      reason: "STABLE_ROTATION_ROLE" as const
    };
  }

  if ((profile.avgMinutesLast5 ?? profile.avgMinutes ?? 0) < 10 || profile.played12PlusLast5 <= 1) {
    return {
      eligible: false,
      reason: "LOW_MINUTES_ROLE" as const
    };
  }

  return {
    eligible: false,
    reason: "INSUFFICIENT_ROLE_DATA" as const
  };
}

export function evaluatePlayerProjectionReadiness<T extends ProjectionLike>(
  projection: T,
  recentStats: PlayerStatLike[]
): PlayerProjectionReadinessResult<T> {
  const metadata = asRecord(projection.metadata);
  const profile = buildRoleProfile(recentStats);
  const verdict = determineEligibility(metadata, profile);
  const previousDrivers = Array.isArray(metadata.drivers)
    ? metadata.drivers.filter((value): value is string => typeof value === "string")
    : [];
  const enrichedProjection = {
    ...projection,
    metadata: {
      ...metadata,
      projectionEligible: verdict.eligible,
      projectionEligibilityReason: verdict.reason,
      sampleSize: profile.sampleSize,
      playedSampleSize: profile.playedSampleSize,
      minutesSampleSize: profile.minutesSampleSize,
      avgMinutes: profile.avgMinutes,
      avgMinutesLast5: profile.avgMinutesLast5,
      weightedMinutes: profile.weightedMinutes,
      minutesStdDev: profile.minutesStdDev,
      played12PlusLast5: profile.played12PlusLast5,
      startedLast5: profile.startedLast5,
      dnpLast5: profile.dnpLast5,
      starterRate: profile.starterRate,
      roleConfidence: profile.roleConfidence,
      roleProfile: profile,
      drivers: Array.from(new Set([
        ...previousDrivers,
        `Readiness ${verdict.reason.toLowerCase().replace(/_/g, " ")}; role confidence ${(profile.roleConfidence * 100).toFixed(0)}%.`
      ]))
    }
  } as T;

  return {
    projection: enrichedProjection,
    eligible: verdict.eligible,
    reason: verdict.reason,
    roleProfile: profile
  };
}
