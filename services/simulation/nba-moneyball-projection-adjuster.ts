import {
  getCachedNbaMoneyballPlayerProfile,
  getCachedNbaMoneyballTeamProfile
} from "@/services/stats/nba-moneyball-metrics";

type ProjectionLike = {
  eventId: string;
  playerId: string;
  statKey: string;
  meanValue: number;
  medianValue: number;
  stdDev: number;
  metadata?: Record<string, unknown> | null;
};

type PlayerContext = {
  id: string;
  name: string;
  teamId: string;
  team?: {
    id: string;
    name: string;
    abbreviation: string;
  } | null;
};

type TeamContext = {
  id: string;
  name: string;
  abbreviation: string;
} | null;

type PlayerMoneyballProfile = {
  trueShootingPct: number | null;
  effectiveFgPct: number | null;
  usageProxy: number | null;
  pointsPerScoringChance: number | null;
  assistPerMinute: number | null;
  reboundPerMinute: number | null;
  threeAttemptRate: number | null;
  threePointPct: number | null;
  freeThrowRate: number | null;
  turnoverPerChance: number | null;
  consistencyScore: number;
  efficiencyScore: number;
  roleScore: number;
  valueScore: number;
  undervaluedFlags: string[];
};

type TeamMoneyballProfile = {
  pace: number | null;
  offensiveRatingProxy: number | null;
  defensiveRatingProxy: number | null;
  netRatingProxy: number | null;
  effectiveFgPct: number | null;
  freeThrowRate: number | null;
  turnoverPct: number | null;
  offensiveReboundRateProxy: number | null;
  possessionQualityScore: number;
  shootingQualityScore: number;
  ballSecurityScore: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function profileOrNull<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function statSensitivity(statKey: string) {
  switch (statKey) {
    case "player_points":
      return { efficiency: 0.07, role: 0.045, team: 0.035, variance: 0.08 };
    case "player_threes":
      return { efficiency: 0.055, role: 0.03, team: 0.025, variance: 0.09 };
    case "player_assists":
      return { efficiency: 0.028, role: 0.055, team: 0.035, variance: 0.06 };
    case "player_rebounds":
      return { efficiency: 0.018, role: 0.048, team: 0.025, variance: 0.055 };
    default:
      return { efficiency: 0.025, role: 0.03, team: 0.02, variance: 0.045 };
  }
}

function playerSignal(profile: PlayerMoneyballProfile, statKey: string) {
  const sensitivity = statSensitivity(statKey);
  let multiplier = 1;
  let varianceMultiplier = 1;
  const notes: string[] = [];

  const efficiencyEdge = clamp((profile.efficiencyScore ?? 0.5) - 0.5, -0.5, 0.5);
  const roleEdge = clamp((profile.roleScore ?? 0.5) - 0.5, -0.5, 0.5);
  const consistencyEdge = clamp((profile.consistencyScore ?? 0.5) - 0.5, -0.5, 0.5);
  const valueEdge = clamp((profile.valueScore ?? 0.5) - 0.5, -0.5, 0.5);

  multiplier += efficiencyEdge * sensitivity.efficiency;
  multiplier += roleEdge * sensitivity.role;
  multiplier += valueEdge * 0.025;
  varianceMultiplier += (0.5 - consistencyEdge) * sensitivity.variance;

  if (statKey === "player_points") {
    const ts = readNumber(profile.trueShootingPct);
    const usage = readNumber(profile.usageProxy);
    if (ts !== null) multiplier += clamp(ts - 0.57, -0.1, 0.12) * 0.22;
    if (usage !== null) multiplier += clamp(usage - 0.36, -0.16, 0.18) * 0.08;
  }

  if (statKey === "player_threes") {
    const rate = readNumber(profile.threeAttemptRate);
    const pct = readNumber(profile.threePointPct);
    if (rate !== null) multiplier += clamp(rate - 0.16, -0.1, 0.16) * 0.16;
    if (pct !== null) multiplier += clamp(pct - 0.36, -0.09, 0.1) * 0.18;
  }

  if (statKey === "player_assists") {
    const astRate = readNumber(profile.assistPerMinute);
    const turnover = readNumber(profile.turnoverPerChance);
    if (astRate !== null) multiplier += clamp(astRate - 0.13, -0.08, 0.14) * 0.2;
    if (turnover !== null) multiplier -= clamp(turnover - 0.12, -0.08, 0.12) * 0.08;
  }

  if (statKey === "player_rebounds") {
    const rebRate = readNumber(profile.reboundPerMinute);
    if (rebRate !== null) multiplier += clamp(rebRate - 0.22, -0.1, 0.18) * 0.2;
  }

  if (profile.undervaluedFlags?.length) {
    multiplier += Math.min(0.018, profile.undervaluedFlags.length * 0.006);
    notes.push(`Moneyball flags: ${profile.undervaluedFlags.join(", ")}.`);
  }

  notes.push(`Moneyball player value score ${(profile.valueScore * 100).toFixed(0)}, efficiency ${(profile.efficiencyScore * 100).toFixed(0)}, role ${(profile.roleScore * 100).toFixed(0)}.`);

  return {
    multiplier,
    varianceMultiplier,
    notes
  };
}

function teamSignal(teamProfile: TeamMoneyballProfile | null, opponentProfile: TeamMoneyballProfile | null, statKey: string) {
  const sensitivity = statSensitivity(statKey);
  let multiplier = 1;
  let varianceMultiplier = 1;
  const notes: string[] = [];

  if (teamProfile) {
    const possessionQuality = clamp((teamProfile.possessionQualityScore ?? 0.5) - 0.5, -0.5, 0.5);
    const shootingQuality = clamp((teamProfile.shootingQualityScore ?? 0.5) - 0.5, -0.5, 0.5);
    const ballSecurity = clamp((teamProfile.ballSecurityScore ?? 0.5) - 0.5, -0.5, 0.5);
    multiplier += (possessionQuality * 0.45 + shootingQuality * 0.35 + ballSecurity * 0.2) * sensitivity.team;
    varianceMultiplier += Math.abs(possessionQuality) * sensitivity.variance * 0.35;
    notes.push(`Moneyball team possession score ${(teamProfile.possessionQualityScore * 100).toFixed(0)}.`);
  }

  if (opponentProfile) {
    const defense = readNumber(opponentProfile.defensiveRatingProxy);
    if (defense !== null) {
      multiplier += clamp(defense - 114, -14, 16) * 0.0012 * sensitivity.team;
      varianceMultiplier += Math.abs(clamp(defense - 114, -14, 16)) * 0.0008 * sensitivity.variance;
      notes.push(`Moneyball opponent defensive rating proxy ${defense.toFixed(1)}.`);
    }
  }

  return { multiplier, varianceMultiplier, notes };
}

export async function applyNbaMoneyballAdjustmentToProjection<T extends ProjectionLike>(args: {
  projection: T;
  player: PlayerContext | null;
  opponentTeam: TeamContext;
}) {
  if (!args.player?.team || !args.projection.statKey.startsWith("player_")) {
    return args.projection;
  }

  const [playerProfileRaw, teamProfileRaw, opponentProfileRaw] = await Promise.all([
    getCachedNbaMoneyballPlayerProfile(args.player.id),
    getCachedNbaMoneyballTeamProfile(args.player.team.id),
    args.opponentTeam ? getCachedNbaMoneyballTeamProfile(args.opponentTeam.id) : Promise.resolve(null)
  ]);

  const playerProfile = profileOrNull<PlayerMoneyballProfile>(playerProfileRaw);
  const teamProfile = profileOrNull<TeamMoneyballProfile>(teamProfileRaw);
  const opponentProfile = profileOrNull<TeamMoneyballProfile>(opponentProfileRaw);
  if (!playerProfile && !teamProfile && !opponentProfile) {
    return args.projection;
  }

  const player = playerProfile ? playerSignal(playerProfile, args.projection.statKey) : { multiplier: 1, varianceMultiplier: 1, notes: [] as string[] };
  const team = teamSignal(teamProfile, opponentProfile, args.projection.statKey);
  const multiplier = clamp(player.multiplier * team.multiplier, 0.9, 1.1);
  const varianceMultiplier = clamp(player.varianceMultiplier * team.varianceMultiplier, 0.94, 1.18);
  const previousMetadata = args.projection.metadata ?? {};
  const previousDrivers = Array.isArray(previousMetadata.drivers)
    ? previousMetadata.drivers.filter((value): value is string => typeof value === "string")
    : [];

  return {
    ...args.projection,
    meanValue: Number((args.projection.meanValue * multiplier).toFixed(3)),
    medianValue: Number((args.projection.medianValue * multiplier).toFixed(3)),
    stdDev: Number((args.projection.stdDev * varianceMultiplier).toFixed(3)),
    metadata: {
      ...previousMetadata,
      moneyballAdjusted: true,
      moneyballMultiplier: multiplier,
      moneyballVarianceMultiplier: varianceMultiplier,
      moneyballPlayerValueScore: playerProfile?.valueScore ?? null,
      moneyballPlayerEfficiencyScore: playerProfile?.efficiencyScore ?? null,
      moneyballPlayerRoleScore: playerProfile?.roleScore ?? null,
      moneyballUndervaluedFlags: playerProfile?.undervaluedFlags ?? [],
      moneyballTeamPossessionScore: teamProfile?.possessionQualityScore ?? null,
      moneyballOpponentDefensiveRatingProxy: opponentProfile?.defensiveRatingProxy ?? null,
      drivers: Array.from(new Set([...previousDrivers, ...player.notes, ...team.notes]))
    }
  } as T;
}
