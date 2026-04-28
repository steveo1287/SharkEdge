import { prisma } from "@/lib/db/prisma";
import {
  brierScore,
  CalibrationProfile,
  getDefaultCalibrationProfile,
  logLoss,
  setCalibrationProfileOverrides,
  summarizeCalibrationBuckets
} from "@/services/simulation/sim-calibration";
import { americanToImpliedProbability, removeTwoWayVig } from "@/services/simulation/probability-math";

type ProbabilityRecord = {
  predicted: number;
  actual: 0 | 1;
  market?: number | null;
};

type WinnerAccuracySummary = {
  accuracy: number | null;
  correct: number;
  sample: number;
};

type DeltaRecord = {
  rawDelta: number;
  actualDelta: number;
};

export type LeagueCalibrationPayload = {
  leagueKey: string;
  profile: CalibrationProfile;
  metrics: {
    moneylineSample: number;
    spreadSample: number;
    totalSample: number;
    propSample: number;
    modelBrier: number;
    marketBrier: number | null;
    modelLogLoss: number;
    marketLogLoss: number | null;
    modelWinnerAccuracy: number | null;
    marketWinnerAccuracy: number | null;
    winnerAccuracyDelta: number | null;
    modelWinnerCorrect: number;
    marketWinnerCorrect: number;
    highConfidenceWinnerAccuracy: number | null;
    highConfidenceWinnerSample: number;
    buckets: Array<{ bucket: string; predicted: number; actual: number; count: number }>;
  };
  guardrails: {
    minimums: {
      moneylineSample: number;
      spreadSample: number;
      totalSample: number;
      propSample: number;
    };
    eligible: boolean;
    warnings: string[];
  };
  generatedAt: string;
};

const MINIMUM_SAMPLES = {
  moneylineSample: 150,
  spreadSample: 150,
  totalSample: 150,
  propSample: 250
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function slopeFromCenteredProbability(records: ProbabilityRecord[]) {
  let numerator = 0;
  let denominator = 0;

  for (const record of records) {
    const centeredPredicted = record.predicted - 0.5;
    const centeredActual = record.actual - 0.5;
    numerator += centeredPredicted * centeredActual;
    denominator += centeredPredicted * centeredPredicted;
  }

  if (denominator <= 0) {
    return 1;
  }

  return numerator / denominator;
}

function slopeFromDelta(records: DeltaRecord[]) {
  let numerator = 0;
  let denominator = 0;

  for (const record of records) {
    numerator += record.rawDelta * record.actualDelta;
    denominator += record.rawDelta * record.rawDelta;
  }

  if (denominator <= 0) {
    return 1;
  }

  return numerator / denominator;
}

function getClosingOdds(row: {
  closingOdds: number | null;
  currentOdds: number | null;
  oddsAmerican: number;
}) {
  return row.closingOdds ?? row.currentOdds ?? row.oddsAmerican;
}

function getClosingLine(row: {
  closingLine: number | null;
  currentLine: number | null;
  line: number | null;
}) {
  return row.closingLine ?? row.currentLine ?? row.line;
}

function getProbabilityFromHitMap(map: unknown, line: number) {
  if (!map || typeof map !== "object") {
    return null;
  }

  const record = map as Record<string, unknown>;
  const candidates = [String(line), line.toFixed(1), line.toFixed(2)];
  for (const candidate of candidates) {
    const value = record[candidate];
    if (typeof value === "number") {
      return value;
    }
  }

  return null;
}

function getPropActualValue(marketType: string, statsJson: unknown) {
  if (!statsJson || typeof statsJson !== "object") {
    return null;
  }

  const stats = statsJson as Record<string, unknown>;
  const read = (...keys: string[]) => {
    for (const key of keys) {
      const value = stats[key];
      if (typeof value === "number") {
        return value;
      }
    }
    return null;
  };

  switch (marketType) {
    case "player_points":
      return read("points", "pts");
    case "player_rebounds":
      return read("rebounds", "reb");
    case "player_assists":
      return read("assists", "ast");
    case "player_threes":
      return read("threesMade", "threePointersMade", "fg3m");
    case "player_pitcher_outs": {
      const direct = read("pitcherOuts", "outsPitched");
      if (direct !== null) {
        return direct > 15 ? direct : direct * 3;
      }
      return null;
    }
    case "player_pitcher_strikeouts":
      return read("pitchingStrikeouts", "strikeouts", "so");
    default:
      return null;
  }
}

function summarizeWinnerAccuracy(records: ProbabilityRecord[], key: "predicted" | "market", confidenceFloor = 0): WinnerAccuracySummary {
  let correct = 0;
  let sample = 0;

  for (const record of records) {
    const probability = record[key];
    if (typeof probability !== "number") {
      continue;
    }

    const confidence = Math.abs(probability - 0.5) * 2;
    if (confidence < confidenceFloor) {
      continue;
    }

    sample += 1;
    const pickedHome = probability >= 0.5;
    const actualHome = record.actual === 1;
    if (pickedHome === actualHome) {
      correct += 1;
    }
  }

  return {
    accuracy: sample > 0 ? correct / sample : null,
    correct,
    sample
  };
}

function buildGuardrails(metrics: LeagueCalibrationPayload["metrics"]) {
  const warnings: string[] = [];

  if (metrics.moneylineSample < MINIMUM_SAMPLES.moneylineSample) {
    warnings.push(`Moneyline sample below minimum (${metrics.moneylineSample}/${MINIMUM_SAMPLES.moneylineSample}).`);
  }
  if (metrics.spreadSample < MINIMUM_SAMPLES.spreadSample) {
    warnings.push(`Spread sample below minimum (${metrics.spreadSample}/${MINIMUM_SAMPLES.spreadSample}).`);
  }
  if (metrics.totalSample < MINIMUM_SAMPLES.totalSample) {
    warnings.push(`Total sample below minimum (${metrics.totalSample}/${MINIMUM_SAMPLES.totalSample}).`);
  }
  if (metrics.propSample < MINIMUM_SAMPLES.propSample) {
    warnings.push(`Prop sample below minimum (${metrics.propSample}/${MINIMUM_SAMPLES.propSample}).`);
  }

  return {
    minimums: MINIMUM_SAMPLES,
    eligible: warnings.length === 0,
    warnings
  };
}

function buildProfile(leagueKey: string, args: {
  moneylineRecords: ProbabilityRecord[];
  spreadRecords: DeltaRecord[];
  totalRecords: DeltaRecord[];
  propRecords: ProbabilityRecord[];
}): LeagueCalibrationPayload {
  const base = getDefaultCalibrationProfile(leagueKey);
  const moneylineSlope = clamp(slopeFromCenteredProbability(args.moneylineRecords), 0.65, 0.98);
  const propSlope = clamp(slopeFromCenteredProbability(args.propRecords), 0.65, 0.98);
  const spreadSlope = clamp(slopeFromDelta(args.spreadRecords), 0.45, 1);
  const totalSlope = clamp(slopeFromDelta(args.totalRecords), 0.45, 1);

  const modelBrier = brierScore(args.moneylineRecords);
  const marketMoneylineRecords = args.moneylineRecords
    .filter((record): record is ProbabilityRecord & { market: number } => typeof record.market === "number")
    .map((record) => ({ predicted: record.market, actual: record.actual }));
  const marketBrier = marketMoneylineRecords.length > 0 ? brierScore(marketMoneylineRecords) : null;
  const modelLogLoss = logLoss(args.moneylineRecords);
  const marketLogLoss = marketMoneylineRecords.length > 0 ? logLoss(marketMoneylineRecords) : null;
  const modelWinner = summarizeWinnerAccuracy(args.moneylineRecords, "predicted");
  const marketWinner = summarizeWinnerAccuracy(args.moneylineRecords, "market");
  const highConfidenceWinner = summarizeWinnerAccuracy(args.moneylineRecords, "predicted", 0.2);

  const marketBlend = marketBrier !== null
    ? clamp(base.marketBlend + Math.max(0, modelBrier - marketBrier) * 1.8, 0.05, 0.35)
    : base.marketBlend;

  const profile: CalibrationProfile = {
    neutralShrink: clamp(1 - moneylineSlope, 0.04, 0.28),
    marketBlend,
    moneylineTemperature: clamp((base.moneylineTemperature ?? 1.08) + Math.max(0, modelBrier - 0.22) * 2.5, 0.85, 1.35),
    spreadDeltaShrink: clamp(spreadSlope, 0.45, 1),
    totalDeltaShrink: clamp(totalSlope, 0.45, 1),
    propProbShrink: clamp(1 - propSlope, 0.05, 0.35),
    stdBaseline: base.stdBaseline
  };

  const metrics = {
    moneylineSample: args.moneylineRecords.length,
    spreadSample: args.spreadRecords.length,
    totalSample: args.totalRecords.length,
    propSample: args.propRecords.length,
    modelBrier,
    marketBrier,
    modelLogLoss,
    marketLogLoss,
    modelWinnerAccuracy: modelWinner.accuracy,
    marketWinnerAccuracy: marketWinner.accuracy,
    winnerAccuracyDelta:
      modelWinner.accuracy !== null && marketWinner.accuracy !== null
        ? modelWinner.accuracy - marketWinner.accuracy
        : null,
    modelWinnerCorrect: modelWinner.correct,
    marketWinnerCorrect: marketWinner.correct,
    highConfidenceWinnerAccuracy: highConfidenceWinner.accuracy,
    highConfidenceWinnerSample: highConfidenceWinner.sample,
    buckets: summarizeCalibrationBuckets(args.moneylineRecords)
  };

  return {
    leagueKey,
    profile,
    metrics,
    guardrails: buildGuardrails(metrics),
    generatedAt: new Date().toISOString()
  };
}

export async function fitAndPersistSimCalibrationProfiles() {
  const events = await prisma.event.findMany({
    where: {
      status: "FINAL",
      resultState: "OFFICIAL",
      eventResult: { isNot: null },
      eventProjections: { some: {} }
    },
    include: {
      participants: true,
      eventResult: true,
      eventProjections: {
        orderBy: { modelRun: { createdAt: "desc" } },
        take: 1
      },
      playerProjections: true,
      markets: true
    },
    orderBy: { startTime: "desc" },
    take: 1500
  });

  const externalIds = events
    .map((event) => event.externalEventId)
    .filter((value): value is string => Boolean(value));

  const games = externalIds.length > 0
    ? await prisma.game.findMany({
        where: { externalEventId: { in: externalIds } },
        include: {
          playerGameStats: true
        }
      })
    : [];

  const gamesByExternalId = new Map(games.map((game) => [game.externalEventId, game]));
  const recordsByLeague = new Map<string, {
    moneylineRecords: ProbabilityRecord[];
    spreadRecords: DeltaRecord[];
    totalRecords: DeltaRecord[];
    propRecords: ProbabilityRecord[];
  }>();

  for (const event of events) {
    const projection = event.eventProjections[0];
    const result = event.eventResult;
    if (!projection || !result) {
      continue;
    }

    const homeParticipant = event.participants.find((participant) => participant.role === "HOME");
    const homeCompetitorId = homeParticipant?.competitorId ?? null;
    const leagueKey = event.leagueId ? event.leagueId : "UNKNOWN";
    const leagueRecords = recordsByLeague.get(leagueKey) ?? {
      moneylineRecords: [],
      spreadRecords: [],
      totalRecords: [],
      propRecords: []
    };

    if (homeCompetitorId && projection.winProbHome !== null) {
      const homeMoneyline = event.markets.find(
        (market) =>
          market.marketType === "moneyline" &&
          (market.selectionCompetitorId === homeCompetitorId || market.side === "HOME")
      );
      const awayMoneyline = event.markets.find(
        (market) =>
          market.marketType === "moneyline" &&
          market.id !== homeMoneyline?.id &&
          (market.selectionCompetitorId !== homeCompetitorId || market.side === "AWAY")
      );
      const actualHomeWin = result.winnerCompetitorId === homeCompetitorId ? 1 : 0;
      const market = homeMoneyline ? (() => {
        const homeOdds = getClosingOdds(homeMoneyline);
        const awayOdds = awayMoneyline ? getClosingOdds(awayMoneyline) : null;
        const noVig = removeTwoWayVig(homeOdds, awayOdds);
        return noVig?.left ?? americanToImpliedProbability(homeOdds);
      })() : null;

      leagueRecords.moneylineRecords.push({
        predicted: projection.winProbHome,
        actual: actualHomeWin as 0 | 1,
        market
      });
    }

    if (homeCompetitorId && projection.projectedSpreadHome !== null && typeof result.margin === "number") {
      const homeSpreadMarket = event.markets.find(
        (market) =>
          market.marketType === "spread" &&
          (market.selectionCompetitorId === homeCompetitorId || market.side === "HOME")
      );
      const closingLine = homeSpreadMarket ? getClosingLine(homeSpreadMarket) : null;
      if (typeof closingLine === "number") {
        const actualSpreadHome = result.winnerCompetitorId === homeCompetitorId ? result.margin : -result.margin;
        leagueRecords.spreadRecords.push({
          rawDelta: projection.projectedSpreadHome - closingLine,
          actualDelta: actualSpreadHome - closingLine
        });
      }
    }

    if (projection.projectedTotal !== null && typeof result.totalPoints === "number") {
      const totalMarket = event.markets.find(
        (market) => market.marketType === "total" && (market.side === "OVER" || market.selection === "OVER")
      );
      const closingLine = totalMarket ? getClosingLine(totalMarket) : null;
      if (typeof closingLine === "number") {
        leagueRecords.totalRecords.push({
          rawDelta: projection.projectedTotal - closingLine,
          actualDelta: result.totalPoints - closingLine
        });
      }
    }

    const game = event.externalEventId ? gamesByExternalId.get(event.externalEventId) : null;
    if (game) {
      const statsByPlayerId = new Map(game.playerGameStats.map((stat) => [stat.playerId, stat]));
      for (const playerProjection of event.playerProjections) {
        const matchingMarkets = event.markets.filter(
          (market) => market.playerId === playerProjection.playerId && market.marketType !== "moneyline" && market.marketType !== "spread" && market.marketType !== "total"
        );
        const statRow = statsByPlayerId.get(playerProjection.playerId);
        if (!statRow) {
          continue;
        }

        for (const market of matchingMarkets) {
          const closingLine = getClosingLine(market);
          if (typeof closingLine !== "number") {
            continue;
          }

          const actualValue = getPropActualValue(String(market.marketType), statRow.statsJson);
          if (typeof actualValue !== "number" || actualValue === closingLine) {
            continue;
          }

          const rawProb = getProbabilityFromHitMap(playerProjection.hitProbOver, closingLine);
          if (typeof rawProb !== "number") {
            continue;
          }

          leagueRecords.propRecords.push({
            predicted: rawProb,
            actual: (actualValue > closingLine ? 1 : 0) as 0 | 1,
            market: null
          });
        }
      }
    }

    recordsByLeague.set(leagueKey, leagueRecords);
  }

  const persisted: Record<string, CalibrationProfile> = {};
  const reports: LeagueCalibrationPayload[] = [];

  for (const [leagueKey, records] of recordsByLeague.entries()) {
    const report = buildProfile(leagueKey, records);
    if (report.guardrails.eligible) {
      persisted[leagueKey] = report.profile;
    }
    reports.push(report);

    await prisma.trendCache.upsert({
      where: { cacheKey: `sim_calibration_profile:${leagueKey}` },
      update: {
        scope: "sim_calibration_profile",
        filterJson: { leagueKey },
        payloadJson: report,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      },
      create: {
        cacheKey: `sim_calibration_profile:${leagueKey}`,
        scope: "sim_calibration_profile",
        filterJson: { leagueKey },
        payloadJson: report,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)
      }
    });

    await prisma.trendCache.create({
      data: {
        cacheKey: `sim_calibration_profile_history:${leagueKey}:${report.generatedAt}`,
        scope: "sim_calibration_profile_history",
        filterJson: { leagueKey, generatedAt: report.generatedAt },
        payloadJson: report,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90)
      }
    });
  }

  setCalibrationProfileOverrides(persisted);

  return {
    generatedAt: new Date().toISOString(),
    leagueCount: reports.length,
    profiles: persisted,
    reports
  };
}

export async function loadPersistedSimCalibrationProfiles() {
  const cached = await prisma.trendCache.findMany({
    where: {
      scope: "sim_calibration_profile",
      expiresAt: { gt: new Date() }
    }
  });

  const overrides: Record<string, CalibrationProfile> = {};
  for (const row of cached) {
    const payload = row.payloadJson as Partial<LeagueCalibrationPayload> | null;
    if (payload?.leagueKey && payload.profile && payload.guardrails?.eligible) {
      overrides[payload.leagueKey] = payload.profile;
    }
  }

  setCalibrationProfileOverrides(overrides);
  return overrides;
}

export async function getPersistedSimCalibrationReports() {
  const cached = await prisma.trendCache.findMany({
    where: {
      scope: "sim_calibration_profile"
    },
    orderBy: { updatedAt: "desc" }
  });

  return cached
    .map((row) => row.payloadJson as LeagueCalibrationPayload)
    .sort((a, b) => a.leagueKey.localeCompare(b.leagueKey));
}

export async function getSimCalibrationHistoryReports() {
  const cached = await prisma.trendCache.findMany({
    where: {
      scope: "sim_calibration_profile_history",
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "asc" }
  });

  return cached.map((row) => row.payloadJson as LeagueCalibrationPayload);
}
