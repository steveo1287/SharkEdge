import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { ingestPayloadSchema } from "@/lib/validation/intelligence";
import { upsertOddsIngestPayload } from "@/services/market-data/market-data-service";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const payload = ingestPayloadSchema.parse(await request.json());
    return NextResponse.json({ result: await upsertOddsIngestPayload(payload) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to ingest odds." },
      { status: 400 }
    );
  }
}
