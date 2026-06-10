import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEPLOYMENT_MARKER = "accuracy-v3-separated-railway-2026-06-10-01";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "sharkedge-web",
    runtime: "railway",
    deploymentMarker: DEPLOYMENT_MARKER,
    expectedAccuracyHeading: "Accuracy V3 · separated",
    generatedAt: new Date().toISOString()
  });
}
