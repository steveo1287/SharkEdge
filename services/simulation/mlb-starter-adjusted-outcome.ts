import { prisma } from "@/lib/db/prisma";

type JsonRecord = Record<string, unknown>;

type MlbTeamFeatureProfile = {
  teamId: string;
  runCreationScore?: number;
  runPreventionScore?: number;
  contactQualityScore?: number;
  disciplineScore?: number;
  platoonScore?: number;
  recentFormScore?: number;
  bullpenFatigueScore?: number;
  dataQualityScore?: number;
  metrics?: Record<string, number | null>;
};

type MlbPitcherFeatureProfile = {
  playerId: string;
  playerName: string;
  starterStrength?: number;
  strikeoutCeiling?: number;
  walkRisk?: number;
  contactDamageRisk?: number;
  staminaScore?: number;
  pitchMixConfidence?: number;
  dataQualityScore?: number;
  metrics?: Record<string, number | null>;
};

export type MlbStarterAdjustedOutcome = {
  available: boolean;
  confidence: number;
  homeStarterName: string | null;
  awayStarterName: string | null;
  homeStarterStrength: number | null;
  awayStarterStrength: number | null;
  homeRunAdjustment: number;
  awayRunAdjustment: number;
  homeSpreadDelta: number;
  totalDelta: number;
  eloPointDelta: number;
  drivers: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function maybeTeamProfile(value: unknown): MlbTeamFeatureProfile | null {
  const record = asRecord(value);
  if (typeof record.teamId !== "string") return null;
  return record as MlbTeamFeatureProfile;
}

function maybePitcherProfile(value: unknown): MlbPitcherFeatureProfile | null {
  const record = asRecord(value);
  if (typeof record.playerId !== "string") return null;
  return record as MlbPitcherFeatureProfile;
}

async function getCachedTeamFeatureProfile(teamId: string) {
  const cached = await prisma.trendCache.findFirst({
    where: {
      cacheKey: `mlb_team_feature_profile:${teamId}`,
      scope: "mlb_team_feature_profile",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return maybeTeamProfile(cached?.payloadJson);
}

async function getCachedPitcherFeatureProfile(playerId: string) {
  const cached = await prisma.trendCache.findFirst({
    where: {
      cacheKey: `mlb_pitcher_feature_profile:${playerId}`,
      scope: "mlb_pitcher_feature_profile",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return maybePitcherProfile(cached?.payloadJson);
}

async function latestTeamProbablePitcher(teamId: string) {
  const row = await prisma.teamGameStat.findFirst({
    where: { teamId },
    orderBy: { updatedAt: "desc" }
  });
  const stats = asRecord(row?.statsJson);
  return {
    mlbId: readString(stats.probablePitcherId),
    name: readString(stats.probablePitcherName)
  };
}

async function findPitcher(args: { teamId: string; mlbId: string | null; name: string | null }) {
  if (args.mlbId) {
    const byExternalId = await prisma.player.findFirst({
      where: {
        teamId: args.teamId,
        externalIds: { path: ["mlb"], equals: args.mlbId }
      }
    });
    if (byExternalId) return byExternalId;
  }

  if (args.name) {
    const byName = await prisma.player.findFirst({
      where: {
        teamId: args.teamId,
        name: { equals: args.name, mode: "insensitive" }
      }
    });
    if (byName) return byName;
  }

  return null;
}

function pitcherStrength(profile: MlbPitcherFeatureProfile | null) {
  if (!profile) return null;
  const starter = readNumber(profile.starterStrength) ?? 0.5;
  const strikeout = readNumber(profile.strikeoutCeiling) ?? 0.5;
  const walkRisk = readNumber(profile.walkRisk) ?? 0.5;
  const damageRisk = readNumber(profile.contactDamageRisk) ?? 0.5;
  const stamina = readNumber(profile.staminaScore) ?? 0.5;
  const quality = readNumber(profile.dataQualityScore) ?? 0.4;
  const strength = clamp(starter * 0.4 + strikeout * 0.18 + (1 - walkRisk) * 0.15 + (1 - damageRisk) * 0.17 + stamina * 0.1, 0, 1);
  return { strength, quality };
}

function teamOffense(profile: MlbTeamFeatureProfile | null) {
  if (!profile) return { score: 0.5, quality: 0.25 };
  const runCreation = readNumber(profile.runCreationScore) ?? 0.5;
  const contact = readNumber(profile.contactQualityScore) ?? 0.5;
  const discipline = readNumber(profile.disciplineScore) ?? 0.5;
  const platoon = readNumber(profile.platoonScore) ?? 0.5;
  const recent = readNumber(profile.recentFormScore) ?? 0.5;
  const quality = readNumber(profile.dataQualityScore) ?? 0.35;
  return {
    score: clamp(runCreation * 0.42 + contact * 0.22 + discipline * 0.14 + platoon * 0.12 + recent * 0.1, 0, 1),
    quality: clamp(quality, 0, 1)
  };
}

function bullpen(profile: MlbTeamFeatureProfile | null) {
  if (!profile) return { score: 0.5, quality: 0.25 };
  const runPrevention = readNumber(profile.runPreventionScore) ?? 0.5;
  const fatigue = readNumber(profile.bullpenFatigueScore) ?? 0.5;
  const quality = readNumber(profile.dataQualityScore) ?? 0.35;
  return {
    score: clamp(runPrevention * 0.58 + fatigue * 0.42, 0, 1),
    quality: clamp(quality, 0, 1)
  };
}

function runAdjustment(args: {
  offenseScore: number;
  opposingStarterStrength: number | null;
  opposingBullpenScore: number;
}) {
  const starter = args.opposingStarterStrength ?? 0.5;
  const offensePressure = (args.offenseScore - 0.5) * 1.8;
  const starterPressure = (0.5 - starter) * 1.45;
  const bullpenPressure = (0.5 - args.opposingBullpenScore) * 0.95;
  return clamp(offensePressure + starterPressure + bullpenPressure, -1.75, 1.75);
}

export async function buildMlbStarterAdjustedOutcome(args: {
  eventId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
}): Promise<MlbStarterAdjustedOutcome> {
  const [homeTeamProfile, awayTeamProfile, homeProbable, awayProbable] = await Promise.all([
    getCachedTeamFeatureProfile(args.homeTeamId),
    getCachedTeamFeatureProfile(args.awayTeamId),
    latestTeamProbablePitcher(args.homeTeamId),
    latestTeamProbablePitcher(args.awayTeamId)
  ]);

  const [homePitcher, awayPitcher] = await Promise.all([
    findPitcher({ teamId: args.homeTeamId, mlbId: homeProbable.mlbId, name: homeProbable.name }),
    findPitcher({ teamId: args.awayTeamId, mlbId: awayProbable.mlbId, name: awayProbable.name })
  ]);

  const [homePitcherProfile, awayPitcherProfile] = await Promise.all([
    homePitcher ? getCachedPitcherFeatureProfile(homePitcher.id) : Promise.resolve(null),
    awayPitcher ? getCachedPitcherFeatureProfile(awayPitcher.id) : Promise.resolve(null)
  ]);

  const homeStarter = pitcherStrength(homePitcherProfile);
  const awayStarter = pitcherStrength(awayPitcherProfile);
  const homeOffense = teamOffense(homeTeamProfile);
  const awayOffense = teamOffense(awayTeamProfile);
  const homeBullpen = bullpen(homeTeamProfile);
  const awayBullpen = bullpen(awayTeamProfile);

  const homeRunAdjustment = runAdjustment({
    offenseScore: homeOffense.score,
    opposingStarterStrength: awayStarter?.strength ?? null,
    opposingBullpenScore: awayBullpen.score
  });
  const awayRunAdjustment = runAdjustment({
    offenseScore: awayOffense.score,
    opposingStarterStrength: homeStarter?.strength ?? null,
    opposingBullpenScore: homeBullpen.score
  });

  const homeSpreadDelta = clamp(homeRunAdjustment - awayRunAdjustment, -2.75, 2.75);
  const totalDelta = clamp(homeRunAdjustment + awayRunAdjustment, -3.5, 3.5);
  const profileQuality = (homeOffense.quality + awayOffense.quality + homeBullpen.quality + awayBullpen.quality) / 4;
  const starterQuality = ((homeStarter?.quality ?? 0) + (awayStarter?.quality ?? 0)) / 2;
  const confidence = clamp(profileQuality * 0.55 + starterQuality * 0.45, 0, 1);
  const eloPointDelta = clamp(homeSpreadDelta * 18, -65, 65);

  const drivers = [
    `MLB starter model home starter ${homeProbable.name ?? homePitcherProfile?.playerName ?? "unknown"}, away starter ${awayProbable.name ?? awayPitcherProfile?.playerName ?? "unknown"}.`,
    `Home run adjustment ${round(homeRunAdjustment, 2)}, away run adjustment ${round(awayRunAdjustment, 2)}.`,
    `Starter-adjusted spread delta ${round(homeSpreadDelta, 2)}, Elo-equivalent delta ${round(eloPointDelta, 1)}.`
  ];

  if (!homePitcherProfile) drivers.push("Home pitcher feature profile missing; starter strength defaulted.");
  if (!awayPitcherProfile) drivers.push("Away pitcher feature profile missing; starter strength defaulted.");
  if (!homeTeamProfile || !awayTeamProfile) drivers.push("One or both MLB team feature profiles missing; offense/bullpen inputs partially defaulted.");

  return {
    available: Boolean(homeTeamProfile || awayTeamProfile || homePitcherProfile || awayPitcherProfile),
    confidence: Number(confidence.toFixed(4)),
    homeStarterName: homeProbable.name ?? homePitcherProfile?.playerName ?? null,
    awayStarterName: awayProbable.name ?? awayPitcherProfile?.playerName ?? null,
    homeStarterStrength: homeStarter ? Number(homeStarter.strength.toFixed(4)) : null,
    awayStarterStrength: awayStarter ? Number(awayStarter.strength.toFixed(4)) : null,
    homeRunAdjustment: Number(homeRunAdjustment.toFixed(4)),
    awayRunAdjustment: Number(awayRunAdjustment.toFixed(4)),
    homeSpreadDelta: Number(homeSpreadDelta.toFixed(4)),
    totalDelta: Number(totalDelta.toFixed(4)),
    eloPointDelta: Number(eloPointDelta.toFixed(4)),
    drivers
  };
}
