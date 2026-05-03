import { NextResponse } from "next/server";

import { getUfcCards } from "@/services/ufc/card-feed";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const includePast = url.searchParams.get("includePast") !== "0";
  try {
    const cards = await getUfcCards({ modelVersion, includePast });
    return NextResponse.json({ ok: true, cards });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC cards failed" }, { status: 500 });
  }
}
