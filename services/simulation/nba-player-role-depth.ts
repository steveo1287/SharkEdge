import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";

export type NbaPlayerRoleTier =
  | "SUPERSTAR"
  | "STAR"
  | "PRIMARY_CREATOR"
  | "STARTER"
  | "SIXTH_MAN"
  | "ROTATION"
  | "LOW_MIN_BENCH"
  | "FRINGE"
  | "OUT";

export type NbaPlayerUsageTier = "ELITE_USAGE" | "HIGH_USAGE" | "MEDIUM_USAGE" | "LOW_USAGE" | "NON_USAGE";

export type NbaPlayerArchetype =
  | "ON_BALL_ENGINE"
  | "SCORING_STAR"
  | "TWO_WAY_STARTER"
  | "PLAYMAKING_GUARD"
  | "SPACING_WING"
  | "GLASS_BIG"
  | "ROLE_FINISHER"
  | "DEPTH_BENCH"
  | "UNAVAILABLE";

export type NbaPlayerRoleDepth = {
  playerName: string;
  teamName: string;
  teamSide: "home" | "away";
  roleTier: NbaPlayerRoleTier;
  usageTier: NbaPlayerUsageTier;
  archetype: NbaPlayerArchetype;
  projectedMinutes: number;
  minutesScore: number;
  scoringScore: number;
  creationScore: number;
  reboundingScore: number;
  spacingScore: number;
  possessionLoadScore: number;
  availabilityScore: number;
  volatilityScore: number;
  starScore: number;
  rolePlayerScore: number;
  roleConfidence: number;
  replacementRisk: number;
  closingLineupScore: number;
  drivers: string[];
  warnings: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function statusAvailability(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("out")) return 0;
  if (normalized.includes("doubtful")) return 0.2;
  if (normalized.includes("questionable")) return 0.55;
  if (normalized.includes("unknown")) return 0.75;
  return 1;
}

function score01(value: number, low: number, high: number) {
  if (high <= low) return 0;
  return clamp((value - low) / (high - low), 0, 1);
}

function usageTier(possessionLoadScore: number): NbaPlayerUsageTier {
  if (possessionLoadScore >= 0.82) return "ELITE_USAGE";
  if (possessionLoadScore >= 0.64) return "HIGH_USAGE";
  if (possessionLoadScore >= 0.42) return "MEDIUM_USAGE";
  if (possessionLoadScore >= 0.22) return "LOW_USAGE";
  return "NON_USAGE";
}

function roleTier(args: {
  availability: number;
  starScore: number;
  rolePlayerScore: number;
  minutes: number;
  possessionLoadScore: number;
  creationScore: number;
}): NbaPlayerRoleTier {
  if (args.availability <= 0.05) return "OUT";
  if (args.starScore >= 0.82 && args.minutes >= 32) return "SUPERSTAR";
  if (args.starScore >= 0.68 && args.minutes >= 30) return "STAR";
  if (args.possessionLoadScore >= 0.68 && args.creationScore >= 0.58 && args.minutes >= 28) return "PRIMARY_CREATOR";
  if (args.minutes >= 27 && args.rolePlayerScore >= 0.5) return "STARTER";
  if (args.minutes >= 22 && args.possessionLoadScore >= 0.48) return "SIXTH_MAN";
  if (args.minutes >= 15) return "ROTATION";
  if (args.minutes >= 8) return "LOW_MIN_BENCH";
  return "FRINGE";
}

function archetype(args: {
  availability: number;
  starScore: number;
  scoringScore: number;
  creationScore: number;
  reboundingScore: number;
  spacingScore: number;
  rolePlayerScore: number;
  minutes: number;
}): NbaPlayerArchetype {
  if (args.availability <= 0.05) return "UNAVAILABLE";
  if (args.creationScore >= 0.72 && args.scoringScore >= 0.62) return "ON_BALL_ENGINE";
  if (args.starScore >= 0.68 && args.scoringScore >= 0.72) return "SCORING_STAR";
  if (args.rolePlayerScore >= 0.62 && args.minutes >= 28) return "TWO_WAY_STARTER";
  if (args.creationScore >= 0.62) return "PLAYMAKING_GUARD";
  if (args.spacingScore >= 0.64 && args.minutes >= 18) return "SPACING_WING";
  if (args.reboundingScore >= 0.66) return "GLASS_BIG";
  if (args.minutes >= 14) return "ROLE_FINISHER";
  return "DEPTH_BENCH";
}

export function buildNbaPlayerRoleDepth(player: NbaPlayerStatProjection): NbaPlayerRoleDepth {
  const minutes = clamp(player.projectedMinutes, 0, 44);
  const availability = statusAvailability(player.status);
  const pointsPer36 = minutes > 0 ? player.projectedPoints / minutes * 36 : 0;
  const reboundsPer36 = minutes > 0 ? player.projectedRebounds / minutes * 36 : 0;
  const assistsPer36 = minutes > 0 ? player.projectedAssists / minutes * 36 : 0;
  const threesPer36 = minutes > 0 ? player.projectedThrees / minutes * 36 : 0;
  const praPer36 = pointsPer36 + reboundsPer36 + assistsPer36;
  const possessionLoad = player.projectedPoints + player.projectedAssists * 2.15 + player.projectedThrees * 0.75;

  const minutesScore = score01(minutes, 8, 36);
  const scoringScore = score01(pointsPer36, 7, 30);
  const creationScore = score01(assistsPer36, 1.2, 9.5);
  const reboundingScore = score01(reboundsPer36, 2.2, 13.5);
  const spacingScore = score01(threesPer36, 0.2, 4.3);
  const possessionLoadScore = score01(possessionLoad, 6, 42);
  const availabilityScore = availability;
  const volatilityScore = clamp(1 - player.confidence, 0, 1);
  const closingLineupScore = clamp(minutesScore * 0.72 + possessionLoadScore * 0.18 + availabilityScore * 0.1, 0, 1);
  const starScore = clamp(
    scoringScore * 0.32 + creationScore * 0.22 + possessionLoadScore * 0.24 + minutesScore * 0.14 + spacingScore * 0.04 + availabilityScore * 0.04,
    0,
    1
  );
  const rolePlayerScore = clamp(
    minutesScore * 0.28 + spacingScore * 0.18 + reboundingScore * 0.16 + creationScore * 0.13 + availabilityScore * 0.16 + player.confidence * 0.09,
    0,
    1
  );
  const roleConfidence = clamp(player.confidence * 0.62 + minutesScore * 0.22 + availabilityScore * 0.16, 0.05, 0.96);
  const replacementRisk = clamp((1 - availabilityScore) * 0.52 + volatilityScore * 0.24 + (1 - roleConfidence) * 0.24, 0, 1);

  const tier = roleTier({ availability, starScore, rolePlayerScore, minutes, possessionLoadScore, creationScore });
  const type = archetype({ availability, starScore, scoringScore, creationScore, reboundingScore, spacingScore, rolePlayerScore, minutes });
  const warnings: string[] = [];
  if (replacementRisk >= 0.45) warnings.push("elevated replacement/availability risk");
  if (roleConfidence < 0.5) warnings.push("low role-confidence signal");
  if (tier === "SUPERSTAR" || tier === "STAR") warnings.push("star-level player: lineup/news sensitivity is high");

  return {
    playerName: player.playerName,
    teamName: player.teamName,
    teamSide: player.teamSide,
    roleTier: tier,
    usageTier: usageTier(possessionLoadScore),
    archetype: type,
    projectedMinutes: round(minutes, 1),
    minutesScore: round(minutesScore),
    scoringScore: round(scoringScore),
    creationScore: round(creationScore),
    reboundingScore: round(reboundingScore),
    spacingScore: round(spacingScore),
    possessionLoadScore: round(possessionLoadScore),
    availabilityScore: round(availabilityScore),
    volatilityScore: round(volatilityScore),
    starScore: round(starScore),
    rolePlayerScore: round(rolePlayerScore),
    roleConfidence: round(roleConfidence),
    replacementRisk: round(replacementRisk),
    closingLineupScore: round(closingLineupScore),
    drivers: [
      `${pointsPer36.toFixed(1)} pts/36`,
      `${reboundsPer36.toFixed(1)} reb/36`,
      `${assistsPer36.toFixed(1)} ast/36`,
      `${threesPer36.toFixed(1)} 3pm/36`,
      `${praPer36.toFixed(1)} PRA/36`,
      `possession load ${possessionLoad.toFixed(1)}`,
      `role ${tier}`,
      `archetype ${type}`
    ],
    warnings
  };
}
