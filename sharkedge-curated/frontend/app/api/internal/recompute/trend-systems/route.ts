import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { trendSystemDiscoveryJob } from "@/services/jobs/trend-system-discovery-job";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const leagues = Array.isArray(payload?.leagues)
      ? payload.leagues.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
      : undefined;
    const days = typeof payload?.days === "number" ? payload.days : undefined;

    const result = await trendSystemDiscoveryJob({
      leagues,
      days
    });

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to recompute discovered trend systems."
      },
      {
        status: 400
      }
    );
  }
}
