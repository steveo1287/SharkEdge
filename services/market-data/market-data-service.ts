import { Prisma, SportCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { americanToImplied } from "@/lib/odds/index";
import { invalidateHotCache, readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { z } from "zod";
import {
  eventProjectionIngestSchema,
  ingestPayloadSchema,
  injuryIngestSchema,
  playerProjectionIngestSchema
} from "@/lib/validation/intelligence";

type IngestPayload = z.infer<typeof ingestPayloadSchema>;
type EventProjectionPayload = z.infer<typeof eventProjectionIngestSchema>;
type PlayerProjectionPayload = z.infer<typeof playerProjectionIngestSchema>;
type InjuryPayload = z.infer<typeof injuryIngestSchema>;

const SPORT_MAP: Record<string, { sport: SportCode; leagueKey: string }> = {
  nba: { sport: "BASKETBALL", leagueKey: "NBA" },
  basketball_nba: { sport: "BASKETBALL", leagueKey: "NBA" },
  mlb: { sport: "BASEBALL", leagueKey: "MLB" },
  baseball_mlb: { sport: "BASEBALL", leagueKey: "MLB" },
  nhl: { sport: "HOCKEY", leagueKey: "NHL" },
  icehockey_nhl: { sport: "HOCKEY", leagueKey: "NHL" },
  nfl: { sport: "FOOTBALL", leagueKey: "NFL" },
  americanfootball_nfl: { sport: "FOOTBALL", leagueKey: "NFL" },
  ncaaf: { sport: "FOOTBALL", leagueKey: "NCAAF" },
  americanfootball_ncaaf: { sport: "FOOTBALL", leagueKey: "NCAAF" },
  ufc: { sport: "MMA", leagueKey: "UFC" },
  boxing: { sport: "BOXING", leagueKey: "BOXING" }
};

const SPORT_PROFILE_DEFAULTS: Record<SportCode, { key: string; name: string; category: string }> = {
  BASKETBALL: { key: "basketball", name: "Basketball", category: "Team Sports" },
  BASEBALL: { key: "baseball", name: "Baseball", category: "Team Sports" },
  HOCKEY: { key: "hockey", name: "Hockey", category: "Team Sports" },
  FOOTBALL: { key: "football", name: "Football", category: "Team Sports" },
  MMA: { key: "mma", name: "MMA", category: "Combat Sports" },
  BOXING: { key: "boxing", name: "Boxing", category: "Combat Sports" },
  OTHER: { key: "other", name: "Other", category: "Other" }
};

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "_");
}

function resolveSportAndLeague(payload: IngestPayload) {
  const direct = SPORT_MAP[normalizeToken(payload.sport)] ?? SPORT_MAP[normalizeToken(String(payload.sourceMeta?.league ?? ""))];
  if (direct) return direct;
  throw new Error(`Unsupported sport/league combination for ${payload.sport}.`);
}

async function ensureSportLeague(payload: IngestPayload) {
  const resolved = resolveSportAndLeague(payload);
  const sportDefaults = SPORT_PROFILE_DEFAULTS[resolved.sport];
  const sportProfile = await prisma.sport.upsert({
    where: { key: sportDefaults.key },
    update: { name: sportDefaults.name, code: resolved.sport, category: sportDefaults.category },
    create: { key: sportDefaults.key, name: sportDefaults.name, code: resolved.sport, category: sportDefaults.category }
  });
  const league = await prisma.league.upsert({
    where: { key: resolved.leagueKey },
    update: { name: resolved.leagueKey, sport: resolved.sport, isActive: true, sportId: sportProfile.id },
    create: { key: resolved.leagueKey, name: resolved.leagueKey, sport: resolved.sport, isActive: true, sportId: sportProfile.id }
  });
  return { sportId: sportProfile.id, league };
}

async function ensureSportsbook(bookName: string) {
  const key = normalizeToken(bookName);
  return prisma.sportsbook.upsert({
    where: { key },
    update: { name: bookName, isActive: true },
    create: { key, name: bookName, region: "us", isActive: true }
  });
}

export async function upsertOddsIngestPayload(payload: IngestPayload) {
  const { sportId, league } = await ensureSportLeague(payload);
  const event = await prisma.event.upsert({
    where: { externalEventId: payload.eventKey },
    update: { name: `${payload.awayTeam} @ ${payload.homeTeam}`, startTime: new Date(payload.commenceTime), leagueId: league.id, sportId, providerKey: payload.source },
    create: { externalEventId: payload.eventKey, providerKey: payload.source, sportId, leagueId: league.id, name: `${payload.awayTeam} @ ${payload.homeTeam}`, slug: normalizeToken(payload.eventKey), startTime: new Date(payload.commenceTime), status: "SCHEDULED", resultState: "PENDING", eventType: league.sport === "MMA" || league.sport === "BOXING" ? "COMBAT_HEAD_TO_HEAD" : "TEAM_HEAD_TO_HEAD", metadataJson: payload.sourceMeta ? (payload.sourceMeta as Prisma.InputJsonValue) : Prisma.JsonNull }
  });
  const touchedMarketIds: string[] = [];
  for (const line of payload.lines) {
    const sportsbook = await ensureSportsbook(line.book);
    const fetchedAt = new Date(line.fetchedAt);
    const rows = line.markets?.length ? line.markets.map((market) => ({ marketType: market.marketType, marketLabel: market.marketLabel ?? market.marketType, selection: market.selection, side: market.side ?? null, line: typeof market.line === "number" ? market.line : null, oddsAmerican: market.oddsAmerican })) : [];
    for (const row of rows) {
      if (typeof row.oddsAmerican !== "number") continue;
      const id = [event.id, sportsbook.id, row.marketType, normalizeToken(row.selection), row.side ?? "none", row.line ?? "none"].join(":");
      const oddsDecimal = row.oddsAmerican > 0 ? 1 + row.oddsAmerican / 100 : 1 + 100 / Math.max(1, Math.abs(row.oddsAmerican));
      const eventMarket = await prisma.eventMarket.upsert({
        where: { id },
        update: { sportsbookId: sportsbook.id, marketType: row.marketType as never, marketLabel: row.marketLabel, selection: row.selection, side: row.side, line: row.line, oddsAmerican: row.oddsAmerican, oddsDecimal, impliedProbability: americanToImplied(row.oddsAmerican), currentLine: row.line, currentOdds: row.oddsAmerican, isLive: false, sourceKey: payload.source, updatedAt: fetchedAt } as any,
        create: { id, eventId: event.id, sportsbookId: sportsbook.id, marketType: row.marketType as never, marketLabel: row.marketLabel, period: "full_game", selection: row.selection, side: row.side, line: row.line, oddsAmerican: row.oddsAmerican, oddsDecimal, impliedProbability: americanToImplied(row.oddsAmerican), openingLine: row.line, currentLine: row.line, openingOdds: row.oddsAmerican, currentOdds: row.oddsAmerican, isLive: false, sourceKey: payload.source, updatedAt: fetchedAt } as any
      });
      touchedMarketIds.push(eventMarket.id);
      await prisma.eventMarketSnapshot.create({ data: { eventMarketId: eventMarket.id, capturedAt: fetchedAt, line: row.line, oddsAmerican: row.oddsAmerican, impliedProbability: americanToImplied(row.oddsAmerican) } });
    }
  }
  await invalidateHotCache(`board:v1:${league.key}`);
  await invalidateHotCache(`event:v1:${event.id}`);
  return { eventId: event.id, eventKey: payload.eventKey, touchedMarketIds };
}

export async function ingestEventProjection(input: EventProjectionPayload) {
  const modelRun = await prisma.modelRun.upsert({ where: { key: `${input.modelKey}:${input.modelVersion ?? "latest"}:event` }, update: { modelName: input.modelKey, version: input.modelVersion, status: "ACTIVE" }, create: { key: `${input.modelKey}:${input.modelVersion ?? "latest"}:event`, modelName: input.modelKey, version: input.modelVersion, scope: "event_projection", status: "ACTIVE" } });
  return prisma.eventProjection.create({ data: { modelRunId: modelRun.id, eventId: input.eventId, projectedHomeScore: input.projectedHomeScore, projectedAwayScore: input.projectedAwayScore, projectedTotal: input.projectedTotal, projectedSpreadHome: input.projectedSpreadHome, winProbHome: input.winProbHome, winProbAway: input.winProbAway, metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull } });
}

export async function ingestPlayerProjection(input: PlayerProjectionPayload) {
  const modelRun = await prisma.modelRun.upsert({ where: { key: `${input.modelKey}:${input.modelVersion ?? "latest"}:player` }, update: { modelName: input.modelKey, version: input.modelVersion, status: "ACTIVE" }, create: { key: `${input.modelKey}:${input.modelVersion ?? "latest"}:player`, modelName: input.modelKey, version: input.modelVersion, status: "ACTIVE" } });
  return prisma.playerProjection.create({ data: { modelRunId: modelRun.id, eventId: input.eventId, playerId: input.playerId, statKey: input.statKey, meanValue: input.meanValue, medianValue: input.medianValue, stdDev: input.stdDev, hitProbOver: input.hitProbOver ? (input.hitProbOver as Prisma.InputJsonValue) : Prisma.JsonNull, hitProbUnder: input.hitProbUnder ? (input.hitProbUnder as Prisma.InputJsonValue) : Prisma.JsonNull, metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull } });
}

export async function ingestInjury(input: InjuryPayload) {
  return prisma.injury.create({ data: { leagueId: input.leagueId, teamId: input.teamId, playerId: input.playerId, gameId: input.gameId, status: input.status, source: input.source, description: input.description, effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : undefined, reportedAt: new Date(input.reportedAt), metadataJson: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull } });
}

export async function getBoardFeed(leagueKey?: string, options?: { skipCache?: boolean }) {
  const cacheKey = `board:v1:${leagueKey ?? "all"}`;
  if (!options?.skipCache) { const cached = await readHotCache<unknown>(cacheKey); if (cached) return cached; }
  const events = await prisma.event.findMany({ where: { ...(leagueKey ? { league: { key: leagueKey } } : {}), startTime: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24), lte: new Date(Date.now() + 1000 * 60 * 60 * 48) } }, include: { league: true, participants: { include: { competitor: true } }, currentMarketStates: true, edgeSignals: { where: { isActive: true }, orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }], take: 6 } }, orderBy: { startTime: "asc" } });
  const eventIds = events.map((event) => event.id);
  const rawEventMarkets = eventIds.length ? await prisma.eventMarket.findMany({ where: { eventId: { in: eventIds }, updatedAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) } }, include: { sportsbook: true, selectionCompetitor: true, player: true } as any, orderBy: { updatedAt: "desc" } }) : [];
  const eventMarketsByEventId = new Map<string, typeof rawEventMarkets>();
  for (const market of rawEventMarkets) { const existing = eventMarketsByEventId.get(market.eventId) ?? []; existing.push(market); eventMarketsByEventId.set(market.eventId, existing); }
  const board = { generatedAt: new Date().toISOString(), events: events.map((event) => ({ id: event.id, eventKey: event.externalEventId, league: event.league.key, name: event.name, startTime: event.startTime.toISOString(), status: event.status, participants: event.participants.map((participant) => ({ role: participant.role, competitor: participant.competitor.name })), markets: eventMarketsByEventId.get(event.id) ?? [], topSignals: event.edgeSignals })) };
  await writeHotCache(cacheKey, board, 45);
  return board;
}
