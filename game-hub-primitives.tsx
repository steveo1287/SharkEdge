import { NextResponse } from "next/server";

import { notificationPreferencesSchema } from "@/lib/validation/product";
import {
  buildDefaultNotificationPreferences,
  getCurrentUserProfile,
  updateNotificationPreferences
} from "@/services/account/user-service";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  return 400;
}

export async function GET() {
  try {
    const profile = await getCurrentUserProfile();
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load notification preferences."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = notificationPreferencesSchema.parse(body);
    const defaults = buildDefaultNotificationPreferences();
    await updateNotificationPreferences({
      deliveryChannels: parsed.deliveryChannels,
      quietHours: parsed.quietHours,
      sportPreferences: {
        ...defaults.sportPreferences,
        ...(parsed.sportPreferences ?? {})
      },
      alertTypePreferences: {
        ...defaults.alertTypePreferences,
        ...(parsed.alertTypePreferences ?? {})
      }
    });
    return NextResponse.json({
      saved: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save notification preferences."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
