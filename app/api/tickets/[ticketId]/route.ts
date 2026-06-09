import { NextResponse } from "next/server";

import { getLockedPickTicket } from "@/services/proof/locked-pick-tickets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ ticketId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { ticketId } = await context.params;
  const ticket = await getLockedPickTicket(ticketId);
  if (!ticket) {
    return NextResponse.json({ ok: false, error: "ticket_not_found", ticketId }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ticket });
}
