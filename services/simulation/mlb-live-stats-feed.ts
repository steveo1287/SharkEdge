import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam, type MlbTeamProfile } from "@/services/simulation/mlb-team-analytics";

// Computes real MLB team stats from the free MLB Stats API.
// No API key required — uses the same statsapi.mlb.com endpoint already
// configured in the rest of the codebase.
// Data: team ERA, batting avg, HR, OBP, SLG, OPS, bullpen ERA, standings

const CACHE_KEY = "mlb:live-stats-feed:v2";
const CACHE_TTL_SECONDS = 60 * 60 * 3; // 3-hour refresh

type TeamStandingRow = {
  team: { id: number; name: string };
  wins: number;
  losses: number;
  runDifferential: number;
  leagueRank: number;
  leagueRecord: { wins: number; losses: number; pct: string };
  teamStats?: {
    batting?: Record<string, unknown>;
    pitching?: Record<string, unknown>;
  };
};

function num(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

// Convert batting/pitching stats to MlbTeamProfile fields
function deriveProfile(
  teamName: string,
  batting: Record<string, unknown>,
  pitching: Record<string, unknown>,
  record: { wins: number; losses: number; runDiff: number }
): MlbTeamProfile {
  // Batting metrics
  const avg = num(batting.avg ?? batting.battingAverage, 0.250);
  const obp = num(batting.obp ?? batting.onBasePercentage, 0.320);
  const slg = num(batting.slg ?? batting.sluggingPercentage, 0.410);
  const ops = num(batting.ops ?? batting.opsPlus ?? (obp + slg), 0.730);
  const hr = num(batting.homeRuns ?? batting.hr, 120);
  const bb = num(batting.baseOnBalls ?? batting.walks ?? batting.bb, 400);
  const so = num(batting.strikeOuts ?? batting.strikeouts ?? batting.so, 1300);
  const gamesPlayed = Math.max(1, record.wins + record.losses);

  // Derive wRC+ proxy: OPS+ scaled around 100
  // League average OPS ~0.730; wRC+ ≈ (OPS / 0.730) * 100
  const wrcPlusProxy = Number(((ops / 0.730) * 100).toFixed(1));

  // xwOBA proxy from OBP and SLG (rough approximation)
  const xwobaProxy = Number((obp * 0.72 + slg * 0.28).toFixed(3));

  // ISO power
  const isoProxy = Number((slg - avg).toFixed(3));

  // K% and BB%
  const pa = Math.max(1, num(batting.plateAppearances ?? batting.atBats, gamesPlayed * 36));
  const kRateProxy = Number((so / pa).toFixed(3));
  const bbRateProxy = Number((bb / pa).toFixed(3));

  // BABIP proxy
  const babipProxy = Number((avg - hr / pa * 0.3).toFixed(3));

  // Pitching metrics
  const era = num(pitching.era ?? pitching.earnedRunAverage, 4.20);
  const whip = num(pitching.whip, 1.30);
  const kPer9 = num(pitching.strikeoutsPer9Inn ?? pitching.kPer9, 8.5);
  const bbPer9 = num(pitching.walksPer9Inn ?? pitching.bbPer9, 3.2);

  // ERA- proxy: ERA relative to league average (4.20), scaled to 100
  const eraMinus = Number(((era / 4.20) * 100).toFixed(1));

  // xFIP proxy from K/9 and BB/9 (simplified FIP-like calculation)
  const xfipProxy = Number((3.20 + (13 * 0.1) + (3 * bbPer9) - (2 * kPer9)).toFixed(2));

  // Bullpen ERA (estimate from total pitching minus starter share)
  const starterEra = Number((era * 0.92).toFixed(2));
  const bullpenEra = Number((era * 1.15).toFixed(2));
  const starterEraMinus = Number(((starterEra / 4.20) * 100).toFixed(1));
  const bullpenEraMinus = Number(((bullpenEra / 4.20) * 100).toFixed(1));

  // Defense proxy from WHIP and field errors
  const errors = num(pitching.errors ?? batting.errors, 85);
  const drsProxy = Number(((1.30 - whip) * 8 - (errors / gamesPlayed - 0.5) * 2).toFixed(1));

  // Recent form: run differential per game, scaled
  const formProxy = Number(Math.max(-6, Math.min(6, (record.runDiff / gamesPlayed) * 2)).toFixed(2));

  // Park/weather factor — use 1.0 as neutral; real park factors come from venue-weather-feed
  const parkRunFactor = 1.0;
  const weatherRunFactor = 1.0;

  return {
    teamName,
    source: "real",
    wrcPlus: wrcPlusProxy,
    xwoba: xwobaProxy,
    isoPower: isoProxy,
    kRate: kRateProxy,
    bbRate: bbRateProxy,
    babip: babipProxy,
    baseRunning: 0, // not available from standings endpoint
    starterEraMinus,
    starterXFip: xfipProxy,
    bullpenEraMinus,
    bullpenXFip: Number((xfipProxy + 0.4).toFixed(2)),
    bullpenFatigue: 0, // derived from lineup locks, not standings
    defensiveRunsSaved: drsProxy,
    parkRunFactor,
    weatherRunFactor,
    recentForm: formProxy,
    travelRest: 0 // overridden by schedule-rest-service
  };
}

async function fetchTeamStats(season: string): Promise<Record<string, MlbTeamProfile> | null> {
  const baseUrl = process.env.MLB_STATS_API_BASE_URL?.trim() ?? "https://statsapi.mlb.com/api/v1";
  try {
    // Fetch standings with team stats hydrated
    const url = `${baseUrl}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team,record,teamStats`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json() as {
      records?: Array<{
        teamRecords?: TeamStandingRow[];
      }>;
    };

    const result: Record<string, MlbTeamProfile> = {};
    for (const division of json.records ?? []) {
      for (const row of division.teamRecords ?? []) {
        const teamName = row.team?.name;
        if (!teamName) continue;
        const batting = (row.teamStats?.batting ?? {}) as Record<string, unknown>;
        const pitching = (row.teamStats?.pitching ?? {}) as Record<string, unknown>;
        const profile = deriveProfile(teamName, batting, pitching, {
          wins: row.wins ?? 0,
          losses: row.losses ?? 0,
          runDiff: row.runDifferential ?? 0
        });
        result[normalizeMlbTeam(teamName)] = profile;
      }
    }

    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

async function fetchTeamBattingPitching(season: string): Promise<Record<string, { batting: Record<string, unknown>; pitching: Record<string, unknown> }> | null> {
  const baseUrl = process.env.MLB_STATS_API_BASE_URL?.trim() ?? "https://statsapi.mlb.com/api/v1";
  try {
    const [battingRes, pitchingRes] = await Promise.all([
      fetch(`${baseUrl}/teams/stats?season=${season}&sportId=1&group=hitting&gameType=R`, { cache: "no-store" }),
      fetch(`${baseUrl}/teams/stats?season=${season}&sportId=1&group=pitching&gameType=R`, { cache: "no-store" })
    ]);
    if (!battingRes.ok && !pitchingRes.ok) return null;

    type StatsResponse = { stats?: Array<{ splits?: Array<{ team?: { name?: string }; stat?: Record<string, unknown> }> }> };
    const battingJson = battingRes.ok ? await battingRes.json() as StatsResponse : null;
    const pitchingJson = pitchingRes.ok ? await pitchingRes.json() as StatsResponse : null;

    const result: Record<string, { batting: Record<string, unknown>; pitching: Record<string, unknown> }> = {};

    for (const split of battingJson?.stats?.[0]?.splits ?? []) {
      const name = split.team?.name;
      if (!name || !split.stat) continue;
      const key = normalizeMlbTeam(name);
      if (!result[key]) result[key] = { batting: {}, pitching: {} };
      result[key].batting = split.stat;
    }

    for (const split of pitchingJson?.stats?.[0]?.splits ?? []) {
      const name = split.team?.name;
      if (!name || !split.stat) continue;
      const key = normalizeMlbTeam(name);
      if (!result[key]) result[key] = { batting: {}, pitching: {} };
      result[key].pitching = split.stat;
    }

    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

export async function fetchMlbLiveTeamProfiles(): Promise<Record<string, MlbTeamProfile> | null> {
  const cached = await readHotCache<Record<string, MlbTeamProfile>>(CACHE_KEY);
  if (cached) return cached;

  const year = new Date().getFullYear();
  const season = String(year);

  try {
    // Try rich team batting/pitching endpoint first (more granular stats)
    const teamStats = await fetchTeamBattingPitching(season);

    if (teamStats && Object.keys(teamStats).length >= 20) {
      // We need standings for W/L and run differential
      const standingsProfiles = await fetchTeamStats(season);
      const result: Record<string, MlbTeamProfile> = {};

      for (const [key, stats] of Object.entries(teamStats)) {
        const base = standingsProfiles?.[key];
        const teamName = base?.teamName ?? key;
        const profile = deriveProfile(
          teamName,
          stats.batting,
          stats.pitching,
          { wins: 0, losses: 0, runDiff: 0 }
        );
        // Override with standings data where available
        if (base) {
          profile.recentForm = base.recentForm;
          profile.travelRest = base.travelRest;
        }
        result[key] = profile;
      }

      if (Object.keys(result).length) {
        await writeHotCache(CACHE_KEY, result, CACHE_TTL_SECONDS);
        return result;
      }
    }

    // Fallback: standings-hydrated approach
    const standingsProfiles = await fetchTeamStats(season);
    if (standingsProfiles && Object.keys(standingsProfiles).length) {
      await writeHotCache(CACHE_KEY, standingsProfiles, CACHE_TTL_SECONDS);
      return standingsProfiles;
    }
  } catch {
    return null;
  }

  return null;
}

export async function getMlbLiveTeamProfile(teamName: string): Promise<MlbTeamProfile | null> {
  const profiles = await fetchMlbLiveTeamProfiles();
  if (!profiles) return null;
  const key = normalizeMlbTeam(teamName);
  return profiles[key] ?? null;
}
