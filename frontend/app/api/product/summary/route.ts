import { NextResponse } from "next/server";

import { getAlertSummary } from "@/services/alerts/alerts-service";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  return 400;
}

export async function GET() {
  try {
    const summary = await getAlertSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load product summary."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
