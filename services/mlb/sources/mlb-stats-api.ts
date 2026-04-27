export type MlbGameData = {
  venue?: string | null;
  lineupSpot?: number | null;
  pitcher?: string | null;
  pitcherId?: number | null;
  pitcherHand?: "L" | "R" | null;
  seasonAvg?: number | null;
  last7Avg?: number | null;
  pitcherKRate?: number | null;
  pitcherWhip?: number | null;
  pitcherEra?: number | null;
  pitchCount?: number | null;
  pitcherOutsAvg?: number | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchPitcherSeasonStats(pitcherId?: number | null) {
  if (!pitcherId) return {};
  const season = new Date().getFullYear();
  const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=season&group=pitching&season=${season}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {};
    const json: any = await res.json();
    const stat = json?.stats?.[0]?.splits?.[0]?.stat ?? {};
    const strikeouts = toNumber(stat.strikeOuts) ?? 0;
    const battersFaced = toNumber(stat.battersFaced) ?? null;
    const inningsPitched = toNumber(stat.inningsPitched) ?? null;
    const gamesStarted = toNumber(stat.gamesStarted) ?? toNumber(stat.gamesPlayed) ?? null;
    const pitchesPerInning = 15.8;

    return {
      pitcherKRate: battersFaced ? strikeouts / battersFaced : null,
      pitcherWhip: toNumber(stat.whip),
      pitcherEra: toNumber(stat.era),
      pitcherOutsAvg: inningsPitched && gamesStarted ? (inningsPitched * 3) / gamesStarted : null,
      pitchCount: inningsPitched && gamesStarted ? (inningsPitched / gamesStarted) * pitchesPerInning : null
    };
  } catch {
    return {};
  }
}

export async function fetchMlbGameData(input: {
  playerName: string;
  team?: string | null;
  opponent?: string | null;
}): Promise<MlbGameData> {
  const date = new Date().toISOString().slice(0, 10);
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team,venue,lineups`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {};
    const json: any = await res.json();
    const games = json?.dates?.flatMap((d: any) => d.games ?? []) ?? [];
    const team = String(input.team ?? "").toUpperCase();
    const game = games.find((g: any) => {
      const away = String(g?.teams?.away?.team?.abbreviation ?? "").toUpperCase();
      const home = String(g?.teams?.home?.team?.abbreviation ?? "").toUpperCase();
      return team && (away === team || home === team);
    }) ?? games[0];

    const isAway = String(game?.teams?.away?.team?.abbreviation ?? "").toUpperCase() === team;
    const probable = isAway ? game?.teams?.home?.probablePitcher : game?.teams?.away?.probablePitcher;
    const pitcherId = toNumber(probable?.id);
    const seasonStats = await fetchPitcherSeasonStats(pitcherId);

    return {
      venue: game?.venue?.name ?? null,
      pitcher: probable?.fullName ?? null,
      pitcherId,
      pitcherHand: probable?.pitchHand?.code ?? null,
      lineupSpot: null,
      seasonAvg: null,
      last7Avg: null,
      ...seasonStats
    };
  } catch {
    return {};
  }
}
