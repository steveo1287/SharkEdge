import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const updated = await prisma.alertSubscription.update({
      where: { id },
      data: {
        isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
        minEvPercent: typeof body.minEvPercent === "number" ? body.minEvPercent : undefined,
        minConfidenceScore:
          typeof body.minConfidenceScore === "number" ? body.minConfidenceScore : undefined
      }
    });
    return NextResponse.json({ subscription: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update alert." },
      { status: 400 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    await prisma.alertSubscription.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete alert." },
      { status: 400 }
    );
  }
}
