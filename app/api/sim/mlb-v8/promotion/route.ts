import { NextResponse } from "next/server";

import { getMlbV8PromotionReport } from "@/services/simulation/mlb-v8-promotion-comparator";
import { getMlbV8ProductionMode } from "@/services/simulation/mlb-v8-production-control";
import { getMlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseWindowDays(value: string | null) {
  const numeric = Number(value ?? 180);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(3650, Math.round(numeric))) : 180;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowDays = parseWindowDays(searchParams.get("windowDays"));
  const [report, gate] = await Promise.all([
    getMlbV8PromotionReport(windowDays),
    getMlbV8PromotionGate(windowDays)
  ]);
  return NextResponse.json(
    {
      ...report,
      productionControl: {
        mode: getMlbV8ProductionMode(),
        gateMode: gate.mode,
        capturePath:
          getMlbV8ProductionMode() === "force_v7" ? "premium_v7_fallback" :
          getMlbV8ProductionMode() === "shadow" ? "v8_shadow_capture" :
          getMlbV8ProductionMode() === "off" ? "disabled" :
          "v8_gated_capture",
        allowOfficialV8Promotion: gate.allowOfficialV8Promotion,
        allowAttackPicks: gate.allowAttackPicks,
        allowWatchPicks: gate.allowWatchPicks,
        requireShadowCapture: gate.requireShadowCapture
      }
    },
    { status: report.ok && gate.ok ? 200 : 503 }
  );
}
