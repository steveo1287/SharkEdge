import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type TeamStatRow = {
  statsJson: Prisma.JsonValue;
  game?: {
    startTime: Date;
    homeTeamId: string;
    awayTeamId: string;
    venue: string | null;
    scoreJson?: Prisma.JsonValue | null;
    liveStateJson?: Prisma.JsonValue | null;
  };
};

type SplitProfile = {
  sampleSize: number;
  offense: number | null;
  defenseAllowed: number | null;
  margin: number | null;
  pace: number | null;
  powerScore: number;
};

type NbaPowerDetails = {
  homeAwaySplits: {
    home: SplitProfile;
    away: SplitProfile;
  };
  restSplits: {
    zeroOrOneDay: SplitProfile;
    twoPlusDays: SplitProfile;
  };
  windowBlend: {
    last5: SplitProfile;
    last10: SplitProfile;
    season: SplitProfile;
    blendedPowerScore: number;
  };
  fourFactors: {
    effectiveFgPct: number | null;
    turnoverRate: number | null;
    reboundRate: number | null;
    freeThrowRate: number | null;
  };
};

type MlbPowerDetails = {
  startingPitcherStrength: number;
  bullpenStrength: number;
  hittingVsHandedness: {
    vsLeft: number | null;
    vsRight: number | null;
    available: boolean;
  };
  parkFactor: number;
  weatherWindFactor: number;
  defensiveEfficiency: number;
  recentBullpenFatigue: number;
  travelRest: number;
  runCreationScore: number;
  runPreventionScore: number;
};

export type TeamPowerRatingProfile = {
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  leagueKey: string;
  sampleSize: number;
  weightedOffense: number | null;
  weightedDefenseAllowed: number | null;
  weightedMargin: number | null;
  weightedPace: number | null;
  offensiveRatingProxy: number | null;
  defensiveRatingProxy: number | null;
  netRatingProxy: number | null;
  shootingScore: number;
  ballSecurityScore: number;
  reboundScore: number;
  formScore: number;
  consistencyScore: number;
  powerScore: number;
  powerTier: "ELITE" | "STRONG" | "AVERAGE" | "WEAK" | "BAD";
  nba?: NbaPowerDetails;
  mlb?: MlbPowerDetails;
  updatedAt: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stat(row: { statsJson: Prisma.JsonValue }, keys: string[]) {
  const record = asRecord(row.statsJson);
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.86) {
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : null;
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return null;
  const mean = average(values) ?? 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentileish(value: number | null, baseline: number, spread: number, invert = false) {
  if (value === null || !Number.isFinite(value)) return 0.5;
  const raw = clamp(0.5 + (value - baseline) / spread, 0, 1);
  return invert ? 1 - raw : raw;
}

function round(value: number | null, digits = 4) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function tier(powerScore: number): TeamPowerRatingProfile["powerTier"] {
  if (powerScore >= 0.78) return "ELITE";
  if (powerScore >= 0.63) return "STRONG";
  if (powerScore >= 0.43) return "AVERAGE";
  if (powerScore >= 0.28) return "WEAK";
  return "BAD";
}

function points(row: TeamStatRow) {
  return stat(row, ["points", "PTS", "runs", "R", "goals", "G"]);
}

function oppPoints(row: TeamStatRow) {
  return stat(row, ["opp_points", "oppPTS", "points_allowed", "runs_allowed", "RA", "goals_allowed", "GA"]);
}

function pace(row: TeamStatRow) {
  return stat(row, ["possessions", "pace", "plays", "shots", "plate_appearances"]);
}

function rowMargin(row: TeamStatRow) {
  const scored = points(row);
  const allowed = oppPoints(row);
  return scored !== null && allowed !== null ? scored - allowed : null;
}

function splitProfile(rows: TeamStatRow[], leagueKey: string): SplitProfile {
  const offense = weightedAverage(rows.map(points));
  const defenseAllowed = weightedAverage(rows.map(oppPoints));
  const margin = weightedAverage(rows.map(rowMargin));
  const weightedPace = weightedAverage(rows.map(pace));
  const nbaLike = leagueKey === "NBA" || leagueKey === "NCAAB";
  const nflLike = leagueKey === "NFL" || leagueKey === "NCAAF";
  const baseline = nbaLike ? 114 : nflLike ? 23.5 : leagueKey === "MLB" ? 4.4 : 50;
  const spread = nbaLike ? 16 : nflLike ? 14 : leagueKey === "MLB" ? 3 : 10;
  const powerScore = clamp(
    percentileish(offense, baseline, spread * 1.25) * 0.38 +
    percentileish(defenseAllowed, baseline, spread * 1.25, true) * 0.34 +
    percentileish(margin, 0, spread) * 0.28,
    0,
    1
  );
  return {
    sampleSize: rows.length,
    offense: round(offense),
    defenseAllowed: round(defenseAllowed),
    margin: round(margin),
    pace: round(weightedPace),
    powerScore: Number(powerScore.toFixed(4))
  };
}

function daysBetween(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
}

function buildNbaDetails(teamId: string, rows: TeamStatRow[], base: { effectiveFgPct: number | null; turnoverRate: number | null; reboundRate: number | null; freeThrowRate: number | null }): NbaPowerDetails | undefined {
  if (!rows.length) return undefined;
  const sorted = [...rows].sort((left, right) => right.game!.startTime.getTime() - left.game!.startTime.getTime());
  const homeRows = sorted.filter((row) => row.game?.homeTeamId === teamId);
  const awayRows = sorted.filter((row) => row.game?.awayTeamId === teamId);
  const zeroOrOneDay: TeamStatRow[] = [];
  const twoPlusDays: TeamStatRow[] = [];

  sorted.forEach((row, index) => {
    const next = sorted[index + 1];
    if (!next?.game || !row.game) return;
    const restDays = daysBetween(row.game.startTime, next.game.startTime);
    if (restDays <= 1.5) zeroOrOneDay.push(row);
    else twoPlusDays.push(row);
  });

  const last5 = sorted.slice(0, 5);
  const last10 = sorted.slice(0, 10);
  const season = sorted;
  const last5Profile = splitProfile(last5, "NBA");
  const last10Profile = splitProfile(last10, "NBA");
  const seasonProfile = splitProfile(season, "NBA");
  const blendedPowerScore = clamp(last5Profile.powerScore * 0.5 + last10Profile.powerScore * 0.3 + seasonProfile.powerScore * 0.2, 0, 1);

  return {
    homeAwaySplits: {
      home: splitProfile(homeRows, "NBA"),
      away: splitProfile(awayRows, "NBA")
    },
    restSplits: {
      zeroOrOneDay: splitProfile(zeroOrOneDay, "NBA"),
      twoPlusDays: splitProfile(twoPlusDays, "NBA")
    },
    windowBlend: {
      last5: last5Profile,
      last10: last10Profile,
      season: seasonProfile,
      blendedPowerScore: Number(blendedPowerScore.toFixed(4))
    },
    fourFactors: {
      effectiveFgPct: round(base.effectiveFgPct),
      turnoverRate: round(base.turnoverRate),
      reboundRate: round(base.reboundRate),
      freeThrowRate: round(base.freeThrowRate)
    }
  };
}

function metadataNumber(rows: TeamStatRow[], keys: string[]) {
  return weightedAverage(rows.map((row) => {
    const record = asRecord(row.statsJson);
    for (const key of keys) {
      const value = readNumber(record[key]);
      if (value !== null) return value;
    }
    const game = asRecord(row.game?.scoreJson);
    for (const key of keys) {
      const value = readNumber(game[key]);
      if (value !== null) return value;
    }
    const live = asRecord(row.game?.liveStateJson);
    for (const key of keys) {
      const value = readNumber(live[key]);
      if (value !== null) return value;
    }
    return null;
  }));
}

function buildMlbDetails(rows: TeamStatRow[], base: { weightedOffense: number | null; weightedDefenseAllowed: number | null; weightedMargin: number | null }): MlbPowerDetails | undefined {
  if (!rows.length) return undefined;
  const startingPitcherRaw = metadataNumber(rows, ["starterStrength", "startingPitcherStrength", "sp_strength", "starter_era_plus"]);
  const bullpenRaw = metadataNumber(rows, ["bullpenStrength", "bullpen_score", "bullpenEraPlus", "reliefPitchingScore"]);
  const vsLeft = metadataNumber(rows, ["wrcPlusVsLhp", "wRC+_vs_lhp", "opsVsLhp", "vsLeftScore"]);
  const vsRight = metadataNumber(rows, ["wrcPlusVsRhp", "wRC+_vs_rhp", "opsVsRhp", "vsRightScore"]);
  const parkRaw = metadataNumber(rows, ["parkFactor", "park_factor", "runParkFactor"]);
  const weatherRaw = metadataNumber(rows, ["weatherRunFactor", "weatherWindFactor", "windRunFactor"]);
  const defensiveRaw = metadataNumber(rows, ["defensiveEfficiency", "def_eff", "outsAboveAverage", "drs", "fieldingScore"]);
  const bullpenUsage = metadataNumber(rows, ["bullpenInningsLast3", "reliefInningsLast3", "bullpenPitchesLast3", "relieverPitchesLast3"]);
  const travelRestRaw = metadataNumber(rows, ["travelRestScore", "restTravelScore", "daysRest"]);
  const runs = base.weightedOffense;
  const runsAllowed = base.weightedDefenseAllowed;
  const margin = base.weightedMargin;

  const startingPitcherStrength = percentileish(startingPitcherRaw, 100, 40);
  const bullpenStrength = bullpenRaw !== null ? percentileish(bullpenRaw, 100, 40) : percentileish(runsAllowed, 4.4, 2.2, true);
  const parkFactor = parkRaw !== null ? clamp(parkRaw > 2 ? parkRaw / 100 : parkRaw, 0.75, 1.25) : 1;
  const weatherWindFactor = weatherRaw !== null ? clamp(weatherRaw > 2 ? weatherRaw / 100 : weatherRaw, 0.85, 1.15) : 1;
  const defensiveEfficiency = defensiveRaw !== null ? percentileish(defensiveRaw, 0, 20) : percentileish(runsAllowed, 4.4, 2.1, true);
  const recentBullpenFatigue = bullpenUsage !== null ? percentileish(bullpenUsage, 12, 12) : 0.5;
  const travelRest = travelRestRaw !== null ? percentileish(travelRestRaw, 1, 3) : 0.5;
  const handednessAvailable = vsLeft !== null || vsRight !== null;
  const handednessScore = average([vsLeft !== null ? percentileish(vsLeft, 100, 35) : null, vsRight !== null ? percentileish(vsRight, 100, 35) : null]);
  const runCreationScore = clamp(
    percentileish(runs, 4.4, 2.2) * 0.42 +
    (handednessScore ?? 0.5) * 0.24 +
    (parkFactor - 0.75) / 0.5 * 0.14 +
    (weatherWindFactor - 0.85) / 0.3 * 0.08 +
    percentileish(margin, 0, 3) * 0.12,
    0,
    1
  );
  const runPreventionScore = clamp(
    percentileish(runsAllowed, 4.4, 2.2, true) * 0.28 +
    startingPitcherStrength * 0.25 +
    bullpenStrength * 0.2 +
    defensiveEfficiency * 0.17 +
    (1 - recentBullpenFatigue) * 0.1,
    0,
    1
  );

  return {
    startingPitcherStrength: Number(startingPitcherStrength.toFixed(4)),
    bullpenStrength: Number(bullpenStrength.toFixed(4)),
    hittingVsHandedness: {
      vsLeft: vsLeft !== null ? Number(percentileish(vsLeft, 100, 35).toFixed(4)) : null,
      vsRight: vsRight !== null ? Number(percentileish(vsRight, 100, 35).toFixed(4)) : null,
      available: handednessAvailable
    },
    parkFactor: Number(parkFactor.toFixed(4)),
    weatherWindFactor: Number(weatherWindFactor.toFixed(4)),
    defensiveEfficiency: Number(defensiveEfficiency.toFixed(4)),
    recentBullpenFatigue: Number(recentBullpenFatigue.toFixed(4)),
    travelRest: Number(travelRest.toFixed(4)),
    runCreationScore: Number(runCreationScore.toFixed(4)),
    runPreventionScore: Number(runPreventionScore.toFixed(4))
  };
}

function buildProfile(team: {
  id: string;
  name: string;
  abbreviation: string;
  league: { key: string };
  teamGameStats: TeamStatRow[];
}): TeamPowerRatingProfile | null {
  const rows = team.teamGameStats;
  if (rows.length < 3) return null;

  const pointValues = rows.map(points);
  const oppPointValues = rows.map(oppPoints);
  const possessions = rows.map(pace);
  const fga = rows.map((row) => stat(row, ["fieldGoalsAttempted", "FGA", "shotAttempts"]));
  const fgm = rows.map((row) => stat(row, ["fieldGoalsMade", "FGM", "shotsMade"]));
  const fg3m = rows.map((row) => stat(row, ["threes", "FG3M", "threePointMade"]));
  const fta = rows.map((row) => stat(row, ["freeThrowsAttempted", "FTA"]));
  const turnovers = rows.map((row) => stat(row, ["turnovers", "TO"]));
  const oreb = rows.map((row) => stat(row, ["offensiveRebounds", "OREB"]));
  const rebounds = rows.map((row) => stat(row, ["rebounds", "REB", "totalRebounds"]));
  const oppRebounds = rows.map((row) => stat(row, ["opp_rebounds", "oppREB", "opponentRebounds"]));
  const margins = rows.map(rowMargin);

  const weightedOffense = weightedAverage(pointValues);
  const weightedDefenseAllowed = weightedAverage(oppPointValues);
  const weightedMargin = weightedAverage(margins);
  const weightedPace = weightedAverage(possessions);
  const totalPoints = pointValues.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalOppPoints = oppPointValues.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalPossessions = possessions.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFga = fga.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFgm = fgm.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFg3m = fg3m.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalFta = fta.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalTurnovers = turnovers.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalOreb = oreb.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalRebounds = rebounds.reduce((sum, value) => sum + (value ?? 0), 0);
  const totalOppRebounds = oppRebounds.reduce((sum, value) => sum + (value ?? 0), 0);
  const offensiveRatingProxy = totalPossessions > 0 ? totalPoints / totalPossessions * 100 : weightedOffense;
  const defensiveRatingProxy = totalPossessions > 0 ? totalOppPoints / totalPossessions * 100 : weightedDefenseAllowed;
  const netRatingProxy = offensiveRatingProxy !== null && defensiveRatingProxy !== null ? offensiveRatingProxy - defensiveRatingProxy : weightedMargin;
  const effectiveFgPct = totalFga > 0 ? (totalFgm + 0.5 * totalFg3m) / totalFga : null;
  const freeThrowRate = totalFga > 0 ? totalFta / totalFga : null;
  const turnoverRate = totalFga + 0.44 * totalFta + totalTurnovers > 0
    ? totalTurnovers / (totalFga + 0.44 * totalFta + totalTurnovers)
    : null;
  const reboundRate = totalRebounds + totalOppRebounds > 0 ? totalRebounds / (totalRebounds + totalOppRebounds) : null;
  const orebRateProxy = totalFga - totalFgm + totalOreb > 0 ? totalOreb / (totalFga - totalFgm + totalOreb) : null;
  const marginValues = margins.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const marginStd = standardDeviation(marginValues);
  const leagueKey = team.league.key;
  const nbaLike = leagueKey === "NBA" || leagueKey === "NCAAB";
  const nflLike = leagueKey === "NFL" || leagueKey === "NCAAF";
  const scoringBaseline = nbaLike ? 114 : nflLike ? 23.5 : leagueKey === "MLB" ? 4.4 : 50;
  const marginSpread = nbaLike ? 16 : nflLike ? 14 : leagueKey === "MLB" ? 3 : 10;
  const paceBaseline = nbaLike ? 99 : nflLike ? 64 : leagueKey === "MLB" ? 38 : 50;

  const shootingScore = clamp(
    percentileish(effectiveFgPct, 0.54, 0.18) * 0.65 +
    percentileish(freeThrowRate, 0.25, 0.22) * 0.35,
    0,
    1
  );
  const ballSecurityScore = percentileish(turnoverRate, 0.13, 0.12, true);
  const reboundScore = percentileish(reboundRate ?? orebRateProxy, 0.5, 0.18);
  const formScore = percentileish(weightedMargin, 0, marginSpread);
  const consistencyScore = marginStd === null ? 0.5 : clamp(1 - marginStd / Math.max(6, marginSpread), 0, 1);
  const offenseScore = percentileish(offensiveRatingProxy, scoringBaseline, marginSpread * 1.25);
  const defenseScore = percentileish(defensiveRatingProxy, scoringBaseline, marginSpread * 1.25, true);
  const paceScore = percentileish(weightedPace, paceBaseline, paceBaseline * 0.25);
  const mlb = leagueKey === "MLB" ? buildMlbDetails(rows, { weightedOffense, weightedDefenseAllowed, weightedMargin }) : undefined;
  const nba = nbaLike ? buildNbaDetails(team.id, rows, { effectiveFgPct, turnoverRate, reboundRate, freeThrowRate }) : undefined;
  const sportSpecificBoost = leagueKey === "MLB" && mlb
    ? (mlb.runCreationScore * 0.18 + mlb.runPreventionScore * 0.2 + (1 - mlb.recentBullpenFatigue) * 0.05)
    : nba
      ? nba.windowBlend.blendedPowerScore * 0.18
      : 0;
  const genericBase =
    offenseScore * 0.21 +
    defenseScore * 0.2 +
    formScore * 0.18 +
    shootingScore * 0.12 +
    ballSecurityScore * 0.08 +
    reboundScore * 0.07 +
    consistencyScore * 0.05 +
    paceScore * 0.03;
  const sportSpecificWeight = leagueKey === "MLB" ? 0.25 : nba ? 0.18 : 0;
  const powerScore = clamp(genericBase * (1 - sportSpecificWeight) + sportSpecificBoost, 0, 1);

  return {
    teamId: team.id,
    teamName: team.name,
    teamAbbreviation: team.abbreviation,
    leagueKey,
    sampleSize: rows.length,
    weightedOffense: round(weightedOffense),
    weightedDefenseAllowed: round(weightedDefenseAllowed),
    weightedMargin: round(weightedMargin),
    weightedPace: round(weightedPace),
    offensiveRatingProxy: round(offensiveRatingProxy),
    defensiveRatingProxy: round(defensiveRatingProxy),
    netRatingProxy: round(netRatingProxy),
    shootingScore: Number(shootingScore.toFixed(4)),
    ballSecurityScore: Number(ballSecurityScore.toFixed(4)),
    reboundScore: Number(reboundScore.toFixed(4)),
    formScore: Number(formScore.toFixed(4)),
    consistencyScore: Number(consistencyScore.toFixed(4)),
    powerScore: Number(powerScore.toFixed(4)),
    powerTier: tier(powerScore),
    nba,
    mlb,
    updatedAt: new Date().toISOString()
  };
}

export async function refreshTeamPowerRatings(args: { leagueKey?: string | null; lookbackGames?: number } = {}) {
  const leagueKey = args.leagueKey ?? null;
  const lookbackGames = Math.max(5, Math.min(30, args.lookbackGames ?? 12));
  const teams = await prisma.team.findMany({
    where: leagueKey ? { league: { key: leagueKey } } : undefined,
    include: {
      league: { select: { key: true } },
      teamGameStats: {
        orderBy: { createdAt: "desc" },
        take: lookbackGames,
        include: {
          game: {
            select: {
              startTime: true,
              homeTeamId: true,
              awayTeamId: true,
              venue: true,
              scoreJson: true,
              liveStateJson: true
            }
          }
        }
      }
    }
  });

  let profilesWritten = 0;
  for (const team of teams) {
    const profile = buildProfile(team);
    if (!profile) continue;
    await prisma.trendCache.upsert({
      where: { cacheKey: `team_power_rating:${team.id}` },
      update: {
        scope: "team_power_rating",
        filterJson: toJson({ teamId: team.id, leagueKey: team.league.key, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      },
      create: {
        cacheKey: `team_power_rating:${team.id}`,
        scope: "team_power_rating",
        filterJson: toJson({ teamId: team.id, leagueKey: team.league.key, lookbackGames }),
        payloadJson: toJson(profile),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
      }
    });
    profilesWritten += 1;
  }

  await prisma.trendCache.upsert({
    where: { cacheKey: `team_power_rating_summary:${leagueKey ?? "all"}` },
    update: {
      scope: "team_power_rating_summary",
      filterJson: toJson({ leagueKey, lookbackGames }),
      payloadJson: toJson({ leagueKey, lookbackGames, profilesWritten, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey: `team_power_rating_summary:${leagueKey ?? "all"}`,
      scope: "team_power_rating_summary",
      filterJson: toJson({ leagueKey, lookbackGames }),
      payloadJson: toJson({ leagueKey, lookbackGames, profilesWritten, updatedAt: new Date().toISOString() }),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  return { leagueKey, lookbackGames, profilesWritten };
}

export async function getCachedTeamPowerRating(teamId: string) {
  const cached = await prisma.trendCache.findFirst({
    where: {
      cacheKey: `team_power_rating:${teamId}`,
      scope: "team_power_rating",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });
  return cached?.payloadJson as TeamPowerRatingProfile | null;
}
