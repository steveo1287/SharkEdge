import type { MlbEliteRatingBuild } from "@/services/simulation/mlb-elite-rating-system";
import type {
  MlbEliteIntelligenceTier,
  MlbEliteIntelligenceUpgradeResult,
  MlbElitePlayerUpgrade
} from "@/services/simulation/mlb-elite-intelligence-upgrade";
import type { MlbProjectionRating } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbExperienceBand = "ESTABLISHED" | "REGULAR" | "MLB_SAMPLE" | "NO_MLB_SAMPLE";

export type MlbTeamByTeamPlayerGrade = {
  playerId: string;
  playerName: string;
  team: string;
  role: "hitter" | "pitcher";
  originalTier: MlbEliteIntelligenceTier;
  enforcedTier: MlbEliteIntelligenceTier;
  experienceBand: MlbExperienceBand;
  majorLeagueSample: number;
  ratingTrust: number;
  tendencyTrust: number;
  combinedTrust: number;
  highConfidenceEligible: boolean;
  floorApplied: boolean;
  reasons: string[];
};

export type MlbTeamByTeamRatingReport = {
  modelVersion: "mlb-team-by-team-rating-enforcer-v1";
  generatedAt: string;
  teamCount: number;
  playerCount: number;
  floorAppliedCount: number;
  noThinWithMlbSampleCount: number;
  teams: Array<{
    team: string;
    hitters: number;
    pitchers: number;
    elite: number;
    bettable: number;
    watch: number;
    thin: number;
    missing: number;
    mlbSamplePlayers: number;
    floorApplied: number;
    averageCombinedTrust: number;
    highConfidenceEligible: number;
  }>;
  players: MlbTeamByTeamPlayerGrade[];
  warnings: string[];
};

export type MlbTeamByTeamRatingEnforcementResult = MlbEliteIntelligenceUpgradeResult & {
  teamByTeamReport: MlbTeamByTeamRatingReport;
};

type Numberish = number | string | null | undefined;

const TIER_RANK: Record<MlbEliteIntelligenceTier, number> = {
  MISSING: 0,
  THIN: 1,
  WATCH: 2,
  BETTABLE: 3,
  ELITE: 4
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asNumber(value: Numberish, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function sampleRecord(rating: MlbProjectionRating) {
  const sample = rating.metrics_json?.sample;
  return sample && typeof sample === "object" && !Array.isArray(sample) ? sample as Record<string, unknown> : {};
}

function hitterSample(rating: MlbProjectionRating) {
  const sample = sampleRecord(rating);
  return Math.max(
    asNumber(sample.plateAppearances as Numberish, 0),
    asNumber(sample.pa as Numberish, 0),
    asNumber(sample.atBats as Numberish, 0)
  );
}

function pitcherSample(rating: MlbProjectionRating) {
  const sample = sampleRecord(rating);
  const innings = asNumber(sample.inningsPitched as Numberish, asNumber(sample.ip as Numberish, 0));
  return Math.max(
    asNumber(sample.battersFaced as Numberish, 0),
    asNumber(sample.bf as Numberish, 0),
    innings * 4.25
  );
}

function experienceBand(role: "hitter" | "pitcher", sample: number): MlbExperienceBand {
  if (role === "hitter") {
    if (sample >= 300) return "ESTABLISHED";
    if (sample >= 75) return "REGULAR";
    if (sample > 0) return "MLB_SAMPLE";
    return "NO_MLB_SAMPLE";
  }
  if (sample >= 450) return "ESTABLISHED";
  if (sample >= 120) return "REGULAR";
  if (sample > 0) return "MLB_SAMPLE";
  return "NO_MLB_SAMPLE";
}

function floorTier(args: {
  originalTier: MlbEliteIntelligenceTier;
  role: "hitter" | "pitcher";
  band: MlbExperienceBand;
  ratingTrust: number;
  combinedTrust: number;
  skillShapeScore: number;
}) {
  if (args.band === "NO_MLB_SAMPLE") return args.originalTier;
  let floor: MlbEliteIntelligenceTier = "WATCH";
  if (args.band === "ESTABLISHED" && args.ratingTrust >= 0.6 && args.skillShapeScore >= 66) floor = "BETTABLE";
  if (args.band === "REGULAR" && args.ratingTrust >= 0.56 && args.combinedTrust >= 0.48 && args.skillShapeScore >= 64) floor = "BETTABLE";
  return TIER_RANK[args.originalTier] >= TIER_RANK[floor] ? args.originalTier : floor;
}

function key(role: "hitter" | "pitcher", id: string) {
  return `${role}:${id}`;
}

function gradePlayer(rating: MlbProjectionRating, upgrade: MlbElitePlayerUpgrade): MlbTeamByTeamPlayerGrade {
  const sample = upgrade.role === "hitter" ? hitterSample(rating) : pitcherSample(rating);
  const band = experienceBand(upgrade.role, sample);
  const enforcedTier = floorTier({
    originalTier: upgrade.tier,
    role: upgrade.role,
    band,
    ratingTrust: upgrade.ratingTrust,
    combinedTrust: upgrade.combinedTrust,
    skillShapeScore: upgrade.skillShapeScore
  });
  const floorApplied = enforcedTier !== upgrade.tier;
  const highConfidenceEligible = enforcedTier === "ELITE" || enforcedTier === "BETTABLE";
  const reasons = [
    `${band} sample: ${round(sample, 1)} ${upgrade.role === "hitter" ? "PA/AB" : "BF-equivalent"}.`,
    floorApplied ? `Tier floor applied from ${upgrade.tier} to ${enforcedTier}.` : `Tier remained ${enforcedTier}.`,
    upgrade.microCoverage <= 0 ? "No micro row; rating uses MLB experience and skill-shape fallback." : `Micro coverage ${round(upgrade.microCoverage * 100, 1)}%.`
  ];
  return {
    playerId: upgrade.playerId,
    playerName: upgrade.playerName,
    team: rating.team ?? upgrade.team ?? "UNKNOWN",
    role: upgrade.role,
    originalTier: upgrade.tier,
    enforcedTier,
    experienceBand: band,
    majorLeagueSample: round(sample, 1),
    ratingTrust: upgrade.ratingTrust,
    tendencyTrust: upgrade.tendencyTrust,
    combinedTrust: upgrade.combinedTrust,
    highConfidenceEligible,
    floorApplied,
    reasons
  };
}

function withEnforcedMetrics(rating: MlbProjectionRating, grade: MlbTeamByTeamPlayerGrade): MlbProjectionRating {
  const priorWarnings = Array.isArray(rating.metrics_json?.eliteWarnings) ? rating.metrics_json?.eliteWarnings.map(String) : [];
  const warnings = grade.floorApplied
    ? priorWarnings.filter((warning) => !warning.toLowerCase().includes("missing micro"))
    : priorWarnings;
  return {
    ...rating,
    metrics_json: {
      ...(rating.metrics_json ?? {}),
      eliteTier: grade.enforcedTier,
      teamByTeamRatingModel: "mlb-team-by-team-rating-enforcer-v1",
      experienceBand: grade.experienceBand,
      majorLeagueSample: grade.majorLeagueSample,
      experienceFloorApplied: grade.floorApplied,
      highConfidenceEligible: grade.highConfidenceEligible,
      noThinMlbSampleEnforced: grade.experienceBand !== "NO_MLB_SAMPLE" && (grade.originalTier === "THIN" || grade.originalTier === "MISSING"),
      eliteWarnings: warnings,
      teamByTeamReasons: grade.reasons
    }
  };
}

function summarizeTeams(players: MlbTeamByTeamPlayerGrade[]) {
  const teams = Array.from(new Set(players.map((player) => player.team))).sort();
  return teams.map((team) => {
    const rows = players.filter((player) => player.team === team);
    return {
      team,
      hitters: rows.filter((player) => player.role === "hitter").length,
      pitchers: rows.filter((player) => player.role === "pitcher").length,
      elite: rows.filter((player) => player.enforcedTier === "ELITE").length,
      bettable: rows.filter((player) => player.enforcedTier === "BETTABLE").length,
      watch: rows.filter((player) => player.enforcedTier === "WATCH").length,
      thin: rows.filter((player) => player.enforcedTier === "THIN").length,
      missing: rows.filter((player) => player.enforcedTier === "MISSING").length,
      mlbSamplePlayers: rows.filter((player) => player.experienceBand !== "NO_MLB_SAMPLE").length,
      floorApplied: rows.filter((player) => player.floorApplied).length,
      averageCombinedTrust: round(rows.reduce((sum, player) => sum + player.combinedTrust, 0) / Math.max(1, rows.length), 4),
      highConfidenceEligible: rows.filter((player) => player.highConfidenceEligible).length
    };
  });
}

export function enforceMlbTeamByTeamPlayerRatings(result: MlbEliteIntelligenceUpgradeResult): MlbTeamByTeamRatingEnforcementResult {
  const ratingByKey = new Map<string, MlbProjectionRating>();
  for (const hitter of result.ratings.hitters) ratingByKey.set(key("hitter", hitter.id), hitter);
  for (const pitcher of result.ratings.pitchers) ratingByKey.set(key("pitcher", pitcher.id), pitcher);

  const grades = result.report.playerUpgrades.map((upgrade) => {
    const rating = ratingByKey.get(key(upgrade.role, upgrade.playerId));
    if (!rating) {
      return {
        playerId: upgrade.playerId,
        playerName: upgrade.playerName,
        team: upgrade.team ?? "UNKNOWN",
        role: upgrade.role,
        originalTier: upgrade.tier,
        enforcedTier: upgrade.tier,
        experienceBand: "NO_MLB_SAMPLE" as const,
        majorLeagueSample: 0,
        ratingTrust: upgrade.ratingTrust,
        tendencyTrust: upgrade.tendencyTrust,
        combinedTrust: upgrade.combinedTrust,
        highConfidenceEligible: upgrade.tier === "ELITE" || upgrade.tier === "BETTABLE",
        floorApplied: false,
        reasons: ["Rating row missing during team-by-team enforcement."]
      };
    }
    return gradePlayer(rating, upgrade);
  });

  const gradeByKey = new Map(grades.map((grade) => [key(grade.role, grade.playerId), grade]));
  const hitters = result.ratings.hitters.map((rating) => {
    const grade = gradeByKey.get(key("hitter", rating.id));
    return grade ? withEnforcedMetrics(rating, grade) : rating;
  });
  const pitchers = result.ratings.pitchers.map((rating) => {
    const grade = gradeByKey.get(key("pitcher", rating.id));
    return grade ? withEnforcedMetrics(rating, grade) : rating;
  });

  const teams = summarizeTeams(grades);
  const floorAppliedCount = grades.filter((grade) => grade.floorApplied).length;
  const noThinWithMlbSampleCount = grades.filter((grade) => grade.experienceBand !== "NO_MLB_SAMPLE" && (grade.enforcedTier === "THIN" || grade.enforcedTier === "MISSING")).length;
  const warnings = [...result.report.warnings];
  if (noThinWithMlbSampleCount > 0) warnings.push(`${noThinWithMlbSampleCount} players with MLB samples remained thin/missing after enforcement.`);

  return {
    ...result,
    ratings: {
      ...result.ratings,
      hitters,
      pitchers,
      warnings: Array.from(new Set([...result.ratings.warnings, ...warnings]))
    } as MlbEliteRatingBuild,
    report: {
      ...result.report,
      thinPlayers: grades.filter((grade) => grade.enforcedTier === "THIN" || grade.enforcedTier === "MISSING").length,
      bettablePlayers: grades.filter((grade) => grade.enforcedTier === "BETTABLE" || grade.enforcedTier === "ELITE").length,
      playerUpgrades: result.report.playerUpgrades.map((upgrade) => {
        const grade = gradeByKey.get(key(upgrade.role, upgrade.playerId));
        return grade ? { ...upgrade, tier: grade.enforcedTier, warnings: grade.floorApplied ? upgrade.warnings.filter((warning) => !warning.toLowerCase().includes("missing micro")) : upgrade.warnings } : upgrade;
      }),
      warnings: Array.from(new Set(warnings))
    },
    teamByTeamReport: {
      modelVersion: "mlb-team-by-team-rating-enforcer-v1",
      generatedAt: new Date().toISOString(),
      teamCount: teams.length,
      playerCount: grades.length,
      floorAppliedCount,
      noThinWithMlbSampleCount,
      teams,
      players: grades,
      warnings
    }
  };
}
