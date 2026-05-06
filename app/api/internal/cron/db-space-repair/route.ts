import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { repairPostgresSpace } from "@/lib/db/postgres-space-repair";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(request: Request) {
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";
  const unauthorized = isVercelCron ? null : ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await repairPostgresSpace(prisma, "apply");
    return NextResponse.json(result);
  } catch (error) {
    console.error("[db-space-repair] cron failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown database space repair error"
      },
      { status: 500 }
    );
  }
}
