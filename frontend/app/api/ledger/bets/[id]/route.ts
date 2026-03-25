import { NextResponse } from "next/server";

import { archiveBet, deleteBet, settleBet, updateBet } from "@/services/bets/bets-service";

function getStatusCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/database|prisma|migration/i.test(message)) {
    return 503;
  }

  return 400;
}

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    if (body?.archive === true) {
      await archiveBet(id);
      return NextResponse.json({
        archived: true
      });
    }

    if (body?.settle?.result) {
      const bet = await settleBet(id, body.settle);
      return NextResponse.json({
        bet
      });
    }

    const bet = await updateBet(id, body);
    return NextResponse.json({
      bet
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update bet."
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
    await deleteBet(id);

    return NextResponse.json({
      deleted: true
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete bet."
      },
      {
        status: getStatusCode(error)
      }
    );
  }
}
