import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getHistoricalOddsProviderStatus,
  ingestHistoricalOddsSnapshots
} from "@/services/historical-odds/ingestion-service";

const ingestSchema = z.object({
  league: z
    .enum(["ALL", "NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"])
    .default("ALL")
});

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|postgres|prisma|migrate/i.test(message)) {
    return 503;
  }

  if (/not configured|not available|backend request failed/i.test(message)) {
    return 502;
  }

  return 500;
}

export async function GET() {
  try {
    const provider = await getHistoricalOddsProviderStatus();

    return NextResponse.json({
      provider
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load historical odds provider status."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = ingestSchema.parse(await request.json().catch(() => ({})));
    const result = await ingestHistoricalOddsSnapshots(body.league);

    return NextResponse.json({
      result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to ingest historical odds snapshots."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
