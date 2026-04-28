import { prisma } from "@/lib/db/prisma";

type JsonRecord = Record<string, unknown>;

type CoverageMetric = {
  key: string;
  label: string;
  count: number;
  total: number;
  pct: number | null;
  status: "GREEN" | "YELLOW" | "RED" | "GRAY";
};

type MlbDataQualityReport = {
  generatedAt: string;
  lookbackDays: number;
  games: {
    total: number;
    final: number;
    upcoming: number;
  };
  coverage: CoverageMetric[];
  dataQualityScore: number;
  readiness: "FULL" | "PARTIAL" | "WEAK" | "NOT_READY";
  warnings: string[];
  sample: {
    latestGame: string | null;
    latestTeamStatUpdatedAt: string | null;
    latestPlayerStatUpdatedAt: string | null;
    latestMarketUpdatedAt: string | null;
  };
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasAny(record: JsonRecord, keys: string[]) {
  return keys.some((key) => record[key] !== undefined && record[key] !== null && record[key] !== "");
}

function hasNested(record: JsonRecord, path: string[]) {
  let current: unknown = record;
  for (const key of path) {
    const obj = asRecord(current);
    current = obj[key];
  }
  return current !== undefined && current !== null && current !== "";
}

function pct(count: number, total: number) {
  return total ? count / total : null;
}

function status(value: number | null) {
  if (value === null) return "GRAY" as const;
  if (value >= 0.85) return "GREEN" as const;
  if (value >= 0.55) return "YELLOW" as const;
  return "RED" as const;
}

function metric(key: string, label: string, count: number, total: number): CoverageMetric {
  const value = pct(count, total);
  return { key, label, count, total, pct: value, status: status(value) };
}

function statcast(record: JsonRecord) {
  return asRecord(record.statcast);
}

function boolCount<T>(rows: T[], fn: (row: T) => boolean) {
  return rows.reduce((sum, row) => sum + (fn(row) ? 1 : 0), 0);
}

function average(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export async function getMlbDataQualityReport(args: { lookbackDays?: number } = {}): Promise<MlbDataQualityReport> {
  const lookbackDays = Math.max(1, Math.min(60, args.lookbackDays ?? 7));
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const league = await prisma.league.findUnique({ where: { key: "MLB" } });
  if (!league) {
    return {
      generatedAt: new Date().toISOString(),
      lookbackDays,
      games: { total: 0, final: 0, upcoming: 0 },
      coverage: [],
      dataQualityScore: 0,
      readiness: "NOT_READY",
      warnings: ["MLB league is missing from database."],
      sample: { latestGame: null, latestTeamStatUpdatedAt: null, latestPlayerStatUpdatedAt: null, latestMarketUpdatedAt: null }
    };
  }

  const [games, events, teamStats, playerStats, markets] = await Promise.all([
    prisma.game.findMany({
      where: { leagueId: league.id, startTime: { gte: since } },
      orderBy: { startTime: "desc" },
      take: 500
    }),
    prisma.event.findMany({
      where: { leagueId: league.id, startTime: { gte: since } },
      orderBy: { startTime: "desc" },
      take: 500
    }),
    prisma.teamGameStat.findMany({
      where: { team: { leagueId: league.id }, game: { startTime: { gte: since } } },
      orderBy: { updatedAt: "desc" },
      take: 1000
    }),
    prisma.playerGameStat.findMany({
      where: { player: { leagueId: league.id }, game: { startTime: { gte: since } } },
      orderBy: { updatedAt: "desc" },
      take: 5000
    }),
    prisma.eventMarket.findMany({
      where: { event: { leagueId: league.id, startTime: { gte: since } } },
      orderBy: { updatedAt: "desc" },
      take: 5000
    })
  ]);

  const finalGames = games.filter((game) => game.status === "FINAL");
  const upcomingGames = games.filter((game) => game.status === "PREGAME" || game.status === "LIVE");
  const gameTotal = Math.max(1, games.length);
  const teamStatGameIds = new Set(teamStats.map((row) => row.gameId));
  const playerStatGameIds = new Set(playerStats.map((row) => row.gameId));
  const marketEventIds = new Set(markets.map((market) => market.eventId));
  const officialEvents = events.filter((event) => event.status === "FINAL" && event.resultState === "OFFICIAL");

  const teamRecords = teamStats.map((row) => asRecord(row.statsJson));
  const playerRecords = playerStats.map((row) => asRecord(row.statsJson));
  const teamTotal = Math.max(1, teamRecords.length);
  const playerTotal = Math.max(1, playerRecords.length);

  const coverage = [
    metric("team_boxscores", "Games with team boxscore rows", teamStatGameIds.size, games.length),
    metric("player_rows", "Games with player stat rows", playerStatGameIds.size, games.length),
    metric("probable_pitchers", "Team rows with probable pitchers", boolCount(teamRecords, (row) => hasAny(row, ["probablePitcherId", "probablePitcherName"])), teamTotal),
    metric("weather", "Team rows with weather/wind", boolCount(teamRecords, (row) => hasNested(row, ["weather", "wind"]) || hasAny(row, ["weatherRunFactor", "weatherWindFactor"])), teamTotal),
    metric("bullpen_fatigue", "Team rows with bullpen usage proxy", boolCount(teamRecords, (row) => hasAny(row, ["bullpenInningsLast3", "bullpenPitchesLast3"])), teamTotal),
    metric("pitcher_rows", "Player rows with pitcher context", boolCount(playerRecords, (row) => hasAny(row, ["pitcherOuts", "outsPitched", "pitchingStrikeouts", "pitchesThrown"])), playerTotal),
    metric("statcast_team", "Team rows with Statcast quality", boolCount(teamRecords, (row) => Object.keys(statcast(row)).length > 0), teamTotal),
    metric("statcast_player", "Player rows with Statcast quality", boolCount(playerRecords, (row) => Object.keys(statcast(row)).length > 0), playerTotal),
    metric("xwoba", "Rows with xwOBA", boolCount([...teamRecords, ...playerRecords], (row) => hasNested(row, ["statcast", "xwoba"])), teamRecords.length + playerRecords.length),
    metric("hard_hit", "Rows with hard-hit rate", boolCount([...teamRecords, ...playerRecords], (row) => hasNested(row, ["statcast", "hardHitRate"])), teamRecords.length + playerRecords.length),
    metric("pitch_mix", "Pitcher rows with pitch mix", boolCount(playerRecords, (row) => Object.keys(asRecord(asRecord(asRecord(row.statcast).pitching).pitchMix)).length > 0), playerTotal),
    metric("markets", "Events with market rows", marketEventIds.size, events.length),
    metric("closing_lines", "Market rows with closing line/odds", boolCount(markets, (market) => market.closingOdds !== null || market.closingLine !== null), Math.max(1, markets.length)),
    metric("official_results", "Final events with official results", officialEvents.length, Math.max(1, events.filter((event) => event.status === "FINAL").length))
  ];

  const weightedScore = average([
    coverage.find((row) => row.key === "team_boxscores")?.pct,
    coverage.find((row) => row.key === "player_rows")?.pct,
    coverage.find((row) => row.key === "probable_pitchers")?.pct,
    coverage.find((row) => row.key === "pitcher_rows")?.pct,
    coverage.find((row) => row.key === "markets")?.pct,
    coverage.find((row) => row.key === "official_results")?.pct,
    (coverage.find((row) => row.key === "statcast_team")?.pct ?? 0) * 0.65 + 0.35,
    (coverage.find((row) => row.key === "closing_lines")?.pct ?? 0) * 0.5 + 0.5
  ]) ?? 0;

  const dataQualityScore = Number(Math.max(0, Math.min(1, weightedScore)).toFixed(4));
  const readiness = dataQualityScore >= 0.85 ? "FULL" : dataQualityScore >= 0.65 ? "PARTIAL" : dataQualityScore >= 0.4 ? "WEAK" : "NOT_READY";
  const warnings = coverage
    .filter((row) => row.status === "RED")
    .map((row) => `${row.label} coverage is low: ${row.count}/${row.total}.`);

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    games: { total: games.length, final: finalGames.length, upcoming: upcomingGames.length },
    coverage,
    dataQualityScore,
    readiness,
    warnings,
    sample: {
      latestGame: games[0]?.startTime.toISOString() ?? null,
      latestTeamStatUpdatedAt: teamStats[0]?.updatedAt.toISOString() ?? null,
      latestPlayerStatUpdatedAt: playerStats[0]?.updatedAt.toISOString() ?? null,
      latestMarketUpdatedAt: markets[0]?.updatedAt.toISOString() ?? null
    }
  };
}
