import { NextResponse } from "next/server";

import { archiveSharkTrendSystem, getSharkTrendSystem } from "@/src/server/sharktrends/saved-systems";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const system = await getSharkTrendSystem(id);
    if (!system) return NextResponse.json({ ok: false, error: "System not found.", warnings: [] }, { status: 404 });
    return NextResponse.json({ ok: true, data: { system }, warnings: [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "System fetch failed.", warnings: [] }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const system = await archiveSharkTrendSystem(id);
    if (!system) return NextResponse.json({ ok: false, error: "System not found.", warnings: [] }, { status: 404 });
    return NextResponse.json({ ok: true, data: { system }, warnings: [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "System archive failed.", warnings: [] }, { status: 500 });
  }
}
