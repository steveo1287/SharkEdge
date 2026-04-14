import type { Prisma } from "@prisma/client";

type ParticipantContextLike = {
  daysRest?: number | null;
  opponentRestDays?: number | null;
  restAdvantageDays?: number | null;
  gamesLast7?: number | null;
  gamesLast14?: number | null;
  isBackToBack?: boolean | null;
  revengeSpot?: boolean | null;
  recentWinRate?: number | null;
  recentMargin?: number | null;
  scheduleDensityScore?: number | null;
  travelProxyScore?: number | null;
} | null;

export type TeamPlaystyleProfile = {
  teamName: string;
  pace: number;
  paceDelta: number;
  offensePressure: number;
  defenseResistance: number;
  efficiency: number;
  shotVolume: number;
  possessionControl: number;
  volatility: number;
  notes: string[];
};

export type CoachTendencyProfile = {
  teamName: string;
  tempoControl: number;
  aggression: number;
  rotationTightness: number;
  adaptability: number;
  varianceTolerance: number;
  notes: string[];
};

export type EventIntangibleProfile = {
  teamName: string;
  restEdge: number;
  fatigueRisk: number;
  travelStress: number;
  revengeBoost: number;
  morale: number;
  notes: string[];
};

export type HeadToHeadSimulationContext = {
  paceMultiplier: number;
  homeOffenseDelta: number;
  awayOffenseDelta: number;
  varianceMultiplier: number;
  drivers: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.9) {
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : 0;
}

function getNumber(stats: Prisma.JsonValue | unknown, keys: string[]) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return null;
  }
  const record = stats as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function featureKeys(leagueKey: string) {
  switch (leagueKey) {
    case "NBA":
    case "NCAAB":
      return {
        pace: ["pace", "tempo", "possessions"],
        offense: ["offensiveRating", "off_rating", "points", "PTS", "points_per_game"],
        defense: ["defensiveRating", "def_rating", "opp_points", "points_allowed"],
        volume: ["fieldGoalAttempts", "FGA", "threePointAttempts", "3PA", "freeThrowAttempts", "FTA"],
        control: ["assistRate", "AST%", "turnoverRate", "TOV%"]
      };
    case "NFL":
    case "NCAAF":
      return {
        pace: ["plays", "plays_per_game", "pace", "seconds_per_play"],
        offense: ["points", "epa_offense", "yards", "total_yards"],
        defense: ["points_allowed", "epa_defense", "yards_allowed"],
        volume: ["pass_attempts", "rush_attempts", "explosive_plays"],
        control: ["time_of_possession", "third_down_rate", "turnover_margin"]
      };
    case "MLB":
      return {
        pace: ["plate_appearances", "innings", "batters_faced"],
        offense: ["runs", "R", "runs_per_game", "wrc_plus", "ops"],
        defense: ["runs_allowed", "RA", "era", "whip"],
        volume: ["hits", "H", "walks", "BB", "strikeouts", "SO"],
        control: ["hard_hit_rate", "barrel_rate", "ground_ball_rate"]
      };
    case "NHL":
      return {
        pace: ["shots", "SOG", "tempo", "pace"],
        offense: ["goals", "G", "xgf", "goals_per_game"],
        defense: ["goals_allowed", "GA", "xga"],
        volume: ["shots", "SOG", "high_danger_chances"],
        control: ["faceoff_win_rate", "corsi_for_pct", "fenwick_for_pct"]
      };
    default:
      return {
        pace: ["pace", "tempo", "plays"],
        offense: ["points", "goals", "runs", "yards"],
        defense: ["opp_points", "points_allowed", "goals_allowed", "runs_allowed"],
        volume: ["usage", "attempts", "shots"],
        control: ["assistRate", "turnoverRate", "time_of_possession"]
      };
  }
}

function leagueBaseline(leagueKey: string) {
  switch (leagueKey) {
    case "NBA":
      return { pace: 99, offense: 114, defense: 114, volume: 96, control: 50 };
    case "NCAAB":
      return { pace: 69, offense: 108, defense: 108, volume: 84, control: 50 };
    case "NFL":
      return { pace: 64, offense: 350, defense: 350, volume: 62, control: 50 };
    case "NCAAF":
      return { pace: 70, offense: 400, defense: 400, volume: 70, control: 50 };
    case "MLB":
      return { pace: 38, offense: 4.4, defense: 4.4, volume: 9, control: 50 };
    case "NHL":
      return { pace: 31, offense: 3.1, defense: 3.1, volume: 30, control: 50 };
    default:
      return { pace: 50, offense: 50, defense: 50, volume: 50, control: 50 };
  }
}

export function buildTeamPlaystyleProfile(args: {
  leagueKey: string;
  teamName: string;
  statRows: Array<{ statsJson: Prisma.JsonValue | unknown }>;
  participantContext?: ParticipantContextLike;
}): TeamPlaystyleProfile {
  const keys = featureKeys(args.leagueKey);
  const baseline = leagueBaseline(args.leagueKey);

  const paceValues = args.statRows.map((row) => getNumber(row.statsJson, keys.pace));
  const offenseValues = args.statRows.map((row) => getNumber(row.statsJson, keys.offense));
  const defenseValues = args.statRows.map((row) => getNumber(row.statsJson, keys.defense));
  const volumeValues = args.statRows.map((row) => getNumber(row.statsJson, keys.volume));
  const controlValues = args.statRows.map((row) => getNumber(row.statsJson, keys.control));

  const pace = weightedAverage(paceValues) || baseline.pace;
  const offense = weightedAverage(offenseValues) || baseline.offense;
  const defense = weightedAverage(defenseValues) || baseline.defense;
  const volume = weightedAverage(volumeValues) || baseline.volume;
  const control = weightedAverage(controlValues) || baseline.control;

  const offensePressure = clamp(50 + ((offense - baseline.offense) / Math.max(1, baseline.offense)) * 100, 15, 90);
  const defenseResistance = clamp(50 + ((baseline.defense - defense) / Math.max(1, baseline.defense)) * 100, 15, 90);
  const efficiency = clamp((offensePressure * 0.58) + (defenseResistance * 0.42), 15, 90);
  const shotVolume = clamp(50 + ((volume - baseline.volume) / Math.max(1, baseline.volume)) * 100, 15, 90);
  const possessionControl = clamp(control, 20, 85);
  const volatility = clamp(28 + standardDeviation(offenseValues.filter((value): value is number => typeof value === "number")) * 1.6, 18, 85);
  const paceDelta = clamp(((pace - baseline.pace) / Math.max(1, baseline.pace)) * 100, -25, 25);

  const notes: string[] = [];
  if (paceDelta >= 8) notes.push("Tempo profile runs faster than league baseline.");
  if (paceDelta <= -8) notes.push("Tempo profile runs slower than league baseline.");
  if (offensePressure >= 60) notes.push("Offensive pressure profile is above baseline.");
  if (defenseResistance >= 60) notes.push("Defensive resistance profile is above baseline.");
  if ((args.participantContext?.gamesLast7 ?? 0) >= 4) notes.push("Recent schedule volume suggests higher fatigue exposure.");

  return {
    teamName: args.teamName,
    pace: round(pace),
    paceDelta: round(paceDelta),
    offensePressure: round(offensePressure),
    defenseResistance: round(defenseResistance),
    efficiency: round(efficiency),
    shotVolume: round(shotVolume),
    possessionControl: round(possessionControl),
    volatility: round(volatility),
    notes
  };
}

export function buildCoachTendencyProfile(args: {
  leagueKey: string;
  teamName: string;
  statRows: Array<{ statsJson: Prisma.JsonValue | unknown }>;
  participantContext?: ParticipantContextLike;
}): CoachTendencyProfile {
  const keys = featureKeys(args.leagueKey);
  const paceValues = args.statRows.map((row) => getNumber(row.statsJson, keys.pace)).filter((value): value is number => typeof value === "number");
  const controlValues = args.statRows.map((row) => getNumber(row.statsJson, keys.control)).filter((value): value is number => typeof value === "number");
  const volumeValues = args.statRows.map((row) => getNumber(row.statsJson, keys.volume)).filter((value): value is number => typeof value === "number");

  const paceMean = average(paceValues) || leagueBaseline(args.leagueKey).pace;
  const paceVar = standardDeviation(paceValues);
  const controlMean = average(controlValues) || 50;
  const volumeMean = average(volumeValues) || leagueBaseline(args.leagueKey).volume;

  const tempoControl = clamp(72 - paceVar * 6 + (args.participantContext?.daysRest ?? 0) * 1.5, 20, 90);
  const aggression = clamp(
    45 +
      ((volumeMean - leagueBaseline(args.leagueKey).volume) / Math.max(1, leagueBaseline(args.leagueKey).volume)) * 100 * 0.35 +
      (paceMean - leagueBaseline(args.leagueKey).pace) * 0.4,
    15,
    90
  );
  const rotationTightness = clamp(
    50 +
      ((args.participantContext?.gamesLast7 ?? 0) >= 4 ? -6 : 4) +
      ((args.participantContext?.scheduleDensityScore ?? 0) > 0.65 ? -5 : 0),
    20,
    85
  );
  const adaptability = clamp(45 + controlMean * 0.35 + Math.abs(args.participantContext?.recentMargin ?? 0) * 1.4, 20, 90);
  const varianceTolerance = clamp(35 + aggression * 0.3 + paceVar * 5 - tempoControl * 0.18, 15, 90);

  const notes: string[] = [];
  if (tempoControl >= 62) notes.push("Coach profile suggests tighter tempo control.");
  if (aggression >= 60) notes.push("Coach profile leans aggressive on volume and pressure.");
  if (rotationTightness <= 42) notes.push("Rotation or usage pattern looks looser than ideal.");

  return {
    teamName: args.teamName,
    tempoControl: round(tempoControl),
    aggression: round(aggression),
    rotationTightness: round(rotationTightness),
    adaptability: round(adaptability),
    varianceTolerance: round(varianceTolerance),
    notes
  };
}

export function buildEventIntangibleProfile(args: {
  teamName: string;
  participantContext?: ParticipantContextLike;
}): EventIntangibleProfile {
  const context = args.participantContext ?? null;
  const restEdge = clamp((context?.restAdvantageDays ?? 0) * 8 + ((context?.daysRest ?? 0) > 1 ? 4 : 0), -25, 25);
  const fatigueRisk = clamp(
    (context?.isBackToBack ? 18 : 0) +
      (context?.gamesLast7 ?? 0) * 2.4 +
      (context?.scheduleDensityScore ?? 0) * 18 -
      (context?.daysRest ?? 0) * 4,
    0,
    35
  );
  const travelStress = clamp((context?.travelProxyScore ?? 0) * 12, 0, 25);
  const revengeBoost = context?.revengeSpot ? 8 : 0;
  const morale = clamp(((context?.recentWinRate ?? 0.5) - 0.5) * 60 + (context?.recentMargin ?? 0) * 1.8, -20, 20);

  const notes: string[] = [];
  if (restEdge >= 8) notes.push("Schedule context gives this side a real rest edge.");
  if (fatigueRisk >= 16) notes.push("Schedule density raises fatigue risk.");
  if (travelStress >= 10) notes.push("Travel burden is materially elevated.");
  if (revengeBoost > 0) notes.push("Revenge spot adds emotional edge.");
  if (morale >= 8) notes.push("Recent results support stronger morale/form.");

  return {
    teamName: args.teamName,
    restEdge: round(restEdge),
    fatigueRisk: round(fatigueRisk),
    travelStress: round(travelStress),
    revengeBoost,
    morale: round(morale),
    notes
  };
}

export function buildHeadToHeadSimulationContext(args: {
  leagueKey: string;
  homeStyle: TeamPlaystyleProfile;
  awayStyle: TeamPlaystyleProfile;
  homeCoach: CoachTendencyProfile;
  awayCoach: CoachTendencyProfile;
  homeIntangibles: EventIntangibleProfile;
  awayIntangibles: EventIntangibleProfile;
}): HeadToHeadSimulationContext {
  const pacePressure =
    ((args.homeStyle.paceDelta + args.awayStyle.paceDelta) / 2) * 0.0035 +
    ((args.homeCoach.aggression + args.awayCoach.aggression) / 2 - 50) * 0.0012 -
    ((args.homeCoach.tempoControl + args.awayCoach.tempoControl) / 2 - 50) * 0.0009;
  const paceMultiplier = clamp(1 + pacePressure, 0.9, 1.1);

  const homeOffenseDelta = clamp(
    (args.homeStyle.offensePressure - args.awayStyle.defenseResistance) * 0.06 +
      (args.homeCoach.aggression - args.awayCoach.tempoControl) * 0.015 +
      (args.homeIntangibles.restEdge - args.homeIntangibles.fatigueRisk) * 0.05 +
      (args.homeIntangibles.revengeBoost + args.homeIntangibles.morale) * 0.03 -
      args.awayIntangibles.travelStress * 0.04,
    -5,
    5
  );

  const awayOffenseDelta = clamp(
    (args.awayStyle.offensePressure - args.homeStyle.defenseResistance) * 0.06 +
      (args.awayCoach.aggression - args.homeCoach.tempoControl) * 0.015 +
      (args.awayIntangibles.restEdge - args.awayIntangibles.fatigueRisk) * 0.05 +
      (args.awayIntangibles.revengeBoost + args.awayIntangibles.morale) * 0.03 -
      args.homeIntangibles.travelStress * 0.04,
    -5,
    5
  );

  const varianceMultiplier = clamp(
    1 +
      ((args.homeStyle.volatility + args.awayStyle.volatility) / 2 - 50) * 0.004 +
      ((args.homeCoach.varianceTolerance + args.awayCoach.varianceTolerance) / 2 - 50) * 0.003,
    0.85,
    1.22
  );

  const drivers = [
    paceMultiplier > 1.02
      ? "Style collision points to a faster-than-baseline game."
      : paceMultiplier < 0.98
        ? "Style collision points to a slower-than-baseline game."
        : "Style collision keeps tempo near baseline.",
    Math.abs(homeOffenseDelta) >= 1
      ? `Home context shift ${homeOffenseDelta > 0 ? "+" : ""}${round(homeOffenseDelta, 2)}`
      : null,
    Math.abs(awayOffenseDelta) >= 1
      ? `Away context shift ${awayOffenseDelta > 0 ? "+" : ""}${round(awayOffenseDelta, 2)}`
      : null,
    varianceMultiplier >= 1.06
      ? "Coach and style mix increase scoring variance."
      : varianceMultiplier <= 0.95
        ? "Coach and style mix compress scoring variance."
        : null
  ].filter((value): value is string => Boolean(value));

  return {
    paceMultiplier: round(paceMultiplier, 4),
    homeOffenseDelta: round(homeOffenseDelta),
    awayOffenseDelta: round(awayOffenseDelta),
    varianceMultiplier: round(varianceMultiplier, 4),
    drivers
  };
}
