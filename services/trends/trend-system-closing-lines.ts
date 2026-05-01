import { Prisma } from "@prisma/client";

import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimMarketSnapshot
} from "@/services/simulation/sim-snapshot-service";

const db = prisma as any;

type ClosingLineUpdate = {
  matchId: string;
  gameId: string | null;
  eventLabel: string | null;
  status: "updated" | "skipped";
  reason: string;
  openingOddsAmerican: number | null;
  closingOddsAmerican: number | null;
  line: number | null;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function n(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function s(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function meta(row: any): Record<string, any> { return row?.metadataJson && typeof row.metadataJson === "object" ? row.metadataJson : {}; }

function impliedFromAmerican(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0 || Math.abs(odds) < 100) return null;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}
function clvPct(openOdds: number | null, closeOdds: number | null) {
  const open = impliedFromAmerican(openOdds);
  const close = impliedFromAmerican(closeOdds);
  if (open == null || close == null) return null;
  return Number(((close - open) * 100).toFixed(2));
}
function clvStatus(openOdds: number | null, closeOdds: number | null) {
  const clv = clvPct(openOdds, closeOdds);
  if (clv == null) return "missing-closing-price";
  if (clv > 0.25) return "beat-close";
  if (clv < -0.25) return "lost-to-close";
  return "near-close";
}

async function readMarketEdges() {
  const market = await readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market).catch(() => null);
  return new Map<string, any>((market?.edges ?? []).map((edge: any) => [edge.gameId, edge]));
}

function closingPriceFromEdge(row: any, edge: any) {
  const m = meta(row);
  const market = edge?.market ?? null;
  const side = s(m.side ?? m.selection);
  const betType = s(m.market ?? row?.trendDefinition?.betType);
  if (!market) return null;
  if (betType.includes("total") || side.includes("over") || side.includes("under")) {
    if (side.includes("under")) return n(market.underPrice);
    return n(market.overPrice);
  }
  const homeName = s(row?.event?.name?.split(" @ ")?.[1]);
  const awayName = s(row?.event?.name?.split(" @ ")?.[0]);
  if (side.includes("home") || (homeName && side.includes(homeName))) return n(market.homeMoneyline);
  if (side.includes("away") || (awayName && side.includes(awayName))) return n(market.awayMoneyline);
  if (s(m.actionability).includes("home")) return n(market.homeMoneyline);
  return n(m.currentOddsAmerican) ?? n(m.price);
}

function closingLineFromEdge(row: any, edge: any) {
  const m = meta(row);
  const market = edge?.market ?? null;
  const betType = s(m.market ?? row?.trendDefinition?.betType);
  if (betType.includes("total")) return n(market?.total) ?? n(m.line) ?? n(m.marketLine);
  return n(m.line) ?? n(m.marketLine);
}

export async function updateTrendSystemClosingLines(args?: { limit?: number }) {
  const source = getServerDatabaseResolution().key;
  if (!hasUsableServerDatabaseUrl()) {
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      database: { usable: false, source },
      summary: { scanned: 0, updated: 0, skipped: 0, marketEdges: 0 },
      updates: [] as ClosingLineUpdate[]
    };
  }

  const [edges, rows] = await Promise.all([
    readMarketEdges(),
    db.savedTrendMatch.findMany({
      where: {
        betResult: "OPEN",
        trendDefinition: { isSystemGenerated: true }
      },
      include: { trendDefinition: true, event: true },
      orderBy: { matchedAt: "desc" },
      take: Math.min(Math.max(args?.limit ?? 500, 1), 1000)
    })
  ]);

  const updates: ClosingLineUpdate[] = [];

  for (const row of rows) {
    const m = meta(row);
    const gameId = String(m.gameId ?? row.event?.externalEventId ?? "").trim() || null;
    const edge = gameId ? edges.get(gameId) : null;
    if (!edge) {
      updates.push({
        matchId: row.id,
        gameId,
        eventLabel: row.event?.name ?? m.eventLabel ?? null,
        status: "skipped",
        reason: "No matching warmed market edge found for saved trend match.",
        openingOddsAmerican: n(m.openingOddsAmerican) ?? n(m.price),
        closingOddsAmerican: n(m.closingOddsAmerican),
        line: n(m.line) ?? n(m.marketLine)
      });
      continue;
    }

    const openingOddsAmerican = n(m.openingOddsAmerican) ?? n(m.price);
    const closingOddsAmerican = closingPriceFromEdge(row, edge);
    const line = closingLineFromEdge(row, edge);
    if (closingOddsAmerican == null) {
      updates.push({
        matchId: row.id,
        gameId,
        eventLabel: row.event?.name ?? m.eventLabel ?? null,
        status: "skipped",
        reason: "Market edge matched, but no closing/current price was available for this side.",
        openingOddsAmerican,
        closingOddsAmerican: null,
        line
      });
      continue;
    }

    const nextMeta = {
      ...m,
      line,
      marketLine: line,
      closingOddsAmerican,
      currentOddsAmerican: closingOddsAmerican,
      clvPct: clvPct(openingOddsAmerican, closingOddsAmerican),
      clvStatus: clvStatus(openingOddsAmerican, closingOddsAmerican),
      closingLineCapturedAt: new Date().toISOString(),
      closingLineSource: "sim-market-cache",
      closingMarketSnapshot: edge.market ? {
        homeMoneyline: n(edge.market.homeMoneyline),
        awayMoneyline: n(edge.market.awayMoneyline),
        total: n(edge.market.total),
        overPrice: n(edge.market.overPrice),
        underPrice: n(edge.market.underPrice)
      } : null
    };

    await db.savedTrendMatch.update({
      where: { id: row.id },
      data: { metadataJson: json(nextMeta) }
    });

    updates.push({
      matchId: row.id,
      gameId,
      eventLabel: row.event?.name ?? m.eventLabel ?? null,
      status: "updated",
      reason: "Updated closing/current odds from warmed market cache.",
      openingOddsAmerican,
      closingOddsAmerican,
      line
    });
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: { usable: true, source },
    summary: {
      scanned: rows.length,
      updated: updates.filter((row) => row.status === "updated").length,
      skipped: updates.filter((row) => row.status === "skipped").length,
      marketEdges: edges.size
    },
    updates
  };
}
