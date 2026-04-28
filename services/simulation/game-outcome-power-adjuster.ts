import { normalCdf } from "@/services/simulation/probability-math";
import { getCachedTeamPowerRating, type TeamPowerRatingProfile } from "@/services/stats/team-power-ratings";
import { buildPlayerLockImpactForEvent, type PlayerLockImpactSummary } from "@/services/simulation/player-lock-impact";

type EventProjectionLike = {
  eventId: string;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
  winProbAway: number;
  metadata?: Record<string, unknown> | null;
};

type TeamContext = {
  id: string;
  name: string;
  abbreviation: string;
} | null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readSpreadStd(metadata: Record<string, unknown>) {
  const simulation = asRecord(metadata.simulation);
  const distribution = asRecord(simulation.distribution ?? metadata.distribution);
  const spreadStdDev = typeof distribution.spreadStdDev === "number" ? distribution.spreadStdDev : null;
  return clamp(spreadStdDev ?? 12.5, 4, 24);
}

function powerScoreDelta(home: TeamPowerRatingProfile | null, away: TeamPowerRatingProfile | null) {
  if (!home || !away) return null;
  const powerDelta = home.powerScore - away.powerScore;
  const netDelta = (home.netRatingProxy ?? 0) - (away.netRatingProxy ?? 0);
  const formDelta = home.formScore - away.formScore;
  const consistencyDelta = home.consistencyScore - away.consistencyScore;
  const spreadDelta = clamp(powerDelta * 8.5 + netDelta * 0.055 + formDelta * 2.2 + consistencyDelta * 0.8, -7.5, 7.5);
  const totalDelta = clamp(
    ((home.offensiveRatingProxy ?? 0) + (away.offensiveRatingProxy ?? 0) - (home.defensiveRatingProxy ?? 0) - (away.defensiveRatingProxy ?? 0)) * 0.015,
    -4,
    4
  );
  return {
    powerDelta,
    netDelta,
    formDelta,
    consistencyDelta,
    spreadDelta,
    totalDelta,
    confidence: clamp((home.sampleSize + away.sampleSize) / 24, 0.15, 1)
  };
}

function applyScoreDelta(args: {
  homeScore: number;
  awayScore: number;
  homeSpreadDelta: number;
  totalDelta: number;
}) {
  const spreadDelta = args.homeSpreadDelta;
  const totalDelta = args.totalDelta;
  return {
    homeScore: Math.max(0, args.homeScore + totalDelta / 2 + spreadDelta / 2),
    awayScore: Math.max(0, args.awayScore + totalDelta / 2 - spreadDelta / 2)
  };
}

export async function applyGameOutcomePowerAdjustment<T extends EventProjectionLike>(args: {
  projection: T;
  leagueKey: string;
  homeTeam: TeamContext;
  awayTeam: TeamContext;
}) {
  if (!args.homeTeam || !args.awayTeam) return args.projection;

  const [homePower, awayPower, playerLock] = await Promise.all([
    getCachedTeamPowerRating(args.homeTeam.id),
    getCachedTeamPowerRating(args.awayTeam.id),
    buildPlayerLockImpactForEvent({
      eventId: args.projection.eventId,
      homeTeamId: args.homeTeam.id,
      awayTeamId: args.awayTeam.id,
      homeTeamName: args.homeTeam.name,
      awayTeamName: args.awayTeam.name
    })
  ]);

  const power = powerScoreDelta(homePower, awayPower);
  const previousMetadata = asRecord(args.projection.metadata);
  const previousDrivers = Array.isArray(previousMetadata.drivers)
    ? previousMetadata.drivers.filter((value): value is string => typeof value === "string")
    : [];
  const simulation = asRecord(previousMetadata.simulation);
  const simulationDrivers = Array.isArray(simulation.drivers)
    ? simulation.drivers.filter((value): value is string => typeof value === "string")
    : [];

  let homeScore = args.projection.projectedHomeScore;
  let awayScore = args.projection.projectedAwayScore;
  let totalPowerSpreadDelta = 0;
  let totalPowerTotalDelta = 0;
  const drivers: string[] = [];

  if (power) {
    const weight = clamp(0.22 + power.confidence * 0.16, 0.18, 0.38);
    totalPowerSpreadDelta += power.spreadDelta * weight;
    totalPowerTotalDelta += power.totalDelta * weight;
    drivers.push(`Team power delta home ${round(power.powerDelta, 3)}, spread adjustment ${round(power.spreadDelta * weight, 2)}.`);
  } else {
    drivers.push("Team power rating unavailable; no power adjustment applied.");
  }

  const lockWeight = clamp(0.55 + playerLock.confidence * 0.25, 0.45, 0.8);
  const lockSpreadDelta = playerLock.homeSpreadDelta * lockWeight;
  const lockTotalDelta = playerLock.totalDelta * lockWeight;
  drivers.push(`Player lock spread adjustment ${round(lockSpreadDelta, 2)}; total adjustment ${round(lockTotalDelta, 2)}.`);
  drivers.push(...playerLock.drivers.slice(0, 8));

  const adjusted = applyScoreDelta({
    homeScore,
    awayScore,
    homeSpreadDelta: totalPowerSpreadDelta + lockSpreadDelta,
    totalDelta: totalPowerTotalDelta + lockTotalDelta
  });
  homeScore = adjusted.homeScore;
  awayScore = adjusted.awayScore;

  const projectedSpreadHome = homeScore - awayScore;
  const projectedTotal = homeScore + awayScore;
  const spreadStdDev = readSpreadStd(previousMetadata);
  const marginProb = normalCdf(projectedSpreadHome, 0, spreadStdDev);
  const priorWinProb = typeof args.projection.winProbHome === "number" ? args.projection.winProbHome : 0.5;
  const winBlend = clamp(0.42 + (power?.confidence ?? 0.25) * 0.12 + playerLock.confidence * 0.08, 0.38, 0.62);
  const winProbHome = clamp(priorWinProb * (1 - winBlend) + marginProb * winBlend, 0.02, 0.98);

  return {
    ...args.projection,
    projectedHomeScore: round(homeScore, 3),
    projectedAwayScore: round(awayScore, 3),
    projectedTotal: round(projectedTotal, 3),
    projectedSpreadHome: round(projectedSpreadHome, 3),
    winProbHome: round(winProbHome, 4),
    winProbAway: round(1 - winProbHome, 4),
    metadata: {
      ...previousMetadata,
      gameOutcomePowerAdjusted: true,
      teamPower: {
        home: homePower,
        away: awayPower,
        powerDelta: power
      },
      playerLock,
      gameOutcomeAdjustments: {
        powerSpreadDelta: round(totalPowerSpreadDelta, 3),
        powerTotalDelta: round(totalPowerTotalDelta, 3),
        playerLockSpreadDelta: round(lockSpreadDelta, 3),
        playerLockTotalDelta: round(lockTotalDelta, 3),
        spreadStdDev,
        priorWinProbHome: round(priorWinProb, 4),
        marginWinProbHome: round(marginProb, 4),
        winBlend: round(winBlend, 4)
      },
      drivers: Array.from(new Set([...previousDrivers, ...simulationDrivers, ...drivers]))
    }
  } as T;
}
