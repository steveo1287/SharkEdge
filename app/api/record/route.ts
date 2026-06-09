import { NextResponse } from "next/server";

import { getPublicRecordBoard } from "@/services/proof/public-record-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const board = await getPublicRecordBoard();
  return NextResponse.json(board);
}
