type SavantData = {
  xwoba: number | null;
  barrel: number | null;
  exitVelocity: number | null;
  hardHitPct: number | null;
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values: Array<number | null>) {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function fetchSavantData(playerName: string): Promise<SavantData> {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 45);

  const params = new URLSearchParams({
    all: "true",
    hfPT: "",
    hfAB: "",
    hfGT: "R|",
    hfPR: "",
    hfZ: "",
    stadia: "",
    hfBBL: "",
    hfNewZones: "",
    hfPull: "",
    hfC: "",
    hfSea: String(endDate.getFullYear()),
    hfSit: "",
    player_type: "batter",
    hfOuts: "",
    opponent: "",
    pitcher_throws: "",
    batter_stands: "",
    hfSA: "",
    game_date_gt: startDate.toISOString().slice(0, 10),
    game_date_lt: endDate.toISOString().slice(0, 10),
    team: "",
    position: "",
    hfRO: "",
    home_road: "",
    hfFlag: "",
    hfBBT: "",
    metric_1: "",
    hfInn: "",
    min_pitches: "0",
    min_results: "0",
    group_by: "name",
    sort_col: "xwoba",
    player_event_sort: "h_launch_speed",
    sort_order: "desc",
    min_pas: "0",
    type: "details"
  });

  try {
    const response = await fetch(`https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Savant CSV failed");
    const rows = parseCsv(await response.text());
    const normalized = playerName.trim().toLowerCase();
    const playerRows = rows.filter((row: any) => String(row.player_name ?? row.batter_name ?? "").trim().toLowerCase() === normalized);
    const sample = playerRows.length ? playerRows : rows.slice(0, 0);

    const xwoba = mean(sample.map((row: any) => toNumber(row.estimated_woba_using_speedangle ?? row.xwoba)));
    const ev = mean(sample.map((row: any) => toNumber(row.launch_speed)));
    const hardHitRows = sample.map((row: any) => toNumber(row.launch_speed)).filter((v): v is number => typeof v === "number");
    const hardHitPct = hardHitRows.length ? hardHitRows.filter((v) => v >= 95).length / hardHitRows.length : null;
    const barrelRows = sample.map((row: any) => String(row.bb_type ?? "").toLowerCase());
    const barrel = barrelRows.length ? barrelRows.filter((v) => v.includes("barrel")).length / barrelRows.length : null;

    return { xwoba, barrel, exitVelocity: ev, hardHitPct };
  } catch {
    return { xwoba: null, barrel: null, exitVelocity: null, hardHitPct: null };
  }
}
