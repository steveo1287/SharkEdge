import { NextResponse } from "next/server";

import { runActiveUfcWhatIfSim } from "@/services/ufc/active-what-if-sim";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 60;

function parseRounds(value: unknown): 3 | 5 {
  return Number(value) === 5 ? 5 : 3;
}

function parseIntBounded(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

async function paramsFromRequest(request: Request) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    return {
      fighterA: url.searchParams.get("fighterA") ?? url.searchParams.get("a") ?? "",
      fighterB: url.searchParams.get("fighterB") ?? url.searchParams.get("b") ?? "",
      modelVersion: url.searchParams.get("modelVersion") ?? undefined,
      simulations: parseIntBounded(url.searchParams.get("simulations"), 10_000, 250, 25_000),
      scheduledRounds: parseRounds(url.searchParams.get("rounds")),
      seed: parseIntBounded(url.searchParams.get("seed"), 1287, 1, 999_999_999)
    };
  }
  const body = await request.json().catch(() => ({}));
  return {
    fighterA: String(body.fighterA ?? body.a ?? ""),
    fighterB: String(body.fighterB ?? body.b ?? ""),
    modelVersion: typeof body.modelVersion === "string" ? body.modelVersion : undefined,
    simulations: parseIntBounded(body.simulations, 10_000, 250, 25_000),
    scheduledRounds: parseRounds(body.scheduledRounds ?? body.rounds),
    seed: parseIntBounded(body.seed, 1287, 1, 999_999_999)
  };
}

export async function GET(request: Request) {
  const params = await paramsFromRequest(request);
  if (!params.fighterA.trim() || !params.fighterB.trim()) {
    return NextResponse.json({ ok: false, error: "Provide fighterA and fighterB, or a and b." }, { status: 400 });
  }
  const result = await runActiveUfcWhatIfSim(params);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

export async function POST(request: Request) {
  return GET(request);
}
