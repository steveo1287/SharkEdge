import { NextResponse } from "next/server";

import { enrichMlbMarketAuditSnapshots } from "@/services/sim/mlb-market-audit-snapshot-enrichment";
import { settleMlbSimPredictionSnapshots } from "@/services/simulation/mlb-snapshot-settlement";
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
  const mlbSettlement = await settleMlbSimPredictionSnapshots({ limit: 1000, olderThanHours: 1 }).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "MLB snapshot settlement failed."
  }));
  const marketAuditEnrichment = await enrichMlbMarketAuditSnapshots(150).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : "MLB market audit enrichment failed."
  }));

  const ok = Boolean(result.ok && mlbSettlement.ok);
  return NextResponse.json({ ...result, mlbSettlement, marketAuditEnrichment }, { status: ok ? 200 : 503 });
}

export async function POST(req: Request) {
  return GET(req);
}
