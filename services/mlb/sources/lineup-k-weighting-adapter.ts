export type LineupKWeighting = {
  lineupKRate: number | null;
  handednessKRate: number | null;
  confidence: number;
  reasons: string[];
};

function parseCsv(text: string) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) return [];
  const headers = rows[0].split(",").map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const cols = row.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
  });
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function kRateFromRows(rows: any[]) {
  const strikeouts = rows.reduce((sum, row) => sum + (toNumber(row.strikeout ?? row.so ?? row.k) ?? 0), 0);
  const events = rows.length;
  if (!events) return null;
  return strikeouts / events;
}

export async function fetchLineupKWeighting(args: {
  opponent?: string | null;
  pitcherHand?: "L" | "R" | null;
}): Promise<LineupKWeighting> {
  const opponent = args.opponent?.toUpperCase();
  if (!opponent) return { lineupKRate: null, handednessKRate: null, confidence: 0, reasons: ["No opponent for lineup K weighting"] };

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 30);

  const params = new URLSearchParams({
    all: "true",
    hfGT: "R|",
    player_type: "batter",
    game_date_gt: startDate.toISOString().slice(0, 10),
    game_date_lt: endDate.toISOString().slice(0, 10),
    team: opponent,
    group_by: "name",
    type: "details",
    min_pitches: "0",
    min_results: "0"
  });

  if (args.pitcherHand) params.set("pitcher_throws", `${args.pitcherHand}|`);

  try {
    const res = await fetch(`https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Lineup Savant CSV failed");
    const rows = parseCsv(await res.text());
    const handednessKRate = kRateFromRows(rows);

    const allParams = new URLSearchParams(params);
    allParams.delete("pitcher_throws");
    const allRes = await fetch(`https://baseballsavant.mlb.com/statcast_search/csv?${allParams.toString()}`, { cache: "no-store" });
    const allRows = allRes.ok ? parseCsv(await allRes.text()) : [];
    const lineupKRate = kRateFromRows(allRows);

    return {
      lineupKRate,
      handednessKRate,
      confidence: handednessKRate ? 0.72 : lineupKRate ? 0.55 : 0.15,
      reasons: [
        handednessKRate ? `Opponent K% vs ${args.pitcherHand}HP loaded` : "Handedness K split unavailable",
        lineupKRate ? "Recent team lineup K% loaded" : "Recent lineup K% unavailable"
      ]
    };
  } catch {
    return { lineupKRate: null, handednessKRate: null, confidence: 0, reasons: ["Lineup K weighting failed safe"] };
  }
}
