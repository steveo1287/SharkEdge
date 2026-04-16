import { NextResponse } from "next/server";

import { getBoardApi } from "@/services/feed/feed-api";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const league = searchParams.get("league") ?? undefined;
    return NextResponse.json(await getBoardApi(league));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load board." },
      { status: 500 }
    );
  }
}
