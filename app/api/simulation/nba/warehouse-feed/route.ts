import { NextRequest, NextResponse } from "next/server";

import { buildOfficialNbaLiveFeed } from "@/services/data/nba/official-live-feed";
import { nbaWarehouseFeedPlan, readNbaWarehouseFeed, type NbaWarehouseKind } from "@/services/data/nba/warehouse-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseKind(value: string | null): NbaWarehouseKind | null {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "team" || normalized === "player" || normalized === "history" || normalized === "rating") return normalized;
  return null;
}

function authorized(request: NextRequest) {
  const expected = process.env.NBA_WAREHOUSE_FEED_TOKEN?.trim() || process.env.NBA_SOURCE_FEED_TOKEN?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  return queryToken === expected || bearer === expected;
}

type FeedShape = Awaited<ReturnType<typeof readNbaWarehouseFeed>>;

async function feedWithFallback(kind: NbaWarehouseKind): Promise<FeedShape & { fallbackUsed?: boolean }> {
  const feed = await readNbaWarehouseFeed(kind);
  if (feed.rows.length || process.env.NBA_DISABLE_OFFICIAL_LIVE_FALLBACK === "1") return { ...feed, fallbackUsed: false };
  const rows = await buildOfficialNbaLiveFeed(kind);
  if (!rows.length) return { ...feed, fallbackUsed: false };
  return {
    ...feed,
    generatedAt: new Date().toISOString(),
    filePath: "official-nba-stats-live",
    rows,
    warnings: [
      ...feed.warnings,
      `No local NBA warehouse ${kind} feed was found; using official NBA Stats live fallback rows.`
    ],
    fallbackUsed: true
  };
}

function shapeFeed(feed: FeedShape & { fallbackUsed?: boolean }) {
  const body: Record<string, unknown> = {
    kind: feed.kind,
    generatedAt: feed.generatedAt,
    warehouseDir: feed.warehouseDir,
    filePath: feed.filePath,
    rows: feed.rows,
    rowCount: feed.rows.length,
    fallbackUsed: Boolean(feed.fallbackUsed),
    warnings: feed.warnings
  };
  if (feed.kind === "team") body.teams = feed.rows;
  if (feed.kind === "player") body.players = feed.rows;
  if (feed.kind === "history") body.history = feed.rows;
  if (feed.kind === "rating") body.ratings = feed.rows;
  return body;
}

export async function GET(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ error: "Unauthorized NBA warehouse feed request." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const kind = parseKind(searchParams.get("kind"));
    if (!kind) {
      return NextResponse.json({ error: "Missing or invalid kind. Use team, player, history, or rating." }, { status: 400 });
    }

    if (searchParams.get("plan") === "1") {
      return NextResponse.json({ ...nbaWarehouseFeedPlan(kind), officialLiveFallback: process.env.NBA_DISABLE_OFFICIAL_LIVE_FALLBACK !== "1" });
    }

    const feed = await feedWithFallback(kind);
    return NextResponse.json(shapeFeed(feed));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load NBA warehouse feed." }, { status: 500 });
  }
}
