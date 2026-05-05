import { NextResponse } from "next/server";

import { getSimModelScorecard } from "@/services/sim/model-scorecard";
import { getMlbIntelV7AccuracyProof } from "@/services/simulation/mlb-intel-v7-accuracy-adapter";
import {
  captureCurrentSimPredictionSnapshots,
  getSimAccuracySummary,
  gradeFinalSimPredictionSnapshots,
  runSimAccuracyLedgerJob
} from "@/services/simulation/sim-accuracy-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "scorecard" | "summary" | "capture" | "grade" | "run" | "v7-proof";

function parseAction(value: string | null): Action {
  if (value === "summary" || value === "capture" || value === "grade" || value === "run" || value === "v7-proof") return value;
  return "scorecard";
}

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 20);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(100, numeric)) : 20;
}

function parseNumber(value: string | null) {
  if (!value?.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function scorecardFilters(searchParams: URLSearchParams) {
  return {
    league: searchParams.get("league"),
    market: searchParams.get("market"),
    modelVersion: searchParams.get("modelVersion"),
    windowDays: parseNumber(searchParams.get("windowDays"))
  };
}

function v7WindowDays(filters: { windowDays: number | null }) {
  return typeof filters.windowDays === "number" && Number.isFinite(filters.windowDays)
    ? Math.max(1, Math.min(3650, Math.round(filters.windowDays)))
    : 90;
}

function wantsMlbV7(filters: { league: string | null; modelVersion: string | null }) {
  const league = filters.league?.toUpperCase() ?? "ALL";
  const modelVersion = filters.modelVersion ?? "ALL";
  return (league === "ALL" || league === "MLB") && (modelVersion === "ALL" || modelVersion === "mlb-intel-v7");
}

async function scorecardWithMlbV7Proof(filters: ReturnType<typeof scorecardFilters>) {
  const [scorecard, mlbIntelV7] = await Promise.all([
    getSimModelScorecard(filters),
    wantsMlbV7(filters)
      ? getMlbIntelV7AccuracyProof(v7WindowDays(filters))
      : Promise.resolve(null)
  ]);

  return {
    ...scorecard,
    accuracyProofs: {
      mlbIntelV7
    }
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = parseAction(searchParams.get("action"));
  const limit = parseLimit(searchParams.get("limit"));
  const filters = scorecardFilters(searchParams);

  if (action === "capture") {
    const result = await captureCurrentSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  if (action === "grade") {
    const result = await gradeFinalSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  if (action === "run") {
    const [job, scorecard] = await Promise.all([
      runSimAccuracyLedgerJob(),
      scorecardWithMlbV7Proof(filters)
    ]);

    return NextResponse.json(
      {
        ok: Boolean(job.ok && scorecard.ok),
        action,
        job,
        scorecard
      },
      { status: job.ok && scorecard.ok ? 200 : 503 }
    );
  }

  if (action === "summary") {
    const summary = await getSimAccuracySummary(limit);
    return NextResponse.json(summary, { status: summary.ok ? 200 : 503 });
  }

  if (action === "v7-proof") {
    const proof = await getMlbIntelV7AccuracyProof(v7WindowDays(filters));
    return NextResponse.json(proof, { status: proof.ok ? 200 : 503 });
  }

  const scorecard = await scorecardWithMlbV7Proof(filters);
  return NextResponse.json(scorecard, { status: scorecard.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = parseAction(typeof body.action === "string" ? body.action : "run");

  if (action === "capture") {
    const result = await captureCurrentSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  if (action === "grade") {
    const result = await gradeFinalSimPredictionSnapshots();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  }

  if (action === "v7-proof") {
    const windowDays = typeof body.windowDays === "number" ? body.windowDays : 90;
    const proof = await getMlbIntelV7AccuracyProof(windowDays);
    return NextResponse.json(proof, { status: proof.ok ? 200 : 503 });
  }

  const filters = {
    league: typeof body.league === "string" ? body.league : null,
    market: typeof body.market === "string" ? body.market : null,
    modelVersion: typeof body.modelVersion === "string" ? body.modelVersion : null,
    windowDays: typeof body.windowDays === "number" ? body.windowDays : null
  };

  const [job, scorecard] = await Promise.all([
    runSimAccuracyLedgerJob(),
    scorecardWithMlbV7Proof(filters)
  ]);

  return NextResponse.json(
    {
      ok: Boolean(job.ok && scorecard.ok),
      action: "run",
      job,
      scorecard
    },
    { status: job.ok && scorecard.ok ? 200 : 503 }
  );
}
