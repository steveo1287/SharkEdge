import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { injuryIngestSchema } from "@/lib/validation/intelligence";
import { ingestInjury } from "@/services/market-data/market-data-service";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const payload = injuryIngestSchema.parse(await request.json());
    return NextResponse.json({ result: await ingestInjury(payload) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to ingest injury." },
      { status: 400 }
    );
  }
}
