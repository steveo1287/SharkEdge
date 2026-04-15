import { NextResponse } from "next/server";

import { getEventApi } from "@/services/feed/feed-api";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const { eventId } = await params;
    return NextResponse.json(await getEventApi(eventId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load event." },
      { status: 500 }
    );
  }
}
