import { NextResponse } from "next/server";

import { persistUfcCalibrationSnapshot } from "@/services/ufc/calibration";
import { persistUfcEnsembleCalibrationReport } from "@/services/ufc/ensemble-calibration";
import { runUfcOperationalSkillSim } from "@/services/ufc/operational-sim";
import { resolveUfcShadowPrediction } from "@/services/ufc/shadow-mode";

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true;
  const key = request.headers.get("x-api-key")?.trim() ?? request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
  return key === configured;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/ufc/operational-sim",
    modes: ["simulate", "resolve-shadow", "calibrate", "calibrate-ensemble"],
    weightPriority: "manual override > learned weights > default weights",
    simulation: "warehouse feature snapshots -> ensemble UFC sim -> prediction/sim run/shadow tables"
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.mode === "simulate") {
      if (!body.fightId) return NextResponse.json({ ok: false, error: "Missing fightId" }, { status: 400 });
      const result = await runUfcOperationalSkillSim(String(body.fightId), {
        modelVersion: body.modelVersion,
        simulations: asNumber(body.simulations) ?? undefined,
        seed: asNumber(body.seed) ?? undefined,
        recordShadow: Boolean(body.recordShadow),
        marketOddsAOpen: asNumber(body.marketOddsAOpen),
        marketOddsBOpen: asNumber(body.marketOddsBOpen),
        marketOddsAClose: asNumber(body.marketOddsAClose),
        marketOddsBClose: asNumber(body.marketOddsBClose),
        skillMarkovWeight: asNumber(body.skillMarkovWeight),
        exchangeMonteCarloWeight: asNumber(body.exchangeMonteCarloWeight)
      });
      return NextResponse.json({ ok: true, result });
    }

    if (body.mode === "resolve-shadow") {
      if (!body.fightId || !body.actualWinnerFighterId) return NextResponse.json({ ok: false, error: "Missing fightId or actualWinnerFighterId" }, { status: 400 });
      const result = await resolveUfcShadowPrediction({
        fightId: String(body.fightId),
        actualWinnerFighterId: String(body.actualWinnerFighterId),
        marketOddsAClose: asNumber(body.marketOddsAClose),
        marketOddsBClose: asNumber(body.marketOddsBClose)
      });
      return NextResponse.json({ ok: true, result });
    }

    if (body.mode === "calibrate") {
      const result = await persistUfcCalibrationSnapshot(String(body.modelVersion ?? "ufc-fight-iq-v1"), String(body.label ?? "shadow-mode"));
      return NextResponse.json({ ok: true, result });
    }

    if (body.mode === "calibrate-ensemble") {
      const result = await persistUfcEnsembleCalibrationReport(String(body.modelVersion ?? "ufc-fight-iq-v1"), String(body.label ?? "ensemble-weight-learner"));
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Unknown mode" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC operational sim failed" }, { status: 500 });
  }
}
