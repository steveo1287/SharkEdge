import { NextResponse } from "next/server";

import { getEdgesApi } from "@/services/feed/feed-api";

export async function GET() {
  try {
    return NextResponse.json(await getEdgesApi());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load edges." },
      { status: 500 }
    );
  }
}
