import { NextResponse } from "next/server";

import { getMlbPlayerCardGrade } from "@/services/players/mlb-player-card-grade";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const grade = await getMlbPlayerCardGrade();
  return NextResponse.json(grade);
}
