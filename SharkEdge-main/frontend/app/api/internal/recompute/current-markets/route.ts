import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { recomputeRequestSchema } from "@/lib/validation/intelligence";
import { currentMarketStateJob } from "@/services/jobs/current-market-state-job";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const payload = recomputeRequestSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ result: await currentMarketStateJob(payload.eventId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to recompute current market state." },
      { status: 400 }
    );
  }
}
