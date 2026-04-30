import { NextRequest, NextResponse } from "next/server";

import { buildNbaSourcePlan, getNbaSourceFeed, type NbaSourceKind } from "@/services/simulation/nba-source-feed-layer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeedShape = {
  kind: NbaSourceKind;
  generatedAt: string;
  rows: unknown[];
  teams?: unknown[];
  players?: unknown[];
  history?: unknown[];
  ratings?: unknown[];
  sources: unknown[];
  warnings: string[];
};

function parseKind(value: string | null): NbaSourceKind | null {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "team" || normalized === "player" || normalized === "history" || normalized === "rating") return normalized;
  return null;
}

function authorized(request: NextRequest) {
  const expected = process.env.NBA_SOURCE_FEED_TOKEN?.trim();
  if (!expected) return true;
  const queryToken = new URL(request.url).searchParams.get("token");
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  return queryToken === expected || bearer === expected;
}

function shapeFeed(feed: Awaited<ReturnType<typeof getNbaSourceFeed>>): FeedShape {
  const body: FeedShape = {
    kind: feed.kind,
    generatedAt: feed.generatedAt,
    rows: feed.rows,
    sources: feed.sources,
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
      return NextResponse.json({ error: "Unauthorized NBA source feed request." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const kind = parseKind(searchParams.get("kind"));
    if (!kind) {
      return NextResponse.json({ error: "Missing or invalid kind. Use team, player, history, or rating." }, { status: 400 });
    }

    if (searchParams.get("plan") === "1") {
      return NextResponse.json({ kind, sources: buildNbaSourcePlan(kind) });
    }

    const feed = await getNbaSourceFeed(kind);
    return NextResponse.json(shapeFeed(feed));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load NBA source feed." }, { status: 500 });
  }
}
