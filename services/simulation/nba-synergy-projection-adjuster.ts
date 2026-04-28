import { getCachedNbaSynergyProfile } from "@/services/stats/nba-synergy-playtype-ingestion";

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

type OpponentContext = {
  id: string;
  name: string;
  abbreviation: string;
} | null;

type SynergyRow = {
  playType?: string;
  possessions?: number | null;
  frequency?: number | null;
  ppp?: number | null;
  percentile?: number | null;
};

type SynergyProfile = {
  matchedDbId?: string | null;
  entityName?: string;
  teamAbbreviation?: string | null;
  playTypes?: {
    offense?: Record<string, SynergyRow>;
    defense?: Record<string, SynergyRow>;
  };
  summary?: {
    primaryOffensivePlayType?: string | null;
    primaryOffensiveFrequency?: number | null;
    bestOffensivePlayType?: string | null;
    bestOffensivePpp?: number | null;
    weakestDefensivePlayType?: string | null;
    weakestDefensivePppAllowed?: number | null;
    profileQuality?: "HIGH" | "MEDIUM" | "LOW";
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asProfile(value: unknown): SynergyProfile | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SynergyProfile) : null;
}

function weightedAverage(rows: SynergyRow[], value: (row: SynergyRow) => number | null, weight: (row: SynergyRow) => number | null) {
  let weighted = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const v = value(row);
    const w = weight(row) ?? 1;
    if (v === null || !Number.isFinite(v) || w <= 0) continue;
    weighted += v * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? weighted / totalWeight : null;
}

function profileRows(profile: SynergyProfile | null, side: "offense" | "defense") {
  const rows = profile?.playTypes?.[side] ? Object.values(profile.playTypes[side] ?? {}) : [];
  return rows.filter((row) => typeof row === "object" && row !== null);
}

function getFrequency(row: SynergyRow) {
  const frequency = readNumber(row.frequency);
  if (frequency === null) return null;
  return frequency > 1 ? frequency / 100 : frequency;
}

function qualityWeight(profile: SynergyProfile | null) {
  switch (profile?.summary?.profileQuality) {
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 0.65;
    case "LOW":
      return 0.35;
    default:
      return 0;
  }
}

function playerOffensiveSignal(profile: SynergyProfile | null) {
  const rows = profileRows(profile, "offense");
  if (!rows.length) {
    return null;
  }

  const ppp = weightedAverage(rows, (row) => readNumber(row.ppp), (row) => readNumber(row.possessions) ?? getFrequency(row) ?? 1);
  const percentile = weightedAverage(rows, (row) => readNumber(row.percentile), (row) => readNumber(row.possessions) ?? getFrequency(row) ?? 1);
  const primaryFrequency = readNumber(profile?.summary?.primaryOffensiveFrequency);
  const bestPpp = readNumber(profile?.summary?.bestOffensivePpp);

  return {
    ppp,
    percentile: percentile !== null && percentile > 1 ? percentile / 100 : percentile,
    primaryFrequency: primaryFrequency !== null && primaryFrequency > 1 ? primaryFrequency / 100 : primaryFrequency,
    bestPpp,
    quality: qualityWeight(profile)
  };
}

function opponentDefensiveSignal(profile: SynergyProfile | null) {
  const rows = profileRows(profile, "defense");
  if (!rows.length) {
    return null;
  }

  const pppAllowed = weightedAverage(rows, (row) => readNumber(row.ppp), (row) => readNumber(row.possessions) ?? getFrequency(row) ?? 1);
  const weakestPpp = readNumber(profile?.summary?.weakestDefensivePppAllowed);

  return {
    pppAllowed,
    weakestPpp,
    quality: qualityWeight(profile)
  };
}

function statSensitivity(statKey: string) {
  switch (statKey) {
    case "player_points":
      return { offense: 0.08, defense: 0.045, variance: 0.07 };
    case "player_threes":
      return { offense: 0.06, defense: 0.025, variance: 0.1 };
    case "player_assists":
      return { offense: 0.035, defense: 0.02, variance: 0.05 };
    case "player_rebounds":
      return { offense: 0.018, defense: 0.012, variance: 0.045 };
    default:
      return { offense: 0.02, defense: 0.015, variance: 0.04 };
  }
}

function calculateSynergyAdjustment(args: {
  statKey: string;
  playerProfile: SynergyProfile | null;
  opponentProfile: SynergyProfile | null;
}) {
  const sensitivity = statSensitivity(args.statKey);
  const playerSignal = playerOffensiveSignal(args.playerProfile);
  const opponentSignal = opponentDefensiveSignal(args.opponentProfile);
  let multiplier = 1;
  let varianceMultiplier = 1;
  const notes: string[] = [];

  if (playerSignal && playerSignal.quality > 0) {
    const pppDelta = playerSignal.ppp !== null ? clamp(playerSignal.ppp - 0.98, -0.35, 0.35) : 0;
    const percentileDelta = playerSignal.percentile !== null ? clamp(playerSignal.percentile - 0.5, -0.5, 0.5) : 0;
    const frequencyBoost = playerSignal.primaryFrequency !== null ? clamp(playerSignal.primaryFrequency, 0, 0.45) : 0;
    const offensiveLift = (pppDelta * 0.7 + percentileDelta * 0.3) * sensitivity.offense * playerSignal.quality;
    const volumeLift = frequencyBoost * sensitivity.offense * 0.4 * playerSignal.quality;
    multiplier += offensiveLift + volumeLift;
    varianceMultiplier += frequencyBoost * sensitivity.variance * playerSignal.quality;
    notes.push(`Synergy player offense: PPP ${playerSignal.ppp?.toFixed(3) ?? "n/a"}, quality ${args.playerProfile?.summary?.profileQuality ?? "UNKNOWN"}.`);
  }

  if (opponentSignal && opponentSignal.quality > 0) {
    const pppAllowedDelta = opponentSignal.pppAllowed !== null ? clamp(opponentSignal.pppAllowed - 0.98, -0.3, 0.3) : 0;
    const defensiveLift = pppAllowedDelta * sensitivity.defense * opponentSignal.quality;
    multiplier += defensiveLift;
    varianceMultiplier += Math.abs(pppAllowedDelta) * sensitivity.variance * opponentSignal.quality;
    notes.push(`Synergy opponent defense: PPP allowed ${opponentSignal.pppAllowed?.toFixed(3) ?? "n/a"}, quality ${args.opponentProfile?.summary?.profileQuality ?? "UNKNOWN"}.`);
  }

  return {
    multiplier: clamp(multiplier, 0.92, 1.08),
    varianceMultiplier: clamp(varianceMultiplier, 0.96, 1.16),
    notes,
    playerSignal,
    opponentSignal
  };
}

export async function applyNbaSynergyAdjustmentToProjection<T extends ProjectionLike>(args: {
  projection: T;
  player: PlayerContext | null;
  opponentTeam: OpponentContext;
  season?: string;
}) {
  if (!args.player?.team || !args.projection.statKey.startsWith("player_")) {
    return args.projection;
  }

  const [playerProfileRaw, opponentProfileRaw] = await Promise.all([
    getCachedNbaSynergyProfile({
      season: args.season,
      entityType: "player",
      dbId: args.player.id,
      entityName: args.player.name,
      teamAbbreviation: args.player.team.abbreviation
    }),
    args.opponentTeam
      ? getCachedNbaSynergyProfile({
          season: args.season,
          entityType: "team",
          dbId: args.opponentTeam.id,
          entityName: args.opponentTeam.name,
          teamAbbreviation: args.opponentTeam.abbreviation
        })
      : Promise.resolve(null)
  ]);

  const playerProfile = asProfile(playerProfileRaw);
  const opponentProfile = asProfile(opponentProfileRaw);
  if (!playerProfile && !opponentProfile) {
    return args.projection;
  }

  const adjustment = calculateSynergyAdjustment({
    statKey: args.projection.statKey,
    playerProfile,
    opponentProfile
  });
  const previousMetadata = args.projection.metadata ?? {};
  const previousDrivers = Array.isArray(previousMetadata.drivers)
    ? previousMetadata.drivers.filter((value): value is string => typeof value === "string")
    : [];

  return {
    ...args.projection,
    meanValue: Number((args.projection.meanValue * adjustment.multiplier).toFixed(3)),
    medianValue: Number((args.projection.medianValue * adjustment.multiplier).toFixed(3)),
    stdDev: Number((args.projection.stdDev * adjustment.varianceMultiplier).toFixed(3)),
    metadata: {
      ...previousMetadata,
      synergyAdjusted: true,
      synergyMultiplier: adjustment.multiplier,
      synergyVarianceMultiplier: adjustment.varianceMultiplier,
      synergyPlayerProfileQuality: playerProfile?.summary?.profileQuality ?? null,
      synergyOpponentProfileQuality: opponentProfile?.summary?.profileQuality ?? null,
      synergyPrimaryPlayType: playerProfile?.summary?.primaryOffensivePlayType ?? null,
      synergyOpponentWeakness: opponentProfile?.summary?.weakestDefensivePlayType ?? null,
      synergyPlayerSignal: adjustment.playerSignal,
      synergyOpponentSignal: adjustment.opponentSignal,
      drivers: Array.from(new Set([...previousDrivers, ...adjustment.notes]))
    }
  } as T;
}
