import { NextResponse } from "next/server";

import { watchlistIntentSchema } from "@/lib/validation/product";
import { createWatchlistItem } from "@/services/watchlist/watchlist-service";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  if (/limit|premium/i.test(message)) {
    return 403;
  }

  return 400;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { intent: string };
    const intent = watchlistIntentSchema.parse(body.intent);
    const id = await createWatchlistItem(intent);

    return NextResponse.json({
      id
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save play to watchlist."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
