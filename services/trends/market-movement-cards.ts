import type { Prisma } from "@prisma/client";

import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey, MarketType, SportCode, TrendCardView, TrendFilters, TrendMatchView, TrendTableRow } from "@/lib/types/domain";

export type MarketMovementTrendPayload = {
  cards: TrendCardView[];
  rows: TrendTableRow[];
  sourceNote: string;
};

type LineMovementRow = Prisma.LineMovementGetPayload<{
  include: {
    event: { include: { league: true } };
    sportsbook: true;
    player: true;
  };
}>;

function leagueToSport(league: LeagueKey | "ALL"): SportCode {
  if (league === "MLB") return "BASEBALL";
  if (league === "NBA") return "BASKETBALL";
  if (league === "NHL") return "HOCKEY";
  if (league === "NFL" || league === "NCAAF") return "FOOTBALL";
  if (league === "UFC") return "MMA";
  if (league === "BOXING") return "BOXING";
  return "OTHER";
}

function fmtOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function fmtLine(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function fmtDelta(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}${suffix}`;
}

function ageLabel(value: Date | string | null | undefined) {
  if (!value) return "time unknown";
  const movedAt = typeof value === "string" ? new Date(value) : value;
  const ageMs = Date.now() - movedAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return movedAt.toISOString();
  const minutes = Math.round(ageMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function hrefFor(row: LineMovementRow) {
  const league = row.event.league.key;
  return `/sharktrends/matchup/${encodeURIComponent(league)}/${encodeURIComponent(row.eventId)}`;
}

function matchesMarket(row: LineMovementRow, market: TrendFilters["market"]) {
  return market === "ALL" || row.marketType === market;
}

function movementScore(row: LineMovementRow) {
  const oddsDelta = typeof row.oldOddsAmerican === "number" && typeof row.newOddsAmerican === "number"
    ? Math.abs(row.newOddsAmerican - row.oldOddsAmerican)
    : 0;
  const lineDelta = typeof row.oldLineValue === "number" && typeof row.newLineValue === "number"
    ? Math.abs(row.newLineValue - row.oldLineValue)
    : 0;
  const recencyPenalty = Math.min(48, Math.max(0, (Date.now() - row.movedAt.getTime()) / 3600000));
  return oddsDelta * 2 + lineDelta * 20 - recencyPenalty;
}

function movementLabel(row: LineMovementRow) {
  const oddsDelta = typeof row.oldOddsAmerican === "number" && typeof row.newOddsAmerican === "number"
    ? row.newOddsAmerican - row.oldOddsAmerican
    : null;
  const lineDelta = typeof row.oldLineValue === "number" && typeof row.newLineValue === "number"
    ? row.newLineValue - row.oldLineValue
    : null;
  const pieces = [
    oddsDelta != null ? `${fmtOdds(row.oldOddsAmerican)} → ${fmtOdds(row.newOddsAmerican)} (${fmtDelta(oddsDelta, "¢")})` : null,
    lineDelta != null ? `line ${fmtLine(row.oldLineValue)} → ${fmtLine(row.newLineValue)} (${fmtDelta(lineDelta)})` : null
  ].filter(Boolean);
  return pieces.join(" · ") || row.movementType || "movement captured";
}

function cardTone(row: LineMovementRow): TrendCardView["tone"] {
  const score = movementScore(row);
  if (score >= 45) return "success";
  if (score >= 25) return "brand";
  if (score >= 12) return "premium";
  return "muted";
}

function matchView(row: LineMovementRow): TrendMatchView {
  const league = row.event.league.key as LeagueKey;
  return {
    id: `movement-match:${row.id}`,
    sport: leagueToSport(league),
    leagueKey: league,
    eventLabel: row.event.name,
    startTime: row.event.startTime.toISOString(),
    status: row.event.status,
    stateDetail: null,
    matchingLogic: `${league} | ${row.marketType} | ${row.side} | ${row.sportsbook.name}`,
    recommendedBetLabel: "MARKET UPDATE",
    oddsContext: movementLabel(row),
    matchupHref: hrefFor(row),
    boardHref: `/?league=${league}`,
    propsHref: row.playerId ? `/props?league=${league}` : null,
    supportNote: `Line movement row from ${row.sportsbook.name}; captured ${ageLabel(row.movedAt)}.`
  };
}

function rowToCard(row: LineMovementRow): TrendCardView {
  const league = row.event.league.key as LeagueKey;
  const playerSuffix = row.player?.name ? ` · ${row.player.name}` : "";
  const label = movementLabel(row);
  const delta = typeof row.oldOddsAmerican === "number" && typeof row.newOddsAmerican === "number"
    ? row.newOddsAmerican - row.oldOddsAmerican
    : null;
  return {
    id: `movement:${row.id}`,
    title: `${row.event.name} · ${String(row.marketType).replace(/_/g, " ")} ${row.side}${playerSuffix}`,
    value: delta != null ? `${fmtDelta(delta, "¢")}` : label,
    hitRate: null,
    roi: null,
    sampleSize: 1,
    dateRange: `Current movement · ${league} · ${row.sportsbook.name} · ${ageLabel(row.movedAt)}`,
    note: `Proof: LINE MOVEMENT ROW · ${row.sportsbook.name} · ${label}. Movement type: ${row.movementType ?? "captured"}.`,
    explanation: `This card is generated from the line_movements table, not inferred from text. Event ${row.eventId}, sportsbook ${row.sportsbook.name}, market ${row.marketType}, side ${row.side}.`,
    whyItMatters: [
      `Open/current proof: ${label}`,
      `Book: ${row.sportsbook.name}`,
      `Captured: ${row.movedAt.toISOString()}`,
      row.player?.name ? `Player: ${row.player.name}` : null,
      row.movementType ? `Type: ${row.movementType}` : null
    ].filter(Boolean).join(" · "),
    caution: "Movement is a data record only. Review current price, market depth, news context, and model agreement separately.",
    href: hrefFor(row),
    tone: cardTone(row),
    todayMatches: [matchView(row)]
  };
}

function rowToTable(row: LineMovementRow): TrendTableRow {
  return {
    label: `${row.event.name} · ${String(row.marketType).replace(/_/g, " ")} ${row.side}`,
    movement: movementLabel(row),
    note: `${row.sportsbook.name} · ${ageLabel(row.movedAt)} · line_movements row${row.player?.name ? ` · ${row.player.name}` : ""}`,
    href: hrefFor(row)
  };
}

async function fetchLineMovements(filters: TrendFilters): Promise<LineMovementRow[]> {
  const leagueWhere = filters.league === "ALL" ? {} : { event: { league: { key: filters.league } } };
  const marketWhere = filters.market === "ALL" ? {} : { marketType: filters.market as MarketType };
  const rows = await prisma.lineMovement.findMany({
    where: {
      ...leagueWhere,
      ...marketWhere
    },
    include: {
      event: { include: { league: true } },
      sportsbook: true,
      player: true
    },
    orderBy: { movedAt: "desc" },
    take: 200
  });
  return rows.filter((row) => matchesMarket(row, filters.market));
}

export async function buildMarketMovementTrendPayload(filters: TrendFilters): Promise<MarketMovementTrendPayload> {
  if (!hasUsableServerDatabaseUrl()) {
    return { cards: [], rows: [], sourceNote: "Market movement skipped because DATABASE_URL is unavailable." };
  }

  try {
    const rows = (await fetchLineMovements(filters)).sort((left, right) => movementScore(right) - movementScore(left));
    const cards = rows.slice(0, 12).map(rowToCard);
    return {
      cards,
      rows: rows.slice(0, 20).map(rowToTable),
      sourceNote: cards.length
        ? `${cards.length} proof-backed market movement card${cards.length === 1 ? "" : "s"} built from line_movements.`
        : "No line_movements rows matched the current filters."
    };
  } catch (error) {
    return {
      cards: [],
      rows: [],
      sourceNote: error instanceof Error
        ? `Market movement unavailable: ${error.message}`
        : "Market movement unavailable."
    };
  }
}
