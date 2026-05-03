import { NextResponse } from "next/server";

import { getUfcOperationalFeed } from "@/services/ufc/operational-feed";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const includePast = url.searchParams.get("includePast") === "1";

  try {
    const cards = await getUfcOperationalFeed({ modelVersion, limit, includePast });
    return NextResponse.json({ ok: true, cards });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC operational feed failed" }, { status: 500 });
  }
}
