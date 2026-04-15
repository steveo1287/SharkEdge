import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { recomputeRequestSchema } from "@/lib/validation/intelligence";
import { edgeRecomputeJob } from "@/services/jobs/edge-recompute-job";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }
  try {
    const payload = recomputeRequestSchema.parse(await request.json().catch(() => ({})));
    if (!payload.eventId) {
      throw new Error("eventId is required for edge recompute.");
    }
    return NextResponse.json({ result: await edgeRecomputeJob(payload.eventId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to recompute edges." },
      { status: 400 }
    );
  }
}
