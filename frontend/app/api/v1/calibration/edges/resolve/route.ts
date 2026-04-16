import { NextResponse } from "next/server";

import { resolveEdgeSnapshotsFromResults } from "@/services/calibration/edge-resolution-service";

export async function POST() {
  try {
    const result = await resolveEdgeSnapshotsFromResults();
    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve edge snapshots." },
      { status: 500 }
    );
  }
}
