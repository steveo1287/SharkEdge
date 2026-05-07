import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

const CACHE_TTL_SECONDS = 1800; // 30 min — recent form refreshes often enough

const TEAM_IDS: Record<string, number> = {
  arizonadiamondbacks:   109,
  atlantabraves:         144,
  baltimoreorioles:      110,
  bostonredsox:          111,
  chicagocubs:           112,
  chicagowhitesox:       145,
  cincinnatiredss:       113,
  clevelandguardians:    114,
  coloradorockies:       115,
  detroittigers:         116,
  houstonastroas:        117,
  kansascityroyals:      118,
  losangelesangels:      108,
  losangelesdodgers:     119,
  miamimarlins:          146,
  milwaukeebrewers:      158,
  minnesotatwins:        142,
  newyorkmets:           121,
  newyorkyankees:        147,
  oaklandathletics:      133,
  philadelphiaphillies:  143,
  pittsburghpirates:     134,
  sandiegopadres:        135,
  sanfranciscogaints:    137,
  seattlemariners:       136,
  stlouiscardinals:      138,
  tampabayarys:          139,
  texasrangers:          140,
  torontobluejays:       141,
  washingtonnationals:   120,
};

function statsApiBase() {
  return process.env.MLB_STATS_API_URL?.trim().replace(/\/$/, "") ?? "https://statsapi.mlb.com/api/v1";
}

type ScheduleGame = {
  status?: { abstractGameState?: string };
  teams?: {
    away?: { team?: { id?: number }; score?: number; isWinner?: boolean };
    home?: { team?: { id?: number }; score?: number; isWinner?: boolean };
  };
};

type ScheduleResponse = { dates?: Array<{ games?: ScheduleGame[] }> };

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

async function fetchTeamScheduleGames(teamId: number, days: number): Promise<ScheduleGame[]> {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - days * 86400 * 1000).toISOString().slice(0, 10);
  const url = `${statsApiBase()}/schedule?teamId=${teamId}&sportId=1&gameType=R&startDate=${start}&endDate=${end}&season=${now.getFullYear()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data: ScheduleResponse = await res.json();
    return (data.dates ?? []).flatMap((d) => d.games ?? []);
  } catch {
    return [];
  }
}

function computeFormFromGames(teamId: number, games: ScheduleGame[], maxGames = 10): number {
  const finished = games
    .filter((g) => g.status?.abstractGameState === "Final")
    .slice(-maxGames);

  if (!finished.length) return 0;

  let wins = 0;
  let runDiffTotal = 0;

  for (const g of finished) {
    const isHome = g.teams?.home?.team?.id === teamId;
    const mine = isHome ? g.teams?.home : g.teams?.away;
    const opp = isHome ? g.teams?.away : g.teams?.home;
    if (mine?.isWinner) wins += 1;
    const rs = mine?.score ?? 0;
    const ra = opp?.score ?? 0;
    runDiffTotal += rs - ra;
  }

  const n = finished.length;
  const winsAbove500 = wins - n / 2;
  const avgRunDiff = runDiffTotal / n;
  return Number(clamp(winsAbove500 * 1.2 + avgRunDiff * 0.5, -6, 6).toFixed(2));
}

export async function getTeamRecentForm(teamName: string, days = 14): Promise<number | null> {
  const key = normalizeMlbTeam(teamName);
  const teamId = TEAM_IDS[key];
  if (!teamId) return null;

  const cacheKey = `mlb:recent-form:${key}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await readHotCache<number>(cacheKey);
  if (cached !== null && cached !== undefined) return cached;

  const games = await fetchTeamScheduleGames(teamId, days).catch(() => [] as ScheduleGame[]);
  if (!games.length) return null;

  const form = computeFormFromGames(teamId, games);
  await writeHotCache(cacheKey, form, CACHE_TTL_SECONDS);
  return form;
}

export async function getMatchupRecentForms(awayTeam: string, homeTeam: string) {
  const [awayForm, homeForm] = await Promise.all([
    getTeamRecentForm(awayTeam).catch(() => null),
    getTeamRecentForm(homeTeam).catch(() => null)
  ]);
  return { awayForm, homeForm };
}
