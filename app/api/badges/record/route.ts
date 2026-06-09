import { NextResponse } from "next/server";

import { getProofBadgeData, getProofBadgeSvg } from "@/services/proof/proof-badge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format")?.toLowerCase();

  if (format === "json") {
    return NextResponse.json(await getProofBadgeData());
  }

  return new Response(await getProofBadgeSvg(), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
