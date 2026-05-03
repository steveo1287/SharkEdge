import type { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import { normalizeNbaPropStatKey } from "./nba-prop-calibration";
import { captureNbaPropProjectionPayloadSnapshot } from "./nba-prop-prediction-ledger";

type CaptureResult = {
  ok: true;
  eventId: string;
  attempted: number;
  captured: number;
  skipped: number;
  failures: string[];
};

function recordFromJson(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberMapFromJson(value: Prisma.JsonValue | null | undefined): Record<string, number> | undefined {
  const record = recordFromJson(value);
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === "number" && Number.isFinite(raw)) output[key] = raw;
  }
  return Object.keys(output).length ? output : undefined;
}

function firstMarketLine(hitProbOver: Record<string, number> | undefined) {
  for (const key of Object.keys(hitProbOver ?? {})) {
    const parsed = Number(key);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function hasRecentSnapshot(args: {
  eventId: string;
  playerId: string;
  statKey: string;
  marketLine: number;
  windowMinutes: number;
}) {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM nba_prop_prediction_snapshots
      WHERE event_id = ${args.eventId}
        AND player_id = ${args.playerId}
        AND stat_key = ${args.statKey}
        AND market_line = ${args.marketLine}
        AND captured_at >= NOW() - (${args.windowMinutes} * INTERVAL '1 minute');
    `;
    return Number(rows[0]?.count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function captureNbaPropProjectionSnapshotsForEvent(eventId: string, options?: { dedupeWindowMinutes?: number }): Promise<CaptureResult> {
  const failures: string[] = [];
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: true, eventId, attempted: 0, captured: 0, skipped: 0, failures: ["DATABASE_URL missing"] };
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: {
          competitor: {
            include: {
              team: true
            }
          }
        }
      }
    }
  });

  if (!event || event.league.key !== "NBA") {
    return { ok: true, eventId, attempted: 0, captured: 0, skipped: 0, failures: event ? [] : ["event not found"] };
  }

  const homeTeam = event.participants.find((participant) => participant.role === "HOME")?.competitor.team ?? null;
  const awayTeam = event.participants.find((participant) => participant.role === "AWAY")?.competitor.team ?? null;

  const projections = await prisma.playerProjection.findMany({
    where: { eventId },
    include: {
      player: {
        include: { team: true }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 1000
  });

  let attempted = 0;
  let captured = 0;
  let skipped = 0;
  const dedupeWindowMinutes = Math.max(1, options?.dedupeWindowMinutes ?? 20);

  for (const projection of projections) {
    const statKey = normalizeNbaPropStatKey(projection.statKey);
    if (!statKey) {
      skipped += 1;
      continue;
    }
    const hitProbOver = numberMapFromJson(projection.hitProbOver);
    const hitProbUnder = numberMapFromJson(projection.hitProbUnder);
    const marketLine = firstMarketLine(hitProbOver);
    if (marketLine === null) {
      skipped += 1;
      continue;
    }

    attempted += 1;
    if (await hasRecentSnapshot({ eventId, playerId: projection.playerId, statKey, marketLine, windowMinutes: dedupeWindowMinutes })) {
      skipped += 1;
      continue;
    }

    const playerTeam = projection.player?.team ?? null;
    const opponent = playerTeam?.id === homeTeam?.id ? awayTeam : playerTeam?.id === awayTeam?.id ? homeTeam : null;
    const result = await captureNbaPropProjectionPayloadSnapshot({
      eventId,
      playerId: projection.playerId,
      playerName: projection.player?.name ?? projection.playerId,
      team: playerTeam?.name ?? null,
      opponent: opponent?.name ?? null,
      statKey,
      marketLine,
      gameStartTime: event.startTime,
      projection: {
        meanValue: projection.meanValue,
        medianValue: projection.medianValue ?? undefined,
        stdDev: projection.stdDev ?? undefined,
        hitProbOver,
        hitProbUnder,
        metadata: recordFromJson(projection.metadataJson)
      },
      metadata: {
        source: "edge-recompute-job",
        eventName: event.name,
        league: event.league.key,
        capturedFromPlayerProjectionId: projection.id
      }
    });

    if (result.ok) captured += 1;
    else {
      skipped += 1;
      failures.push(`${projection.player?.name ?? projection.playerId} ${statKey}: ${result.reason ?? "capture failed"}`);
    }
  }

  return {
    ok: true,
    eventId,
    attempted,
    captured,
    skipped,
    failures
  };
}
