import { NextResponse } from "next/server";

import {
  getRetrosheetFeatureSnapshotStatus,
  refreshRetrosheetFeatureSnapshots
} from "@/services/data/retrosheet/feature-snapshot-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const xKey = request.headers.get("x-api-key")?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && xKey === apiKey) || (cronSecret && bearer === cronSecret));
}

function sourceKeyFrom(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("sourceKey")?.trim() || "RETROSHEET";
}

export async function GET(request: Request) {
  const sourceKey = sourceKeyFrom(request);
  const status = await getRetrosheetFeatureSnapshotStatus(sourceKey);
  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    status
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceKey = sourceKeyFrom(request);
  const rebuild = url.searchParams.get("rebuild") === "1" || url.searchParams.get("rebuild") === "true";
  const result = await refreshRetrosheetFeatureSnapshots({ sourceKey, rebuild });
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
