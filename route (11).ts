import { NextResponse } from "next/server";

import { updateAlertRuleState } from "@/services/alerts/alerts-service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  return 400;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      status?: "ACTIVE" | "INACTIVE" | "MUTED";
      mute?: boolean;
    };

    await updateAlertRuleState(id, body);

    return NextResponse.json({
      updated: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update alert rule."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
