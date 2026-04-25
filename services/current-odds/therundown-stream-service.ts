import { loadEnvConfig } from "@next/env";
import WebSocket from "ws";

import type { LeagueKey } from "@/lib/types/domain";
import { upsertOddsIngestPayload } from "@/services/market-data/market-data-service";
import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";
import { lineMovementJob } from "@/services/jobs/line-movement-job";

import { ingestTheRundownCurrentOdds } from "./therundown-ingestion-service";

declare global {
  var sharkedgeTheRundownStreamEnvLoaded: boolean | undefined;
}

if (!global.sharkedgeTheRundownStreamEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgeTheRundownStreamEnvLoaded = true;
}

const WS_URL = process.env.THERUNDOWN_WS_URL?.trim() || "wss://therundown.io/api/v2/ws/markets";
const MARKET_IDS = "1,2,3";
const SUPPORTED_LEAGUES = ["NBA", "MLB", "NHL", "NFL", "NCAAF"] as const;
type SupportedLeagueKey = (typeof SUPPORTED_LEAGUES)[number];
const SPORT_IDS: Record<SupportedLeagueKey, number> = {
  NCAAF: 1,
  NFL: 2,
  MLB: 3,
  NBA: 4,
  NHL: 6
};

type StreamPrice = {
  price?: number;
};

type StreamLine = {
  value?: string;
  prices?: Record<string, StreamPrice>;
};

type StreamParticipant = {
  name: string;
  lines?: StreamLine[];
};

type StreamMeta = {
  type?: string;
  timestamp?: string;
};

type StreamMessage = {
  event_id?: string;
  sport_id?: number;
  market_id?: number;
  market_name?: string;
  participants?: StreamParticipant[];
  meta?: StreamMeta;
};

function getApiKey() {
  const value = process.env.THERUNDOWN_API_KEY?.trim();
  return value?.length ? value : null;
}

function getAffiliateIds() {
  const raw = process.env.THERUNDOWN_AFFILIATE_IDS?.trim();
  if (!raw) {
    return [];
  }

  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getLeagueForSportId(sportId: number) {
  return (
    Object.entries(SPORT_IDS).find(([, value]) => value === sportId)?.[0] as LeagueKey | undefined
  ) ?? null;
}

function mapMarketType(name: string | undefined) {
  const normalized = (name ?? "").toLowerCase();
  if (normalized === "moneyline") {
    return "moneyline";
  }
  if (normalized === "handicap") {
    return "spread";
  }
  if (normalized === "totals") {
    return "total";
  }
  return null;
}

function parsePoint(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function streamTheRundownCurrentOdds(args?: {
  leagues?: LeagueKey[];
  flushIntervalMs?: number;
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("THERUNDOWN_API_KEY is required.");
  }

  const leagues = (args?.leagues?.filter((league): league is SupportedLeagueKey =>
    (SUPPORTED_LEAGUES as readonly string[]).includes(league)
  ) ?? [...SUPPORTED_LEAGUES]) as SupportedLeagueKey[];
  const affiliateIds = getAffiliateIds();

  const bootstrap = await ingestTheRundownCurrentOdds({ leagues });
  const pendingEventIds = new Set<string>();
  const flushIntervalMs = args?.flushIntervalMs ?? 15000;
  let closed = false;
  let flushing = false;

  async function flushPending() {
    if (flushing || !pendingEventIds.size) {
      return;
    }

    flushing = true;
    const eventIds = Array.from(pendingEventIds);
    pendingEventIds.clear();

    try {
      for (const eventId of eventIds) {
        await currentMarketStateJob(eventId, {
          skipBookFeedRefresh: true
        });
        await lineMovementJob(eventId, {
          skipBookFeedRefresh: true
        });
      }
    } finally {
      flushing = false;
    }
  }

  const flushTimer = setInterval(() => {
    void flushPending();
  }, flushIntervalMs);

  const url = new URL(WS_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("sport_ids", leagues.map((league) => SPORT_IDS[league]).join(","));
  url.searchParams.set("market_ids", MARKET_IDS);
  if (affiliateIds.length) {
    url.searchParams.set("affiliate_ids", affiliateIds.join(","));
  }

  const socket = new WebSocket(url.toString());

  const closedPromise = new Promise<{ code: number; reason: string }>((resolve, reject) => {
    socket.on("open", () => {
      console.info(
        `[therundown-stream] connected sports=${leagues.join(",")} bootstrapEvents=${bootstrap.eventCount}`
      );
    });

    socket.on("message", async (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as StreamMessage;
        if (message.meta?.type === "heartbeat") {
          return;
        }

        if (!message.event_id || !message.sport_id || !message.market_name || !message.participants?.length) {
          return;
        }

        const leagueKey = getLeagueForSportId(message.sport_id);
        if (!leagueKey) {
          return;
        }

        const marketType = mapMarketType(message.market_name);
        if (!marketType) {
          return;
        }

        const eventExternalId = `therundown:${leagueKey}:${message.event_id}`;
        const { prisma } = await import("@/lib/db/prisma");
        const event = await prisma.event.findUnique({
          where: {
            externalEventId: eventExternalId
          }
        });

        if (!event) {
          return;
        }

        const teams = event.name.split(" @ ");
        const awayTeam = teams[0] ?? "Away";
        const homeTeam = teams[1] ?? "Home";
        const fetchedAt = message.meta?.timestamp ?? new Date().toISOString();
        const byAffiliate = new Map<
          string,
          {
            book: string;
            fetchedAt: string;
            odds: {
              homeMoneyline?: number | null;
              awayMoneyline?: number | null;
              homeSpread?: number | null;
              homeSpreadOdds?: number | null;
              awaySpreadOdds?: number | null;
              total?: number | null;
              overOdds?: number | null;
              underOdds?: number | null;
            };
          }
        >();

        for (const participant of message.participants) {
          for (const line of participant.lines ?? []) {
            for (const [affiliateId, price] of Object.entries(line.prices ?? {})) {
              if (affiliateIds.length && !affiliateIds.includes(affiliateId)) {
                continue;
              }

              const entry = byAffiliate.get(affiliateId) ?? {
                book: `Affiliate ${affiliateId}`,
                fetchedAt,
                odds: {}
              };

              const point = parsePoint(line.value);
              const normalized = normalizeName(participant.name);

              if (marketType === "moneyline") {
                if (normalized === normalizeName(homeTeam)) {
                  entry.odds.homeMoneyline = typeof price.price === "number" ? Math.round(price.price) : null;
                } else if (normalized === normalizeName(awayTeam)) {
                  entry.odds.awayMoneyline = typeof price.price === "number" ? Math.round(price.price) : null;
                }
              } else if (marketType === "spread") {
                if (normalized === normalizeName(homeTeam)) {
                  entry.odds.homeSpread = point;
                  entry.odds.homeSpreadOdds =
                    typeof price.price === "number" ? Math.round(price.price) : null;
                } else if (normalized === normalizeName(awayTeam)) {
                  entry.odds.awaySpreadOdds =
                    typeof price.price === "number" ? Math.round(price.price) : null;
                }
              } else if (marketType === "total") {
                entry.odds.total = point;
                if (normalized === "over") {
                  entry.odds.overOdds = typeof price.price === "number" ? Math.round(price.price) : null;
                } else if (normalized === "under") {
                  entry.odds.underOdds = typeof price.price === "number" ? Math.round(price.price) : null;
                }
              }

              byAffiliate.set(affiliateId, entry);
            }
          }
        }

        const lines = Array.from(byAffiliate.values()).filter((line) =>
          Object.values(line.odds).some((value) => typeof value === "number")
        );

        if (!lines.length) {
          return;
        }

        await upsertOddsIngestPayload({
          sport: leagueKey,
          eventKey: eventExternalId,
          homeTeam,
          awayTeam,
          commenceTime: event.startTime.toISOString(),
          source: "therundown",
          lines,
          sourceMeta: {
            provider: "therundown",
            source: "ws",
            marketName: message.market_name,
            vendorEventId: message.event_id
          }
        });

        pendingEventIds.add(event.id);
      } catch (error) {
        console.error("[therundown-stream] message error", error);
      }
    });

    socket.on("close", async (code, reason) => {
      clearInterval(flushTimer);
      await flushPending();
      closed = true;
      resolve({
        code,
        reason: reason.toString()
      });
    });

    socket.on("error", async (error) => {
      clearInterval(flushTimer);
      await flushPending();
      if (!closed) {
        reject(error);
      }
    });
  });

  return {
    bootstrap,
    socket,
    closed: closedPromise,
    stop: async () => {
      clearInterval(flushTimer);
      await flushPending();
      socket.close();
    }
  };
}
