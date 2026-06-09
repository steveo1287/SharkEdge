import { NextResponse } from "next/server";

import { getProofComparison } from "@/services/proof/proof-comparison";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const comparison = await getProofComparison();
  return NextResponse.json(comparison);
}
