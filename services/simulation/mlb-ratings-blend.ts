import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { fetchRawFeedRows, pick } from "@/services/mlb/raw-feed-parser";
import { getMlbTeamProfile, normalizeMlbTeam, type MlbTeamProfile } from "@/services/simulation/mlb-team-analytics";

export type MlbRatingsProfile = {
  teamName: string;
  source: "real" | "estimated" | "synthetic";
  teamOverall: number;
  contactRating: number;
  powerRating: number;
  speedRating: number;
  defenseRating: number;
  starterRating: number;
  bullpenRating: number;
  clutchRating: number;
  disciplineRating: number;
  playerStarRating: number;
  playerDepthRating: number;
  injuryRating: number;
};

export type MlbRatingsComparison = {
  away: MlbRatingsProfile;
  home: MlbRatingsProfile;
  ratingEdge: number;
  lineupRatingEdge: number;
  pitchingRatingEdge: number;
  fieldingRatingEdge: number;
  starDepthEdge: number;
  clutchRatingEdge: number;
  ratingRunEnvironment: number;
  ratingConfidence: number;
  factors: Array<{ label: string; value: number }>;
};

type RawRating = Record<string, unknown>;
const CACHE_KEY = "mlb:ratings-blend:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 12;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seedUnit(seed: number) {
  return (seed % 10000) / 10000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(2));
}

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function syntheticProfile(teamName: string): MlbRatingsProfile {
  const seed = hashString(`${teamName}:mlb-ratings-blend`);
  return {
    teamName,
    source: "synthetic",
    teamOverall: range(seed >>> 1, 72, 91),
    contactRating: range(seed >>> 2, 68, 92),
    powerRating: range(seed >>> 3, 66, 93),
    speedRating: range(seed >>> 4, 64, 91),
    defenseRating: range(seed >>> 5, 66, 94),
    starterRating: range(seed >>> 6, 68, 94),
    bullpenRating: range(seed >>> 7, 66, 92),
    clutchRating: range(seed >>> 8, 66, 91),
    disciplineRating: range(seed >>> 9, 66, 93),
    playerStarRating: range(seed >>> 10, 68, 96),
    playerDepthRating: range(seed >>> 11, 64, 90),
    injuryRating: range(seed >>> 12, 78, 98)
  };
}

function ratingFromTeamProfile(profile: MlbTeamProfile): MlbRatingsProfile {
  const offense = profile.wrcPlus;
  const contact = 72 + (profile.xwoba - 0.3) * 180 + (100 - profile.kRate) * 0.08;
  const power = 70 + profile.isoPower * 95 + (profile.wrcPlus - 100) * 0.12;
  const starter = 82 + (100 - profile.starterEraMinus) * 0.16 + (4.2 - profile.starterXFip) * 3.2;
  const bullpen = 81 + (100 - profile.bullpenEraMinus) * 0.15 + (4.2 - profile.bullpenXFip) * 2.6 - profile.bullpenFatigue * 4;
  const defense = 76 + profile.defensiveRunsSaved * 0.45;
  return {
    teamName: profile.teamName,
    source: profile.source === "real" ? "estimated" : "synthetic",
    teamOverall: num((offense + starter + bullpen + defense) / 4, 78),
    contactRating: num(contact, 76),
    powerRating: num(power, 76),
    speedRating: num(78 + profile.baseRunning * 1.2, 78),
    defenseRating: num(defense, 78),
    starterRating: num(starter, 78),
    bullpenRating: num(bullpen, 78),
    clutchRating: num(78 + profile.recentForm * 0.8, 78),
    disciplineRating: num(76 + profile.bbRate * 1.1 - profile.kRate * 0.28, 76),
    playerStarRating: num(78 + Math.max(0, profile.wrcPlus - 100) * 0.18 + Math.max(0, 100 - profile.starterEraMinus) * 0.12, 78),
    playerDepthRating: num(77 + (profile.wrcPlus - 100) * 0.08 + Math.max(0, 100 - profile.bullpenEraMinus) * 0.12, 77),
    injuryRating: num(88 - profile.bullpenFatigue * 5, 88)
  };
}

function normalizeRaw(row: RawRating): MlbRatingsProfile | null {
  const teamName = text(pick(row, "teamName", "team", "team_name", "name", "TEAM_NAME", "Team", "Tm"));
  if (!teamName) return null;
  const base = syntheticProfile(teamName);
  return {
    ...base,
    source: "real",
    teamOverall: num(pick(row, "teamOverall", "overall", "ovr", "rating", "gameRating"), base.teamOverall),
    contactRating: num(pick(row, "contactRating", "contact", "hitTool", "battingContact"), base.contactRating),
    powerRating: num(pick(row, "powerRating", "power", "slugging", "battingPower"), base.powerRating),
    speedRating: num(pick(row, "speedRating", "speed", "baseRunning", "baserunning"), base.speedRating),
    defenseRating: num(pick(row, "defenseRating", "defense", "fielding", "glove"), base.defenseRating),
    starterRating: num(pick(row, "starterRating", "rotationRating", "startingPitching", "rotation"), base.starterRating),
    bullpenRating: num(pick(row, "bullpenRating", "bullpen", "reliefPitching"), base.bullpenRating),
    clutchRating: num(pick(row, "clutchRating", "clutch", "composure", "lateGame"), base.clutchRating),
    disciplineRating: num(pick(row, "disciplineRating", "discipline", "plateDiscipline", "vision"), base.disciplineRating),
    playerStarRating: num(pick(row, "playerStarRating", "starRating", "topPlayers", "starPower"), base.playerStarRating),
    playerDepthRating: num(pick(row, "playerDepthRating", "depthRating", "rosterDepth", "depth"), base.playerDepthRating),
    injuryRating: num(pick(row, "injuryRating", "healthRating", "durability", "health"), base.injuryRating)
  };
}

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, MlbRatingsProfile>>(CACHE_KEY);
  if (cached) return cached;
  const url =
    process.env.MLB_TEAM_RATINGS_URL?.trim() ||
    process.env.MLB_PLAYER_RATINGS_URL?.trim() ||
    process.env.MLB_GAME_RATINGS_URL?.trim() ||
    process.env.VIDEO_GAME_RATINGS_URL?.trim();
  if (!url) return null;

  try {
    const grouped: Record<string, MlbRatingsProfile> = {};
    for (const row of await fetchRawFeedRows(url, ["teams", "ratings", "data", "rows"])) {
      const profile = normalizeRaw(row);
      if (profile) grouped[normalizeMlbTeam(profile.teamName)] = profile;
    }
    if (Object.keys(grouped).length) {
      await writeHotCache(CACHE_KEY, grouped, CACHE_TTL_SECONDS);
      return grouped;
    }
  } catch {
    return null;
  }

  return null;
}

export async function getMlbRatingsProfile(teamName: string): Promise<MlbRatingsProfile> {
  const profiles = await fetchProfiles();
  if (profiles?.[normalizeMlbTeam(teamName)]) return profiles[normalizeMlbTeam(teamName)];
  const teamProfile = await getMlbTeamProfile(teamName).catch(() => null);
  return teamProfile ? ratingFromTeamProfile(teamProfile) : syntheticProfile(teamName);
}

function diff(home: number, away: number, scale: number) {
  return Number(((home - away) * scale).toFixed(2));
}

function ratingSourceWeight(away: MlbRatingsProfile, home: MlbRatingsProfile) {
  // Synthetic/video-game style ratings are useful as display context, but they
  // should not be allowed to masquerade as a premium predictive input.
  if (away.source === "real" && home.source === "real") return 1;
  if (away.source === "estimated" && home.source === "estimated") return 0.42;
  if (away.source === "estimated" || home.source === "estimated") return 0.25;
  if (away.source === "real" || home.source === "real") return 0.35;
  return 0.08;
}

export async function compareMlbRatings(awayTeam: string, homeTeam: string): Promise<MlbRatingsComparison> {
  const [away, home] = await Promise.all([getMlbRatingsProfile(awayTeam), getMlbRatingsProfile(homeTeam)]);
  const sourceWeight = ratingSourceWeight(away, home);
  const rawLineupRatingEdge = diff(
    home.contactRating * 0.36 + home.powerRating * 0.34 + home.disciplineRating * 0.18 + home.speedRating * 0.12,
    away.contactRating * 0.36 + away.powerRating * 0.34 + away.disciplineRating * 0.18 + away.speedRating * 0.12,
    0.055
  );
  const rawPitchingRatingEdge = diff(
    home.starterRating * 0.58 + home.bullpenRating * 0.42,
    away.starterRating * 0.58 + away.bullpenRating * 0.42,
    0.065
  );
  const lineupRatingEdge = Number((rawLineupRatingEdge * sourceWeight).toFixed(2));
  const pitchingRatingEdge = Number((rawPitchingRatingEdge * sourceWeight).toFixed(2));
  const fieldingRatingEdge = Number((diff(home.defenseRating + home.speedRating * 0.28, away.defenseRating + away.speedRating * 0.28, 0.032) * sourceWeight).toFixed(2));
  const starDepthEdge = Number((diff(home.playerStarRating * 0.62 + home.playerDepthRating * 0.38, away.playerStarRating * 0.62 + away.playerDepthRating * 0.38, 0.052) * sourceWeight).toFixed(2));
  const clutchRatingEdge = Number((diff(home.clutchRating + home.injuryRating * 0.22, away.clutchRating + away.injuryRating * 0.22, 0.03) * sourceWeight).toFixed(2));
  const ratingEdge = Number((
    lineupRatingEdge * 0.28 +
    pitchingRatingEdge * 0.34 +
    fieldingRatingEdge * 0.12 +
    starDepthEdge * 0.16 +
    clutchRatingEdge * 0.1
  ).toFixed(2));
  const ratingRunEnvironment = Number(((
    ((home.contactRating + away.contactRating - 150) * 0.012) +
    ((home.powerRating + away.powerRating - 150) * 0.018) -
    ((home.starterRating + away.starterRating - 150) * 0.014) -
    ((home.bullpenRating + away.bullpenRating - 150) * 0.009)
  ) * sourceWeight).toFixed(2));
  const ratingConfidence = Number(Math.max(0.005, Math.min(0.08, Math.abs(ratingEdge) / 42 + (home.source === "real" && away.source === "real" ? 0.015 : 0))).toFixed(3));

  return {
    away,
    home,
    ratingEdge,
    lineupRatingEdge,
    pitchingRatingEdge,
    fieldingRatingEdge,
    starDepthEdge,
    clutchRatingEdge,
    ratingRunEnvironment,
    ratingConfidence,
    factors: [
      { label: "Ratings lineup", value: lineupRatingEdge },
      { label: "Ratings pitching", value: pitchingRatingEdge },
      { label: "Ratings fielding", value: fieldingRatingEdge },
      { label: "Ratings star/depth", value: starDepthEdge },
      { label: "Ratings clutch/health", value: clutchRatingEdge }
    ]
  };
}
