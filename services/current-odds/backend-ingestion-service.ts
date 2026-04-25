import { loadEnvConfig } from "@next/env";

import type { LeagueKey } from "@/lib/types/domain";
import { upsertOddsIngestPayload } from "@/services/market-data/market-data-service";
import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { lineMovementJob } from "@/services/jobs/line-movement-job";

import { backendCurrentOddsProvider } from "./backend-provider";
import type {
  CurrentOddsBoardResponse,
  CurrentOddsBookOutcome,
  CurrentOddsBookmaker,
  CurrentOddsGame
} from "./provider-types";

declare global {
  // eslint-disable-next-line no-var
  var sharkedgeBackendIngestEnvLoaded: boolean | undefined;
}

if (!global.sharkedgeBackendIngestEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgeBackendIngestEnvLoaded = true;
}

const SUPPORTED_LEAGUES = new Set<LeagueKey>(["NBA", "MLB", "NHL", "NFL", "NCAAF"]);

type BackendBoardSource = "theoddsapi" | "scraper" | "therundown";

function normalizeName(value: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildNameParts(name: string) {
  const normalized = normalizeName(name);
  const parts = normalized.split(" ").filter(Boolean);
  return {
    full: normalized,
    first: parts[0] ?? "",
    last: parts[parts.length - 1] ?? "",
    parts
  };
}

function outcomeMatchScore(targetName: string, outcomeName: string) {
  const target = buildNameParts(targetName);
  const outcome = buildNameParts(outcomeName);

  if (!target.full || !outcome.full) return -1;
  if (target.full === outcome.full) return 100;
  if (target.last && outcome.last && target.last === outcome.last) return 80;
  if (target.first && outcome.first && target.first === outcome.first) return 60;
  if (outcome.full.includes(target.full) || target.full.includes(outcome.full)) return 50;

  const shared = target.parts.filter((part) => outcome.parts.includes(part)).length;
  if (shared > 0) return shared * 10;

  return -1;
}

function findOutcome(outcomes: CurrentOddsBookOutcome[], name: string) {
  let best: CurrentOddsBookOutcome | null = null;
  let bestScore = -1;

  for (const outcome of outcomes) {
    const score = outcomeMatchScore(name, outcome.name);
    if (score > bestScore) {
      best = outcome;
      bestScore = score;
    }
  }

  return bestScore >= 50 ? best : null;
}

function mapBackendBoardSource(board: CurrentOddsBoardResponse): BackendBoardSource | null {
  const provider = String(board.provider ?? board.provider_mode ?? "")
    .trim()
    .toLowerCase();

  if (provider === "odds_api" || provider === "oddsapi" || provider === "theoddsapi") {
    return "theoddsapi";
  }

  if (provider === "scraper_cache" || provider === "scraper") {
    return "scraper";
  }

  if (provider === "therundown") {
    return "therundown";
  }

  return null;
}

function toEventKey(source: BackendBoardSource, leagueKey: LeagueKey, game: CurrentOddsGame) {
  return `${source}:${leagueKey}:${game.id}`;
}

function toLine(bookmaker: CurrentOddsBookmaker, game: CurrentOddsGame, fetchedAt: string) {
  const homeMoneyline = findOutcome(bookmaker.markets.moneyline, game.home_team);
  const awayMoneyline = findOutcome(bookmaker.markets.moneyline, game.away_team);
  const homeSpread = findOutcome(bookmaker.markets.spread, game.home_team);
  const awaySpread = findOutcome(bookmaker.markets.spread, game.away_team);
  const over = findOutcome(bookmaker.markets.total, "over");
  const under = findOutcome(bookmaker.markets.total, "under");

  const totalLine =
    typeof over?.point === "number"
      ? over.point
      : typeof under?.point === "number"
        ? under.point
        : null;

  const hasAnyOdds = [
    homeMoneyline?.price,
    awayMoneyline?.price,
    homeSpread?.price,
    awaySpread?.price,
    over?.price,
    under?.price
  ].some((value) => typeof value === "number");

  if (!hasAnyOdds) {
    return null;
  }

  return {
    book: bookmaker.title,
    fetchedAt,
    odds: {
      homeMoneyline: homeMoneyline?.price ?? null,
      awayMoneyline: awayMoneyline?.price ?? null,
      homeSpread: homeSpread?.point ?? null,
      homeSpreadOdds: homeSpread?.price ?? null,
      awaySpreadOdds: awaySpread?.price ?? null,
      total: totalLine,
      overOdds: over?.price ?? null,
      underOdds: under?.price ?? null
    }
  };
}

function isLine(
  value: ReturnType<typeof toLine>
): value is NonNullable<ReturnType<typeof toLine>> {
  return value !== null;
}

export async function ingestBackendCurrentOdds(args?: {
  leagues?: LeagueKey[];
  allowedSources?: BackendBoardSource[];
}) {
  const board = await backendCurrentOddsProvider.fetchBoard();
  if (!board?.configured) {
    return {
      ok: false,
      reason: "backend_not_configured",
      eventCount: 0,
      marketIngestions: 0,
      recomputedEvents: 0,
      leagues: [] as LeagueKey[],
      provider: null
    };
  }

  const source = mapBackendBoardSource(board);
  if (!source) {
    return {
      ok: false,
      reason: "backend_provider_not_supported",
      eventCount: 0,
      marketIngestions: 0,
      recomputedEvents: 0,
      leagues: [] as LeagueKey[],
      provider: board.provider ?? null
    };
  }

  if (args?.allowedSources?.length && !args.allowedSources.includes(source)) {
    return {
      ok: false,
      reason: "backend_provider_filtered",
      eventCount: 0,
      marketIngestions: 0,
      recomputedEvents: 0,
      leagues: [] as LeagueKey[],
      provider: board.provider ?? source
    };
  }

  const requestedLeagues = (args?.leagues?.filter((league) => SUPPORTED_LEAGUES.has(league)) ??
    []) as LeagueKey[];
  const sports = board.sports.filter((sport) => {
    const leagueKey = sport.key as LeagueKey;
    return SUPPORTED_LEAGUES.has(leagueKey) && (!requestedLeagues.length || requestedLeagues.includes(leagueKey));
  });

  const touchedEventIds: string[] = [];
  let marketIngestions = 0;

  for (const sport of sports) {
    const leagueKey = sport.key as LeagueKey;

    for (const game of sport.games) {
      const lines = game.bookmakers
        .map((bookmaker) => toLine(bookmaker, game, board.generated_at))
        .filter(isLine);

      if (!lines.length) {
        continue;
      }

      const result = await upsertOddsIngestPayload({
        sport: leagueKey,
        eventKey: toEventKey(source, leagueKey, game),
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        commenceTime: game.commence_time,
        source,
        lines,
        sourceMeta: {
          provider: board.provider ?? source,
          providerMode: board.provider_mode ?? board.provider ?? source,
          generatedAt: board.generated_at,
          bookmakerCount: game.bookmakers_available,
          bookmakerKeys: game.bookmakers.map((bookmaker) => bookmaker.key),
          vendorEventId: game.id
        }
      });

      touchedEventIds.push(result.eventId);
      marketIngestions += result.touchedMarketIds.length;
    }
  }

  const uniqueEventIds = Array.from(new Set(touchedEventIds));

  for (const eventId of uniqueEventIds) {
    await currentMarketStateJob(eventId, {
      skipBookFeedRefresh: true
    });
    await lineMovementJob(eventId, {
      skipBookFeedRefresh: true
    });
  }

  return {
    ok: true,
    reason: null,
    eventCount: uniqueEventIds.length,
    marketIngestions,
    recomputedEvents: uniqueEventIds.length,
    leagues: Array.from(new Set(sports.map((sport) => sport.key as LeagueKey))),
    generatedAt: board.generated_at,
    provider: board.provider ?? source,
    providerMode: board.provider_mode ?? board.provider ?? source,
    source
  };
}
