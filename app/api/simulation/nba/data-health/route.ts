import { NextResponse } from "next/server";

import { buildOfficialNbaLiveFeed, type OfficialNbaKind } from "@/services/data/nba/official-live-feed";
import { readNbaWarehouseFeed, type NbaWarehouseKind } from "@/services/data/nba/warehouse-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: NbaWarehouseKind[] = ["team", "player", "history", "rating"];

async function statusFor(kind: NbaWarehouseKind) {
  const warehouse = await readNbaWarehouseFeed(kind);
  let officialRows: Awaited<ReturnType<typeof buildOfficialNbaLiveFeed>> = [];
  let officialError: string | null = null;
  if (!warehouse.rows.length && process.env.NBA_DISABLE_OFFICIAL_LIVE_FALLBACK !== "1") {
    try {
      officialRows = await buildOfficialNbaLiveFeed(kind as OfficialNbaKind);
    } catch (error) {
      officialError = error instanceof Error ? error.message : "Official fallback failed.";
    }
  }
  const activeRows = warehouse.rows.length || officialRows.length;
  return {
    kind,
    ready: activeRows > 0,
    source: warehouse.rows.length ? "warehouse" : officialRows.length ? "official-nba-stats-live" : "missing",
    warehouseRows: warehouse.rows.length,
    officialFallbackRows: officialRows.length,
    activeRows,
    filePath: warehouse.filePath,
    fallbackEnabled: process.env.NBA_DISABLE_OFFICIAL_LIVE_FALLBACK !== "1",
    officialError,
    sample: (warehouse.rows[0] ?? officialRows[0] ?? null)
  };
}

export async function GET() {
  try {
    const statuses = await Promise.all(KINDS.map(statusFor));
    const requiredReady = statuses.find((status) => status.kind === "team")?.ready && statuses.find((status) => status.kind === "player")?.ready;
    return NextResponse.json({
      ok: Boolean(requiredReady),
      generatedAt: new Date().toISOString(),
      realDataOnlyGate: {
        required: ["team", "player"],
        ready: Boolean(requiredReady),
        note: requiredReady ? "NBA real-data model can produce edges." : "NBA real-data model will pass until team/player rows are available."
      },
      statuses
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "NBA data health check failed." }, { status: 500 });
  }
}
