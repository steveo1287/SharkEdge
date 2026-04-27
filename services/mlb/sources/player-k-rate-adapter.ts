function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchPlayerKRate(playerId: number) {
  const season = new Date().getFullYear();

  try {
    const url = `https://statsapi.mlb.com/api/v1/people/${playerId}/stats?stats=season&group=hitting&season=${season}`;
    const res = await fetch(url, { cache: "no-store" });
    const json: any = await res.json();

    const stat = json?.stats?.[0]?.splits?.[0]?.stat;
    const strikeouts = toNumber(stat?.strikeOuts);
    const plateAppearances = toNumber(stat?.plateAppearances);

    if (!strikeouts || !plateAppearances) return null;

    return strikeouts / plateAppearances;
  } catch {
    return null;
  }
}
