import { NextResponse } from "next/server";

import { getProofAuditManifest } from "@/services/proof/proof-audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const audit = await getProofAuditManifest();
  return NextResponse.json(audit);
}
