import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function rowsFromBody(body: any): RawTeam[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.teams)) return body.teams;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.standings)) return body.standings;
  if (Array.isArray(body?.records)) return body.records;
  return [];
}

function normalizeTeam(row: RawTeam) {
  const teamName = text(row.teamName, row.team, row.team_name, row.name, row.teamFullName, row.Team);
  if (!teamName) return null;

  const runsScored = num(row.runsScored ?? row.R ?? row.runs, 700);
  const runsAllowed = num(row.runsAllowed ?? row.RA ?? row.runs_allowed, 700);
  const games = Math.max(1, num(row.games ?? row.G, 162));
  const runsPerGame = runsScored / games;
  const runsAllowedPerGame = runsAllowed / games;
  const ops = num(row.ops ?? row.OPS, 0.72);
  const obp = num(row.obp ?? row.OBP, 0.315);
  const slg = num(row.slg ?? row.SLG, 0.405);
  const era = num(row.era ?? row.ERA, 4.2);
  const whip = num(row.whip ?? row.WHIP, 1.28);

  return {
    teamName,
    source: "real",
    wrcPlus: num(row.wrcPlus ?? row.wRCPlus ?? row.wRC_plus, 100 + (runsPerGame - 4.45) * 12),
    xwoba: num(row.xwoba ?? row.xwOBA, 0.29 + ops * 0.045),
    isoPower: num(row.isoPower ?? row.ISO, Math.max(0.1, slg - obp)),
    kRate: num(row.kRate ?? row.KRate ?? row.K_PCT, 22.5),
    bbRate: num(row.bbRate ?? row.BBRate ?? row.BB_PCT, 8.2),
    babip: num(row.babip ?? row.BABIP, 0.295),
    baseRunning: num(row.baseRunning ?? row.BsR, 0),
    starterEraMinus: num(row.starterEraMinus, Math.max(70, Math.min(130, (era / 4.2) * 100))),
    starterXFip: num(row.starterXFip ?? row.starter_xfip, Math.max(2.7, Math.min(5.6, era - 0.15))),
    bullpenEraMinus: num(row.bullpenEraMinus, Math.max(70, Math.min(130, (era / 4.2) * 100 + whip * 4 - 5))),
    bullpenXFip: num(row.bullpenXFip ?? row.bullpen_xfip, Math.max(2.8, Math.min(5.7, era + 0.05))),
    bullpenFatigue: num(row.bullpenFatigue ?? row.bullpen_fatigue, 0.25),
    defensiveRunsSaved: num(row.defensiveRunsSaved ?? row.DRS, (runsAllowedPerGame - 4.45) * -8),
    parkRunFactor: num(row.parkRunFactor ?? row.park_factor, 1),
    weatherRunFactor: num(row.weatherRunFactor ?? row.weather_factor, 1),
    recentForm: num(row.recentForm ?? row.last10RunDiff, (runsPerGame - runsAllowedPerGame) * 2),
    travelRest: num(row.travelRest ?? row.rest_edge, 0)
  };
}

async function fetchConfiguredSource() {
  const url = process.env.MLB_RAW_TEAM_STATS_URL?.trim() || process.env.MLB_STATS_PIPELINE_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const rows = rowsFromBody(await response.json()).map(normalizeTeam).filter(Boolean);
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

async function fetchMlbStatsApiFallback() {
  try {
    const response = await fetch("https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=2026&standingsTypes=regularSeason", { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    const rows: RawTeam[] = [];
    for (const record of body.records ?? []) {
      for (const teamRecord of record.teamRecords ?? []) {
        rows.push({
          teamName: teamRecord.team?.name,
          runsScored: teamRecord.runsScored,
          runsAllowed: teamRecord.runsAllowed,
          games: teamRecord.gamesPlayed,
          winningPercentage: teamRecord.winningPercentage,
          recentForm: teamRecord.runDifferential ? Number(teamRecord.runDifferential) / 10 : 0
        });
      }
    }
    const normalized = rows.map(normalizeTeam).filter(Boolean);
    return normalized.length ? normalized : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const configured = await fetchConfiguredSource();
  const teams = configured ?? await fetchMlbStatsApiFallback() ?? [];
  return NextResponse.json({
    ok: true,
    source: configured ? "configured-feed" : "mlb-stats-api-standings-fallback",
    teamCount: teams.length,
    teams
  });
}
