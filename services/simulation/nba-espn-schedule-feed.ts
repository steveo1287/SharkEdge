import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

// Computes real NBA rest/travel/form context from the free ESPN public API.
// No API key required. Refreshes every 30 minutes.

export type NbaScheduleContext = {
  teamName: string;
  source: "real" | "synthetic";
  lastGameDate: string | null;
  daysRest: number;
  isBackToBack: boolean;
  recentRecord: { wins: number; losses: number; last10: number[] }; // last10: 1=win, 0=loss
  recentFormEdge: number;    // normalized -5 to +5
  restTravelEdge: number;    // normalized -2.5 to +2.5
  homeRecord?: { wins: number; losses: number };
  awayRecord?: { wins: number; losses: number };
};

const CACHE_KEY = "nba:espn-schedule:v2";
const CACHE_TTL_SECONDS = 60 * 30;

// ESPN NBA team ID map (consistent across seasons)
const ESPN_TEAM_IDS: Record<string, string> = {
  atlantahawks: "1", bostonceltics: "2", brooklynnets: "17",
  charlottehornets: "30", chicagobulls: "4", clevelandcavaliers: "5",
  dallasmavericks: "6", denvernuggets: "7", detroitpistons: "8",
  goldenstatewarriors: "9", houstonrockets: "10", indianapacers: "11",
  losangelesclippers: "12", losangeleslakers: "13", memphisgrizzlies: "29",
  miamiheat: "14", milwaukeebucks: "15", minnesotatimberwolves: "16",
  neworleanspelicans: "3", newyorkknicks: "18", oklahomacitythunder: "25",
  orlandomagic: "19", philadelphia76ers: "20", phoenixsuns: "21",
  portlandtrailblazers: "22", sacramentokings: "23", sanantoniospurs: "24",
  torontoraptors: "28", utahjazz: "26", washingtonwizards: "27"
};

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function restFromDays(days: number): number {
  if (days === 0) return -2.4;   // back-to-back: significant penalty
  if (days === 1) return 0.0;    // one day off: neutral
  if (days === 2) return 0.6;    // two days: slight boost
  if (days === 3) return 1.1;    // three days: well rested
  return 1.0;                    // 4+ days: well rested, slight rust
}

function formFromRecord(last10: number[]): number {
  if (!last10.length) return 0;
  const wins = last10.reduce((s, w) => s + w, 0);
  const pct = wins / last10.length;
  // Scale to -5 to +5 edge, centered at .500
  return Number(((pct - 0.5) * 10).toFixed(2));
}

async function fetchTeamSchedule(espnTeamId: string, teamKey: string): Promise<NbaScheduleContext | null> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/schedule`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json() as {
      team?: { displayName?: string };
      events?: Array<{
        date?: string;
        competitions?: Array<{
          competitors?: Array<{
            homeAway?: string;
            team?: { abbreviation?: string };
            score?: string;
            winner?: boolean;
            records?: Array<{ type?: string; summary?: string }>;
          }>;
          status?: { type?: { completed?: boolean } };
        }>;
      }>;
    };

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    let lastGameDate: string | null = null;
    const last10: number[] = [];
    let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;

    for (const event of json.events ?? []) {
      const comp = event.competitions?.[0];
      if (!comp?.status?.type?.completed) continue;
      const dateStr = event.date ? event.date.slice(0, 10) : null;
      if (!dateStr || dateStr > todayStr) continue;

      // Find this team's competitor entry by matching the ESPN team ID
      const myEntry = comp.competitors?.find(
        (c: { team?: { id?: string; abbreviation?: string }; homeAway?: string; winner?: boolean }) =>
          c.team?.id === ESPN_TEAM_IDS[teamKey]
      );
      const didWin = myEntry?.winner === true;
      const isHome = myEntry?.homeAway === "home";

      if (last10.length < 10) last10.unshift(didWin ? 1 : 0);
      if (isHome) { didWin ? homeWins++ : homeLosses++; }
      else { didWin ? awayWins++ : awayLosses++; }

      if (!lastGameDate || dateStr > lastGameDate) lastGameDate = dateStr;
    }

    const daysRest = lastGameDate
      ? Math.round((today.getTime() - new Date(lastGameDate).getTime()) / 86400000)
      : 1;

    return {
      teamName: json.team?.displayName ?? teamKey,
      source: "real",
      lastGameDate,
      daysRest,
      isBackToBack: daysRest === 0,
      recentRecord: { wins: last10.filter(Boolean).length, losses: last10.filter((w) => !w).length, last10 },
      recentFormEdge: formFromRecord(last10),
      restTravelEdge: restFromDays(daysRest),
      homeRecord: { wins: homeWins, losses: homeLosses },
      awayRecord: { wins: awayWins, losses: awayLosses }
    };
  } catch {
    return null;
  }
}

async function fetchTeamStandings(): Promise<Record<string, { wins: number; losses: number; form: number }> | null> {
  try {
    const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json() as {
      sports?: Array<{
        leagues?: Array<{
          teams?: Array<{
            team?: {
              displayName?: string;
              abbreviation?: string;
              record?: { items?: Array<{ summary?: string }> };
            };
          }>;
        }>;
      }>;
    };

    const result: Record<string, { wins: number; losses: number; form: number }> = {};
    for (const team of json.sports?.[0]?.leagues?.[0]?.teams ?? []) {
      const name = team.team?.displayName;
      if (!name) continue;
      const key = normalizeNbaTeam(name);
      const summary = team.team?.record?.items?.[0]?.summary ?? "";
      const parts = summary.split("-");
      const wins = num(parts[0]) ?? 41;
      const losses = num(parts[1]) ?? 41;
      const total = wins + losses;
      result[key] = {
        wins,
        losses,
        form: total > 0 ? Number(((wins / total - 0.5) * 10).toFixed(2)) : 0
      };
    }
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

export async function fetchNbaScheduleContextAll(): Promise<Record<string, NbaScheduleContext> | null> {
  const cached = await readHotCache<Record<string, NbaScheduleContext>>(CACHE_KEY);
  if (cached) return cached;

  // Fetch standings for all teams (fast, single request)
  const standings = await fetchTeamStandings();

  // Fetch schedule for all 30 teams in parallel (individual schedule calls)
  const teamEntries = Object.entries(ESPN_TEAM_IDS);
  const results = await Promise.allSettled(
    teamEntries.map(([key, id]) => fetchTeamSchedule(id, key))
  );

  const contexts: Record<string, NbaScheduleContext> = {};
  for (let i = 0; i < teamEntries.length; i++) {
    const [key] = teamEntries[i];
    const result = results[i];
    if (result.status === "fulfilled" && result.value) {
      const ctx = result.value;
      // Augment form edge with season-long record if we have it
      if (standings?.[key]) {
        const standing = standings[key];
        ctx.recentFormEdge = Number((ctx.recentFormEdge * 0.6 + standing.form * 0.4).toFixed(2));
      }
      contexts[key] = ctx;
    }
  }

  if (Object.keys(contexts).length) {
    await writeHotCache(CACHE_KEY, contexts, CACHE_TTL_SECONDS);
    return contexts;
  }

  return null;
}

export async function getNbaScheduleContext(teamName: string): Promise<NbaScheduleContext | null> {
  const all = await fetchNbaScheduleContextAll();
  const key = normalizeNbaTeam(teamName);
  return all?.[key] ?? null;
}
