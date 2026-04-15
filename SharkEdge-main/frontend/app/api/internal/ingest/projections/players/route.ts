import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { playerProjectionIngestSchema } from "@/lib/validation/intelligence";
import { ingestPlayerProjection } from "@/services/market-data/market-data-service";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const payload = playerProjectionIngestSchema.parse(await request.json());
    return NextResponse.json({ result: await ingestPlayerProjection(payload) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to ingest player projection." },
      { status: 400 }
    );
  }
}
