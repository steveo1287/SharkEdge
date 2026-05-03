import { NextResponse } from "next/server";

import { getUfcCardDetail } from "@/services/ufc/card-feed";

export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  try {
    const card = await getUfcCardDetail(eventId, { modelVersion });
    if (!card) return NextResponse.json({ ok: false, error: "UFC card not found" }, { status: 404 });
    return NextResponse.json({ ok: true, card });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC card detail failed" }, { status: 500 });
  }
}
