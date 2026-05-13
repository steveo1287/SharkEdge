import { NextResponse } from "next/server";

import { findLiveSharkTrendQualifiers } from "@/src/server/sharktrends/live-qualifiers";
import { sharkTrendFilterZodSchema } from "@/src/server/sharktrends/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const filters = sharkTrendFilterZodSchema.parse(body.filters ?? { league: "MLB" });
    const result = await findLiveSharkTrendQualifiers({ filters, daysAhead: Number(body.daysAhead ?? 7) });
    return NextResponse.json({ ok: true, data: result, warnings: result.warnings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Qualifier search failed.", warnings: [] }, { status: 400 });
  }
}
