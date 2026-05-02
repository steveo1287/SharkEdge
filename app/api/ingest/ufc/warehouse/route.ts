import { NextResponse } from "next/server";

import {
  summarizeUfcWarehousePayload,
  upsertUfcWarehousePayload,
  validateUfcWarehousePayload
} from "@/services/ufc/warehouse-ingestion";

function getApiKey(request: Request) {
  return (
    request.headers.get("x-api-key")?.trim() ??
    request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim() ??
    null
  );
}

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true;
  return getApiKey(request) === configured;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "UFC warehouse ingest endpoint is ready",
    endpoint: "POST /api/ingest/ufc/warehouse",
    auth: process.env.INTERNAL_API_KEY ? "x-api-key required" : "open (no INTERNAL_API_KEY set)",
    tables: [
      "ufc_fighters",
      "ufc_fights",
      "ufc_fight_stats_rounds",
      "ufc_fighter_ratings",
      "ufc_opponent_strength_snapshots",
      "ufc_amateur_results",
      "ufc_prospect_notes",
      "ufc_model_features",
      "ufc_predictions",
      "ufc_sim_runs",
      "ufc_backtest_results"
    ],
    leakagePolicy: "feature snapshots and pre-fight snapshots must be at or before fightDate"
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    validateUfcWarehousePayload(body);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Validation failed" },
      { status: 400 }
    );
  }

  if (request.headers.get("x-validate-only") === "1") {
    return NextResponse.json({ ok: true, validateOnly: true, summary: summarizeUfcWarehousePayload(body) });
  }

  try {
    const result = await upsertUfcWarehousePayload(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UFC warehouse ingest failed";
    console.error("[ingest/ufc/warehouse]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
