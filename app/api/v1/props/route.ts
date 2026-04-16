import { NextResponse } from "next/server";

import { getPropsApi } from "@/services/feed/feed-api";

export async function GET() {
  try {
    return NextResponse.json(await getPropsApi());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load props." },
      { status: 500 }
    );
  }
}
