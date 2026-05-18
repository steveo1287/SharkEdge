import { NextResponse } from "next/server";

import { NAMED_UFC_FIGHTER_ERA_PRIORS } from "@/services/ufc/named-fighter-era-priors";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    scope: "active_ufc_only",
    generatedAt: new Date().toISOString(),
    count: NAMED_UFC_FIGHTER_ERA_PRIORS.length,
    priors: NAMED_UFC_FIGHTER_ERA_PRIORS.map((prior) => ({
      id: prior.id,
      aliases: prior.aliases,
      confidence: prior.confidence,
      label: prior.label,
      sourceUrl: prior.sourceUrl,
      activeUfcOnly: prior.metadata.activeUfcOnly !== false,
      combatBase: prior.metadata.combatBase,
      projectedWeightClass: prior.metadata.projectedWeightClass,
      styleOverride: prior.metadata.styleOverride,
      evidence: prior.evidence,
      profileKeys: Object.keys(prior.profile),
      tendencyKeys: Object.keys(prior.metadata.tendencyPrior).filter((key) => typeof prior.metadata.tendencyPrior[key] === "number"),
      eraProfiles: prior.metadata.eraProfiles
    }))
  });
}
