import { NextResponse } from "next/server";

import {
  dismissNotification,
  markNotificationRead
} from "@/services/alerts/alerts-service";

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
    const body = (await request.json()) as { read?: boolean; dismiss?: boolean };

    if (body.dismiss) {
      await dismissNotification(id);
      return NextResponse.json({ dismissed: true });
    }

    await markNotificationRead(id);
    return NextResponse.json({ read: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update notification."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
