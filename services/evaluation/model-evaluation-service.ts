import { prisma } from "@/lib/db/prisma";
import type { MarketType, Prisma } from "@prisma/client";
import {
  clampProbability,
  removeTwoWayVig
} from "@/services/simulation/probability-math";

type JsonRecord = Record<string, unknown>;

type BucketSummary = {
  bucket: string;
  count: number;
  hitRate: number | null;
  avgEdge: number | null;
  avgClvLine: number | null;
  avgAbsError: number | null;
  brier: number | null;
};

type PlayerPropEvaluationRecord = {
  projectionId: string;
  eventId: string;
  eventName: string;
  leagueKey: string;
  startTime: string;
  playerId: string;
  playerName: string;
  statKey: string;
  actualValue: number;
  modelMean: number;
  modelStdDev: number;
  marketLine: number | null;
  closingLine: number | null;
  modelOverProbability: number | null;
  marketNoVigOverProbability: number | null;
  modelEdgeProbability: number | null;
  modelPick: "OVER" | "UNDER" | "NONE";
  result: "WIN" | "LOSS" | "PUSH" | "NO_LINE";
  absoluteError: number;
  squaredError: number;
  brier: number | null;
  clvLine: number | null;
  confidence: number | null;
  metadata: JsonRecord;
};

type EventEvaluationRecord = {
  projectionId: string;
  eventId: string;
  eventName: string;
  leagueKey: string;
  startTime: string;
  modelHomeWinProbability: number;
  actualHomeWin: 0 | 1;
  modelPickedHome: boolean;
  winnerCorrect: boolean;
  brier: number;
  logLoss: number;
  projectedSpreadHome: number | null;
  actualSpreadHome: number | null;
  projectedTotal: number | null;
  actualTotal: number | null;
  spreadAbsError: number | null;
  totalAbsError: number | null;
};

type EvaluationReport = {
  generatedAt: string;
  leagueKey: string | null;
  lookbackDays: number;
  playerProps: {
    sample: number;
    withLineSample: number;
    hitRate: number | null;
    mae: number | null;
    rmse: number | null;
    brier: number | null;
    avgModelEdge: number | null;
    avgClvLine: number | null;
    byStatKey: BucketSummary[];
    byEdgeBucket: BucketSummary[];
    byConfidenceBucket: BucketSummary[];
    records: PlayerPropEvaluationRecord[];
  };
  events: {
    sample: number;
    winnerAccuracy: number | null;
    brier: number | null;
    logLoss: number | null;
    spreadMae: number | null;
    totalMae: number | null;
    records: EventEvaluationRecord[];
  };
  guardrails: {
    warnings: string[];
    minimumSamples: {
      playerProps: number;
      events: number;
    };
  };
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number | null, digits = 4) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function avg(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function rmseFromSquaredErrors(values: Array<number | null | undefined>) {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return clean.length ? Math.sqrt(clean.reduce((sum, value) => sum + value, 0) / clean.length) : null;
}

function logLoss(probability: number, actual: 0 | 1) {
  const p = clampProbability(probability, 0.0001, 0.9999);
  return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
}

function statValue(statKey: string, statsJson: unknown) {
  const row = asRecord(statsJson);
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = readNumber(row[key]);
      if (value !== null) return value;
    }
    return null;
  };

  switch (statKey) {
    case "player_points":
      return pick("points", "PTS", "pts");
    case "player_rebounds":
      return pick("rebounds", "REB", "reb");
    case "player_assists":
      return pick("assists", "AST", "ast");
    case "player_threes":
      return pick("threes", "FG3M", "3PM", "fg3m");
    case "player_pitcher_outs":
      return pick("pitcherOuts", "outsPitched", "outs", "recorded_outs");
    case "player_pitcher_strikeouts":
      return pick("pitchingStrikeouts", "strikeouts", "SO", "Ks");
    default:
      return pick(statKey);
  }
}

function hitProbabilityAtLine(map: unknown, line: number | null) {
  if (line === null) return null;
  const record = asRecord(map);
  const candidates = [String(line), line.toFixed(1), line.toFixed(2)];
  for (const key of candidates) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function edgeBucket(edge: number | null) {
  if (edge === null) return "unknown";
  const abs = Math.abs(edge);
  if (abs < 0.02) return "0-2%";
  if (abs < 0.04) return "2-4%";
  if (abs < 0.06) return "4-6%";
  if (abs < 0.08) return "6-8%";
  return "8%+";
}

function confidenceBucket(confidence: number | null) {
  if (confidence === null) return "unknown";
  if (confidence < 0.35) return "low";
  if (confidence < 0.65) return "medium";
  return "high";
}

function getMarketLine(metadata: JsonRecord) {
  return readNumber(metadata.marketLine);
}

function getClosingLine(market: { closingLine: number | null; currentLine: number | null; line: number | null } | null) {
  return market?.closingLine ?? market?.currentLine ?? market?.line ?? null;
}

function getClosingOdds(market: { closingOdds: number | null; currentOdds: number | null; oddsAmerican: number } | null) {
  return market?.closingOdds ?? market?.currentOdds ?? market?.oddsAmerican ?? null;
}

function sideMatches(side: string | null, selection: string | null, desired: "OVER" | "UNDER") {
  return String(side ?? selection ?? "").toUpperCase() === desired;
}

function findPropMarkets(markets: Array<{
  marketType: MarketType;
  playerId: string | null;
  side: string | null;
  selection: string;
  line: number | null;
  currentLine: number | null;
  closingLine: number | null;
  oddsAmerican: number;
  currentOdds: number | null;
  closingOdds: number | null;
}>, playerId: string, statKey: string, line: number | null) {
  const candidates = markets.filter((market) => {
    if (market.playerId !== playerId || String(market.marketType) !== statKey) return false;
    if (line === null) return true;
    const marketLine = market.closingLine ?? market.currentLine ?? market.line;
    return typeof marketLine === "number" && Math.abs(marketLine - line) < 0.01;
  });

  const over = candidates.find((market) => sideMatches(market.side, market.selection, "OVER")) ?? null;
  const under = candidates.find((market) => sideMatches(market.side, market.selection, "UNDER")) ?? null;
  return { over, under };
}

function marketNoVigOver(overOdds: number | null, underOdds: number | null) {
  if (overOdds === null || underOdds === null) return null;
  return removeTwoWayVig(overOdds, underOdds)?.left ?? null;
}

function summarizeBuckets(records: PlayerPropEvaluationRecord[], bucketOf: (record: PlayerPropEvaluationRecord) => string): BucketSummary[] {
  const groups = new Map<string, PlayerPropEvaluationRecord[]>();
  for (const record of records) {
    const key = bucketOf(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, bucketRecords]) => {
      const settled = bucketRecords.filter((record) => record.result === "WIN" || record.result === "LOSS");
      return {
        bucket,
        count: bucketRecords.length,
        hitRate: settled.length ? round(settled.filter((record) => record.result === "WIN").length / settled.length) : null,
        avgEdge: round(avg(bucketRecords.map((record) => record.modelEdgeProbability))),
        avgClvLine: round(avg(bucketRecords.map((record) => record.clvLine))),
        avgAbsError: round(avg(bucketRecords.map((record) => record.absoluteError))),
        brier: round(avg(bucketRecords.map((record) => record.brier)))
      };
    });
}

async function findGameForEvent(event: {
  externalEventId: string | null;
  startTime: Date;
  leagueId: string;
  participants: Array<{ role: string; competitor: { teamId: string | null } }>;
}) {
  if (event.externalEventId) {
    const exact = await prisma.game.findUnique({ where: { externalEventId: event.externalEventId } });
    if (exact) return exact;
  }

  const homeTeamId = event.participants.find((participant) => participant.role === "HOME")?.competitor.teamId ?? null;
  const awayTeamId = event.participants.find((participant) => participant.role === "AWAY")?.competitor.teamId ?? null;
  if (!homeTeamId || !awayTeamId) return null;

  const start = new Date(event.startTime.getTime() - 1000 * 60 * 60 * 18);
  const end = new Date(event.startTime.getTime() + 1000 * 60 * 60 * 18);
  return prisma.game.findFirst({
    where: {
      leagueId: event.leagueId,
      homeTeamId,
      awayTeamId,
      startTime: { gte: start, lte: end }
    },
    orderBy: { startTime: "desc" }
  });
}

async function buildPlayerPropRecords(events: Awaited<ReturnType<typeof loadSettledEvents>>) {
  const records: PlayerPropEvaluationRecord[] = [];

  for (const event of events) {
    const game = await findGameForEvent(event);
    if (!game) continue;

    const playerIds = Array.from(new Set(event.playerProjections.map((projection) => projection.playerId)));
    const playerStats = playerIds.length
      ? await prisma.playerGameStat.findMany({ where: { gameId: game.id, playerId: { in: playerIds } } })
      : [];
    const statsByPlayerId = new Map(playerStats.map((stat) => [stat.playerId, stat]));

    for (const projection of event.playerProjections) {
      const actual = statValue(projection.statKey, statsByPlayerId.get(projection.playerId)?.statsJson);
      if (actual === null) continue;

      const metadata = asRecord(projection.metadataJson);
      const metadataCalibration = asRecord(metadata.marketCalibration);
      const marketLine = getMarketLine(metadata) ?? readNumber(metadataCalibration.marketLine);
      const markets = findPropMarkets(event.markets, projection.playerId, projection.statKey, marketLine);
      const closingLine = getClosingLine(markets.over ?? markets.under);
      const overClosingOdds = getClosingOdds(markets.over);
      const underClosingOdds = getClosingOdds(markets.under);
      const marketOver = marketNoVigOver(overClosingOdds, underClosingOdds) ?? readNumber(metadataCalibration.marketNoVigOverProbability);
      const modelOver = hitProbabilityAtLine(projection.hitProbOver, marketLine) ?? readNumber(metadataCalibration.calibratedOverProbability) ?? readNumber(metadataCalibration.modelOverProbability);
      const modelEdge = modelOver !== null && marketOver !== null ? modelOver - marketOver : null;
      const modelPick = modelOver === null || marketLine === null ? "NONE" : modelOver >= 0.5 ? "OVER" : "UNDER";
      const result = marketLine === null
        ? "NO_LINE"
        : actual === marketLine
          ? "PUSH"
          : modelPick === "OVER"
            ? actual > marketLine ? "WIN" : "LOSS"
            : modelPick === "UNDER"
              ? actual < marketLine ? "WIN" : "LOSS"
              : "NO_LINE";
      const actualOver = marketLine === null || actual === marketLine ? null : actual > marketLine ? 1 : 0;
      const brier = modelOver !== null && actualOver !== null ? (modelOver - actualOver) ** 2 : null;
      const clvLine = marketLine !== null && closingLine !== null && modelPick !== "NONE"
        ? modelPick === "OVER"
          ? closingLine - marketLine
          : marketLine - closingLine
        : null;

      records.push({
        projectionId: projection.id,
        eventId: event.id,
        eventName: event.name,
        leagueKey: event.league.key,
        startTime: event.startTime.toISOString(),
        playerId: projection.playerId,
        playerName: projection.player.name,
        statKey: projection.statKey,
        actualValue: actual,
        modelMean: projection.meanValue,
        modelStdDev: projection.stdDev,
        marketLine,
        closingLine,
        modelOverProbability: modelOver,
        marketNoVigOverProbability: marketOver,
        modelEdgeProbability: modelEdge,
        modelPick,
        result,
        absoluteError: Math.abs(projection.meanValue - actual),
        squaredError: (projection.meanValue - actual) ** 2,
        brier,
        clvLine,
        confidence: readNumber(metadata.roleConfidence) ?? readNumber(metadataCalibration.confidence),
        metadata
      });
    }
  }

  return records;
}

function buildEventRecords(events: Awaited<ReturnType<typeof loadSettledEvents>>) {
  const records: EventEvaluationRecord[] = [];

  for (const event of events) {
    const result = event.eventResult;
    const projection = event.eventProjections[0];
    if (!result || !projection || typeof projection.winProbHome !== "number") continue;

    const homeCompetitorId = event.participants.find((participant) => participant.role === "HOME")?.competitorId ?? null;
    if (!homeCompetitorId || !result.winnerCompetitorId) continue;

    const actualHomeWin = result.winnerCompetitorId === homeCompetitorId ? 1 : 0;
    const modelHomeWinProbability = projection.winProbHome;
    const projectedSpreadHome = projection.projectedSpreadHome;
    const actualSpreadHome = typeof result.margin === "number"
      ? actualHomeWin === 1 ? result.margin : -result.margin
      : null;
    const projectedTotal = projection.projectedTotal;
    const actualTotal = result.totalPoints;

    records.push({
      projectionId: projection.id,
      eventId: event.id,
      eventName: event.name,
      leagueKey: event.league.key,
      startTime: event.startTime.toISOString(),
      modelHomeWinProbability,
      actualHomeWin: actualHomeWin as 0 | 1,
      modelPickedHome: modelHomeWinProbability >= 0.5,
      winnerCorrect: (modelHomeWinProbability >= 0.5) === (actualHomeWin === 1),
      brier: (modelHomeWinProbability - actualHomeWin) ** 2,
      logLoss: logLoss(modelHomeWinProbability, actualHomeWin as 0 | 1),
      projectedSpreadHome,
      actualSpreadHome,
      projectedTotal,
      actualTotal,
      spreadAbsError: projectedSpreadHome !== null && actualSpreadHome !== null ? Math.abs(projectedSpreadHome - actualSpreadHome) : null,
      totalAbsError: projectedTotal !== null && actualTotal !== null ? Math.abs(projectedTotal - actualTotal) : null
    });
  }

  return records;
}

async function loadSettledEvents(args: { leagueKey?: string | null; lookbackDays: number }) {
  return prisma.event.findMany({
    where: {
      status: "FINAL",
      resultState: "OFFICIAL",
      startTime: { gte: new Date(Date.now() - args.lookbackDays * 24 * 60 * 60 * 1000) },
      ...(args.leagueKey ? { league: { key: args.leagueKey } } : {})
    },
    include: {
      league: true,
      eventResult: true,
      participants: { include: { competitor: true } },
      markets: true,
      eventProjections: { orderBy: { createdAt: "desc" }, take: 1 },
      playerProjections: {
        include: { player: true },
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { startTime: "desc" },
    take: 1000
  });
}

function buildGuardrails(playerRecords: PlayerPropEvaluationRecord[], eventRecords: EventEvaluationRecord[]) {
  const warnings: string[] = [];
  if (playerRecords.length < 250) warnings.push(`Player prop sample below target (${playerRecords.length}/250).`);
  if (eventRecords.length < 150) warnings.push(`Event projection sample below target (${eventRecords.length}/150).`);
  if (playerRecords.filter((record) => record.marketLine !== null).length < 150) warnings.push("Player prop market-line sample is thin.");
  if (playerRecords.filter((record) => record.clvLine !== null).length < 100) warnings.push("Closing-line value sample is thin or unavailable.");
  return {
    warnings,
    minimumSamples: {
      playerProps: 250,
      events: 150
    }
  };
}

export async function rebuildModelEvaluationReport(args: { leagueKey?: string | null; lookbackDays?: number } = {}) {
  const leagueKey = args.leagueKey ?? null;
  const lookbackDays = Math.max(1, Math.min(365, args.lookbackDays ?? 90));
  const events = await loadSettledEvents({ leagueKey, lookbackDays });
  const [playerRecords, eventRecords] = await Promise.all([
    buildPlayerPropRecords(events),
    Promise.resolve(buildEventRecords(events))
  ]);
  const settledPlayerRecords = playerRecords.filter((record) => record.result === "WIN" || record.result === "LOSS");
  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    leagueKey,
    lookbackDays,
    playerProps: {
      sample: playerRecords.length,
      withLineSample: playerRecords.filter((record) => record.marketLine !== null).length,
      hitRate: settledPlayerRecords.length ? round(settledPlayerRecords.filter((record) => record.result === "WIN").length / settledPlayerRecords.length) : null,
      mae: round(avg(playerRecords.map((record) => record.absoluteError))),
      rmse: round(rmseFromSquaredErrors(playerRecords.map((record) => record.squaredError))),
      brier: round(avg(playerRecords.map((record) => record.brier))),
      avgModelEdge: round(avg(playerRecords.map((record) => record.modelEdgeProbability))),
      avgClvLine: round(avg(playerRecords.map((record) => record.clvLine))),
      byStatKey: summarizeBuckets(playerRecords, (record) => record.statKey),
      byEdgeBucket: summarizeBuckets(playerRecords, (record) => edgeBucket(record.modelEdgeProbability)),
      byConfidenceBucket: summarizeBuckets(playerRecords, (record) => confidenceBucket(record.confidence)),
      records: playerRecords.slice(0, 250)
    },
    events: {
      sample: eventRecords.length,
      winnerAccuracy: eventRecords.length ? round(eventRecords.filter((record) => record.winnerCorrect).length / eventRecords.length) : null,
      brier: round(avg(eventRecords.map((record) => record.brier))),
      logLoss: round(avg(eventRecords.map((record) => record.logLoss))),
      spreadMae: round(avg(eventRecords.map((record) => record.spreadAbsError))),
      totalMae: round(avg(eventRecords.map((record) => record.totalAbsError))),
      records: eventRecords.slice(0, 250)
    },
    guardrails: buildGuardrails(playerRecords, eventRecords)
  };

  const cacheKey = `model_evaluation_report:${leagueKey ?? "all"}:${lookbackDays}`;
  await prisma.trendCache.upsert({
    where: { cacheKey },
    update: {
      scope: "model_evaluation_report",
      filterJson: toJson({ leagueKey, lookbackDays }),
      payloadJson: toJson(report),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    },
    create: {
      cacheKey,
      scope: "model_evaluation_report",
      filterJson: toJson({ leagueKey, lookbackDays }),
      payloadJson: toJson(report),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });

  return report;
}

export async function getCachedModelEvaluationReports() {
  const reports = await prisma.trendCache.findMany({
    where: {
      scope: "model_evaluation_report",
      expiresAt: { gt: new Date() }
    },
    orderBy: { updatedAt: "desc" }
  });

  return reports.map((report) => report.payloadJson as EvaluationReport);
}
