import { NextResponse } from "next/server";

import {
  archiveWatchlistItem,
  deleteWatchlistItem,
  restoreWatchlistItem
} from "@/services/watchlist/watchlist-service";

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
    const body = (await request.json()) as { archive?: boolean; restore?: boolean };

    if (body.archive) {
      await archiveWatchlistItem(id);
      return NextResponse.json({ archived: true });
    }

    if (body.restore) {
      await restoreWatchlistItem(id);
      return NextResponse.json({ restored: true });
    }

    return NextResponse.json(
      {
        error: "No watchlist action supplied."
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update watchlist item."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteWatchlistItem(id);

    return NextResponse.json({
      deleted: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete watchlist item."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
