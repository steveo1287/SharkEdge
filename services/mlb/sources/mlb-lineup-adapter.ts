type LineupPlayer = {
  name: string;
  battingOrder: number;
  playerId: number;
};

type LineupData = {
  lineup: LineupPlayer[];
};

export async function fetchConfirmedLineup(team?: string): Promise<LineupData> {
  if (!team) return { lineup: [] };

  const date = new Date().toISOString().slice(0, 10);
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=lineups,team`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json: any = await res.json();

    const games = json?.dates?.flatMap((d: any) => d.games ?? []) ?? [];
    const game = games.find((g: any) => {
      const away = g?.teams?.away?.team?.abbreviation;
      const home = g?.teams?.home?.team?.abbreviation;
      return away === team || home === team;
    });

    const isAway = game?.teams?.away?.team?.abbreviation === team;
    const lineup = isAway
      ? game?.teams?.away?.lineup
      : game?.teams?.home?.lineup;

    if (!Array.isArray(lineup)) return { lineup: [] };

    return {
      lineup: lineup.map((p: any, i: number) => ({
        name: p?.fullName ?? p?.person?.fullName,
        battingOrder: i + 1,
        playerId: p?.id ?? p?.person?.id
      }))
    };
  } catch {
    return { lineup: [] };
  }
}
