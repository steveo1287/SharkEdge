import { NextResponse } from "next/server";

import { getUfcShadowAuditHealth, parseUfcShadowAuditLimit } from "@/services/ufc/shadow-audit-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? "ufc-fight-iq-v1";
  const limit = parseUfcShadowAuditLimit(url.searchParams.get("limit"));
  const health = await getUfcShadowAuditHealth({ modelVersion, limit });
  return NextResponse.json(health);
}
