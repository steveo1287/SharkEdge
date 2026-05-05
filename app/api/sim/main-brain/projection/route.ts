import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { buildMainSimProjection, mainBrainLabel } from "@/services/simulation/main-sim-brain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProjectionRequest = {
  id?: string;
  label?: string;
  startTime?: string;
  status?: string;
  leagueKey?: LeagueKey;
  leagueLabel?: string;
  simulationRuns?: number;
};

function normalizePayload(body: ProjectionRequest) {
  const leagueKey = body.leagueKey ?? "MLB";
  return {
    id: body.id ?? `manual:${leagueKey}:${body.label ?? "unknown-game"}`,
    label: body.label ?? "Away @ Home",
    startTime: body.startTime ?? new Date().toISOString(),
    status: body.status ?? "SCHEDULED",
    leagueKey,
    leagueLabel: body.leagueLabel ?? leagueKey,
    simulationRuns: body.simulationRuns
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as ProjectionRequest));
  const input = normalizePayload(body);
  const projection = await buildMainSimProjection(input);
  return NextResponse.json({
    ok: true,
    brain: mainBrainLabel(input.leagueKey),
    input,
    projection
  });
}
