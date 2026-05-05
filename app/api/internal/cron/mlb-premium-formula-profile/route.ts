import { NextResponse } from "next/server";

import {
  fitAndPersistMlbPremiumFormulaProfile,
  getActiveMlbPremiumFormulaProfile
} from "@/services/simulation/mlb-premium-formula-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearer === cronSecret;
}

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 5000);
  return Number.isFinite(numeric) ? Math.max(50, Math.min(20000, Math.round(numeric))) : 5000;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const fit = await fitAndPersistMlbPremiumFormulaProfile(parseLimit(searchParams.get("limit")));
  const active = await getActiveMlbPremiumFormulaProfile();
  return NextResponse.json({ ok: Boolean(fit.ok), fit, active });
}
