import { NextResponse } from "next/server";

import { summarizeUfcCredentialPriorCatalog } from "@/services/ufc/fighter-credential-priors";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const priors = summarizeUfcCredentialPriorCatalog();
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: priors.length,
    priors
  });
}
