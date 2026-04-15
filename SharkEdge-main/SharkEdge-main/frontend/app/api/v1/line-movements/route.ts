import { NextResponse } from "next/server";

import { getLineMovementsApi } from "@/services/feed/feed-api";

export async function GET() {
  try {
    return NextResponse.json(await getLineMovementsApi());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load line movements." },
      { status: 500 }
    );
  }
}
