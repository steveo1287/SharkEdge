import { NextResponse } from "next/server";

import { getLivePlayEngine } from "@/services/plays/live-play-engine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = await getLivePlayEngine({
      league: searchParams.get("league"),
      date: searchParams.get("date")
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load live plays."
      },
      { status: 500 }
    );
  }
}
