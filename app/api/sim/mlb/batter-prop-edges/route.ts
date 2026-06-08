import { NextResponse } from "next/server";

import {
  buildMlbBatterPropEdgeBoard,
  type MlbBatterBookPropQuoteWithPlayer
} from "@/services/simulation/mlb-batter-prop-edge-board";
import { buildMlbBatterPropProbabilityCalibration, type MlbSettledBatterPropProbabilityRow } from "@/services/simulation/mlb-batter-prop-probability-calibration";
import { projectMlbPlayerStatsForGame, type MlbProjectionTeamContext } from "@/services/simulation/mlb-player-stat-inning-engine";
import { buildMlbV8PlayerImpactContext } from "@/services/simulation/mlb-v8-player-impact-model";

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
  quotes?: MlbBatterBookPropQuoteWithPlayer[];
  settledCalibrationRows?: MlbSettledBatterPropProbabilityRow[];
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

function normalizeQuotes(value: unknown): MlbBatterBookPropQuoteWithPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((quote) => {
    if (!quote || typeof quote !== "object" || Array.isArray(quote)) return [];
    const row = quote as Record<string, unknown>;
    const market = String(row.market ?? "").trim().toUpperCase();
    const side = String(row.side ?? "").trim().toUpperCase();
    const line = Number(row.line);
    const americanOdds = Number(row.americanOdds ?? row.odds);
    const book = String(row.book ?? "").trim();
    if (!book || !market || !side || !Number.isFinite(line) || !Number.isFinite(americanOdds)) return [];
    if (!["HITS", "TOTAL_BASES", "HOME_RUN", "WALKS", "STRIKEOUTS"].includes(market)) return [];
    if (!["OVER", "UNDER"].includes(side)) return [];
    return [{
      book,
      market: market as MlbBatterBookPropQuoteWithPlayer["market"],
      line,
      side: side as MlbBatterBookPropQuoteWithPlayer["side"],
      americanOdds,
      playerId: typeof row.playerId === "string" ? row.playerId : null,
      playerName: typeof row.playerName === "string" ? row.playerName : null,
      team: typeof row.team === "string" ? row.team.toUpperCase() : null,
      available: typeof row.available === "boolean" ? row.available : undefined,
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined
    }];
  });
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
    const quotes = normalizeQuotes(body.quotes);
    const settledCalibrationRows = normalizeCalibrationRows(body.settledCalibrationRows);
    const probabilityCalibration = settledCalibrationRows.length ? buildMlbBatterPropProbabilityCalibration({ rows: settledCalibrationRows }) : null;

    const context = await buildMlbV8PlayerImpactContext({ gameId, awayTeam, homeTeam });
    if (!context.available || !context.away || !context.home) {
      return NextResponse.json({
        ok: false,
        modelVersion: "mlb-batter-prop-edge-board-v1",
        gameId,
        awayTeam,
        homeTeam,
        probabilityCalibration,
        reason: context.reason ?? "roster intelligence unavailable",
        board: null
      }, { status: 503 });
    }

    const projection = projectMlbPlayerStatsForGame({
      away: context.away as MlbProjectionTeamContext,
      home: context.home as MlbProjectionTeamContext,
      awayRuns: awayProjectedRuns,
      homeRuns: homeProjectedRuns,
      awayOffenseScore: body.awayOffenseScore ?? null,
      homeOffenseScore: body.homeOffenseScore ?? null,
      awayWinProbability: body.awayWinProbability ?? null,
      homeWinProbability: body.homeWinProbability ?? null
    });

    const board = buildMlbBatterPropEdgeBoard({
      projection,
      quotes,
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
      quoteCount: quotes.length,
      settledCalibrationRowCount: settledCalibrationRows.length,
      probabilityCalibration,
      projection,
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
