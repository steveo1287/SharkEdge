import { NextResponse } from "next/server";

import { createBet, getBetTrackerData, parseBetFilters } from "@/services/bets/bets-service";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  return 500;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = parseBetFilters({
      status: searchParams.get("status") ?? undefined,
      sport: searchParams.get("sport") ?? undefined,
      league: searchParams.get("league") ?? undefined,
      market: searchParams.get("market") ?? undefined,
      sportsbook: searchParams.get("sportsbook") ?? undefined,
      window: searchParams.get("window") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      direction: searchParams.get("direction") ?? undefined
    });
    const selection = searchParams.get("selection") ?? undefined;
    const prefill = searchParams.get("prefill") ?? undefined;
    const data = await getBetTrackerData(filters, selection, prefill);

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load bet ledger."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bet = await createBet(body);

    return NextResponse.json({
      bet
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create bet."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
