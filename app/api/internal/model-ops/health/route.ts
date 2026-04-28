import { NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { getModelOpsHealth } from "@/services/ops/model-ops-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const health = await getModelOpsHealth();
    return NextResponse.json({ ok: true, health });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Model ops health check failed";
    console.error("[model-ops/health]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
