import { captureCurrentMlbIntelV7Ledgers } from "@/services/simulation/mlb-intel-v7-ledgers";
import { captureCurrentMlbPremiumLedgers } from "@/services/simulation/mlb-premium-ledger-capture";
import { captureCurrentMlbV8GatedLedgers } from "@/services/simulation/mlb-v8-gated-ledger-capture";
import { getMlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";

export type MlbV8ProductionMode = "off" | "shadow" | "gated" | "force_v7" | "v7_control";

export function getMlbV8ProductionMode(value = process.env.MLB_V8_PRODUCTION_MODE): MlbV8ProductionMode {
  if (value === "off" || value === "shadow" || value === "gated" || value === "force_v7" || value === "v7_control") return value;
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
    const v8Shadow = await captureCurrentMlbV8GatedLedgers(windowDays, { shadowOnly: true });
    const gate = await getMlbV8PromotionGate(windowDays);
    return {
      ok: Boolean(capture.ok && v8Shadow.ok && gate.ok),
      productionMode,
      capturePath: "premium_v7_official_plus_v8_shadow",
      capture,
      v8Shadow,
      gate: {
        ...gate,
        mode: "shadow_only" as const,
        allowOfficialV8Promotion: false,
        allowAttackPicks: false,
        allowWatchPicks: false,
        requireShadowCapture: true
      }
    };
  }

  if (productionMode === "v7_control") {
    const capture = await captureCurrentMlbIntelV7Ledgers();
    const v8Shadow = await captureCurrentMlbV8GatedLedgers(windowDays, { shadowOnly: true });
    const gate = await getMlbV8PromotionGate(windowDays);
    return {
      ok: Boolean(capture.ok && v8Shadow.ok && gate.ok),
      productionMode,
      capturePath: "v7_control_official_plus_v8_shadow",
      capture,
      v8Shadow,
      gate: {
        ...gate,
        mode: "shadow_only" as const,
        allowOfficialV8Promotion: false,
        allowAttackPicks: false,
        allowWatchPicks: false,
        requireShadowCapture: true
      }
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
