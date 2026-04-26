export type MlbAnalyticsPipelineTeam = {
  teamName: string;
  source: "real";
  wrcPlus: number;
  xwoba: number;
  isoPower: number;
  kRate: number;
  bbRate: number;
  babip: number;
  baseRunning: number;
  starterEraMinus: number;
  starterXFip: number;
  bullpenEraMinus: number;
  bullpenXFip: number;
  bullpenFatigue: number;
  defensiveRunsSaved: number;
  parkRunFactor: number;
  weatherRunFactor: number;
  recentForm: number;
  travelRest: number;
};

type RawTeam = Record<string, unknown>;

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function rowsFromMlbAnalyticsBody(body: any): RawTeam[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.teams)) return body.teams;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.records)) return body.records;
  if (Array.isArray(body?.standings)) return body.standings;
  return [];
}

export function normalizeMlbAnalyticsRow(row: RawTeam): MlbAnalyticsPipelineTeam | null {
  const teamName = text(row.teamName, row.team, row.team_name, row.name, row.Team, row.teamFullName);
  if (!teamName) return null;

  const games = Math.max(1, num(row.games ?? row.G, 162));
  const runsScored = num(row.runsScored ?? row.R ?? row.runs, 4.45 * games);
  const runsAllowed = num(row.runsAllowed ?? row.RA ?? row.runs_allowed, 4.45 * games);
  const runsPerGame = runsScored / games;
  const runsAllowedPerGame = runsAllowed / games;
  const ops = num(row.ops ?? row.OPS, 0.72);
  const obp = num(row.obp ?? row.OBP, 0.315);
  const slg = num(row.slg ?? row.SLG, 0.405);
  const era = num(row.era ?? row.ERA, 4.2);
  const whip = num(row.whip ?? row.WHIP, 1.28);
  const recentRunDiff = num(row.recentRunDiff ?? row.last10RunDiff ?? row.runDifferential, (runsScored - runsAllowed) / Math.max(1, games / 10));

  const wrcPlus = num(row.wrcPlus ?? row.wRCPlus ?? row.wRC_plus ?? row.wRC, 100 + (runsPerGame - 4.45) * 12);
  const xwoba = num(row.xwoba ?? row.xwOBA ?? row.expected_woba, 0.29 + ops * 0.045);
  const isoPower = num(row.isoPower ?? row.ISO ?? row.iso, clamp(slg - obp, 0.09, 0.24));
  const starterEraMinus = num(row.starterEraMinus ?? row.SP_ERA_MINUS, clamp((era / 4.2) * 100, 65, 140));
  const bullpenEraMinus = num(row.bullpenEraMinus ?? row.RP_ERA_MINUS, clamp((era / 4.2) * 100 + whip * 4 - 5, 65, 145));

  return {
    teamName,
    source: "real",
    wrcPlus: Number(wrcPlus.toFixed(2)),
    xwoba: Number(xwoba.toFixed(3)),
    isoPower: Number(isoPower.toFixed(3)),
    kRate: num(row.kRate ?? row.KRate ?? row.K_PCT ?? row.k_pct, 22.5),
    bbRate: num(row.bbRate ?? row.BBRate ?? row.BB_PCT ?? row.bb_pct, 8.2),
    babip: num(row.babip ?? row.BABIP, 0.295),
    baseRunning: num(row.baseRunning ?? row.BsR ?? row.base_running, 0),
    starterEraMinus: Number(starterEraMinus.toFixed(2)),
    starterXFip: num(row.starterXFip ?? row.starter_xfip ?? row.SP_xFIP, clamp(era - 0.15, 2.7, 5.8)),
    bullpenEraMinus: Number(bullpenEraMinus.toFixed(2)),
    bullpenXFip: num(row.bullpenXFip ?? row.bullpen_xfip ?? row.RP_xFIP, clamp(era + 0.05, 2.8, 5.9)),
    bullpenFatigue: num(row.bullpenFatigue ?? row.bullpen_fatigue ?? row.relieverFatigue, 0.25),
    defensiveRunsSaved: num(row.defensiveRunsSaved ?? row.DRS ?? row.OAA, (runsAllowedPerGame - 4.45) * -8),
    parkRunFactor: num(row.parkRunFactor ?? row.park_factor ?? row.parkFactor, 1),
    weatherRunFactor: num(row.weatherRunFactor ?? row.weather_factor ?? row.weatherFactor, 1),
    recentForm: num(row.recentForm ?? row.last10RunDiff, recentRunDiff / 5),
    travelRest: num(row.travelRest ?? row.rest_edge ?? row.restEdge, 0)
  };
}

export function normalizeMlbAnalyticsRows(rows: RawTeam[]) {
  return rows.map(normalizeMlbAnalyticsRow).filter((row): row is MlbAnalyticsPipelineTeam => Boolean(row));
}
