import { NextResponse } from "next/server";

import { getLockedPickTickets } from "@/services/proof/locked-pick-tickets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "100");
  const data = await getLockedPickTickets(Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.round(limit))) : 100);
  return NextResponse.json(data);
}
