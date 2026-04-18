import { loadEnvConfig } from "@next/env";
import type { LeagueKey } from "@/lib/types/domain";
import { upsertOddsIngestPayload } from "@/services/market-data/market-data-service";
import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { lineMovementJob } from "@/services/jobs/line-movement-job";

import type {
  CurrentOddsBookOutcome,
  CurrentOddsBookmaker,
  CurrentOddsGame
} from "./provider-types";
import { therundownCurrentOddsProvider } from "./therundown-provider";

declare global {
  var sharkedgeTheRundownIngestEnvLoaded: boolean | undefined;
}

if (!global.sharkedgeTheRundownIngestEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgeTheRundownIngestEnvLoaded = true;
}

const SUPPORTED_LEAGUES = new Set<LeagueKey>(["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"]);

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findOutcome(outcomes: CurrentOddsBookOutcome[], name: string) {
  const target = normalizeName(name);
  return outcomes.find((outcome) => normalizeName(outcome.name) === target) ?? null;
}

function toEventKey(leagueKey: LeagueKey, game: CurrentOddsGame) {
  return `therundown:${leagueKey}:${game.id}`;
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

export async function ingestTheRundownCurrentOdds(args?: {
  leagues?: LeagueKey[];
  recomputeEdges?: boolean;
}) {
  const board = await therundownCurrentOddsProvider.fetchBoard();
  if (!board?.configured) {
    return {
      ok: false,
      reason: "therundown_not_configured",
      eventCount: 0,
      marketIngestions: 0,
      recomputedEvents: 0,
      leagues: [] as LeagueKey[]
    };
  }

  const allowedLeagues = (args?.leagues?.filter((league) => SUPPORTED_LEAGUES.has(league)) ??
    []) as LeagueKey[];
  const sports = board.sports.filter((sport) => {
    const leagueKey = sport.key as LeagueKey;
    return SUPPORTED_LEAGUES.has(leagueKey) && (!allowedLeagues.length || allowedLeagues.includes(leagueKey));
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
        eventKey: toEventKey(leagueKey, game),
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        commenceTime: game.commence_time,
        source: "therundown",
        lines,
        sourceMeta: {
          provider: "therundown",
          providerMode: board.provider_mode ?? "therundown",
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
    provider: board.provider ?? "therundown"
  };
}
