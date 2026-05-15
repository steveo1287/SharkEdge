import { NextResponse } from "next/server";

import {
  getStatsPipelineRunCenterSnapshot,
  runStatsPipelineRunCenter,
  type StatsPipelineRunOptions
} from "@/services/ops/stats-pipeline-run-center";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getApiKey(request: Request) {
  return request.headers.get("x-api-key")?.trim() ?? request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim() ?? null;
}

function isAuthorized(request: Request) {
  const configured = process.env.INTERNAL_API_KEY?.trim();
  if (!configured) return true;
  return getApiKey(request) === configured;
}

function boolParam(value: string | null, fallback: boolean) {
  if (value == null) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function numParam(value: string | null, fallback: number) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionsFromSearchParams(searchParams: URLSearchParams): StatsPipelineRunOptions {
  return {
    runMlb: boolParam(searchParams.get("runMlb"), true),
    runUfc: boolParam(searchParams.get("runUfc"), true),
    mlbLookbackDays: numParam(searchParams.get("mlbLookbackDays"), 45),
    mlbLimit: numParam(searchParams.get("mlbLimit"), 1500),
    includeLineups: boolParam(searchParams.get("includeLineups"), true),
    ufcLimit: numParam(searchParams.get("ufcLimit"), 50),
    modelVersion: searchParams.get("modelVersion") ?? "ufc-fight-iq-v1"
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  if (searchParams.get("run") === "1") {
    const result = await runStatsPipelineRunCenter(optionsFromSearchParams(searchParams));
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  }
  const result = await getStatsPipelineRunCenterSnapshot();
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({} as StatsPipelineRunOptions));
  const result = await runStatsPipelineRunCenter(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
