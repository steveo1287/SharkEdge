import { getMlbDataApiLeaguePlayerProfiles } from "@/services/mlb/mlb-data-api-feed";

type MlbFeedTeam = {
  teamName: string;
  players: Awaited<ReturnType<typeof getMlbDataApiLeaguePlayerProfiles>>;
};

type RawTeam = Record<string, unknown>;

function avg(values: number[], fallback: number) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return fallback;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function groupByTeam(players: Awaited<ReturnType<typeof getMlbDataApiLeaguePlayerProfiles>>) {
  const map = new Map<string, MlbFeedTeam["players"]>();
  for (const player of players) {
    const key = player.teamName;
    map.set(key, [...(map.get(key) ?? []), player]);
  }
  return Array.from(map.entries()).map(([teamName, players]) => ({ teamName, players }));
}

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function normalizeStandingsTeam(row: RawTeam) {
  const teamName = String(row.teamName ?? row.team ?? row.name ?? "").trim();
  if (!teamName) return null;
  const runsScored = num(row.runsScored ?? row.R ?? row.runs, 700);
  const runsAllowed = num(row.runsAllowed ?? row.RA ?? row.runs_allowed, 700);
  const games = Math.max(1, num(row.games ?? row.G, 162));
  const runsPerGame = runsScored / games;
  const runsAllowedPerGame = runsAllowed / games;
  const runDiffPerGame = runsPerGame - runsAllowedPerGame;
  const eraProxy = clamp(runsAllowedPerGame * 0.92, 3.1, 5.4);

  return {
    teamName,
    source: "mlb-stats-api-standings-derived",
    wrcPlus: Number(clamp(100 + (runsPerGame - 4.45) * 13, 72, 132).toFixed(2)),
    xwoba: Number(clamp(0.315 + (runsPerGame - 4.45) * 0.018, 0.285, 0.36).toFixed(3)),
    isoPower: Number(clamp(0.16 + (runsPerGame - 4.45) * 0.018, 0.105, 0.235).toFixed(3)),
    kRate: 22.5,
    bbRate: 8.2,
    babip: 0.295,
    baseRunning: Number(clamp(runDiffPerGame * 1.4, -5, 6).toFixed(2)),
    starterEraMinus: Number(clamp((eraProxy / 4.2) * 100, 68, 135).toFixed(2)),
    starterXFip: Number(clamp(eraProxy - 0.12, 3.1, 5.25).toFixed(2)),
    bullpenEraMinus: Number(clamp((eraProxy / 4.2) * 100 + 2, 70, 138).toFixed(2)),
    bullpenXFip: Number(clamp(eraProxy + 0.05, 3.15, 5.35).toFixed(2)),
    bullpenFatigue: 0.25,
    defensiveRunsSaved: Number(clamp((4.45 - runsAllowedPerGame) * 8, -16, 18).toFixed(2)),
    parkRunFactor: 1,
    weatherRunFactor: 1,
    recentForm: Number(clamp(runDiffPerGame * 2, -6, 6).toFixed(2)),
    travelRest: 0
  };
}

async function fetchMlbStatsApiTeamFeed() {
  const season = process.env.MLB_DATA_API_SEASON ?? String(new Date().getFullYear());
  const url = new URL("https://statsapi.mlb.com/api/v1/standings");
  url.searchParams.set("leagueId", "103,104");
  url.searchParams.set("season", season);
  url.searchParams.set("standingsTypes", "regularSeason");

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SharkEdge/1.5" },
    cache: "force-cache",
    next: { revalidate: Number(process.env.MLB_DATA_API_CACHE_TTL_SECONDS ?? 60 * 60 * 6) }
  });
  if (!response.ok) return [];

  const body = await response.json();
  const rows: RawTeam[] = [];
  for (const record of body.records ?? []) {
    for (const teamRecord of record.teamRecords ?? []) {
      rows.push({
        teamName: teamRecord.team?.name,
        runsScored: teamRecord.runsScored,
        runsAllowed: teamRecord.runsAllowed,
        games: teamRecord.gamesPlayed,
        recentForm: teamRecord.runDifferential ? Number(teamRecord.runDifferential) / 10 : 0
      });
    }
  }

  return rows.map(normalizeStandingsTeam).filter((team): team is NonNullable<ReturnType<typeof normalizeStandingsTeam>> => Boolean(team));
}

export async function buildInternalMlbTeamAnalyticsFeed() {
  const standingsFeed = await fetchMlbStatsApiTeamFeed();
  if (standingsFeed.length) return standingsFeed;

  const players = await getMlbDataApiLeaguePlayerProfiles();
  return groupByTeam(players).map(({ teamName, players }) => {
    const hitters = players.filter((player) => player.playerType === "hitter");
    const starters = players.filter((player) => player.playerType === "starter");
    const relievers = players.filter((player) => player.playerType === "reliever");

    return {
      teamName,
      source: "mlb-data-api-derived",
      wrcPlus: Number(avg(hitters.map((player) => player.wrcPlus), 100).toFixed(2)),
      xwoba: Number(avg(hitters.map((player) => player.xwoba), 0.315).toFixed(3)),
      isoPower: Number(avg(hitters.map((player) => player.isoPower), 0.16).toFixed(3)),
      kRate: Number(avg(hitters.map((player) => player.kRate), 22.5).toFixed(2)),
      bbRate: Number(avg(hitters.map((player) => player.bbRate), 8.2).toFixed(2)),
      babip: 0.295,
      baseRunning: Number(avg(hitters.map((player) => player.stolenBaseValue), 0).toFixed(2)),
      starterEraMinus: Number(avg(starters.map((player) => player.pitcherEraMinus), 100).toFixed(2)),
      starterXFip: Number(avg(starters.map((player) => player.pitcherXFip), 4.2).toFixed(2)),
      bullpenEraMinus: Number(avg(relievers.map((player) => player.pitcherEraMinus), 100).toFixed(2)),
      bullpenXFip: Number(avg(relievers.map((player) => player.pitcherXFip), 4.25).toFixed(2)),
      bullpenFatigue: Number(clamp(avg(relievers.map((player) => player.fatigueRisk), 0.22), 0, 1).toFixed(2)),
      defensiveRunsSaved: Number(avg(hitters.map((player) => player.defenseValue), 0).toFixed(2)),
      parkRunFactor: 1,
      weatherRunFactor: 1,
      recentForm: 0,
      travelRest: 0
    };
  });
}

export async function buildInternalMlbStatcastSplitsFeed() {
  const teams = await buildInternalMlbTeamAnalyticsFeed();
  return teams.map((team) => ({
    teamName: team.teamName,
    source: "mlb-data-api-derived",
    hitterXwobaVsFastball: Number(clamp(team.xwoba + 0.012, 0.285, 0.385).toFixed(3)),
    hitterXwobaVsBreaking: Number(clamp(team.xwoba - 0.018, 0.245, 0.35).toFixed(3)),
    hitterXwobaVsOffspeed: Number(clamp(team.xwoba - 0.01, 0.255, 0.36).toFixed(3)),
    barrelRate: Number(clamp(4 + team.isoPower * 32, 3, 16).toFixed(2)),
    hardHitRate: Number(clamp(31 + team.isoPower * 65, 30, 55).toFixed(2)),
    sweetSpotRate: Number(clamp(28 + (team.xwoba - 0.29) * 130, 27, 42).toFixed(2)),
    chaseRate: Number(clamp(34 - team.bbRate * 0.7, 22, 36).toFixed(2)),
    whiffRate: Number(clamp(team.kRate * 0.98, 16, 34).toFixed(2)),
    pitcherFastballRunValue: Number(clamp((team.starterEraMinus - 100) / 4, -9, 9).toFixed(2)),
    pitcherBreakingRunValue: Number(clamp((team.starterXFip - 4.2) * 3.5, -8, 8).toFixed(2)),
    pitcherOffspeedRunValue: Number(clamp((team.bullpenXFip - 4.2) * 3, -8, 8).toFixed(2)),
    pitcherAvgExitVeloAllowed: Number(clamp(88 + (team.starterEraMinus - 100) * 0.025, 85.5, 91.5).toFixed(2)),
    pitcherBarrelAllowedRate: Number(clamp(7 + (team.bullpenEraMinus - 100) * 0.04, 4.5, 11.5).toFixed(2)),
    weatherCarrySensitivity: Number(clamp((team.isoPower - 0.16) * 3.5, -0.7, 0.9).toFixed(2))
  }));
}

export async function buildInternalFangraphsCompatibleFeed() {
  const players = await getMlbDataApiLeaguePlayerProfiles();
  return players.map((player) => ({
    playerName: player.playerName,
    teamName: player.teamName,
    playerType: player.playerType,
    role: player.role,
    bats: player.bats,
    throws: player.throws,
    status: player.status,
    projectedPa: player.projectedPa,
    projectedInnings: player.projectedInnings,
    lineupSpot: player.lineupSpot,
    wrcPlus: player.wrcPlus,
    xwoba: player.xwoba,
    isoPower: player.isoPower,
    kRate: player.kRate,
    bbRate: player.bbRate,
    hardHitRate: player.hardHitRate,
    barrelRate: player.barrelRate,
    stolenBaseValue: player.stolenBaseValue,
    defenseValue: player.defenseValue,
    pitcherEraMinus: player.pitcherEraMinus,
    pitcherXFip: player.pitcherXFip,
    pitcherKRate: player.pitcherKRate,
    pitcherBbRate: player.pitcherBbRate,
    groundBallRate: player.groundBallRate,
    platoonVsLhp: player.platoonVsLhp,
    platoonVsRhp: player.platoonVsRhp,
    fatigueRisk: player.fatigueRisk,
    leverageIndex: player.leverageIndex
  }));
}
