import { captureCurrentMlbPremiumLedgers } from "@/services/simulation/mlb-premium-ledger-capture";
import { captureCurrentMlbV8GatedLedgers } from "@/services/simulation/mlb-v8-gated-ledger-capture";
import { getMlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";

export type MlbV8ProductionMode = "off" | "shadow" | "gated" | "force_v7";

export function getMlbV8ProductionMode(value = process.env.MLB_V8_PRODUCTION_MODE): MlbV8ProductionMode {
  if (value === "off" || value === "shadow" || value === "gated" || value === "force_v7") return value;
  return "gated";
}

export async function runMlbProductionCapture(args: { windowDays?: number } = {}) {
  const windowDays = args.windowDays ?? 180;
  const productionMode = getMlbV8ProductionMode();

  if (productionMode === "off") {
    const gate = await getMlbV8PromotionGate(windowDays);
    return {
      ok: true,
      productionMode,
      capturePath: "disabled",
      capture: {
        ok: true,
        capturedSnapshots: 0,
        officialPicks: 0,
        gateBlocked: 0,
        premiumBlocked: 0,
        skipped: 0,
        disabled: true,
        reason: "MLB_V8_PRODUCTION_MODE=off"
      },
      gate: {
        ...gate,
        mode: "blocked" as const,
        allowOfficialV8Promotion: false,
        allowAttackPicks: false,
        allowWatchPicks: false,
        requireShadowCapture: false
      }
    };
  }

  if (productionMode === "force_v7") {
    const capture = await captureCurrentMlbPremiumLedgers();
    const gate = await getMlbV8PromotionGate(windowDays);
    return {
      ok: Boolean(capture.ok && gate.ok),
      productionMode,
      capturePath: "premium_v7_fallback",
      capture,
      gate
    };
  }

  const capture = await captureCurrentMlbV8GatedLedgers(windowDays, { shadowOnly: productionMode === "shadow" });
  const gate = await getMlbV8PromotionGate(windowDays);
  return {
    ok: Boolean(capture.ok && gate.ok),
    productionMode,
    capturePath: productionMode === "shadow" ? "v8_shadow_capture" : "v8_gated_capture",
    capture,
    gate
  };
}
