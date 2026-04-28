import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { getMlbDataQualityReport } from "@/services/ops/mlb-data-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  lookbackDays: z.coerce.number().int().min(1).max(60).optional().default(7)
});

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ lookbackDays: url.searchParams.get("lookbackDays") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const report = await getMlbDataQualityReport(parsed.data);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "MLB data quality check failed";
    console.error("[mlb/data-quality]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
