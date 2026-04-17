import type { CombatHistoryRow, CombatProfile } from "@/services/modeling/fighter-history-service";

export type UfcFighterIntelligenceInput = {
  record: string | null;
  recentWinRate?: number | null;
  recentMargin?: number | null;
  metadata?: Record<string, unknown> | null;
  combatProfile: CombatProfile;
  historyRows: CombatHistoryRow[];
};

export type UfcFighterIntelligenceProfile = {
  sampleSize: number;
  strengthOfScheduleScore: number;
  winQualityScore: number;
  lossQualityScore: number;
  fraudCheckScore: number;
  strikingEfficiencyScore: number;
  strikingDefenseScore: number;
  grapplingControlScore: number;
  antiWrestlingScore: number;
  submissionThreatScore: number;
  finishingPressureScore: number;
  roundWinningScore: number;
  durabilityTrendScore: number;
  pedigreeScore: number;
  campQualityScore: number;
  trainingPartnerScore: number;
  physicalityScore: number;
  videoGameRatingScore: number;
  opponentAdjustedQualityScore: number;
  compositeQualityScore: number;
  styleArchetype: string;
  scoutingFlags: string[];
};

const ELITE_CAMP_SCORES: Record<string, number> = {
  aka: 9.2,
  american_kickboxing_academy: 9.2,
  att: 9.1,
  american_top_team: 9.1,
  xtreme_couture: 8.6,
  city_kickboxing: 9.0,
  tiger_muay_thai: 8.3,
  sanford_mma: 8.4,
  kill_cliff_fc: 8.7,
  jackson_wink: 8.1,
  elevation_fight_team: 8.4,
  hard_knocks_365: 8.2,
  nova_uniao: 8.5,
  tiger_schulmann: 7.4,
  team_alpha_male: 8.4,
  syndicate_mma: 8.0,
  roufusport: 7.9,
  mma_lab: 8.0,
  blackzilians: 7.8
};

const ELITE_PARTNER_SCORES: Record<string, number> = {
  khabib_nurmagomedov: 9.5,
  islam_makhachev: 9.5,
  alexander_volkanovski: 9.3,
  merab_dvalishvili: 9.2,
  aljamain_sterling: 8.8,
  jon_jones: 9.7,
  daniel_cormier: 9.4,
  dustin_poirier: 9.0,
  sean_strickland: 8.3,
  usman_nurmagomedov: 8.7,
  justin_gaethje: 8.8,
  max_holloway: 9.2,
  ilia_topuria: 9.2,
  leon_edwards: 8.7,
  belal_muhammad: 8.5,
  shavkat_rakhmonov: 9.1,
  deiveson_figueiredo: 8.4,
  henry_cejudo: 9.1,
  demetrious_johnson: 9.6,
  charles_oliveira: 9.3
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseRecord(record: string | null | undefined) {
  const match = (record ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) {
    return { wins: 0, losses: 0, draws: 0, winPct: 0.5, sampleSize: 0 };
  }
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const sampleSize = wins + losses + draws;
  return {
    wins,
    losses,
    draws,
    sampleSize,
    winPct: sampleSize ? (wins + draws * 0.5) / sampleSize : 0.5
  };
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = asNumber(metadata?.[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function getMetadataString(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getMetadataStringArray(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry).trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseBoutRecord(value: string | null | undefined) {
  const match = (value ?? "").match(/(\d+)-(\d+)(?:-(\d+))?/);
  if (!match) {
    return { wins: 0, losses: 0, draws: 0, total: 0, winPct: 0.5 };
  }
  const wins = Number(match[1] ?? 0);
  const losses = Number(match[2] ?? 0);
  const draws = Number(match[3] ?? 0);
  const total = wins + losses + draws;
  return {
    wins,
    losses,
    draws,
    total,
    winPct: total ? (wins + draws * 0.5) / total : 0.5
  };
}

function mapWrestlingLevel(value: string | null) {
  const normalized = normalizeToken(value);
  if (["olympic", "world", "ncaa_division_1_all_american", "ncaa_d1_all_american", "national_team"].includes(normalized)) return 9.4;
  if (["ncaa_division_1", "ncaa_d1", "division_1", "all_american"].includes(normalized)) return 8.6;
  if (["division_2", "ncaa_division_2", "junior_college", "juco"].includes(normalized)) return 7.6;
  if (["state_champion", "national_champion", "collegiate"].includes(normalized)) return 7.2;
  if (["regional", "amateur", "high_school"].includes(normalized)) return 6.2;
  return 5.2;
}

function mapBjjLevel(value: string | null) {
  const normalized = normalizeToken(value);
  if (normalized.includes("black")) return 9.1;
  if (normalized.includes("brown")) return 8.1;
  if (normalized.includes("purple")) return 7.1;
  if (normalized.includes("blue")) return 6.3;
  return 5.4;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function deriveCampQuality(metadata: Record<string, unknown> | null | undefined) {
  const campName = getMetadataString(metadata, ["camp", "trainingCamp", "gym", "team"]);
  const normalizedCamp = normalizeToken(campName);
  const campBase = ELITE_CAMP_SCORES[normalizedCamp] ?? 5.8;
  const trainingPartners = getMetadataStringArray(metadata, ["trainingPartners", "notableTrainingPartners", "partners"]);
  const partnerScores = trainingPartners
    .map((name) => ELITE_PARTNER_SCORES[normalizeToken(name)] ?? null)
    .filter((value): value is number => typeof value === "number");
  const partnerScore = clamp((average(partnerScores) ?? 5.2) + Math.min(1.2, trainingPartners.length * 0.12), 4.8, 9.8);
  return {
    campName,
    campQualityScore: round(clamp(campBase + (partnerScores.length ? 0.25 : 0), 4.8, 9.8), 3),
    trainingPartnerScore: round(partnerScore, 3)
  };
}

function derivePedigreeScore(metadata: Record<string, unknown> | null | undefined) {
  const amateur = parseBoutRecord(getMetadataString(metadata, ["amateurRecord", "mmaAmateurRecord"]));
  const kickboxing = parseBoutRecord(getMetadataString(metadata, ["kickboxingRecord", "muayThaiRecord"]));
  const boxing = parseBoutRecord(getMetadataString(metadata, ["boxingRecord"]));
  const wrestlingLevel = mapWrestlingLevel(getMetadataString(metadata, ["wrestlingLevel", "wrestlingPedigree"]));
  const bjjLevel = mapBjjLevel(getMetadataString(metadata, ["bjjBelt", "grapplingLevel"]));
  const international = getMetadataNumber(metadata, ["internationalTitles", "nationalTitles", "majorTitles"]) ?? 0;

  const combatPedigree = clamp(
    4.8 + amateur.winPct * 1.6 + Math.min(1.3, amateur.total * 0.06) + Math.min(0.9, kickboxing.total * 0.03) + Math.min(0.8, boxing.total * 0.025),
    4.8,
    9.4
  );

  return round(clamp((combatPedigree + wrestlingLevel + bjjLevel + Math.min(1.1, international * 0.18)) / 3.2, 4.8, 9.6), 3);
}

function deriveEfficiencyScores(metadata: Record<string, unknown> | null | undefined, combatProfile: CombatProfile) {
  const sigLanded = getMetadataNumber(metadata, ["sigStrikesLandedPerMin", "strikesLandedPerMin", "sigStrikeLandedPerMin", "SLpM"]);
  const sigAbsorbed = getMetadataNumber(metadata, ["sigStrikesAbsorbedPerMin", "strikesAbsorbedPerMin", "sigStrikeAbsorbedPerMin", "SApM"]);
  const sigAccuracy = getMetadataNumber(metadata, ["sigStrikeAccuracy", "strikingAccuracy", "sigAcc"]) ?? 45;
  const sigDefense = getMetadataNumber(metadata, ["sigStrikeDefense", "strikingDefense", "sigDef"]) ?? 54;
  const takedownAvg = getMetadataNumber(metadata, ["takedownAvgPer15", "takedownsPer15", "tdAvg"]) ?? combatProfile.controlScore * 0.22;
  const takedownAccuracy = getMetadataNumber(metadata, ["takedownAccuracy", "tdAcc"]) ?? 38;
  const takedownDefense = getMetadataNumber(metadata, ["takedownDefense", "tdDef"]) ?? 58;
  const submissionAvg = getMetadataNumber(metadata, ["submissionsPer15", "subAvg"]) ?? combatProfile.finishWinRate * 3.2;
  const knockdownAvg = getMetadataNumber(metadata, ["knockdownsPer15", "kdAvg"]) ?? combatProfile.powerScore * 0.09;
  const controlMinutes = getMetadataNumber(metadata, ["controlMinutesPer15", "controlTimePer15", "controlAvg"]) ?? combatProfile.controlScore * 0.6;

  const strikingEfficiencyScore = clamp(5 + (sigLanded ?? 3.5) * 0.55 - (sigAbsorbed ?? 3.2) * 0.35 + (sigAccuracy - 45) * 0.04, 3.8, 9.8);
  const strikingDefenseScore = clamp(5.2 + (sigDefense - 52) * 0.06 - Math.max(0, (sigAbsorbed ?? 3.2) - 3.5) * 0.3, 3.8, 9.8);
  const grapplingControlScore = clamp(5 + takedownAvg * 0.48 + takedownAccuracy * 0.018 + controlMinutes * 0.1, 3.8, 9.8);
  const antiWrestlingScore = clamp(4.7 + takedownDefense * 0.05 + combatProfile.decisionWinRate * 2.4, 3.8, 9.8);
  const submissionThreatScore = clamp(4.5 + submissionAvg * 0.8 + combatProfile.finishWinRate * 2.5, 3.8, 9.8);
  const finishingPressureScore = clamp(4.8 + (knockdownAvg ?? 0.4) * 1.2 + combatProfile.finishWinRate * 4.4 + (sigLanded ?? 3.5) * 0.18, 3.8, 9.8);
  const roundWinningScore = clamp(4.8 + (strikingEfficiencyScore - 5) * 0.4 + (grapplingControlScore - 5) * 0.45 + (strikingDefenseScore - 5) * 0.25 + (combatProfile.historicalWinPct - 0.5) * 5.5, 3.8, 9.8);

  return {
    strikingEfficiencyScore: round(strikingEfficiencyScore, 3),
    strikingDefenseScore: round(strikingDefenseScore, 3),
    grapplingControlScore: round(grapplingControlScore, 3),
    antiWrestlingScore: round(antiWrestlingScore, 3),
    submissionThreatScore: round(submissionThreatScore, 3),
    finishingPressureScore: round(finishingPressureScore, 3),
    roundWinningScore: round(roundWinningScore, 3)
  };
}

function deriveOpponentQuality(rows: CombatHistoryRow[], recordWinPct: number, combatProfile: CombatProfile) {
  if (!rows.length) {
    return {
      strengthOfScheduleScore: 5.2,
      winQualityScore: 5.1,
      lossQualityScore: 5.0,
      fraudCheckScore: 5.0,
      opponentAdjustedQualityScore: 5.1
    };
  }

  let opponentWinPctTotal = 0;
  let winsAgainstQuality = 0;
  let lossesAgainstQuality = 0;
  let winCount = 0;
  let lossCount = 0;
  for (const row of rows) {
    const opponent = parseRecord(row.opponentRecord).winPct;
    opponentWinPctTotal += opponent;
    if (row.winnerCompetitorId === row.competitorId) {
      winCount += 1;
      winsAgainstQuality += opponent;
    } else if (row.loserCompetitorId === row.competitorId) {
      lossCount += 1;
      lossesAgainstQuality += opponent;
    }
  }

  const averageOpponent = opponentWinPctTotal / rows.length;
  const averageWinQuality = winCount ? winsAgainstQuality / winCount : averageOpponent;
  const averageLossQuality = lossCount ? lossesAgainstQuality / lossCount : averageOpponent;
  const strengthOfScheduleScore = clamp(4.2 + averageOpponent * 6.4 + Math.min(1.1, rows.length * 0.05), 4.2, 9.8);
  const winQualityScore = clamp(4.3 + averageWinQuality * 5.8 + combatProfile.finishWinRate * 1.3 + combatProfile.historicalWinPct * 1.2, 4.0, 9.8);
  const lossQualityScore = clamp(4.1 + averageLossQuality * 5.5, 4.0, 9.6);
  const fraudCheckScore = clamp(7.8 - Math.max(0, recordWinPct - averageOpponent) * 6.8 + Math.min(0.9, rows.length * 0.04), 2.8, 9.5);
  const opponentAdjustedQualityScore = clamp((strengthOfScheduleScore + winQualityScore + fraudCheckScore) / 3, 3.6, 9.8);

  return {
    strengthOfScheduleScore: round(strengthOfScheduleScore, 3),
    winQualityScore: round(winQualityScore, 3),
    lossQualityScore: round(lossQualityScore, 3),
    fraudCheckScore: round(fraudCheckScore, 3),
    opponentAdjustedQualityScore: round(opponentAdjustedQualityScore, 3)
  };
}

function derivePhysicality(metadata: Record<string, unknown> | null | undefined) {
  const reach = getMetadataNumber(metadata, ["reachInches", "reach"]) ?? 70;
  const height = getMetadataNumber(metadata, ["heightInches", "height"]) ?? 69;
  const age = getMetadataNumber(metadata, ["age"]) ?? 30;
  const stance = normalizeToken(getMetadataString(metadata, ["stance"]));
  const stanceBoost = stance === "southpaw" ? 0.25 : stance === "switch" ? 0.4 : 0;
  return round(clamp(5 + (reach - 70) * 0.08 + (height - 69) * 0.05 + stanceBoost - Math.max(0, age - 33) * 0.08, 4.0, 9.4), 3);
}

function deriveVideoGameScore(metadata: Record<string, unknown> | null | undefined) {
  const raw = getMetadataNumber(metadata, ["videoGameRating", "ufcGameRating", "overallRating", "eaUfcOverall"]);
  if (raw === null) return 5;
  return round(clamp(4.2 + (raw - 70) * 0.08, 4.2, 8.8), 3);
}

function deriveDurabilityTrend(metadata: Record<string, unknown> | null | undefined, combatProfile: CombatProfile) {
  const knockdownsAbsorbed = getMetadataNumber(metadata, ["knockdownsAbsorbedPer15", "kdAbsorbedPer15"]) ?? 0.35;
  const headStrikesAbsorbed = getMetadataNumber(metadata, ["headStrikesAbsorbedPerMin", "headSapm"]) ?? 1.6;
  const recentDamage = getMetadataNumber(metadata, ["recentDamageLoad", "damageLoad", "damageTakenRecent"]) ?? 0;
  return round(clamp(combatProfile.durabilityScore - knockdownsAbsorbed * 0.8 - headStrikesAbsorbed * 0.16 - recentDamage * 0.08, 3.5, 9.7), 3);
}

function deriveStyleArchetype(scores: {
  grapplingControlScore: number;
  submissionThreatScore: number;
  finishingPressureScore: number;
  strikingEfficiencyScore: number;
  antiWrestlingScore: number;
}) {
  if (scores.grapplingControlScore >= 7.6 && scores.submissionThreatScore >= 7.1) return "control_submission_grappler";
  if (scores.grapplingControlScore >= 7.6 && scores.antiWrestlingScore >= 7.2) return "chain_wrestle_controller";
  if (scores.finishingPressureScore >= 7.8 && scores.strikingEfficiencyScore >= 7.1) return "pressure_finisher";
  if (scores.strikingEfficiencyScore >= 7.4 && scores.antiWrestlingScore >= 7) return "range_striker_sprawl";
  if (scores.strikingEfficiencyScore >= 7.1) return "technical_striker";
  return "balanced_mma_generalist";
}

function deriveScoutingFlags(profile: Omit<UfcFighterIntelligenceProfile, "scoutingFlags">) {
  const flags: string[] = [];
  if (profile.fraudCheckScore <= 4.7) flags.push("soft_schedule_risk");
  if (profile.finishingPressureScore >= 7.8) flags.push("high_finish_threat");
  if (profile.antiWrestlingScore >= 7.6) flags.push("elite_takedown_denial");
  if (profile.grapplingControlScore >= 7.8) flags.push("control_heavy_path");
  if (profile.durabilityTrendScore <= 5.2) flags.push("durability_risk");
  if (profile.pedigreeScore >= 7.8) flags.push("elite_pedigree");
  if (profile.campQualityScore >= 8.4 || profile.trainingPartnerScore >= 8.4) flags.push("elite_room");
  if (profile.opponentAdjustedQualityScore >= 7.6) flags.push("proven_vs_quality");
  return flags;
}

export function buildUfcFighterIntelligenceProfile(input: UfcFighterIntelligenceInput): UfcFighterIntelligenceProfile {
  const record = parseRecord(input.record);
  const metadata = input.metadata ?? null;
  const camp = deriveCampQuality(metadata);
  const pedigreeScore = derivePedigreeScore(metadata);
  const efficiency = deriveEfficiencyScores(metadata, input.combatProfile);
  const quality = deriveOpponentQuality(input.historyRows, record.winPct, input.combatProfile);
  const physicalityScore = derivePhysicality(metadata);
  const videoGameRatingScore = deriveVideoGameScore(metadata);
  const durabilityTrendScore = deriveDurabilityTrend(metadata, input.combatProfile);

  const compositeQualityScore = round(
    clamp(
      quality.opponentAdjustedQualityScore * 0.23 +
        efficiency.roundWinningScore * 0.15 +
        efficiency.finishingPressureScore * 0.12 +
        efficiency.grapplingControlScore * 0.12 +
        efficiency.antiWrestlingScore * 0.1 +
        durabilityTrendScore * 0.11 +
        pedigreeScore * 0.07 +
        camp.campQualityScore * 0.05 +
        camp.trainingPartnerScore * 0.03 +
        physicalityScore * 0.02,
      3.8,
      9.9
    ),
    3
  );

  const baseProfile = {
    sampleSize: input.combatProfile.sampleSize,
    strengthOfScheduleScore: quality.strengthOfScheduleScore,
    winQualityScore: quality.winQualityScore,
    lossQualityScore: quality.lossQualityScore,
    fraudCheckScore: quality.fraudCheckScore,
    strikingEfficiencyScore: efficiency.strikingEfficiencyScore,
    strikingDefenseScore: efficiency.strikingDefenseScore,
    grapplingControlScore: efficiency.grapplingControlScore,
    antiWrestlingScore: efficiency.antiWrestlingScore,
    submissionThreatScore: efficiency.submissionThreatScore,
    finishingPressureScore: efficiency.finishingPressureScore,
    roundWinningScore: efficiency.roundWinningScore,
    durabilityTrendScore,
    pedigreeScore,
    campQualityScore: camp.campQualityScore,
    trainingPartnerScore: camp.trainingPartnerScore,
    physicalityScore,
    videoGameRatingScore,
    opponentAdjustedQualityScore: quality.opponentAdjustedQualityScore,
    compositeQualityScore,
    styleArchetype: deriveStyleArchetype(efficiency)
  };

  return {
    ...baseProfile,
    scoutingFlags: deriveScoutingFlags(baseProfile)
  };
}
