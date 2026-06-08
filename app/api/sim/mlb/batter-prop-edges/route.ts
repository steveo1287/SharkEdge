import { NextResponse } from "next/server";

import { buildMlbBatterPropEdgeBoard } from "@/services/simulation/mlb-batter-prop-edge-board";
import { normalizeMlbBatterPropQuotes } from "@/services/simulation/mlb-batter-prop-quote-normalizer";
import { qualityGateMlbBatterPropQuotes, type MlbBatterPropQuoteQualityConfig } from "@/services/simulation/mlb-batter-prop-quote-quality";
import { buildMlbBatterPropProbabilityCalibration, type MlbSettledBatterPropProbabilityRow } from "@/services/simulation/mlb-batter-prop-probability-calibration";
import { loadMlbBatterBoxProjection } from "@/services/simulation/mlb-batter-box-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

type RequestBody = {
  gameId?: string;
  awayTeam?: string;
  homeTeam?: string;
  awayProjectedRuns?: number;
  homeProjectedRuns?: number;
  awayOffenseScore?: number;
  homeOffenseScore?: number;
  awayWinProbability?: number;
  homeWinProbability?: number;
  quotes?: unknown;
  settledCalibrationRows?: MlbSettledBatterPropProbabilityRow[];
  quoteQuality?: MlbBatterPropQuoteQualityConfig;
  config?: {
    minProbabilityEdge?: number;
    minExpectedValue?: number;
    minConfidence?: number;
    maxCandidates?: number;
    requireCalibration?: boolean;
    minCalibrationSampleSize?: number;
    minCalibrationReliability?: number;
  };
};

function required(value: unknown, key: string) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(`Missing required field: ${key}`);
  return clean;
}

function numberOr(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function normalizeCalibrationRows(value: unknown): MlbSettledBatterPropProbabilityRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    const market = String(row.market ?? "").trim().toUpperCase();
    const side = String(row.side ?? "").trim().toUpperCase();
    const line = Number(row.line);
    const modelProbability = Number(row.modelProbability ?? row.probability);
    const won = typeof row.won === "boolean" ? row.won : typeof row.resultWon === "boolean" ? row.resultWon : null;
    if (!["HITS", "TOTAL_BASES", "HOME_RUN", "WALKS", "STRIKEOUTS"].includes(market)) return [];
    if (!["OVER", "UNDER"].includes(side)) return [];
    if (!Number.isFinite(line) || !Number.isFinite(modelProbability) || won === null) return [];
    return [{
      market: market as MlbSettledBatterPropProbabilityRow["market"],
      line,
      side: side as MlbSettledBatterPropProbabilityRow["side"],
      modelProbability,
      won,
      playerId: typeof row.playerId === "string" ? row.playerId : null,
      playerName: typeof row.playerName === "string" ? row.playerName : null,
      hitterArchetype: typeof row.hitterArchetype === "string" ? row.hitterArchetype : null,
      pitcherArchetype: typeof row.pitcherArchetype === "string" ? row.pitcherArchetype : null,
      matchupClusterKey: typeof row.matchupClusterKey === "string" ? row.matchupClusterKey : null,
      confidence: typeof row.confidence === "number" ? row.confidence : null,
      settledAt: typeof row.settledAt === "string" ? row.settledAt : null
    }];
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as RequestBody;
    const gameId = required(body.gameId, "gameId");
    const awayTeam = required(body.awayTeam, "awayTeam").toUpperCase();
    const homeTeam = required(body.homeTeam, "homeTeam").toUpperCase();
    const awayProjectedRuns = numberOr(body.awayProjectedRuns, 4.3, 1.5, 9.5);
    const homeProjectedRuns = numberOr(body.homeProjectedRuns, 4.5, 1.5, 9.5);
    const quoteNormalization = normalizeMlbBatterPropQuotes(body.quotes ?? []);
    const settledCalibrationRows = normalizeCalibrationRows(body.settledCalibrationRows);
    const probabilityCalibration = settledCalibrationRows.length ? buildMlbBatterPropProbabilityCalibration({ rows: settledCalibrationRows }) : null;

    const projectionLoad = await loadMlbBatterBoxProjection({
      gameId,
      awayTeam,
      homeTeam,
      awayProjectedRuns: String(awayProjectedRuns),
      homeProjectedRuns: String(homeProjectedRuns),
      awayOffenseScore: body.awayOffenseScore === undefined ? undefined : String(body.awayOffenseScore),
      homeOffenseScore: body.homeOffenseScore === undefined ? undefined : String(body.homeOffenseScore),
      awayWinProbability: body.awayWinProbability === undefined ? undefined : String(body.awayWinProbability),
      homeWinProbability: body.homeWinProbability === undefined ? undefined : String(body.homeWinProbability)
    });

    if (!projectionLoad.projection) {
      return NextResponse.json({
        ok: false,
        modelVersion: "mlb-batter-prop-edge-board-v1",
        gameId,
        awayTeam,
        homeTeam,
        quoteNormalization,
        probabilityCalibration,
        diagnostics: projectionLoad.diagnostics,
        reason: projectionLoad.error ?? "roster intelligence unavailable",
        board: null
      }, { status: 503 });
    }

    const quoteQuality = qualityGateMlbBatterPropQuotes({
      projection: projectionLoad.projection,
      quotes: quoteNormalization.quotes,
      config: body.quoteQuality
    });

    const board = buildMlbBatterPropEdgeBoard({
      projection: projectionLoad.projection,
      quotes: quoteQuality.quotes,
      config: body.config,
      calibration: probabilityCalibration
    });

    return NextResponse.json({
      ok: true,
      modelVersion: "mlb-batter-prop-edge-board-v1",
      gameId,
      awayTeam,
      homeTeam,
      awayProjectedRuns,
      homeProjectedRuns,
      rawQuoteCount: Array.isArray(body.quotes) ? body.quotes.length : 0,
      normalizedQuoteCount: quoteNormalization.quotes.length,
      acceptedQuoteCount: quoteQuality.acceptedCount,
      settledCalibrationRowCount: settledCalibrationRows.length,
      quoteNormalization,
      quoteQuality,
      probabilityCalibration,
      diagnostics: projectionLoad.diagnostics,
      projection: projectionLoad.projection,
      board
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown MLB batter prop edge API error";
    const status = message.startsWith("Missing required") ? 400 : 500;
    return NextResponse.json({
      ok: false,
      modelVersion: "mlb-batter-prop-edge-board-v1",
      error: message
    }, { status });
  }
}
