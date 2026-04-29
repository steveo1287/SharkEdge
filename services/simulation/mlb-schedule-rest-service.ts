import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbRestContext = {
  teamName: string;
  source: "real" | "synthetic";
  lastGameDate: string | null;
  daysRest: number;        // 0 = back-to-back, 1 = one day off, etc.
  travelRest: number;      // normalized edge: negative = fatigued, positive = rested
  isBackToBack: boolean;
};

type MlbRestMatchup = {
  awayRest: MlbRestContext;
  homeRest: MlbRestContext;
  fatigueEdge: number;     // positive = home more rested than away
  source: "real" | "synthetic";
};

type ScheduleGame = Record<string, unknown>;
const CACHE_KEY = "mlb:schedule-rest:v1";
const CACHE_TTL_SECONDS = 60 * 30; // 30-minute TTL — refresh twice per hour

function normalizeFranchise(abbr: string): string {
  const map: Record<string, string> = {
    AZ: "ARI", WSH: "WSN", WSN: "WSN",
    CWS: "CWS", LAD: "LAD", LAA: "LAA",
    KC: "KCR", KCR: "KCR",
    SD: "SDP", SDP: "SDP",
    SF: "SFG", SFG: "SFG",
    TB: "TBR", TBR: "TBR",
    TOR: "TOR"
  };
  return map[abbr.toUpperCase()] ?? abbr.toUpperCase();
}

type TeamEntry = { team?: { abbreviation?: string; name?: string } };
type GameTeams = { teams?: { away?: TeamEntry; home?: TeamEntry } };

function teamAbbrs(game: ScheduleGame): { away: string; home: string; awayName: string | null; homeName: string | null } | null {
  const teams = (game as GameTeams).teams;
  const away = teams?.away?.team?.abbreviation;
  const home = teams?.home?.team?.abbreviation;
  if (!away || !home) return null;
  return {
    away: normalizeFranchise(away),
    home: normalizeFranchise(home),
    awayName: teams?.away?.team?.name ?? null,
    homeName: teams?.home?.team?.name ?? null,
  };
}

function gameDateStr(game: ScheduleGame): string | null {
  const d = (game as { gameDate?: string; officialDate?: string }).officialDate ??
            (game as { gameDate?: string }).gameDate;
  return typeof d === "string" ? d.slice(0, 10) : null;
}

function isFinished(game: ScheduleGame): boolean {
  const status = (game as { status?: { abstractGameState?: string } }).status?.abstractGameState;
  return status === "Final";
}

function travelRestFromDays(days: number): number {
  // Maps days of rest to a normalized edge value used in the simulation.
  // Back-to-back (0): significant fatigue penalty.
  // 1 day off: neutral.
  // 2 days: slight rest boost.
  // 3-4 days: well-rested, max benefit.
  // 5+: marginal rustiness risk, slight regression.
  if (days === 0) return -1.6;
  if (days === 1) return 0.0;
  if (days === 2) return 0.5;
  if (days === 3) return 0.9;
  if (days === 4) return 1.1;
  return 1.0; // 5+ days: well rested but slightly rusty
}

function syntheticRest(teamName: string): MlbRestContext {
  return {
    teamName,
    source: "synthetic",
    lastGameDate: null,
    daysRest: 1,
    travelRest: 0,
    isBackToBack: false
  };
}

async function fetchRestByTeam(): Promise<Record<string, MlbRestContext> | null> {
  const cached = await readHotCache<Record<string, MlbRestContext>>(CACHE_KEY);
  if (cached) return cached;

  const baseUrl = process.env.MLB_STATS_API_BASE_URL?.trim() ?? "https://statsapi.mlb.com/api/v1";
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Look back 8 days to find each team's last completed game
  const lookbackStart = new Date(today);
  lookbackStart.setDate(lookbackStart.getDate() - 8);
  const startStr = lookbackStart.toISOString().slice(0, 10);

  try {
    const url = `${baseUrl}/schedule?sportId=1&startDate=${startStr}&endDate=${todayStr}&gameType=R,P,F,D,L,W&hydrate=team`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json() as { dates?: Array<{ date: string; games: ScheduleGame[] }> };

    // Collect last completed game date per team; track full name alongside abbr
    const lastGame: Record<string, string> = {};
    const teamFullName: Record<string, string> = {};
    for (const dateEntry of json.dates ?? []) {
      if (dateEntry.date > todayStr) continue; // future games
      for (const game of dateEntry.games ?? []) {
        if (!isFinished(game)) continue;
        const abbrs = teamAbbrs(game);
        const gDate = gameDateStr(game);
        if (!abbrs || !gDate) continue;
        // Keep the most recent completed game for each team
        if (!lastGame[abbrs.away] || gDate > lastGame[abbrs.away]) lastGame[abbrs.away] = gDate;
        if (!lastGame[abbrs.home] || gDate > lastGame[abbrs.home]) lastGame[abbrs.home] = gDate;
        if (abbrs.awayName) teamFullName[abbrs.away] = abbrs.awayName;
        if (abbrs.homeName) teamFullName[abbrs.home] = abbrs.homeName;
      }
    }

    if (!Object.keys(lastGame).length) return null;

    const result: Record<string, MlbRestContext> = {};
    const todayDate = new Date(todayStr);
    for (const [abbr, lastDate] of Object.entries(lastGame)) {
      const last = new Date(lastDate);
      const days = Math.round((todayDate.getTime() - last.getTime()) / 86400000);
      const fullName = teamFullName[abbr] ?? abbr;
      // Store under normalized full name so lookups via team display names hit correctly.
      // Also store under normalized abbreviation as a fallback.
      const ctx: MlbRestContext = {
        teamName: fullName,
        source: "real",
        lastGameDate: lastDate,
        daysRest: days,
        travelRest: travelRestFromDays(days),
        isBackToBack: days === 0
      };
      result[normalizeMlbTeam(fullName)] = ctx;
      result[normalizeMlbTeam(abbr)] = ctx;
    }

    if (Object.keys(result).length) {
      await writeHotCache(CACHE_KEY, result, CACHE_TTL_SECONDS);
      return result;
    }
  } catch {
    return null;
  }

  return null;
}

export async function getMlbRestContext(teamName: string): Promise<MlbRestContext> {
  const rests = await fetchRestByTeam();
  const key = normalizeMlbTeam(teamName);
  return rests?.[key] ?? syntheticRest(teamName);
}

export async function getMlbRestMatchup(awayTeam: string, homeTeam: string): Promise<MlbRestMatchup> {
  const [awayRest, homeRest] = await Promise.all([
    getMlbRestContext(awayTeam),
    getMlbRestContext(homeTeam)
  ]);
  const fatigueEdge = Number((homeRest.travelRest - awayRest.travelRest).toFixed(2));
  const source = awayRest.source === "real" || homeRest.source === "real" ? "real" : "synthetic";
  return { awayRest, homeRest, fatigueEdge, source };
}
