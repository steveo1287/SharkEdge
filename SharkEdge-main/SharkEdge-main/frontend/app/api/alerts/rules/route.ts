import { NextResponse } from "next/server";

import { alertRuleCreateSchema } from "@/lib/validation/product";
import { createAlertRule, getAlertsPageData } from "@/services/alerts/alerts-service";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  if (/premium|limit/i.test(message)) {
    return 403;
  }

  return 400;
}

export async function GET() {
  try {
    const data = await getAlertsPageData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load alert rules."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = alertRuleCreateSchema.parse(body);
    const rule = await createAlertRule(payload);

    return NextResponse.json({
      rule
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create alert rule."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
