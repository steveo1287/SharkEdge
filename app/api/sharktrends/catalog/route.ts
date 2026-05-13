import { NextResponse } from "next/server";

import { getSharkTrendCatalog } from "@/src/server/sharktrends/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, data: getSharkTrendCatalog(), warnings: [] });
}
