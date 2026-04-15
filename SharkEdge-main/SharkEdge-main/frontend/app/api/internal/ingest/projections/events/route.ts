import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { eventProjectionIngestSchema } from "@/lib/validation/intelligence";
import { ingestEventProjection } from "@/services/market-data/market-data-service";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const payload = eventProjectionIngestSchema.parse(await request.json());
    return NextResponse.json({ result: await ingestEventProjection(payload) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to ingest event projection." },
      { status: 400 }
    );
  }
}
