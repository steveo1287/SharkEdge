import { prisma } from "@/lib/db/prisma";
import { americanToImplied } from "@/lib/odds/index";
import { normalCdf } from "@/services/simulation/probability-math";
import { getCachedTeamPowerRating, type TeamPowerRatingProfile } from "@/services/stats/team-power-ratings";
import { buildPlayerLockImpactForEvent } from "@/services/simulation/player-lock-impact";
import { eloWinProbability, getCachedTeamElo } from "@/services/ratings/elo-rating-service";
import { getLatestGameOutcomeCalibration } from "@/services/evaluation/game-outcome-calibration-service";
import { buildMlbStarterAdjustedOutcome } from "@/services/simulation/mlb-starter-adjusted-outcome";
import { buildGamePickGate } from "@/services/simulation/game-pick-gate";

type EventProjectionLike = {
  eventId: string;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
  winProbAway: number;
  metadata?: Record<string, unknown> | null;
};

type TeamContext = {
  id: string;
  name: string;
  abbreviation: string;
} | null;

type MarketAnchor = {
  homeNoVigProbability: number;
  awayNoVigProbability: number;
  hold: number | null;
  bookCount: number;
  source: "paired_books" | "best_available";
};

type CalibrationRules = {
  marketBlendScale: number;
  modelBlendScale: number;
  eloBlendScale: number;
  maxModelDeviationFromMarket: number;
  confidenceScale: number;
  action: "TRUST" | "STANDARD" | "CAUTION" | "PASS_ONLY";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function readSpreadStd(metadata: Record<string, unknown>) {
  const simulation = asRecord(metadata.simulation);
  const distribution = asRecord(simulation.distribution ?? metadata.distribution);
  const spreadStdDev = typeof distribution.spreadStdDev === "number" ? distribution.spreadStdDev : null;
  return clamp(spreadStdDev ?? 12.5, 4, 24);
}

function noVigPair(homeOdds: number, awayOdds: number) {
  const home = americanToImplied(homeOdds);
  const away = americanToImplied(awayOdds);
  const total = home + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return { home: home / total, away: away / total, hold: total - 1 };
}

async function getMarketAnchor(eventId: string): Promise<MarketAnchor | null> {
  const markets = await prisma.eventMarket.findMany({
    where: { eventId, marketType: "moneyline", side: { in: ["home", "away"] } },
    orderBy: { updatedAt: "desc" },
    take: 80
  });
  if (!markets.length) return null;

  const byBook = new Map<string, { home?: number; away?: number }>();
  for (const market of markets) {
    const bookKey = market.sportsbookId ?? "unknown";
    const odds = typeof market.currentOdds === "number" ? market.currentOdds : market.oddsAmerican;
    const current = byBook.get(bookKey) ?? {};
    if (market.side === "home" && current.home === undefined) current.home = odds;
    if (market.side === "away" && current.away === undefined) current.away = odds;
    byBook.set(bookKey, current);
  }

  const paired = Array.from(byBook.values())
    .map((book) => (typeof book.home === "number" && typeof book.away === "number" ? noVigPair(book.home, book.away) : null))
    .filter((value): value is { home: number; away: number; hold: number } => Boolean(value));
  if (paired.length) {
    const home = average(paired.map((pair) => pair.home));
    const away = average(paired.map((pair) => pair.away));
    if (home !== null && away !== null) {
      return {
        homeNoVigProbability: round(home, 6),
        awayNoVigProbability: round(away, 6),
        hold: round(average(paired.map((pair) => pair.hold)) ?? 0, 6),
        bookCount: paired.length,
        source: "paired_books"
      };
    }
  }

  const homeMarket = markets.find((market) => market.side === "home");
  const awayMarket = markets.find((market) => market.side === "away");
  if (!homeMarket || !awayMarket) return null;
  const homeOdds = typeof homeMarket.currentOdds === "number" ? homeMarket.currentOdds : homeMarket.oddsAmerican;
  const awayOdds = typeof awayMarket.currentOdds === "number" ? awayMarket.currentOdds : awayMarket.oddsAmerican;
  const fallback = noVigPair(homeOdds, awayOdds);
  if (!fallback) return null;
  return {
    homeNoVigProbability: round(fallback.home, 6),
    awayNoVigProbability: round(fallback.away, 6),
    hold: round(fallback.hold, 6),
    bookCount: 1,
    source: "best_available"
  };
}

function powerScoreDelta(home: TeamPowerRatingProfile | null, away: TeamPowerRatingProfile | null) {
  if (!home || !away) return null;
  const powerDelta = home.powerScore - away.powerScore;
  const netDelta = (home.netRatingProxy ?? 0) - (away.netRatingProxy ?? 0);
  const formDelta = home.formScore - away.formScore;
  const consistencyDelta = home.consistencyScore - away.consistencyScore;
  const spreadDelta = clamp(powerDelta * 8.5 + netDelta * 0.055 + formDelta * 2.2 + consistencyDelta * 0.8, -7.5, 7.5);
  const totalDelta = clamp(((home.offensiveRatingProxy ?? 0) + (away.offensiveRatingProxy ?? 0) - (home.defensiveRatingProxy ?? 0) - (away.defensiveRatingProxy ?? 0)) * 0.015, -4, 4);
  return { powerDelta, netDelta, formDelta, consistencyDelta, spreadDelta, totalDelta, confidence: clamp((home.sampleSize + away.sampleSize) / 24, 0.15, 1) };
}

function applyScoreDelta(args: { homeScore: number; awayScore: number; homeSpreadDelta: number; totalDelta: number }) {
  return {
    homeScore: Math.max(0, args.homeScore + args.totalDelta / 2 + args.homeSpreadDelta / 2),
    awayScore: Math.max(0, args.awayScore + args.totalDelta / 2 - args.homeSpreadDelta / 2)
  };
}

function homeFieldEloForLeague(leagueKey: string) {
  return leagueKey === "MLB" ? 24 : leagueKey === "NBA" ? 55 : 45;
}

function defaultCalibrationRules(): CalibrationRules {
  return { marketBlendScale: 1, modelBlendScale: 1, eloBlendScale: 1, maxModelDeviationFromMarket: 0.16, confidenceScale: 1, action: "STANDARD" };
}

function blendProbabilities(args: {
  priorProb: number;
  marginProb: number;
  eloProb: number | null;
  marketAnchor: MarketAnchor | null;
  powerConfidence: number;
  lockConfidence: number;
  eloConfidence: number;
  calibrationRules: CalibrationRules;
}) {
  const rules = args.calibrationRules;
  const modelBlend = clamp((0.42 + args.powerConfidence * 0.12 + args.lockConfidence * 0.08) * rules.modelBlendScale, 0.28, 0.7);
  const modelProbRaw = clamp(args.priorProb * (1 - modelBlend) + args.marginProb * modelBlend, 0.02, 0.98);
  const modelProb = args.marketAnchor
    ? clamp(modelProbRaw, args.marketAnchor.homeNoVigProbability - rules.maxModelDeviationFromMarket, args.marketAnchor.homeNoVigProbability + rules.maxModelDeviationFromMarket)
    : modelProbRaw;
  const eloBlend = args.eloProb === null ? 0 : clamp((0.1 + args.eloConfidence * 0.14) * rules.eloBlendScale, 0.06, 0.28);
  const modelPlusEloRaw = clamp(args.eloProb === null ? modelProb : modelProb * (1 - eloBlend) + args.eloProb * eloBlend, 0.02, 0.98);
  const modelPlusElo = args.marketAnchor
    ? clamp(modelPlusEloRaw, args.marketAnchor.homeNoVigProbability - rules.maxModelDeviationFromMarket, args.marketAnchor.homeNoVigProbability + rules.maxModelDeviationFromMarket)
    : modelPlusEloRaw;
  const baseMarketConfidence = args.marketAnchor
    ? clamp(0.52 + Math.min(0.16, args.marketAnchor.bookCount * 0.025) - Math.max(0, (args.marketAnchor.hold ?? 0.04) - 0.045), 0.42, 0.72)
    : 0;
  const marketConfidence = args.marketAnchor ? clamp(baseMarketConfidence * rules.marketBlendScale, 0.35, 0.82) : 0;
  const finalProb = args.marketAnchor ? clamp(args.marketAnchor.homeNoVigProbability * marketConfidence + modelPlusElo * (1 - marketConfidence), 0.02, 0.98) : modelPlusElo;

  return { modelBlend, modelProb, eloBlend, modelPlusElo, marketConfidence, finalProb };
}

export async function applyGameOutcomePowerAdjustment<T extends EventProjectionLike>(args: { projection: T; leagueKey: string; homeTeam: TeamContext; awayTeam: TeamContext }) {
  if (!args.homeTeam || !args.awayTeam) return args.projection;

  const [homePower, awayPower, homeElo, awayElo, marketAnchor, calibration, playerLock, mlbStarter] = await Promise.all([
    getCachedTeamPowerRating(args.homeTeam.id),
    getCachedTeamPowerRating(args.awayTeam.id),
    getCachedTeamElo({ leagueKey: args.leagueKey, teamId: args.homeTeam.id }),
    getCachedTeamElo({ leagueKey: args.leagueKey, teamId: args.awayTeam.id }),
    getMarketAnchor(args.projection.eventId),
    getLatestGameOutcomeCalibration(args.leagueKey),
    buildPlayerLockImpactForEvent({ eventId: args.projection.eventId, homeTeamId: args.homeTeam.id, awayTeamId: args.awayTeam.id, homeTeamName: args.homeTeam.name, awayTeamName: args.awayTeam.name }),
    args.leagueKey === "MLB"
      ? buildMlbStarterAdjustedOutcome({ eventId: args.projection.eventId, homeTeamId: args.homeTeam.id, awayTeamId: args.awayTeam.id, homeTeamName: args.homeTeam.name, awayTeamName: args.awayTeam.name })
      : Promise.resolve(null)
  ]);

  const calibrationRules = calibration?.rules ?? defaultCalibrationRules();
  const power = powerScoreDelta(homePower, awayPower);
  const previousMetadata = asRecord(args.projection.metadata);
  const previousDrivers = Array.isArray(previousMetadata.drivers) ? previousMetadata.drivers.filter((value): value is string => typeof value === "string") : [];
  const simulation = asRecord(previousMetadata.simulation);
  const simulationDrivers = Array.isArray(simulation.drivers) ? simulation.drivers.filter((value): value is string => typeof value === "string") : [];

  let homeScore = args.projection.projectedHomeScore;
  let awayScore = args.projection.projectedAwayScore;
  let totalPowerSpreadDelta = 0;
  let totalPowerTotalDelta = 0;
  let starterSpreadDelta = 0;
  let starterTotalDelta = 0;
  const drivers: string[] = [];

  if (power) {
    const weight = clamp(0.22 + power.confidence * 0.16, 0.18, 0.38) * calibrationRules.confidenceScale;
    totalPowerSpreadDelta += power.spreadDelta * weight;
    totalPowerTotalDelta += power.totalDelta * weight;
    drivers.push(`Team power delta home ${round(power.powerDelta, 3)}, spread adjustment ${round(power.spreadDelta * weight, 2)}.`);
  } else drivers.push("Team power rating unavailable; no power adjustment applied.");

  if (mlbStarter?.available) {
    const starterWeight = clamp(0.48 + mlbStarter.confidence * 0.28, 0.35, 0.76) * calibrationRules.confidenceScale;
    starterSpreadDelta = mlbStarter.homeSpreadDelta * starterWeight;
    starterTotalDelta = mlbStarter.totalDelta * starterWeight;
    totalPowerSpreadDelta += starterSpreadDelta;
    totalPowerTotalDelta += starterTotalDelta;
    drivers.push(...mlbStarter.drivers.slice(0, 8));
  } else if (args.leagueKey === "MLB") {
    drivers.push("MLB starter-adjusted model unavailable; starter/run-environment deltas skipped.");
  }

  const eloProbBase = homeElo && awayElo ? eloWinProbability({ homeElo: homeElo.rating, awayElo: awayElo.rating, homeFieldElo: homeFieldEloForLeague(args.leagueKey) }) : null;
  const eloProb = eloProbBase !== null && mlbStarter?.available
    ? eloWinProbability({ homeElo: 1500 + mlbStarter.eloPointDelta, awayElo: 1500, homeFieldElo: (eloProbBase - 0.5) * 400 })
    : eloProbBase;
  const eloConfidenceBase = homeElo && awayElo ? clamp((homeElo.games + awayElo.games) / 120, 0.1, 1) : 0;
  const eloConfidence = mlbStarter?.available ? clamp(eloConfidenceBase * 0.75 + mlbStarter.confidence * 0.25, 0.1, 1) : eloConfidenceBase;
  if (eloProb !== null && homeElo && awayElo) drivers.push(`Elo home win probability ${round(eloProb, 3)} from ${round(homeElo.rating, 1)} vs ${round(awayElo.rating, 1)}.`);
  else drivers.push("Elo rating unavailable; no Elo win-probability blend applied.");

  if (marketAnchor) drivers.push(`Market anchor home no-vig probability ${round(marketAnchor.homeNoVigProbability, 3)} from ${marketAnchor.bookCount} book pair(s).`);
  else drivers.push("Market anchor unavailable; model blend used without moneyline baseline.");
  drivers.push(`Game outcome calibration action ${calibrationRules.action}; market scale ${calibrationRules.marketBlendScale}, model scale ${calibrationRules.modelBlendScale}.`);

  const lockWeight = clamp(0.55 + playerLock.confidence * 0.25, 0.45, 0.8) * calibrationRules.confidenceScale;
  const lockSpreadDelta = playerLock.homeSpreadDelta * lockWeight;
  const lockTotalDelta = playerLock.totalDelta * lockWeight;
  drivers.push(`Player lock spread adjustment ${round(lockSpreadDelta, 2)}; total adjustment ${round(lockTotalDelta, 2)}.`);
  drivers.push(...playerLock.drivers.slice(0, 8));

  const adjusted = applyScoreDelta({ homeScore, awayScore, homeSpreadDelta: totalPowerSpreadDelta + lockSpreadDelta, totalDelta: totalPowerTotalDelta + lockTotalDelta });
  homeScore = adjusted.homeScore;
  awayScore = adjusted.awayScore;

  const projectedSpreadHome = homeScore - awayScore;
  const projectedTotal = homeScore + awayScore;
  const spreadStdDev = readSpreadStd(previousMetadata);
  const marginProb = normalCdf(projectedSpreadHome, 0, spreadStdDev);
  const priorWinProb = typeof args.projection.winProbHome === "number" ? args.projection.winProbHome : 0.5;
  const ensemble = blendProbabilities({ priorProb: priorWinProb, marginProb, eloProb, marketAnchor, powerConfidence: power?.confidence ?? 0.25, lockConfidence: playerLock.confidence, eloConfidence, calibrationRules });
  const winProbHome = ensemble.finalProb;
  const gamePickGate = buildGamePickGate({
    leagueKey: args.leagueKey,
    finalWinProbHome: winProbHome,
    marketAnchor,
    calibration: calibration ? { sample: calibration.sample, rules: calibration.rules, warnings: calibration.warnings } : null,
    starterLock: mlbStarter?.lineupLock ?? null,
    powerConfidence: power?.confidence ?? 0.25,
    eloConfidence,
    playerLockConfidence: playerLock.confidence,
    modelPlusEloWinProbHome: ensemble.modelPlusElo
  });
  drivers.push(...gamePickGate.drivers);

  return {
    ...args.projection,
    projectedHomeScore: round(homeScore, 3),
    projectedAwayScore: round(awayScore, 3),
    projectedTotal: round(projectedTotal, 3),
    projectedSpreadHome: round(projectedSpreadHome, 3),
    winProbHome: round(winProbHome, 4),
    winProbAway: round(1 - winProbHome, 4),
    metadata: {
      ...previousMetadata,
      gameOutcomePowerAdjusted: true,
      gameOutcomeEnsembleVersion: "market_anchor_calibrated_starter_gate_v1",
      teamPower: { home: homePower, away: awayPower, powerDelta: power },
      mlbStarterAdjustedOutcome: mlbStarter,
      marketAnchor,
      gamePickGate,
      gameOutcomeCalibration: { generatedAt: calibration?.generatedAt ?? null, sample: calibration?.sample ?? 0, rules: calibrationRules, warnings: calibration?.warnings ?? [] },
      elo: { home: homeElo, away: awayElo, homeWinProbability: eloProb === null ? null : round(eloProb, 4), baseHomeWinProbability: eloProbBase === null ? null : round(eloProbBase, 4), confidence: round(eloConfidence, 4), blend: round(ensemble.eloBlend, 4) },
      playerLock,
      gameOutcomeAdjustments: {
        powerSpreadDelta: round(totalPowerSpreadDelta, 3),
        powerTotalDelta: round(totalPowerTotalDelta, 3),
        starterSpreadDelta: round(starterSpreadDelta, 3),
        starterTotalDelta: round(starterTotalDelta, 3),
        playerLockSpreadDelta: round(lockSpreadDelta, 3),
        playerLockTotalDelta: round(lockTotalDelta, 3),
        spreadStdDev,
        priorWinProbHome: round(priorWinProb, 4),
        marginWinProbHome: round(marginProb, 4),
        modelWinProbHome: round(ensemble.modelProb, 4),
        modelPlusEloWinProbHome: round(ensemble.modelPlusElo, 4),
        marketBlend: round(ensemble.marketConfidence, 4),
        finalWinProbHome: round(winProbHome, 4),
        winBlend: round(ensemble.modelBlend, 4)
      },
      drivers: Array.from(new Set([...previousDrivers, ...simulationDrivers, ...drivers]))
    }
  } as T;
}
