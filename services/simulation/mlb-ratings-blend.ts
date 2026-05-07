import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";
import { prisma } from "@/lib/db/prisma";

export type MlbRatingsProfile = {
  teamName: string;
  source: "real" | "synthetic";
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

function rowsFromBody(body: unknown): RawRating[] {
  const value = body as { teams?: RawRating[]; ratings?: RawRating[]; data?: RawRating[]; rows?: RawRating[] };
  if (Array.isArray(body)) return body as RawRating[];
  if (Array.isArray(value.teams)) return value.teams;
  if (Array.isArray(value.ratings)) return value.ratings;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.rows)) return value.rows;
  return [];
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

function normalizeRaw(row: RawRating): MlbRatingsProfile | null {
  const teamName = text(row.teamName, row.team, row.team_name, row.name, row.TEAM_NAME);
  if (!teamName) return null;
  const base = syntheticProfile(teamName);
  return {
    ...base,
    source: "real",
    teamOverall: num(row.teamOverall ?? row.overall ?? row.ovr ?? row.rating ?? row.gameRating, base.teamOverall),
    contactRating: num(row.contactRating ?? row.contact ?? row.hitTool ?? row.battingContact, base.contactRating),
    powerRating: num(row.powerRating ?? row.power ?? row.slugging ?? row.battingPower, base.powerRating),
    speedRating: num(row.speedRating ?? row.speed ?? row.baseRunning ?? row.baserunning, base.speedRating),
    defenseRating: num(row.defenseRating ?? row.defense ?? row.fielding ?? row.glove, base.defenseRating),
    starterRating: num(row.starterRating ?? row.rotationRating ?? row.startingPitching ?? row.rotation, base.starterRating),
    bullpenRating: num(row.bullpenRating ?? row.bullpen ?? row.reliefPitching, base.bullpenRating),
    clutchRating: num(row.clutchRating ?? row.clutch ?? row.composure ?? row.lateGame, base.clutchRating),
    disciplineRating: num(row.disciplineRating ?? row.discipline ?? row.plateDiscipline ?? row.vision, base.disciplineRating),
    playerStarRating: num(row.playerStarRating ?? row.starRating ?? row.topPlayers ?? row.starPower, base.playerStarRating),
    playerDepthRating: num(row.playerDepthRating ?? row.depthRating ?? row.rosterDepth ?? row.depth, base.playerDepthRating),
    injuryRating: num(row.injuryRating ?? row.healthRating ?? row.durability ?? row.health, base.injuryRating)
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
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, MlbRatingsProfile> = {};
    for (const row of rowsFromBody(await response.json())) {
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

function eloToRatingsProfile(teamName: string, elo: number): MlbRatingsProfile {
  const pin = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  const base = pin(79 + (elo - 1500) * 0.025, 65, 95);
  return {
    teamName,
    source: "real",
    teamOverall: base,
    contactRating: pin(base + 1, 65, 96),
    powerRating: pin(base - 1, 63, 96),
    speedRating: pin(base - 3, 60, 93),
    defenseRating: pin(base, 62, 95),
    starterRating: pin(base + 1, 65, 96),
    bullpenRating: pin(base - 1, 63, 94),
    clutchRating: pin(base, 63, 93),
    disciplineRating: pin(base, 63, 95),
    playerStarRating: pin(base + 2, 65, 96),
    playerDepthRating: pin(base - 2, 62, 92),
    injuryRating: 88,
  };
}

async function getSpineEloProfile(teamName: string): Promise<MlbRatingsProfile | null> {
  try {
    const normalizedName = normalizeMlbTeam(teamName);
    // Resolve the integer team ID stored in mlb_betting_games using the normalized name.
    const idRows = await prisma.$queryRaw<{ team_id: number }[]>`
      SELECT home_team_id AS team_id FROM mlb_betting_games
      WHERE LOWER(REGEXP_REPLACE(home_team_name, '[^a-z0-9]', '', 'g')) = ${normalizedName}
        AND home_team_id IS NOT NULL
      UNION
      SELECT away_team_id FROM mlb_betting_games
      WHERE LOWER(REGEXP_REPLACE(away_team_name, '[^a-z0-9]', '', 'g')) = ${normalizedName}
        AND away_team_id IS NOT NULL
      LIMIT 1
    `;
    const teamId = idRows[0]?.team_id;
    if (!teamId) return null;

    const snapshot = await prisma.mlbTeamEloSnapshot.findFirst({
      where: { sourceKey: "SPINE", teamId: String(teamId) },
      orderBy: { gameDate: "desc" },
    });
    if (!snapshot) return null;

    return eloToRatingsProfile(teamName, snapshot.postGameElo);
  } catch {
    return null;
  }
}

export async function getMlbRatingsProfile(teamName: string): Promise<MlbRatingsProfile> {
  const profiles = await fetchProfiles();
  if (profiles?.[normalizeMlbTeam(teamName)]) return profiles[normalizeMlbTeam(teamName)];
  // Spine Elo path: derived from actual game results — returns source: "real".
  const spineElo = await getSpineEloProfile(teamName);
  if (spineElo) return spineElo;
  return syntheticProfile(teamName);
}

function diff(home: number, away: number, scale: number) {
  return Number(((home - away) * scale).toFixed(2));
}

export async function compareMlbRatings(awayTeam: string, homeTeam: string): Promise<MlbRatingsComparison> {
  const [away, home] = await Promise.all([getMlbRatingsProfile(awayTeam), getMlbRatingsProfile(homeTeam)]);
  const lineupRatingEdge = diff(
    home.contactRating * 0.36 + home.powerRating * 0.34 + home.disciplineRating * 0.18 + home.speedRating * 0.12,
    away.contactRating * 0.36 + away.powerRating * 0.34 + away.disciplineRating * 0.18 + away.speedRating * 0.12,
    0.055
  );
  const pitchingRatingEdge = diff(
    home.starterRating * 0.58 + home.bullpenRating * 0.42,
    away.starterRating * 0.58 + away.bullpenRating * 0.42,
    0.065
  );
  const fieldingRatingEdge = diff(home.defenseRating + home.speedRating * 0.28, away.defenseRating + away.speedRating * 0.28, 0.032);
  const starDepthEdge = diff(home.playerStarRating * 0.62 + home.playerDepthRating * 0.38, away.playerStarRating * 0.62 + away.playerDepthRating * 0.38, 0.052);
  const clutchRatingEdge = diff(home.clutchRating + home.injuryRating * 0.22, away.clutchRating + away.injuryRating * 0.22, 0.03);
  const ratingEdge = Number((
    lineupRatingEdge * 0.28 +
    pitchingRatingEdge * 0.34 +
    fieldingRatingEdge * 0.12 +
    starDepthEdge * 0.16 +
    clutchRatingEdge * 0.1
  ).toFixed(2));
  const ratingRunEnvironment = Number((
    ((home.contactRating + away.contactRating - 150) * 0.012) +
    ((home.powerRating + away.powerRating - 150) * 0.018) -
    ((home.starterRating + away.starterRating - 150) * 0.014) -
    ((home.bullpenRating + away.bullpenRating - 150) * 0.009)
  ).toFixed(2));
  const ratingConfidence = Number(Math.max(0.01, Math.min(0.08, Math.abs(ratingEdge) / 42 + (home.source === "real" && away.source === "real" ? 0.015 : 0))).toFixed(3));

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
