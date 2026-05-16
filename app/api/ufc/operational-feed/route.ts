import { NextResponse } from "next/server";

import { getUfcOperationalFeed } from "@/services/ufc/operational-feed";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const includePast = url.searchParams.get("includePast") === "1";
  const promotionStatus = url.searchParams.get("promotionStatus") ?? url.searchParams.get("gateStatus") ?? undefined;

  try {
    const cards = await getUfcOperationalFeed({ modelVersion, limit, includePast, promotionStatus });
    const counts = cards.reduce((acc, card) => {
      const status = card.promotionGate?.status ?? "SHADOW_ONLY";
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return NextResponse.json({ ok: true, counts, cards });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC operational feed failed" }, { status: 500 });
  }
}
