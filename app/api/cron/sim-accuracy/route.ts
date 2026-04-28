import { NextResponse } from "next/server";

import { runSimAccuracyLedgerJob } from "@/services/simulation/sim-accuracy-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSimAccuracyLedgerJob();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  return GET(req);
}
