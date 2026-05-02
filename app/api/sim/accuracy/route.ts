import { NextResponse } from "next/server";

import { getSimModelScorecard } from "@/services/sim/model-scorecard";
import { getSimAccuracyDiagnostics } from "@/services/simulation/sim-accuracy-diagnostics";
import {
  captureCurrentSimPredictionSnapshots,
  getSimAccuracySummary,
  gradeFinalSimPredictionSnapshots,
  runSimAccuracyLedgerJob
} from "@/services/simulation/sim-accuracy-ledger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Action = "scorecard" | "summary" | "capture" | "grade" | "run";

function parseAction(value: string | null): Action {
  if (value === "summary" || value === "capture" || value === "grade" || value === "run") return value;
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

async function appendDiagnostics<T extends Record<string, unknown>>(payload: T) {
  const diagnostics = await getSimAccuracyDiagnostics();
  return { ...payload, diagnostics };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = parseAction(searchParams.get("action"));
  const limit = parseLimit(searchParams.get("limit"));
  const filters = scorecardFilters(searchParams);

  if (action === "capture") {
    const result = await captureCurrentSimPredictionSnapshots();
    return NextResponse.json(await appendDiagnostics(result), { status: result.ok ? 200 : 503 });
  }

  if (action === "grade") {
    const result = await gradeFinalSimPredictionSnapshots();
    return NextResponse.json(await appendDiagnostics(result), { status: result.ok ? 200 : 503 });
  }

  if (action === "run") {
    const job = await runSimAccuracyLedgerJob();
    const [scorecard, diagnostics] = await Promise.all([
      getSimModelScorecard(filters),
      getSimAccuracyDiagnostics()
    ]);

    return NextResponse.json(
      {
        ok: Boolean(job.ok && scorecard.ok),
        action,
        job,
        scorecard,
        diagnostics
      },
      { status: job.ok && scorecard.ok ? 200 : 503 }
    );
  }

  if (action === "summary") {
    const summary = await getSimAccuracySummary(limit);
    return NextResponse.json(await appendDiagnostics(summary), { status: summary.ok ? 200 : 503 });
  }

  const [scorecard, diagnostics] = await Promise.all([
    getSimModelScorecard(filters),
    getSimAccuracyDiagnostics()
  ]);

  return NextResponse.json({ ...scorecard, diagnostics }, { status: scorecard.ok ? 200 : 503 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = parseAction(typeof body.action === "string" ? body.action : "run");

  if (action === "capture") {
    const result = await captureCurrentSimPredictionSnapshots();
    return NextResponse.json(await appendDiagnostics(result), { status: result.ok ? 200 : 503 });
  }

  if (action === "grade") {
    const result = await gradeFinalSimPredictionSnapshots();
    return NextResponse.json(await appendDiagnostics(result), { status: result.ok ? 200 : 503 });
  }

  const job = await runSimAccuracyLedgerJob();
  const [scorecard, diagnostics] = await Promise.all([
    getSimModelScorecard({
      league: typeof body.league === "string" ? body.league : null,
      market: typeof body.market === "string" ? body.market : null,
      modelVersion: typeof body.modelVersion === "string" ? body.modelVersion : null,
      windowDays: typeof body.windowDays === "number" ? body.windowDays : null
    }),
    getSimAccuracyDiagnostics()
  ]);

  return NextResponse.json(
    {
      ok: Boolean(job.ok && scorecard.ok),
      action: "run",
      job,
      scorecard,
      diagnostics
    },
    { status: job.ok && scorecard.ok ? 200 : 503 }
  );
}
