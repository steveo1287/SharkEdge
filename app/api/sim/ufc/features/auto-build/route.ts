import { NextResponse } from "next/server";

import { buildUfcModelFeaturesFromWarehouse } from "@/services/ufc/fighter-feature-auto-builder";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function getApiKey(request: Request) {
  return request.headers.get("x-api-key")?.trim() ?? request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim() ?? null;
}

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true;
  return getApiKey(request) === configured;
}

function parseLimit(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 50);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(200, Math.round(numeric))) : 50;
}

function parseModelVersion(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "ufc-fight-iq-v1";
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const result = await buildUfcModelFeaturesFromWarehouse({
    limit: parseLimit(searchParams.get("limit")),
    modelVersion: parseModelVersion(searchParams.get("modelVersion"))
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const result = await buildUfcModelFeaturesFromWarehouse({
    limit: parseLimit(body.limit),
    modelVersion: parseModelVersion(body.modelVersion)
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
