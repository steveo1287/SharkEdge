import { NextResponse } from "next/server";

import { nbaWarehouseFeedPlan, readNbaWarehouseFeed, type NbaWarehouseKind } from "@/services/data/nba/warehouse-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: NbaWarehouseKind[] = ["team", "player", "history", "rating"];

function sampleKeys(rows: Record<string, unknown>[]) {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 10)) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return Array.from(keys).sort();
}

function sampleTeams(rows: Record<string, unknown>[]) {
  return Array.from(new Set(rows.map((row) => String(row.teamName ?? row.team ?? row.name ?? "").trim()).filter(Boolean))).slice(0, 12);
}

function samplePlayers(rows: Record<string, unknown>[]) {
  return rows.slice(0, 12).map((row) => ({
    playerName: row.playerName ?? row.player ?? row.name ?? null,
    teamName: row.teamName ?? row.team ?? null,
    minutes: row.minutes ?? null,
    impactRating: row.impactRating ?? null
  }));
}

export async function GET() {
  try {
    const feeds = await Promise.all(KINDS.map((kind) => readNbaWarehouseFeed(kind)));
    const byKind = Object.fromEntries(feeds.map((feed) => [feed.kind, feed]));
    const summaries = Object.fromEntries(feeds.map((feed) => [feed.kind, {
      ok: feed.rows.length > 0,
      rows: feed.rows.length,
      filePath: feed.filePath,
      warehouseDir: feed.warehouseDir,
      generatedAt: feed.generatedAt,
      warnings: feed.warnings,
      sampleKeys: sampleKeys(feed.rows),
      sampleTeams: sampleTeams(feed.rows),
      samplePlayers: feed.kind === "player" ? samplePlayers(feed.rows) : undefined
    }]));
    const requiredReady = KINDS.every((kind) => byKind[kind]?.rows.length > 0);

    return NextResponse.json({
      ok: requiredReady,
      generatedAt: new Date().toISOString(),
      requiredReady,
      summary: summaries,
      plan: Object.fromEntries(KINDS.map((kind) => [kind, nbaWarehouseFeedPlan(kind)])),
      nextAction: requiredReady
        ? "NBA warehouse is ready for local-warehouse-first model loading."
        : "Run Refresh NBA Warehouse and inspect this route for the zero-row feed."
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "NBA warehouse health failed." }, { status: 500 });
  }
}
