import { NextResponse } from "next/server";

import { getUfcOperationalStatus } from "@/services/ufc/operational-status";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? "ufc-fight-iq-v1";
  try {
    return NextResponse.json(await getUfcOperationalStatus(modelVersion));
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC operational status failed" }, { status: 500 });
  }
}
