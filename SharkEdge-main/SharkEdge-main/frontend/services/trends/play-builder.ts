import { prisma } from "@/lib/db/prisma";
import { hasUsableServerDatabaseUrl } from "@/lib/db/prisma";
import { matchTrendToGames } from "@/lib/trends/trendMatcher";
import type { FilterConditions } from "@/types/trends";

import { scoreCalibrationQuality, calibrateProbability } from "./calibration";
import { computeConfidenceScore, estimateProbabilityBand } from "./confidence";
import { createDiagnostics } from "./diagnostics";
import { computeBrierScore, computeCalibrationError, computeRollingStabilityScore } from "./evaluation";
import { americanToImpliedProb, impliedProbToAmerican, probabilityEdge } from "./market-pricing";
import type { ActivationState, RankedTrendPlay, TrendsPlaysResponse } from "./play-types";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function asPct(edge: number | null) {
  if (typeof edge !== "number" || !Number.isFinite(edge)) return null;
  return edge * 100;
}

function scoreToInt(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, 0, 100));
}

function deriveRawModelProb(winPercentage: number | null) {
  if (typeof winPercentage !== "number" || !Number.isFinite(winPercentage)) return null;
  const p = winPercentage / 100;
  return clamp(p, 0.01, 0.99);
}

function toOutcomeRows(matches: Array<{ betResult: string }>, predicted: number) {
  const rows: Array<{ predicted: number; actual: 0 | 1 }> = [];
  for (const m of matches) {
    if (m.betResult === "W") rows.push({ predicted, actual: 1 });
    else if (m.betResult === "L") rows.push({ predicted, actual: 0 });
  }
  return rows;
}

function computeMarketScore(args: {
  pointEdge: number | null;
  conservativeEdge: number | null;
  bestNumber: boolean;
  booksSeen: number;
}) {
  const point = typeof args.pointEdge === "number" ? args.pointEdge : 0;
  const conservative = typeof args.conservativeEdge === "number" ? args.conservativeEdge : 0;

  // Edge drives the score; conservative edge matters.
  const edgeScore = clamp(point * 2200 + conservative * 1800, 0, 100);
  const bookScore = clamp(args.booksSeen * 7, 0, 20);
  const bestBonus = args.bestNumber ? 10 : 0;
  return scoreToInt(edgeScore + bookScore + bestBonus);
}

function computeTimingScore(args: {
  inPlayableBand: boolean | null;
  startsAt: string | null;
  providerOk: boolean;
  booksSeen: number;
}) {
  let score = 55;
  if (args.inPlayableBand === true) score += 25;
  if (args.inPlayableBand === false) score -= 25;
  if (args.providerOk) score += 8;
  if (args.booksSeen >= 3) score += 7;

  const ts = args.startsAt ? Date.parse(args.startsAt) : NaN;
  if (Number.isFinite(ts)) {
    const minutes = (ts - Date.now()) / (60 * 1000);
    // Games too far out get less urgency; games already started still can be playable for live markets,
    // but V1 play engine stays pregame-first.
    if (minutes < -10) score -= 18;
    else if (minutes < 90) score += 8;
    else if (minutes < 360) score += 4;
    else if (minutes > 24 * 60) score -= 6;
  }

  return scoreToInt(score);
}

function computeDataQualityScore(args: {
  sportsbook: string | null;
  oddsAmerican: number | null;
  line: number | null;
  hasCalibrationInputs: boolean;
}) {
  let score = 45;
  if (args.sportsbook) score += 12;
  if (typeof args.oddsAmerican === "number") score += 18;
  if (typeof args.line === "number") score += 8;
  if (args.hasCalibrationInputs) score += 10;
  return scoreToInt(score);
}

function computeFinalScore(parts: {
  marketScore: number;
  stabilityScore: number;
  calibrationScore: number;
  confidenceScore: number;
  timingScore: number;
  dataQualityScore: number;
}) {
  const final =
    parts.marketScore * 0.35 +
    parts.stabilityScore * 0.2 +
    parts.calibrationScore * 0.15 +
    parts.confidenceScore * 0.1 +
    parts.timingScore * 0.1 +
    parts.dataQualityScore * 0.1;

  return Math.round(clamp(final, 0, 100));
}

function pickTier(state: ActivationState, finalScore: number) {
  if (state === "LIVE_NOW") {
    if (finalScore >= 88) return "A" as const;
    if (finalScore >= 78) return "B" as const;
    return "C" as const;
  }

  if (state === "BUILDING") return "C" as const;
  return "PASS" as const;
}

function isInRange(value: number | null, range: { min: number; max: number } | null | undefined) {
  if (!range) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= range.min && value <= range.max;
}

function computeActivationState(args: {
  pointEdge: number | null;
  conservativeEdge: number | null;
  confidenceScore: number;
  finalScore: number;
  inPlayableBand: boolean | null;
}): ActivationState {
  if (args.inPlayableBand === false) return "DEAD";

  const point = args.pointEdge ?? null;
  const conservative = args.conservativeEdge ?? null;
  const meetsEdge =
    typeof point === "number" &&
    typeof conservative === "number" &&
    point >= 0.025 &&
    conservative >= 0.0075;
  const meetsConfidence = args.confidenceScore >= 65;
  const meetsScore = args.finalScore >= 75;

  if (meetsEdge && meetsConfidence && meetsScore) {
    return "LIVE_NOW";
  }

  if (typeof point === "number" && point > 0) {
    return "BUILDING";
  }

  if (args.inPlayableBand === true) {
    return "EARLY";
  }

  return "PASS";
}

type TrendDefinitionRow = {
  id: string;
  name: string;
  sport: string;
  league: string | null;
  betType: "moneyline" | "spread" | "total";
  filterConditionsJson: unknown;
  isSystemGenerated: boolean;
  isUserCreated: boolean;
  isPublic: boolean;
  isPremium: boolean;
  lastComputedAt: Date | null;
  snapshots: Array<{
    calculatedAt: Date;
    totalGames: number;
    wins: number;
    losses: number;
    pushes: number;
    winPercentage: number | null;
    roi: number | null;
    confidenceScore: number | null;
    warningsJson: unknown;
  }>;
};

type TrendMatchRow = {
  trendDefinitionId: string;
  betResult: string;
  matchedAt: Date;
};

let cached: { at: number; value: TrendsPlaysResponse } | null = null;
const CACHE_TTL_MS = 45_000;

export async function buildTrendPlays(): Promise<TrendsPlaysResponse> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const diagnostics = createDiagnostics();
  const generatedAt = new Date().toISOString();

  if (!hasUsableServerDatabaseUrl()) {
    diagnostics.setProviderStatus("down");
    diagnostics.addIssue(
      "No server database URL detected (set DATABASE_URL / POSTGRES_PRISMA_URL / POSTGRES_URL). Trends cannot load systems or current odds without it."
    );
    const empty = {
      generatedAt,
      diagnostics: diagnostics.toObject(),
      bestPlays: [],
      buildingSignals: [],
      historicalSystems: []
    } satisfies TrendsPlaysResponse;
    cached = { at: now, value: empty };
    return empty;
  }

  diagnostics.setProviderStatus("ok");

  // 1) Load validated systems (definitions + latest snapshot)
  const definitions = (await prisma.savedTrendDefinition.findMany({
    include: {
      snapshots: {
        orderBy: { calculatedAt: "desc" },
        take: 1
      }
    },
    orderBy: [{ lastComputedAt: "desc" }, { updatedAt: "desc" }],
    take: 120
  })) as unknown as TrendDefinitionRow[];

  diagnostics.bump("discoveredSystems", definitions.length);

  const validated = definitions.filter((row) => row.snapshots[0]);
  diagnostics.bump("validatedSystems", validated.length);

  if (!validated.length) {
    diagnostics.setProviderStatus("degraded");
    diagnostics.addIssue("No validated trend snapshots found yet. Run `npm run worker:trends` after your DB is connected.");
  }

  // 2) Load historical match rows for calibration (batch query, W/L only)
  const definitionIds = validated.map((row) => row.id);
  const historicalMatches = definitionIds.length
    ? ((await prisma.savedTrendMatch.findMany({
        where: { trendDefinitionId: { in: definitionIds } },
        select: { trendDefinitionId: true, betResult: true, matchedAt: true },
        orderBy: { matchedAt: "asc" },
        take: 25_000
      })) as unknown as TrendMatchRow[])
    : [];

  diagnostics.bump("historicalRows", historicalMatches.length);

  const matchesByDefinition = new Map<string, TrendMatchRow[]>();
  for (const row of historicalMatches) {
    const list = matchesByDefinition.get(row.trendDefinitionId) ?? [];
    list.push(row);
    matchesByDefinition.set(row.trendDefinitionId, list);
  }

  // 3) For each system, load current candidates (existing matcher path), then score.
  const candidates: RankedTrendPlay[] = [];
  const historicalOnly: RankedTrendPlay[] = [];

  const concurrency = 6;
  let index = 0;

  async function worker() {
    while (index < validated.length) {
      const current = validated[index];
      index += 1;

      const snapshot = current.snapshots[0] ?? null;
      const sampleSize = snapshot?.totalGames ?? 0;
      const roiPct = snapshot?.roi ?? null;
      const winPct = snapshot?.winPercentage ?? null;
      const rawProb = deriveRawModelProb(winPct);

      const filterConditions = current.filterConditionsJson as FilterConditions;

      const historyRows = matchesByDefinition.get(current.id) ?? [];
      const outcomeRows = rawProb !== null ? toOutcomeRows(historyRows, rawProb) : [];
      const brierScore = computeBrierScore(outcomeRows);
      const calibrationError = computeCalibrationError(outcomeRows);
      const stabilityScore = computeRollingStabilityScore(
        outcomeRows.map((row) => row.actual)
      );
      const calibrationScore = scoreCalibrationQuality({
        calibrationError,
        brierScore,
        sampleSize
      });

      const warnings: string[] = [];
      const snapshotWarnings = Array.isArray(snapshot?.warningsJson) ? snapshot?.warningsJson.map(String) : [];
      warnings.push(...(snapshotWarnings ?? []));

      if (!historyRows.length) {
        warnings.push("No historical match rows available for calibration; using conservative shrinkage only.");
      }

      const calibrated = calibrateProbability({
        rawProb,
        calibrationError,
        sampleSize
      });

      const band = estimateProbabilityBand({
        probability: calibrated,
        sampleSize
      });

      const confidenceScore = computeConfidenceScore({
        sampleSize,
        calibrationError,
        clvPct: null,
        stabilityScore
      });

      let activeMatches: Awaited<ReturnType<typeof matchTrendToGames>> = [];
      try {
        activeMatches = await matchTrendToGames(filterConditions, { activeOnly: true, limit: 40 });
      } catch (error) {
        diagnostics.setProviderStatus("degraded");
        diagnostics.addIssue(
          `Failed to load active matches for system "${current.name}": ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }

      diagnostics.bump("currentRows", activeMatches.length);

      if (!activeMatches.length) {
        // Historical system card, not a live play.
        historicalOnly.push({
          systemId: current.id,
          eventId: `system:${current.id}`,
          gameLabel: current.name,
          league: current.league ?? "ALL",
          marketType: current.betType,
          selection: "System",
          sportsbook: null,
          line: null,
          oddsAmerican: null,
          marketImpliedProb: null,
          fairImpliedProb: calibrated,
          rawModelProb: rawProb,
          calibratedModelProb: calibrated,
          probabilityLowerBound: band.lower,
          probabilityUpperBound: band.upper,
          fairLine: null,
          fairOddsAmerican: impliedProbToAmerican(calibrated ?? 0.5),
          edgePct: null,
          sampleSize,
          roiPct,
          clvPct: null,
          brierScore,
          calibrationError,
          calibrationScore,
          stabilityScore,
          confidenceScore,
          timingScore: 40,
          marketScore: 0,
          dataQualityScore: 55,
          finalScore: Math.round(
            calibrationScore * 0.25 + stabilityScore * 0.25 + confidenceScore * 0.5
          ),
          activationState: "EARLY",
          tier: "PASS",
          reasons: [
            `Historical sample ${sampleSize} games`,
            typeof winPct === "number" ? `Win% ${winPct.toFixed(1)}%` : "Win% pending"
          ],
          warnings: Array.from(new Set(warnings))
        });
        continue;
      }

      // Group by eventId + selection; pick best number (line first for spread/total, then price).
      const byKey = new Map<string, typeof activeMatches>();
      for (const row of activeMatches) {
        const key = `${row.eventId}:${row.marketType}:${row.selection}:${row.side ?? ""}`;
        const list = byKey.get(key) ?? [];
        list.push(row);
        byKey.set(key, list);
      }

      for (const [key, rows] of byKey.entries()) {
        diagnostics.bump("activeCandidates", 1);
        const first = rows[0];

        const marketType =
          first.marketType === "moneyline" || first.marketType === "spread" || first.marketType === "total"
            ? first.marketType
            : current.betType;

        const selection = first.selection;
        const isOver = (first.side ?? "").toUpperCase() === "OVER" || (first.role ?? "").toUpperCase() === "OVER";
        const isUnder = (first.side ?? "").toUpperCase() === "UNDER" || (first.role ?? "").toUpperCase() === "UNDER";

        const sorted = [...rows].sort((a, b) => {
          const aLine = a.line ?? null;
          const bLine = b.line ?? null;
          if (marketType === "spread") {
            // Always prefer the higher (more favorable) spread number.
            if (typeof aLine === "number" && typeof bLine === "number" && aLine !== bLine) {
              return bLine - aLine;
            }
          }

          if (marketType === "total") {
            if (typeof aLine === "number" && typeof bLine === "number" && aLine !== bLine) {
              // Over wants lower, Under wants higher.
              if (isOver) return aLine - bLine;
              if (isUnder) return bLine - aLine;
            }
          }

          // Moneyline: prefer the better payout on the selection.
          const aOdds = a.oddsAmerican ?? 0;
          const bOdds = b.oddsAmerican ?? 0;
          return bOdds - aOdds;
        });

        const best = sorted[0];
        const sportsbook = typeof best.metadata?.sportsbook === "string" ? best.metadata.sportsbook : null;

        const marketProb = typeof best.oddsAmerican === "number" ? americanToImpliedProb(best.oddsAmerican) : null;
        const fairProb = calibrated;
        const pointEdge = probabilityEdge(fairProb, marketProb);
        const conservativeEdge = probabilityEdge(band.lower, marketProb);
        const edgePct = asPct(pointEdge);

        const inPlayableBand =
          marketType === "moneyline"
            ? isInRange(best.oddsAmerican ?? null, filterConditions.moneylineRange)
            : marketType === "spread"
              ? isInRange(best.line ?? null, filterConditions.spreadRange)
              : isInRange(best.line ?? null, filterConditions.totalRange);

        if (inPlayableBand === null) {
          warnings.push("Playable range not explicit; inferred/unknown trigger band reduces timing confidence.");
        }

        const marketScore = computeMarketScore({
          pointEdge,
          conservativeEdge,
          bestNumber: true,
          booksSeen: rows.length
        });

        const timingScore = computeTimingScore({
          inPlayableBand,
          startsAt: best.startTime ?? null,
          providerOk: true,
          booksSeen: rows.length
        });

        const dataQualityScore = computeDataQualityScore({
          sportsbook,
          oddsAmerican: best.oddsAmerican,
          line: best.line ?? null,
          hasCalibrationInputs: Boolean(historyRows.length)
        });

        const finalScore = computeFinalScore({
          marketScore,
          stabilityScore,
          calibrationScore,
          confidenceScore,
          timingScore,
          dataQualityScore
        });

        const activationState = computeActivationState({
          pointEdge,
          conservativeEdge,
          confidenceScore,
          finalScore,
          inPlayableBand
        });

        const reasons: string[] = [];
        if (typeof edgePct === "number") reasons.push(`Edge ${edgePct.toFixed(2)}% vs market`);
        if (typeof winPct === "number") reasons.push(`System win% ${winPct.toFixed(1)}% (shrunk)`);
        reasons.push(`Confidence ${confidenceScore}/100`);
        if (rows.length >= 2) reasons.push(`${rows.length} books matched this angle`);

        const play: RankedTrendPlay = {
          systemId: current.id,
          eventId: best.eventId,
          gameLabel: best.eventLabel,
          league: best.league,
          marketType,
          selection,
          sportsbook,
          line: best.line ?? null,
          oddsAmerican: best.oddsAmerican ?? null,
          marketImpliedProb: marketProb,
          fairImpliedProb: fairProb,
          rawModelProb: rawProb,
          calibratedModelProb: fairProb,
          probabilityLowerBound: band.lower,
          probabilityUpperBound: band.upper,
          fairLine: null,
          fairOddsAmerican: typeof fairProb === "number" ? impliedProbToAmerican(fairProb) : null,
          edgePct,
          sampleSize,
          roiPct,
          clvPct: null,
          brierScore,
          calibrationError,
          calibrationScore,
          stabilityScore,
          confidenceScore,
          timingScore,
          marketScore,
          dataQualityScore,
          finalScore,
          activationState,
          tier: pickTier(activationState, finalScore),
          reasons,
          warnings: Array.from(new Set(warnings))
        };

        candidates.push(play);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, validated.length) }, () => worker()));

  // 4) Bucket + sort
  const live = candidates.filter((p) => p.activationState === "LIVE_NOW").sort((a, b) => b.finalScore - a.finalScore);
  const building = candidates
    .filter((p) => p.activationState === "BUILDING")
    .sort((a, b) => b.finalScore - a.finalScore);
  const historical = historicalOnly.sort((a, b) => b.finalScore - a.finalScore);

  diagnostics.bump("surfacedPlays", live.length + building.length + historical.length);

  if (!live.length && !building.length && historical.length) {
    diagnostics.addIssue("No live edges qualified right now. Historical systems are still available below.");
  }

  if (!live.length && !building.length && !historical.length) {
    diagnostics.setProviderStatus("degraded");
    diagnostics.addIssue(
      "No trend plays could be generated. Most common causes: empty savedTrendDefinition table, missing current odds ingestion, or DB connection not set in this runtime."
    );
  }

  const response: TrendsPlaysResponse = {
    generatedAt,
    diagnostics: diagnostics.toObject(),
    bestPlays: live.slice(0, 25),
    buildingSignals: building.slice(0, 40),
    historicalSystems: historical.slice(0, 80)
  };

  cached = { at: now, value: response };
  return response;
}
