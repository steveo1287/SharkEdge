import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { getMlbDataQualityReport } from "@/services/ops/mlb-data-quality";

type JsonRecord = Record<string, unknown>;

type MlbTeamFeatureProfile = {
  teamId: string;
  teamName: string;
  abbreviation: string;
  sampleSize: number;
  dataQualityScore: number;
  runCreationScore: number;
  runPreventionScore: number;
  contactQualityScore: number;
  disciplineScore: number;
  platoonScore: number;
  recentFormScore: number;
  bullpenFatigueScore: number;
  weatherParkCoverage: number;
  metrics: Record<string, number | null>;
  updatedAt: string;
};

type MlbPitcherFeatureProfile = {
  playerId: string;
  playerName: string;
  teamId: string;
  sampleSize: number;
  dataQualityScore: number;
  starterStrength: number;
  strikeoutCeiling: number;
  walkRisk: number;
  contactDamageRisk: number;
  staminaScore: number;
  pitchMixConfidence: number;
  metrics: Record<string, number | null>;
  updatedAt: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function statcast(value: unknown) {
  return asRecord(asRecord(value).statcast);
}

function pitching(value: unknown) {
  return asRecord(statcast(value).pitching);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pick(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.86) {
  let total = 0;
  let weightTotal = 0;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const weight = decay ** index;
    total += value * weight;
    weightTotal += weight;
  });
  return weightTotal ? total / weightTotal : null;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function coverage(values: Array<number | null | undefined>) {
  return values.length ? values.filter((value) => typeof value === "number" && Number.isFinite(value)).length / values.length : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function score(value: number | null, baseline: number, spread: number, invert = false) {
  if (value === null) return 0.5;
  const raw = clamp(0.5 + (value - baseline) / spread, 0, 1);
  return invert ? 1 - raw : raw;
}

function round(value: number | null, digits = 4) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function statcastPresence(rows: JsonRecord[]) {
  return rows.map((row) => (Object.keys(statcast(row)).length ? 1 : null));
}

function buildTeamProfile(team: {
  id: string;
  name: string;
  abbreviation: string;
  teamGameStats: Array<{ statsJson: Prisma.JsonValue }>;
}): MlbTeamFeatureProfile | null {
  const rows = team.teamGameStats.map((row) => asRecord(row.statsJson));
  if (!rows.length) return null;
  const runs = rows.map((row) => pick(row, ["runs", "R", "points"]));
  const runsAllowed = rows.map((row) => pick(row, ["runs_allowed", "RA", "opp_points"]));
  const ops = rows.map((row) => pick(row, ["ops"]));
  const iso = rows.map((row) => pick(row, ["iso"]));
  const walkRate = rows.map((row) => pick(row, ["walkRate"]));
  const strikeoutRate = rows.map((row) => pick(row, ["strikeoutRate"]));
  const xwoba = rows.map((row) => readNumber(statcast(row).xwoba));
  const hardHitRate = rows.map((row) => readNumber(statcast(row).hardHitRate));
  const barrelRate = rows.map((row) => readNumber(statcast(row).barrelRate));
  const chaseRate = rows.map((row) => readNumber(statcast(row).chaseRate));
  const whiffRate = rows.map((row) => readNumber(statcast(row).whiffRate));
  const bullpenInnings = rows.map((row) => pick(row, ["bullpenInningsLast3"]));
  const bullpenPitches = rows.map((row) => pick(row, ["bullpenPitchesLast3"]));
  const weatherFactor = rows.map((row) => pick(row, ["weatherRunFactor", "weatherWindFactor"]));
  const vsLeft = rows.map((row) => pick(row, ["wrcPlusVsLhp", "vsLeftScore"]));
  const vsRight = rows.map((row) => pick(row, ["wrcPlusVsRhp", "vsRightScore"]));

  const avgRuns = weightedAverage(runs);
  const avgRunsAllowed = weightedAverage(runsAllowed);
  const avgOps = weightedAverage(ops);
  const avgIso = weightedAverage(iso);
  const avgWalkRate = weightedAverage(walkRate);
  const avgStrikeoutRate = weightedAverage(strikeoutRate);
  const avgXwoba = weightedAverage(xwoba);
  const avgHardHitRate = weightedAverage(hardHitRate);
  const avgBarrelRate = weightedAverage(barrelRate);
  const avgChaseRate = weightedAverage(chaseRate);
  const avgWhiffRate = weightedAverage(whiffRate);
  const avgBullpenInnings = weightedAverage(bullpenInnings);
  const avgBullpenPitches = weightedAverage(bullpenPitches);
  const avgWeatherFactor = weightedAverage(weatherFactor);
  const avgVsLeft = weightedAverage(vsLeft);
  const avgVsRight = weightedAverage(vsRight);

  const contactQualityScore = clamp(
    score(avgXwoba, 0.315, 0.11) * 0.32 +
    score(avgHardHitRate, 0.39, 0.22) * 0.24 +
    score(avgBarrelRate, 0.075, 0.09) * 0.24 +
    score(avgOps, 0.72, 0.22) * 0.12 +
    score(avgIso, 0.16, 0.12) * 0.08,
    0,
    1
  );
  const disciplineScore = clamp(score(avgWalkRate, 0.085, 0.08) * 0.45 + score(avgStrikeoutRate, 0.225, 0.16, true) * 0.35 + score(avgChaseRate, 0.31, 0.18, true) * 0.2, 0, 1);
  const platoonScore = clamp(average([score(avgVsLeft, 100, 35), score(avgVsRight, 100, 35)]) ?? 0.5, 0, 1);
  const recentFormScore = clamp(score(avgRuns, 4.45, 2.2) * 0.55 + score(avgRunsAllowed, 4.45, 2.2, true) * 0.45, 0, 1);
  const bullpenFatigueScore = clamp(score(avgBullpenInnings, 3.4, 3.5, true) * 0.55 + score(avgBullpenPitches, 30, 60, true) * 0.45, 0, 1);
  const runCreationScore = clamp(contactQualityScore * 0.46 + disciplineScore * 0.22 + platoonScore * 0.16 + recentFormScore * 0.16, 0, 1);
  const runPreventionScore = clamp(score(avgRunsAllowed, 4.45, 2.2, true) * 0.62 + bullpenFatigueScore * 0.24 + score(avgWhiffRate, 0.245, 0.18) * 0.14, 0, 1);
  const dataQualityScore = clamp(coverage([...runs, ...runsAllowed]) * 0.28 + coverage(xwoba) * 0.22 + coverage([...bullpenInnings, ...bullpenPitches]) * 0.18 + coverage(weatherFactor) * 0.12 + coverage([...vsLeft, ...vsRight]) * 0.1 + coverage(statcastPresence(rows)) * 0.1, 0, 1);

  return {
    teamId: team.id,
    teamName: team.name,
    abbreviation: team.abbreviation,
    sampleSize: rows.length,
    dataQualityScore: Number(dataQualityScore.toFixed(4)),
    runCreationScore: Number(runCreationScore.toFixed(4)),
    runPreventionScore: Number(runPreventionScore.toFixed(4)),
    contactQualityScore: Number(contactQualityScore.toFixed(4)),
    disciplineScore: Number(disciplineScore.toFixed(4)),
    platoonScore: Number(platoonScore.toFixed(4)),
    recentFormScore: Number(recentFormScore.toFixed(4)),
    bullpenFatigueScore: Number(bullpenFatigueScore.toFixed(4)),
    weatherParkCoverage: Number(coverage(weatherFactor).toFixed(4)),
    metrics: {
      runsPerGame: round(avgRuns),
      runsAllowed: round(avgRunsAllowed),
      ops: round(avgOps),
      iso: round(avgIso),
      walkRate: round(avgWalkRate),
      strikeoutRate: round(avgStrikeoutRate),
      xwoba: round(avgXwoba),
      hardHitRate: round(avgHardHitRate),
      barrelRate: round(avgBarrelRate),
      chaseRate: round(avgChaseRate),
      whiffRate: round(avgWhiffRate),
      bullpenInnings: round(avgBullpenInnings),
      bullpenPitches: round(avgBullpenPitches),
      weatherFactor: round(avgWeatherFactor),
      vsLeftScore: round(avgVsLeft),
      vsRightScore: round(avgVsRight)
    },
    updatedAt: new Date().toISOString()
  };
}

function buildPitcherProfile(player: {
  id: string;
  name: string;
  teamId: string;
  playerGameStats: Array<{ statsJson: Prisma.JsonValue; starter: boolean; minutes: number | null }>;
}): MlbPitcherFeatureProfile | null {
  const rows = player.playerGameStats.map((row) => ({ ...asRecord(row.statsJson), starter: row.starter, minutes: row.minutes }));
  const pitcherRows = rows.filter((row) => pick(row, ["pitcherOuts", "outsPitched", "recorded_outs", "pitchingStrikeouts", "pitchesThrown"]) !== null || row.starter === true);
  if (!pitcherRows.length) return null;

  const outs = pitcherRows.map((row) => pick(row, ["pitcherOuts", "outsPitched", "recorded_outs"]));
  const strikeouts = pitcherRows.map((row) => pick(row, ["pitchingStrikeouts", "strikeoutsPitching", "SO"]));
  const walksAllowed = pitcherRows.map((row) => pick(row, ["walksAllowed", "pitcherWalks"]));
  const hitsAllowed = pitcherRows.map((row) => pick(row, ["hitsAllowed"]));
  const earnedRuns = pitcherRows.map((row) => pick(row, ["earnedRuns"]));
  const pitchesThrown = pitcherRows.map((row) => pick(row, ["pitchesThrown", "pitchCount"]));
  const whiffAllowed = pitcherRows.map((row) => readNumber(pitching(row).whiffRateAllowed));
  const chaseInduced = pitcherRows.map((row) => readNumber(pitching(row).chaseRateInduced));
  const statcastXwoba = pitcherRows.map((row) => readNumber(statcast(row).xwoba));
  const hardHit = pitcherRows.map((row) => readNumber(statcast(row).hardHitRate));
  const barrel = pitcherRows.map((row) => readNumber(statcast(row).barrelRate));
  const pitchMixCounts = pitcherRows.map((row) => Object.keys(asRecord(pitching(row).pitchMix)).length);

  const avgOuts = weightedAverage(outs);
  const avgKs = weightedAverage(strikeouts);
  const avgWalks = weightedAverage(walksAllowed);
  const avgHits = weightedAverage(hitsAllowed);
  const avgEarnedRuns = weightedAverage(earnedRuns);
  const avgPitches = weightedAverage(pitchesThrown);
  const avgWhiff = weightedAverage(whiffAllowed);
  const avgChase = weightedAverage(chaseInduced);
  const avgXwoba = weightedAverage(statcastXwoba);
  const avgHardHit = weightedAverage(hardHit);
  const avgBarrel = weightedAverage(barrel);
  const avgPitchMixCount = average(pitchMixCounts);
  const innings = avgOuts !== null ? avgOuts / 3 : null;
  const kPerOut = avgOuts ? (avgKs ?? 0) / avgOuts : null;
  const walkPerOut = avgOuts ? (avgWalks ?? 0) / avgOuts : null;
  const whipProxy = innings && innings > 0 ? ((avgHits ?? 0) + (avgWalks ?? 0)) / innings : null;
  const eraProxy = innings && innings > 0 && avgEarnedRuns !== null ? avgEarnedRuns * 9 / innings : null;

  const staminaScore = clamp(score(avgOuts, 16, 8) * 0.6 + score(avgPitches, 82, 34) * 0.4, 0, 1);
  const strikeoutCeiling = clamp(score(kPerOut, 0.27, 0.18) * 0.55 + score(avgWhiff, 0.12, 0.12) * 0.3 + score(avgChase, 0.3, 0.18) * 0.15, 0, 1);
  const walkRisk = clamp(score(walkPerOut, 0.1, 0.13) * 0.55 + score(whipProxy, 1.25, 0.75) * 0.45, 0, 1);
  const contactDamageRisk = clamp(score(avgXwoba, 0.315, 0.12) * 0.35 + score(avgHardHit, 0.39, 0.22) * 0.35 + score(avgBarrel, 0.075, 0.09) * 0.3, 0, 1);
  const starterStrength = clamp(staminaScore * 0.25 + strikeoutCeiling * 0.28 + (1 - walkRisk) * 0.23 + (1 - contactDamageRisk) * 0.24, 0, 1);
  const pitchMixConfidence = clamp((avgPitchMixCount ?? 0) / 5, 0, 1);
  const dataQualityScore = clamp(coverage([...outs, ...strikeouts, ...pitchesThrown]) * 0.45 + coverage([avgWhiff, avgChase, avgXwoba, avgHardHit, avgBarrel]) * 0.35 + pitchMixConfidence * 0.2, 0, 1);

  return {
    playerId: player.id,
    playerName: player.name,
    teamId: player.teamId,
    sampleSize: pitcherRows.length,
    dataQualityScore: Number(dataQualityScore.toFixed(4)),
    starterStrength: Number(starterStrength.toFixed(4)),
    strikeoutCeiling: Number(strikeoutCeiling.toFixed(4)),
    walkRisk: Number(walkRisk.toFixed(4)),
    contactDamageRisk: Number(contactDamageRisk.toFixed(4)),
    staminaScore: Number(staminaScore.toFixed(4)),
    pitchMixConfidence: Number(pitchMixConfidence.toFixed(4)),
    metrics: {
      outs: round(avgOuts),
      strikeouts: round(avgKs),
      walksAllowed: round(avgWalks),
      whipProxy: round(whipProxy),
      eraProxy: round(eraProxy),
      pitchesThrown: round(avgPitches),
      whiffRate: round(avgWhiff),
      chaseRate: round(avgChase),
      xwobaAllowed: round(avgXwoba),
      hardHitAllowed: round(avgHardHit),
      barrelAllowed: round(avgBarrel),
      pitchMixCount: round(avgPitchMixCount)
    },
    updatedAt: new Date().toISOString()
  };
}

export async function refreshMlbFeatureProfiles(args: { lookbackGames?: number; qualityLookbackDays?: number } = {}) {
  const lookbackGames = Math.max(5, Math.min(30, args.lookbackGames ?? 12));
  const qualityLookbackDays = Math.max(1, Math.min(60, args.qualityLookbackDays ?? 7));
  const league = await prisma.league.findUnique({ where: { key: "MLB" } });
  if (!league) return { ok: false, reason: "MLB league missing", teamProfiles: 0, pitcherProfiles: 0, dataQuality: null };

  const dataQuality = await getMlbDataQualityReport({ lookbackDays: qualityLookbackDays });
  const teams = await prisma.team.findMany({
    where: { leagueId: league.id },
    include: { teamGameStats: { orderBy: { updatedAt: "desc" }, take: lookbackGames } }
  });
  const players = await prisma.player.findMany({
    where: { leagueId: league.id },
    include: { playerGameStats: { orderBy: { updatedAt: "desc" }, take: lookbackGames } }
  });

  let teamProfiles = 0;
  for (const team of teams) {
    const profile = buildTeamProfile(team);
    if (!profile) continue;
    await prisma.trendCache.upsert({
      where: { cacheKey: `mlb_team_feature_profile:${team.id}` },
      update: {
        scope: "mlb_team_feature_profile",
        filterJson: toJson({ teamId: team.id, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      },
      create: {
        cacheKey: `mlb_team_feature_profile:${team.id}`,
        scope: "mlb_team_feature_profile",
        filterJson: toJson({ teamId: team.id, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      }
    });
    teamProfiles += 1;
  }

  let pitcherProfiles = 0;
  for (const player of players) {
    const profile = buildPitcherProfile(player);
    if (!profile) continue;
    await prisma.trendCache.upsert({
      where: { cacheKey: `mlb_pitcher_feature_profile:${player.id}` },
      update: {
        scope: "mlb_pitcher_feature_profile",
        filterJson: toJson({ playerId: player.id, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      },
      create: {
        cacheKey: `mlb_pitcher_feature_profile:${player.id}`,
        scope: "mlb_pitcher_feature_profile",
        filterJson: toJson({ playerId: player.id, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      }
    });
    pitcherProfiles += 1;
  }

  await prisma.trendCache.upsert({
    where: { cacheKey: "mlb_feature_profile_summary" },
    update: {
      scope: "mlb_feature_profile_summary",
      filterJson: toJson({ lookbackGames, qualityLookbackDays }),
      payloadJson: toJson({ teamProfiles, pitcherProfiles, dataQuality, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
    },
    create: {
      cacheKey: "mlb_feature_profile_summary",
      scope: "mlb_feature_profile_summary",
      filterJson: toJson({ lookbackGames, qualityLookbackDays }),
      payloadJson: toJson({ teamProfiles, pitcherProfiles, dataQuality, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
    }
  });

  return { ok: true, teamProfiles, pitcherProfiles, dataQuality };
}
