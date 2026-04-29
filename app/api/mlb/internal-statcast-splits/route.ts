import { NextResponse } from "next/server";

import { buildInternalMlbStatcastSplitsFeed } from "@/services/mlb/mlb-internal-analytics-feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const splits = await buildInternalMlbStatcastSplitsFeed();

  return NextResponse.json({
    ok: splits.length > 0,
    source: "mlb-data-api-derived",
    splitCount: splits.length,
    splits
  });
}
