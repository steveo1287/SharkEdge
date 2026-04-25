import type { SupportedLeagueKey, SupportedSportCode } from "@/lib/types/ledger";
import { upsertProviderEvent } from "@/services/events/event-service";
import type { ProviderEvent } from "@/services/events/provider-types";
import { backfillHistoricalIntelligence } from "@/services/historical-odds/backfill-service";
import { invalidateTrendCache } from "@/services/trends/cache";

import type {
  FreeHistoricalImportArgs,
  FreeHistoricalImportResult,
  FreeHistoricalLeagueResult,
  FreeHistoricalSourceKey
} from "./provider-types";
import { fetchJsonWithRetry, fetchTextWithRetry, parseCsv, resolveGitHubReleaseAssetUrl } from "./source-http";

type CsvRecord = Record<string, string>;

type SourceGame = {
  externalEventId: string;
  leagueKey: SupportedLeagueKey;
  sportCode: SupportedSportCode;
  startTime: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  venue?: string | null;
  sourceKey: FreeHistoricalSourceKey;
  metadata?: Record<string, unknown>;
};

type ImportPersistResult = {
  importedCount: number;
  skippedCount: number;
  featureSummary: FreeHistoricalLeagueResult["featureSummary"];
  sourceKey: FreeHistoricalSourceKey;
};

type MlbScheduleResponse = {
  dates?: Array<{
    games?: Array<{
      gamePk: number;
      gameDate: string;
      status?: { detailedState?: string; codedGameState?: string };
      venue?: { name?: string };
      teams?: {
        home?: { team?: { name?: string }; score?: number };
        away?: { team?: { name?: string }; score?: number };
      };
    }>;
  }>;
};

type NhlClubScheduleResponse = {
  games?: Array<{
    id: number;
    gameDate: string;
    venue?: { default?: string };
    homeTeam?: { placeName?: { default?: string }; score?: number };
    awayTeam?: { placeName?: { default?: string }; score?: number };
    gameState?: string;
  }>;
};

const DEFAULT_LEAGUES: SupportedLeagueKey[] = ["NBA", "MLB", "NHL", "NFL", "NCAAF"];
const DAY_MS = 24 * 60 * 60 * 1000;

const NHL_TEAM_CODES = [
  "ANA",
  "BOS",
  "BUF",
  "CAR",
  "CBJ",
  "CGY",
  "CHI",
  "COL",
  "DAL",
  "DET",
  "EDM",
  "FLA",
  "LAK",
  "MIN",
  "MTL",
  "NJD",
  "NSH",
  "NYI",
  "NYR",
  "OTT",
  "PHI",
  "PIT",
  "SEA",
  "SJS",
  "STL",
  "TBL",
  "TOR",
  "UTA",
  "VAN",
  "VGK",
  "WPG",
  "WSH"
];

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

function buildDateRange(args?: Pick<FreeHistoricalImportArgs, "days" | "startDate" | "endDate">) {
  const endDate = normalizeDate(args?.endDate ?? new Date());
  const startDate = args?.startDate
    ? normalizeDate(args.startDate)
    : new Date(endDate.getTime() - Math.max((args?.days ?? 365) - 1, 0) * DAY_MS);

  return {
    startDate,
    endDate
  };
}

function inRange(value: string | Date | null | undefined, startDate: Date, endDate: Date) {
  if (!value) {
    return false;
  }
  const date = normalizeDate(typeof value === "string" ? new Date(value) : value);
  return date >= startDate && date <= endDate;
}

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function scoreStatus(homeScore: number | null, awayScore: number | null) {
  return homeScore !== null && awayScore !== null ? "FINAL" : "SCHEDULED";
}

function buildFeatureSummary(games: SourceGame[]) {
  const finalized = games.filter(
    (game) => typeof game.homeScore === "number" && typeof game.awayScore === "number"
  );
  const totals = finalized.map((game) => (game.homeScore ?? 0) + (game.awayScore ?? 0));
  const margins = finalized.map((game) => Math.abs((game.homeScore ?? 0) - (game.awayScore ?? 0)));
  const recent = finalized.slice(-20);
  const homeWins = recent.filter((game) => (game.homeScore ?? 0) > (game.awayScore ?? 0)).length;

  return {
    importedGames: games.length,
    finalizedGames: finalized.length,
    averageTotalPoints: totals.length ? Number((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2)) : null,
    averageMargin: margins.length ? Number((margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(2)) : null,
    recentFormWindow: recent.length,
    homeWinRate: recent.length ? Number(((homeWins / recent.length) * 100).toFixed(1)) : null
  };
}

function toProviderEvent(game: SourceGame): ProviderEvent {
  const homeWinner =
    game.homeScore !== null && game.awayScore !== null ? game.homeScore > game.awayScore : null;
  const awayWinner =
    game.homeScore !== null && game.awayScore !== null ? game.awayScore > game.homeScore : null;

  return {
    externalEventId: game.externalEventId,
    providerKey: game.sourceKey,
    sportCode: game.sportCode,
    leagueKey: game.leagueKey,
    name: `${game.awayTeam} @ ${game.homeTeam}`,
    startTime: game.startTime,
    status: scoreStatus(game.homeScore, game.awayScore),
    resultState:
      game.homeScore !== null && game.awayScore !== null ? "OFFICIAL" : "PENDING",
    eventType: "TEAM_HEAD_TO_HEAD",
    venue: game.venue ?? null,
    scoreJson:
      game.homeScore !== null && game.awayScore !== null
        ? {
            home: game.homeScore,
            away: game.awayScore
          }
        : null,
    stateJson: null,
    resultJson:
      game.homeScore !== null && game.awayScore !== null
        ? {
            homeScore: game.homeScore,
            awayScore: game.awayScore
          }
        : null,
    metadataJson: game.metadata ?? null,
    participants: [
      {
        externalCompetitorId: `${game.leagueKey}:${game.awayTeam}`,
        role: "AWAY",
        sortOrder: 0,
        name: game.awayTeam,
        abbreviation: null,
        type: "TEAM",
        score: game.awayScore === null ? null : String(game.awayScore),
        record: null,
        isWinner: awayWinner,
        metadata: {}
      },
      {
        externalCompetitorId: `${game.leagueKey}:${game.homeTeam}`,
        role: "HOME",
        sortOrder: 1,
        name: game.homeTeam,
        abbreviation: null,
        type: "TEAM",
        score: game.homeScore === null ? null : String(game.homeScore),
        record: null,
        isWinner: homeWinner,
        metadata: {}
      }
    ]
  };
}

async function importPersistedGames(sourceKey: FreeHistoricalSourceKey, games: SourceGame[]): Promise<ImportPersistResult> {
  let importedCount = 0;
  let skippedCount = 0;

  for (const game of games) {
    try {
      await upsertProviderEvent(toProviderEvent(game));
      importedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  return {
    importedCount,
    skippedCount,
    featureSummary: buildFeatureSummary(games),
    sourceKey
  };
}

function mapSportsDataverseGame(args: {
  leagueKey: "NBA" | "NCAAF";
  sportCode: SupportedSportCode;
  sourceKey: FreeHistoricalSourceKey;
  row: CsvRecord;
}): SourceGame | null {
  const homeTeam =
    args.row.home_team_display_name ||
    args.row.home_display_name ||
    args.row.home_team_name ||
    args.row.home_team ||
    args.row.home;
  const awayTeam =
    args.row.away_team_display_name ||
    args.row.away_display_name ||
    args.row.away_team_name ||
    args.row.away_team ||
    args.row.away;
  const startTime =
    toIso(args.row.start_date) ||
    toIso(args.row.game_date) ||
    toIso(args.row.date) ||
    toIso(args.row.game_datetime);

  if (!homeTeam || !awayTeam || !startTime) {
    return null;
  }

  return {
    externalEventId: `${args.leagueKey}:${args.row.game_id || args.row.id || `${startTime}:${awayTeam}:${homeTeam}`}`,
    leagueKey: args.leagueKey,
    sportCode: args.sportCode,
    startTime,
    homeTeam,
    awayTeam,
    homeScore:
      toNumber(args.row.home_score) ??
      toNumber(args.row.home_points) ??
      toNumber(args.row.home_team_score),
    awayScore:
      toNumber(args.row.away_score) ??
      toNumber(args.row.away_points) ??
      toNumber(args.row.away_team_score),
    venue: args.row.venue_full_name || args.row.venue || null,
    sourceKey: args.sourceKey,
    metadata: {
      season: args.row.season || null,
      neutralSite: args.row.neutral_site || null,
      conferenceGame: args.row.conference_game || null
    }
  };
}

async function importSportsDataverseGames(args: {
  leagueKey: "NBA" | "NCAAF";
  sourceKey: FreeHistoricalSourceKey;
  url: string;
  startDate: Date;
  endDate: Date;
}) {
  const rows = parseCsv(
    await fetchTextWithRetry(args.url, {
      cacheTtlMs: 6 * 60 * 60 * 1000,
      maxDelayMs: 2_250,
      minDelayMs: 900,
      timeoutMs: 45_000
    })
  );
  const sportCode: SupportedSportCode = args.leagueKey === "NCAAF" ? "FOOTBALL" : "BASKETBALL";
  const games = rows
    .map((row) =>
      mapSportsDataverseGame({
        leagueKey: args.leagueKey,
        sportCode,
        sourceKey: args.sourceKey,
        row
      })
    )
    .filter((game): game is SourceGame => Boolean(game))
    .filter((game) => inRange(game.startTime, args.startDate, args.endDate));

  return importPersistedGames(args.sourceKey, games);
}

async function importMlbGames(startDate: Date, endDate: Date) {
  const url = new URL("https://statsapi.mlb.com/api/v1/schedule");
  url.searchParams.set("sportId", "1");
  url.searchParams.set("startDate", startDate.toISOString().slice(0, 10));
  url.searchParams.set("endDate", endDate.toISOString().slice(0, 10));
  url.searchParams.set("hydrate", "team,linescore");

  const payload = await fetchJsonWithRetry<MlbScheduleResponse>(url.toString(), {
    cacheTtlMs: 30 * 60 * 1000
  });
  const games = (payload.dates ?? [])
    .flatMap((date) => date.games ?? [])
    .map<SourceGame | null>((game) => {
      const homeTeam = game.teams?.home?.team?.name ?? "";
      const awayTeam = game.teams?.away?.team?.name ?? "";
      const startTime = toIso(game.gameDate);
      if (!homeTeam || !awayTeam || !startTime) {
        return null;
      }

      return {
        externalEventId: `MLB:${game.gamePk}`,
        leagueKey: "MLB",
        sportCode: "BASEBALL",
        startTime,
        homeTeam,
        awayTeam,
        homeScore: toNumber(game.teams?.home?.score),
        awayScore: toNumber(game.teams?.away?.score),
        venue: game.venue?.name ?? null,
        sourceKey: "mlb_statsapi",
        metadata: {
          sourceStatus: game.status?.detailedState ?? null,
          sourceStateCode: game.status?.codedGameState ?? null
        }
      };
    })
    .filter((game): game is SourceGame => Boolean(game));

  return importPersistedGames("mlb_statsapi", games);
}

function toNhlSeasonCodes(startDate: Date, endDate: Date) {
  const seasons = new Set<string>();
  for (let year = startDate.getUTCFullYear() - 1; year <= endDate.getUTCFullYear(); year += 1) {
    seasons.add(`${year}${year + 1}`);
  }
  return Array.from(seasons);
}

async function importNhlGames(startDate: Date, endDate: Date) {
  const seasonCodes = toNhlSeasonCodes(startDate, endDate);
  const deduped = new Map<string, SourceGame>();

  for (const seasonCode of seasonCodes) {
    for (const teamCode of NHL_TEAM_CODES) {
      const payload = await fetchJsonWithRetry<NhlClubScheduleResponse>(
        `https://api-web.nhle.com/v1/club-schedule-season/${teamCode}/${seasonCode}`,
        {
          cacheTtlMs: 6 * 60 * 60 * 1000,
          minDelayMs: 800,
          maxDelayMs: 1_700
        }
      );

      for (const game of payload.games ?? []) {
        const startTime = toIso(game.gameDate);
        const homeTeam = game.homeTeam?.placeName?.default ?? "";
        const awayTeam = game.awayTeam?.placeName?.default ?? "";
        if (!startTime || !homeTeam || !awayTeam || !inRange(startTime, startDate, endDate)) {
          continue;
        }

        const key = `NHL:${game.id}`;
        if (deduped.has(key)) {
          continue;
        }

        deduped.set(key, {
          externalEventId: key,
          leagueKey: "NHL",
          sportCode: "HOCKEY",
          startTime,
          homeTeam,
          awayTeam,
          homeScore: toNumber(game.homeTeam?.score),
          awayScore: toNumber(game.awayTeam?.score),
          venue: game.venue?.default ?? null,
          sourceKey: "nhl_public_api",
          metadata: {
            gameState: game.gameState ?? null
          }
        });
      }
    }
  }

  return importPersistedGames("nhl_public_api", Array.from(deduped.values()));
}

async function importNflGames(startDate: Date, endDate: Date) {
  const url =
    process.env.NFLVERSE_GAMES_URL?.trim() ||
    (await resolveGitHubReleaseAssetUrl({
      owner: "nflverse",
      repo: "nflverse-data",
      tag: "schedules",
      assetName: "games.csv"
    }));

  if (!url) {
    return importPersistedGames("nflverse", []);
  }

  const rows = parseCsv(
    await fetchTextWithRetry(url, {
      cacheTtlMs: 6 * 60 * 60 * 1000,
      minDelayMs: 900,
      maxDelayMs: 2_000,
      timeoutMs: 45_000
    })
  );

  const games = rows
    .map<SourceGame | null>((row) => {
      const startTime = toIso(row.gameday || row.game_date || row.date);
      const homeTeam = row.home_team || row.home_team_name || row.home;
      const awayTeam = row.away_team || row.away_team_name || row.away;
      if (!startTime || !homeTeam || !awayTeam) {
        return null;
      }

      return {
        externalEventId: `NFL:${row.game_id || row.old_game_id || `${startTime}:${awayTeam}:${homeTeam}`}`,
        leagueKey: "NFL",
        sportCode: "FOOTBALL",
        startTime,
        homeTeam,
        awayTeam,
        homeScore: toNumber(row.home_score),
        awayScore: toNumber(row.away_score),
        venue: row.stadium || null,
        sourceKey: "nflverse",
        metadata: {
          season: row.season || null,
          gameType: row.game_type || null,
          week: row.week || null
        }
      };
    })
    .filter((game): game is SourceGame => Boolean(game))
    .filter((game) => inRange(game.startTime, startDate, endDate));

  return importPersistedGames("nflverse", games);
}

async function importLahmanTeamInfo() {
  const csvUrl =
    process.env.LAHMAN_TEAMS_CSV_URL?.trim() ||
    "https://raw.githubusercontent.com/daviddalpiaz/pylahman/main/data-raw/Teams.csv";
  if (!csvUrl) {
    return false;
  }

  const rows = parseCsv(
    await fetchTextWithRetry(csvUrl, {
      cacheTtlMs: 24 * 60 * 60 * 1000,
      timeoutMs: 45_000
    })
  );
  return rows.length > 0;
}

async function buildLeagueImportResult(
  leagueKey: SupportedLeagueKey,
  sourceKey: FreeHistoricalSourceKey,
  sportCode: SupportedSportCode,
  importResult: ImportPersistResult
): Promise<FreeHistoricalLeagueResult> {
  return {
    leagueKey,
    sportCode,
    sourceKey,
    importedCount: importResult.importedCount,
    skippedCount: importResult.skippedCount,
    featureSummary: importResult.featureSummary,
    note: importResult.importedCount
      ? `${sourceKey} imported ${importResult.importedCount} ${leagueKey} historical games.`
      : `No ${leagueKey} games were imported from ${sourceKey} in this run.`
  };
}

export async function importFreeHistoricalWarehouse(
  args?: FreeHistoricalImportArgs
): Promise<FreeHistoricalImportResult> {
  const { startDate, endDate } = buildDateRange(args);
  const targetLeagues = args?.leagues?.length ? args.leagues : DEFAULT_LEAGUES;
  const results: FreeHistoricalLeagueResult[] = [];
  let importedCount = 0;
  let skippedCount = 0;

  const nbaUrl =
    process.env.SPORTSDATAVERSE_NBA_URL?.trim() ||
    "https://raw.githubusercontent.com/sportsdataverse/hoopR-data/main/nba_schedule_master.csv";
  const ncaafUrl =
    process.env.SPORTSDATAVERSE_NCAAF_URL?.trim() ||
    "https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/schedules/cfb_games_info.csv";

  for (const leagueKey of targetLeagues) {
    let result: FreeHistoricalLeagueResult | null = null;

    if (leagueKey === "NBA") {
      result = await buildLeagueImportResult(
        "NBA",
        "sportsdataverse_nba",
        "BASKETBALL",
        await importSportsDataverseGames({
          leagueKey: "NBA",
          sourceKey: "sportsdataverse_nba",
          url: nbaUrl,
          startDate,
          endDate
        })
      );
    } else if (leagueKey === "NCAAF") {
      result = await buildLeagueImportResult(
        "NCAAF",
        "sportsdataverse_ncaaf",
        "FOOTBALL",
        await importSportsDataverseGames({
          leagueKey: "NCAAF",
          sourceKey: "sportsdataverse_ncaaf",
          url: ncaafUrl,
          startDate,
          endDate
        })
      );
    } else if (leagueKey === "NFL") {
      result = await buildLeagueImportResult(
        "NFL",
        "nflverse",
        "FOOTBALL",
        await importNflGames(startDate, endDate)
      );
    } else if (leagueKey === "MLB") {
      await importLahmanTeamInfo().catch(() => false);
      result = await buildLeagueImportResult(
        "MLB",
        "mlb_statsapi",
        "BASEBALL",
        await importMlbGames(startDate, endDate)
      );
    } else if (leagueKey === "NHL") {
      result = await buildLeagueImportResult(
        "NHL",
        "nhl_public_api",
        "HOCKEY",
        await importNhlGames(startDate, endDate)
      );
    }

    if (result) {
      importedCount += result.importedCount;
      skippedCount += result.skippedCount;
      results.push(result);
    }
  }

  for (const result of results) {
    await backfillHistoricalIntelligence({
      leagueKey: result.leagueKey,
      limit: 5_000
    }).catch(() => undefined);
  }

  const cacheInvalidated = await invalidateTrendCache();

  return {
    generatedAt: new Date().toISOString(),
    leagues: results,
    importedCount,
    skippedCount,
    cacheInvalidated
  };
}
