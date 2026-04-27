type OpponentSplit = {
  opponentKRate: number | null;
};

function parseCsv(text: string) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  const headers = rows[0].split(",");
  return rows.slice(1).map((r) => {
    const cols = r.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
  });
}

function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchOpponentStrikeoutRate(team?: string): Promise<OpponentSplit> {
  if (!team) return { opponentKRate: null };

  try {
    const url = `https://baseballsavant.mlb.com/statcast_search/csv?group_by=team&team=${team}`;
    const res = await fetch(url, { cache: "no-store" });
    const rows = parseCsv(await res.text());

    const teamRow = rows.find((r: any) => String(r.team ?? "").toUpperCase() === team.toUpperCase());

    return {
      opponentKRate: toNumber(teamRow?.k_percent ?? teamRow?.strikeout_rate) ?? null
    };
  } catch {
    return { opponentKRate: null };
  }
}
