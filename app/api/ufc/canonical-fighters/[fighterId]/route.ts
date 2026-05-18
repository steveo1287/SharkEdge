import { NextResponse } from "next/server";

import { getCanonicalUfcFighterProfile } from "@/services/ufc/canonical-fighter-profile-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ fighterId: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const { fighterId } = await params;
  const profile = await getCanonicalUfcFighterProfile(decodeURIComponent(fighterId));
  if (!profile) return NextResponse.json({ ok: false, error: "fighter_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, profile });
}
