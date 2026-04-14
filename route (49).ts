import { NextResponse } from "next/server";

import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { trendRefreshRequestSchema } from "@/lib/validation/intelligence";
import { refreshTrendIntelligence } from "@/services/trends/refresh-service";

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = trendRefreshRequestSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({
      result: await refreshTrendIntelligence({
        leagues: payload.leagues as SupportedLeagueKey[] | undefined,
        days: payload.days
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to refresh trends."
      },
      {
        status: 400
      }
    );
  }
}
