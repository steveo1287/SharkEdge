import type { LeagueKey } from "@/lib/types/domain";
import { getMlbLineupLock, type MlbLineupLock } from "@/services/simulation/mlb-lineup-locks";
import { getMlbNoVigMarket, type MlbNoVigMarket } from "@/services/simulation/mlb-market-sanity";
import { getMlbTeamPlayerSummary } from "@/services/simulation/mlb-player-model";
import { compareMlbPlayerHistory } from "@/services/simulation/mlb-player-history";
import { compareMlbProfiles, type MlbMatchupComparison } from "@/services/simulation/mlb-team-analytics";
import { compareMlbRatings } from "@/services/simulation/mlb-ratings-blend";
import { governMlbProjection, type MlbGovernorFeatures } from "@/services/simulation/mlb-intelligence-governor";
import { getCachedMlbCalibrationConformal, applyMlbCalibration, applyMlbConformalDecision } from "@/services/simulation/mlb-calibration-conformal";
import { buildRealitySimIntel, type RealitySimIntel } from "@/services/simulation/reality-sim-engine";
import { getNbaTeamPlayerProfileSummary } from "@/services/simulation/nba-player-profiles";
import { simulateNbaPlayerGameProjections, type NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";
import { buildSportOutcomeModel, type SportOutcomeModel } from "@/services/simulation/probability-models";

type SimProjectionInput = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
type GameStatSheetCategory = { key: string; label: string; away: number; home: number; format?: "number" | "decimal" | "percent" };
type GameStatSheet = { sport: LeagueKey; awayTeam: string; homeTeam: string; pace: number | null; possessions: number | null; categories: GameStatSheetCategory[]; notes: string[] };
type MlbFactor = { label: string; value: number };
type MlbRunProbabilityModel = {
  awayExpectedRuns: number;
  homeExpectedRuns: number;
  projectedTotal: number;
  pythagoreanHomeWinPct: number;
  poissonHomeWinPct: number;
  poissonTiePct: number;
  blendedHomeWinPct: number;
};

type SimProjection = {
  matchup: { away: string; home: string };
  distribution: { avgAway: number; avgHome: number; homeWinPct: number; awayWinPct: number };
  read: string;
  statSheet: GameStatSheet | null;
  nbaIntel: {
    modelVersion: string;
    dataSource: string;
    confidence: number;
    noBet: boolean;
    tier: "attack" | "watch" | "pass";
    reasons: string[];
    projectedTotal: number;
    volatilityIndex: number;
    playerStatProjections: NbaPlayerStatProjection[];
  } | null;
  realityIntel?: RealitySimIntel | null;
  mlbIntel?: {
    modelVersion: "mlb-intel-v6";
    dataSource: string;
    homeEdge: number;
    projectedTotal: number;
    runModel?: MlbRunProbabilityModel;
    volatilityIndex: number;
    factors: MlbFactor[];
    governor?: { source: string; confidence: number; noBet: boolean; tier: string; reasons: string[] };
    calibration?: { calibratedHomeWinPct: number; correction: number; ece: number | null };
    uncertainty?: { interval: { low: number; high: number; p90Low: number; p90High: number } | null; penalty: number; reason: string };
    market?: MlbNoVigMarket;
    lock?: {
      source: string;
      startersConfirmed: boolean;
      lineupsConfirmed: boolean;
      awayStarterName?: string | null;
      homeStarterName?: string | null;
      awayStarterThrows?: string;
      homeStarterThrows?: string;
      awayBattingOrder: string[];
      homeBattingOrder: string[];
      awayLateScratches: string[];
      homeLateScratches: string[];
      awayBullpenUsage: MlbLineupLock["awayBullpenUsage"];
      homeBullpenUsage: MlbLineupLock["homeBullpenUsage"];
      notes: string[];
    };
  } | null;
};

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function round(value: number, digits = 1) { return Number(value.toFixed(digits)); }
function parseMatchup(label: string) { const at = label.split(" @ "); if (at.length === 2) return { away: at[0]?.trim() || "Away", home: at[1]?.trim() || "Home" }; const vs = label.split(" vs "); if (vs.length === 2) return { away: vs[0]?.trim() || "Away", home: vs[1]?.trim() || "Home" }; return { away: "Away", home: "Home" }; }
function hashSeed(input: string) { let hash = 2166136261; for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function seeded(seed: number, shift: number) { const v = (seed ^ (shift * 1103515245)) >>> 0; return (v % 10000) / 10000; }
function scoreDecimals(leagueKey: LeagueKey) { return leagueKey === "NBA" || leagueKey === "NFL" || leagueKey === "NCAAF" ? 1 : 2; }
function safeDiv(value: number, divisor: number) { return divisor === 0 ? 0 : value / divisor; }
function byLabel(factors: MlbFactor[], label: string) { return factors.find((factor) => factor.label === label)?.value ?? 0; }
function leagueBaseline(leagueKey: LeagueKey) { switch (leagueKey) { case "NBA": return { away: 110, home: 113, spread: 1.8 }; case "MLB": return { away: 4.1, home: 4.35, spread: 0.25 }; case "NHL": return { away: 2.8, home: 3.1, spread: 0.25 }; case "NFL": return { away: 21.5, home: 23.1, spread: 1.1 }; case "NCAAF": return { away: 25, home: 27, spread: 1.3 }; case "UFC": case "BOXING": return { away: 0, home: 0, spread: 0 }; default: return { away: 10, home: 11, spread: 0.5 }; } }
function toNbaTier(confidence: number, edge: number, volatility: number): "attack" | "watch" | "pass" { if (confidence >= 0.68 && edge >= 0.06 && volatility <= 1.45) return "attack"; if (confidence >= 0.58 && edge >= 0.03 && volatility <= 1.7) return "watch"; return "pass"; }
function buildNbaGovernor(realityIntel: RealitySimIntel, homeWinPct: number, awayWinPct: number) {
  const edge = Math.abs(homeWinPct - awayWinPct);
  const reasons: string[] = [];
  const realModuleCount = realityIntel.modules.filter((module) => module.status === "real").length;
  if (realModuleCount < 2) reasons.push("Less than two real NBA feed modules available.");
  if (realityIntel.volatilityIndex > 1.65) reasons.push("Volatility is elevated for this matchup.");
  if (edge < 0.03) reasons.push("Win probability gap is too tight.");
  if (realityIntel.confidence < 0.58) reasons.push("Model confidence is below action threshold.");
  const tier = toNbaTier(realityIntel.confidence, edge, realityIntel.volatilityIndex);
  const noBet = tier === "pass" || reasons.length >= 2;
  return { confidence: realityIntel.confidence, noBet, tier: noBet ? "pass" as const : tier, reasons: reasons.length ? reasons : ["Signal quality is sufficient for simulated action."] };
}

function lockEdges(lock: MlbLineupLock) {
  const lockBoost = Number(((lock.lockScore - 0.5) * 1.45).toFixed(2));
  const handednessEdge = Number((lock.homeLineupHandednessEdge - lock.awayLineupHandednessEdge).toFixed(2));
  const bullpenUsageEdge = Number((lock.awayBullpenUsage.fatigueScore - lock.homeBullpenUsage.fatigueScore).toFixed(2));
  const lateScratchEdge = Number(((lock.awayLateScratches.length - lock.homeLateScratches.length) * 0.38).toFixed(2));
  const starterCertaintyEdge = Number((((lock.homeStarterLocked ? 1 : 0) - (lock.awayStarterLocked ? 1 : 0)) * 0.18).toFixed(2));
  const lineupCertaintyEdge = Number((((lock.homeLineupLocked ? 1 : 0) - (lock.awayLineupLocked ? 1 : 0)) * 0.18).toFixed(2));
  return { lockBoost, handednessEdge, bullpenUsageEdge, lateScratchEdge, starterCertaintyEdge, lineupCertaintyEdge };
}

function poissonProbability(mean: number, runs: number) {
  const safeMean = clamp(mean, 0.2, 14);
  let probability = Math.exp(-safeMean);
  for (let index = 1; index <= runs; index += 1) {
    probability *= safeMean / index;
  }
  return probability;
}

function poissonWinModel(awayExpectedRuns: number, homeExpectedRuns: number) {
  const maxRuns = 24;
  let homeWin = 0;
  let awayWin = 0;
  let tie = 0;
  const awayProbabilities = Array.from({ length: maxRuns + 1 }, (_, runs) => poissonProbability(awayExpectedRuns, runs));
  const homeProbabilities = Array.from({ length: maxRuns + 1 }, (_, runs) => poissonProbability(homeExpectedRuns, runs));

  for (let awayRuns = 0; awayRuns <= maxRuns; awayRuns += 1) {
    for (let homeRuns = 0; homeRuns <= maxRuns; homeRuns += 1) {
      const probability = awayProbabilities[awayRuns] * homeProbabilities[homeRuns];
      if (homeRuns > awayRuns) homeWin += probability;
      else if (awayRuns > homeRuns) awayWin += probability;
      else tie += probability;
    }
  }

  const covered = homeWin + awayWin + tie;
  if (covered > 0) {
    homeWin /= covered;
    awayWin /= covered;
    tie /= covered;
  }

  const extrasHomeWinPct = 0.52;
  return {
    homeWinPct: clamp(homeWin + tie * extrasHomeWinPct, 0.02, 0.98),
    awayWinPct: clamp(awayWin + tie * (1 - extrasHomeWinPct), 0.02, 0.98),
    tiePct: clamp(tie, 0, 0.25)
  };
}

function pythagoreanHomeWinPct(awayExpectedRuns: number, homeExpectedRuns: number) {
  const exponent = 1.83;
  const homePower = Math.pow(Math.max(0.2, homeExpectedRuns), exponent);
  const awayPower = Math.pow(Math.max(0.2, awayExpectedRuns), exponent);
  return clamp(homePower / Math.max(0.001, homePower + awayPower), 0.02, 0.98);
}

function xwobaExpectedRuns(args: {
  teamXwoba: number;
  opponentStarterEraMinus: number;
  opponentBullpenEraMinus: number;
  parkRunFactor: number;
  weatherRunFactor: number;
}) {
  const leagueAverageXwoba = 0.315;
  const leagueRunsPerTeam = 4.5;
  const offenseMultiplier = clamp(args.teamXwoba / leagueAverageXwoba, 0.72, 1.34);
  const opponentRunPreventionMultiplier = clamp((args.opponentStarterEraMinus * 0.62 + args.opponentBullpenEraMinus * 0.38) / 100, 0.72, 1.36);
  const runEnvironmentMultiplier = clamp(args.parkRunFactor * args.weatherRunFactor, 0.78, 1.26);
  return leagueRunsPerTeam * offenseMultiplier * opponentRunPreventionMultiplier * runEnvironmentMultiplier;
}

function buildMlbRunProbabilityModel(args: {
  comparison: MlbMatchupComparison;
  homeContextDelta: number;
  totalContextDelta: number;
}): MlbRunProbabilityModel {
  const parkRunFactor = clamp(args.comparison.home.parkRunFactor, 0.82, 1.2);
  const weatherRunFactor = clamp(args.comparison.home.weatherRunFactor, 0.82, 1.2);
  const awayAnchor = xwobaExpectedRuns({
    teamXwoba: args.comparison.away.xwoba,
    opponentStarterEraMinus: args.comparison.home.starterEraMinus,
    opponentBullpenEraMinus: args.comparison.home.bullpenEraMinus,
    parkRunFactor,
    weatherRunFactor
  });
  const homeAnchor = xwobaExpectedRuns({
    teamXwoba: args.comparison.home.xwoba,
    opponentStarterEraMinus: args.comparison.away.starterEraMinus,
    opponentBullpenEraMinus: args.comparison.away.bullpenEraMinus,
    parkRunFactor,
    weatherRunFactor
  });
  const totalLift = clamp(args.totalContextDelta, -1.4, 1.8);
  const sideDelta = clamp(args.homeContextDelta, -1.35, 1.35);
  const awayExpectedRuns = clamp(awayAnchor + totalLift / 2 - sideDelta / 2, 1.2, 11.5);
  const homeExpectedRuns = clamp(homeAnchor + totalLift / 2 + sideDelta / 2 + 0.08, 1.2, 11.5);
  const pythagorean = pythagoreanHomeWinPct(awayExpectedRuns, homeExpectedRuns);
  const poisson = poissonWinModel(awayExpectedRuns, homeExpectedRuns);
  const blendedHomeWinPct = clamp(poisson.homeWinPct * 0.65 + pythagorean * 0.35, 0.18, 0.82);

  return {
    awayExpectedRuns: Number(awayExpectedRuns.toFixed(3)),
    homeExpectedRuns: Number(homeExpectedRuns.toFixed(3)),
    projectedTotal: Number((awayExpectedRuns + homeExpectedRuns).toFixed(3)),
    pythagoreanHomeWinPct: Number(pythagorean.toFixed(4)),
    poissonHomeWinPct: Number(poisson.homeWinPct.toFixed(4)),
    poissonTiePct: Number(poisson.tiePct.toFixed(4)),
    blendedHomeWinPct: Number(blendedHomeWinPct.toFixed(4))
  };
}

async function buildMlbIntel(matchup: { away: string; home: string }, comparison: MlbMatchupComparison) {
  const [awayPlayers, homePlayers, lock, ratings, history, market] = await Promise.all([
    getMlbTeamPlayerSummary(matchup.away),
    getMlbTeamPlayerSummary(matchup.home),
    getMlbLineupLock(matchup.away, matchup.home),
    compareMlbRatings(matchup.away, matchup.home),
    compareMlbPlayerHistory(matchup.away, matchup.home),
    getMlbNoVigMarket(matchup.away, matchup.home)
  ]);
  const official = lockEdges(lock);
  const playerOffenseEdge = Number((homePlayers.offensivePlayerBoost - awayPlayers.offensivePlayerBoost).toFixed(2));
  const playerPitchingEdge = Number((homePlayers.pitchingPlayerBoost - awayPlayers.pitchingPlayerBoost).toFixed(2));
  const playerVolatility = Number(Math.max(0.85, Math.min(1.9, (homePlayers.volatilityBoost + awayPlayers.volatilityBoost) / 2)).toFixed(2));
  const availabilityEdge = Number((awayPlayers.availabilityDrag - homePlayers.availabilityDrag).toFixed(2));
  const ratingsEdge = Number((ratings.ratingEdge * 0.18).toFixed(2));
  const ratingsPitchingEdge = Number((ratings.pitchingRatingEdge * 0.08).toFixed(2));
  const ratingsLineupEdge = Number((ratings.lineupRatingEdge * 0.07).toFixed(2));
  const ratingsStarDepthEdge = Number((ratings.starDepthEdge * 0.06).toFixed(2));
  const ratingsFieldingEdge = Number((ratings.fieldingRatingEdge * 0.05).toFixed(2));
  const historyEdge = Number((history.historyEdge * 0.34).toFixed(2));
  const hitterHistoryEdge = Number((history.hitterHistoryEdge * 0.16).toFixed(2));
  const pitcherHistoryEdge = Number((history.pitcherHistoryEdge * 0.18).toFixed(2));
  const recentPlayerFormEdge = Number((history.recentFormEdge * 0.18).toFixed(2));
  const bullpenHistoryEdge = Number((history.bullpenHistoryEdge * 0.14).toFixed(2));
  const platoonHistoryEdge = Number((history.platoonHistoryEdge * 0.1).toFixed(2));
  const contactTrendEdge = Number((history.contactTrendEdge * 0.08).toFixed(2));
  const officialLockEdge = Number((official.lockBoost + official.handednessEdge * 0.65 + official.bullpenUsageEdge * 0.32 + official.lateScratchEdge + official.starterCertaintyEdge + official.lineupCertaintyEdge).toFixed(2));

  const homeEdge = Number((
    comparison.offensiveEdge * 0.2 + comparison.powerEdge * 0.13 + comparison.plateDisciplineEdge * 0.13 +
    comparison.startingPitchingEdge * 0.28 + comparison.bullpenEdge * 0.3 + comparison.defenseEdge * 0.1 +
    comparison.fatigueEdge * 0.14 + comparison.formEdge * 0.16 + playerOffenseEdge * 0.42 +
    playerPitchingEdge * 0.48 + availabilityEdge * 0.28 + officialLockEdge + ratingsEdge + ratingsPitchingEdge +
    ratingsLineupEdge + ratingsStarDepthEdge + ratingsFieldingEdge + historyEdge + hitterHistoryEdge +
    pitcherHistoryEdge + recentPlayerFormEdge + bullpenHistoryEdge + platoonHistoryEdge + contactTrendEdge
  ).toFixed(2));

  const runModel = buildMlbRunProbabilityModel({
    comparison,
    homeContextDelta: homeEdge * 0.18,
    totalContextDelta:
      Math.abs(comparison.powerEdge) * 0.08 +
      Math.abs(playerOffenseEdge) * 0.08 -
      Math.max(0, comparison.startingPitchingEdge + playerPitchingEdge + pitcherHistoryEdge) * 0.05 +
      (homePlayers.bullpenFatigue + awayPlayers.bullpenFatigue) * 0.12 +
      (lock.awayBullpenUsage.fatigueScore + lock.homeBullpenUsage.fatigueScore) * 0.12 +
      ratings.ratingRunEnvironment * 0.18 +
      Math.abs(history.recentFormEdge) * 0.04 +
      Math.abs(history.contactTrendEdge) * 0.03
  });
  const projectedTotal = Number(runModel.projectedTotal.toFixed(2));

  const volatilityIndex = Number(Math.max(0.7, Math.min(2.35,
    comparison.volatilityIndex * playerVolatility * lock.volatilityAdjustment * (1 + ratings.ratingConfidence * 0.25 + history.historyConfidence * 0.28)
  )).toFixed(2));

  const pitcherFeature = comparison.startingPitchingEdge + playerPitchingEdge + ratingsPitchingEdge + pitcherHistoryEdge + official.starterCertaintyEdge;
  const bullpenFeature = comparison.bullpenEdge + bullpenHistoryEdge + official.bullpenUsageEdge * 0.45;
  const features: MlbGovernorFeatures = {
    teamEdge: comparison.offensiveEdge + comparison.powerEdge + ratingsLineupEdge + recentPlayerFormEdge + official.handednessEdge,
    playerEdge: playerOffenseEdge + ratingsStarDepthEdge + hitterHistoryEdge + contactTrendEdge + official.lateScratchEdge,
    statcastEdge: comparison.powerEdge + contactTrendEdge,
    weatherEdge: comparison.parkWeatherEdge,
    pitcherEdge: pitcherFeature,
    bullpenEdge: bullpenFeature,
    lockEdge: official.lockBoost + official.starterCertaintyEdge + official.lineupCertaintyEdge,
    parkEdge: comparison.parkWeatherEdge,
    formEdge: comparison.formEdge + ratings.clutchRatingEdge * 0.04 + recentPlayerFormEdge,
    totalWeatherEdge: comparison.parkWeatherEdge,
    totalStatcastEdge: comparison.powerEdge + contactTrendEdge,
    totalPitchingEdge: pitcherFeature,
    totalParkEdge: comparison.parkWeatherEdge,
    totalBullpenEdge: bullpenFeature,
    marketHomeNoVigProbability: market.homeNoVigProbability,
    marketSource: market.source,
    marketHold: market.hold,
    marketHomeOddsAmerican: market.homeOddsAmerican,
    marketAwayOddsAmerican: market.awayOddsAmerican
  };

  const marketEdge = market.homeNoVigProbability == null ? 0 : Number((runModel.blendedHomeWinPct - market.homeNoVigProbability).toFixed(2));
  const factors: MlbFactor[] = [
    { label: "Live no-vig market sanity", value: marketEdge },
    { label: "Pythagorean home win", value: runModel.pythagoreanHomeWinPct },
    { label: "Poisson home win", value: runModel.poissonHomeWinPct },
    { label: "Poisson tie/extras rate", value: runModel.poissonTiePct },
    { label: "xwOBA run anchor total", value: runModel.projectedTotal },
    { label: "Official lineup/starter lock", value: official.lockBoost },
    { label: "Starter handedness vs lineup", value: official.handednessEdge },
    { label: "Recent bullpen usage", value: official.bullpenUsageEdge },
    { label: "Late scratches", value: official.lateScratchEdge },
    { label: "Starter confirmation", value: official.starterCertaintyEdge },
    { label: "Lineup confirmation", value: official.lineupCertaintyEdge },
    { label: "Team offense", value: comparison.offensiveEdge },
    { label: "Team power", value: comparison.powerEdge },
    { label: "Plate discipline", value: comparison.plateDisciplineEdge },
    { label: "Starting pitching", value: comparison.startingPitchingEdge },
    { label: "Bullpen", value: comparison.bullpenEdge },
    { label: "Recent team form", value: comparison.formEdge },
    { label: "Player offense", value: playerOffenseEdge },
    { label: "Player pitching", value: playerPitchingEdge },
    { label: "Availability", value: availabilityEdge },
    { label: "Park/weather", value: comparison.parkWeatherEdge },
    { label: "Bullpen fatigue", value: Number((homePlayers.bullpenFatigue - awayPlayers.bullpenFatigue).toFixed(2)) },
    { label: "Ratings overall", value: ratingsEdge },
    { label: "Ratings lineup", value: ratingsLineupEdge },
    { label: "Ratings pitching", value: ratingsPitchingEdge },
    { label: "Ratings star/depth", value: ratingsStarDepthEdge },
    { label: "Ratings fielding", value: ratingsFieldingEdge },
    { label: "History overall", value: historyEdge },
    { label: "History hitter vs starter", value: hitterHistoryEdge },
    { label: "History pitcher vs lineup", value: pitcherHistoryEdge },
    { label: "Recent player form", value: recentPlayerFormEdge },
    { label: "Recent bullpen form", value: bullpenHistoryEdge },
    { label: "Platoon history", value: platoonHistoryEdge },
    { label: "Hard contact trend", value: contactTrendEdge },
    ...ratings.factors.map((factor) => ({ label: factor.label, value: factor.value })),
    ...history.factors.map((factor) => ({ label: factor.label, value: factor.value }))
  ];

  return {
    modelVersion: "mlb-intel-v6" as const,
    dataSource: `${comparison.away.source}/${comparison.home.source}+team-analytics+player-model:${awayPlayers.source}/${homePlayers.source}+official-lock:${lock.source}+market:${market.source}+history:${history.away.source}/${history.home.source}+ratings:${ratings.away.source}/${ratings.home.source}`,
    homeEdge,
    projectedTotal,
    runModel,
    volatilityIndex,
    features,
    factors,
    market,
    lock: {
      source: lock.source,
      startersConfirmed: lock.awayStarterLocked && lock.homeStarterLocked,
      lineupsConfirmed: lock.awayLineupLocked && lock.homeLineupLocked,
      awayStarterName: lock.awayStarterName,
      homeStarterName: lock.homeStarterName,
      awayStarterThrows: lock.awayStarterThrows,
      homeStarterThrows: lock.homeStarterThrows,
      awayBattingOrder: lock.awayBattingOrder,
      homeBattingOrder: lock.homeBattingOrder,
      awayLateScratches: lock.awayLateScratches,
      homeLateScratches: lock.homeLateScratches,
      awayBullpenUsage: lock.awayBullpenUsage,
      homeBullpenUsage: lock.homeBullpenUsage,
      notes: lock.notes
    }
  };
}

function buildRealityDistribution(leagueKey: LeagueKey, base: ReturnType<typeof leagueBaseline>, realityIntel: RealitySimIntel): { avgAway: number; avgHome: number; homeWinPct: number; awayWinPct: number; outcomeModel: SportOutcomeModel } {
  if (leagueKey === "UFC" || leagueKey === "BOXING") {
    const outcomeModel = buildSportOutcomeModel({ league: leagueKey, awayScore: 0, homeScore: 0, homeSkillEdge: realityIntel.homeEdge, volatilityIndex: realityIntel.volatilityIndex });
    const homeWinPct = clamp(outcomeModel.blendedHomeWinPct, 0.12, 0.88);
    return { avgAway: 0, avgHome: 0, homeWinPct, awayWinPct: 1 - homeWinPct, outcomeModel };
  }
  const total = clamp(realityIntel.projectedTotal, leagueKey === "NHL" ? 3.8 : leagueKey === "NBA" ? 178 : leagueKey === "NFL" ? 28 : 32, leagueKey === "NHL" ? 9.2 : leagueKey === "NBA" ? 268 : leagueKey === "NFL" ? 71 : 86);
  const homeScore = clamp(total / 2 + base.spread * 0.35 + realityIntel.homeEdge * 0.42, 0.5, total - 0.5);
  const awayScore = clamp(total - homeScore, 0.5, total - 0.5);
  const outcomeModel = buildSportOutcomeModel({ league: leagueKey, awayScore, homeScore, homeSkillEdge: realityIntel.homeEdge, volatilityIndex: realityIntel.volatilityIndex });
  const homeWinPct = clamp(outcomeModel.blendedHomeWinPct, 0.12, 0.88);
  return { avgAway: awayScore, avgHome: homeScore, homeWinPct, awayWinPct: 1 - homeWinPct, outcomeModel };
}

function buildMlbStatSheet(matchup: { away: string; home: string }, distribution: { avgAway: number; avgHome: number }, mlbIntel: NonNullable<SimProjection["mlbIntel"]>): GameStatSheet {
  const awayRuns = distribution.avgAway;
  const homeRuns = distribution.avgHome;
  const offensiveEdge = byLabel(mlbIntel.factors, "Team offense");
  const pitchingEdge = byLabel(mlbIntel.factors, "Starting pitching");
  const powerEdge = byLabel(mlbIntel.factors, "Team power");
  const awayHits = round(awayRuns * 2.58 + Math.max(0, -offensiveEdge) * 0.32 + Math.max(0, pitchingEdge) * 0.25, 1);
  const homeHits = round(homeRuns * 2.58 + Math.max(0, offensiveEdge) * 0.32 + Math.max(0, -pitchingEdge) * 0.25, 1);
  const awayHr = round(Math.max(0.2, awayRuns * 0.27 + Math.max(0, -powerEdge) * 0.16), 1);
  const homeHr = round(Math.max(0.2, homeRuns * 0.27 + Math.max(0, powerEdge) * 0.16), 1);
  const awayBb = round(Math.max(1.5, awayRuns * 0.88 + Math.max(0, -byLabel(mlbIntel.factors, "Plate discipline")) * 0.4), 1);
  const homeBb = round(Math.max(1.5, homeRuns * 0.88 + Math.max(0, byLabel(mlbIntel.factors, "Plate discipline")) * 0.4), 1);
  const awaySo = round(Math.max(3, 10.2 - awayRuns * 0.5 + Math.max(0, pitchingEdge) * 0.3), 1);
  const homeSo = round(Math.max(3, 10.2 - homeRuns * 0.5 + Math.max(0, -pitchingEdge) * 0.3), 1);
  return { sport: "MLB", awayTeam: matchup.away, homeTeam: matchup.home, pace: null, possessions: null, categories: [
    { key: "runs", label: "Runs", away: round(awayRuns, 2), home: round(homeRuns, 2), format: "decimal" },
    { key: "hits", label: "Hits", away: awayHits, home: homeHits, format: "decimal" },
    { key: "home_runs", label: "Home Runs", away: awayHr, home: homeHr, format: "decimal" },
    { key: "walks", label: "Walks", away: awayBb, home: homeBb, format: "decimal" },
    { key: "strikeouts", label: "Strikeouts", away: awaySo, home: homeSo, format: "decimal" },
    { key: "bullpen_fatigue", label: "Bullpen Fatigue", away: mlbIntel.lock?.awayBullpenUsage.fatigueScore ?? 0, home: mlbIntel.lock?.homeBullpenUsage.fatigueScore ?? 0, format: "decimal" }
  ], notes: [
    "MLB stat sheet blends projected run distribution with official starter/lineup lock, hitter/pitcher stack, bullpen usage, live no-vig market sanity, and governor context.",
    mlbIntel.market?.available ? `Live no-vig market: home ${((mlbIntel.market.homeNoVigProbability ?? 0) * 100).toFixed(1)}% from ${mlbIntel.market.source}.` : "Live no-vig market unavailable for this matchup.",
    ...(mlbIntel.lock?.notes ?? [])
  ] };
}

function buildNbaStatSheet(matchup: { away: string; home: string }, distribution: { avgAway: number; avgHome: number }, realityIntel: RealitySimIntel, playerStatProjections: NbaPlayerStatProjection[]): GameStatSheet {
  const paceFactor = byLabel(realityIntel.factors as MlbFactor[], "Pace/tempo");
  const pace = round(clamp(95.5 + paceFactor * 1.8 + (realityIntel.projectedTotal - 224) / 6, 88, 109), 1);
  const possessions = round(clamp(pace * 1.01, 86, 112), 1);
  const awayPlayers = playerStatProjections.filter((row) => row.teamSide === "away");
  const homePlayers = playerStatProjections.filter((row) => row.teamSide === "home");
  const awayAssist = awayPlayers.reduce((sum, row) => sum + row.projectedAssists, 0);
  const homeAssist = homePlayers.reduce((sum, row) => sum + row.projectedAssists, 0);
  const awayReb = awayPlayers.reduce((sum, row) => sum + row.projectedRebounds, 0);
  const homeReb = homePlayers.reduce((sum, row) => sum + row.projectedRebounds, 0);
  const away3pm = awayPlayers.reduce((sum, row) => sum + row.projectedThrees, 0);
  const home3pm = homePlayers.reduce((sum, row) => sum + row.projectedThrees, 0);
  const awayFga = round(clamp(distribution.avgAway / 1.1 + away3pm * 0.8, 70, 102), 1);
  const homeFga = round(clamp(distribution.avgHome / 1.1 + home3pm * 0.8, 70, 102), 1);
  const awayFta = round(clamp(distribution.avgAway * 0.22, 9, 36), 1);
  const homeFta = round(clamp(distribution.avgHome * 0.22, 9, 36), 1);
  const awayTov = round(clamp(11.8, 8, 19), 1);
  const homeTov = round(clamp(11.8, 8, 19), 1);
  return { sport: "NBA", awayTeam: matchup.away, homeTeam: matchup.home, pace, possessions, categories: [
    { key: "points", label: "Points", away: round(distribution.avgAway, 1), home: round(distribution.avgHome, 1), format: "decimal" },
    { key: "off_rating", label: "Off Rating", away: round(safeDiv(distribution.avgAway, possessions) * 100, 1), home: round(safeDiv(distribution.avgHome, possessions) * 100, 1), format: "decimal" },
    { key: "possessions", label: "Possessions", away: possessions, home: possessions, format: "decimal" },
    { key: "assists", label: "Assists", away: round(awayAssist, 1), home: round(homeAssist, 1), format: "decimal" },
    { key: "rebounds", label: "Rebounds", away: round(awayReb, 1), home: round(homeReb, 1), format: "decimal" },
    { key: "turnovers", label: "Turnovers", away: awayTov, home: homeTov, format: "decimal" },
    { key: "three_pm", label: "3PM", away: round(away3pm, 1), home: round(home3pm, 1), format: "decimal" },
    { key: "fga", label: "FGA", away: awayFga, home: homeFga, format: "decimal" },
    { key: "fta", label: "FTA", away: awayFta, home: homeFta, format: "decimal" }
  ], notes: ["NBA stat sheet merges team-level reality engine outputs with possession-level player simulation totals."] };
}

export async function buildSimProjection(input: SimProjectionInput): Promise<SimProjection> {
  const matchup = parseMatchup(input.label);
  const base = leagueBaseline(input.leagueKey);
  const seed = hashSeed(`${input.id}:${input.startTime}:${input.leagueKey}:${input.status}`);
  const mlbComparison = input.leagueKey === "MLB" ? await compareMlbProfiles(matchup.away, matchup.home) : null;
  const mlbIntel = mlbComparison ? await buildMlbIntel(matchup, mlbComparison) : null;
  if (mlbIntel) {
    const rulesTotal = clamp(mlbIntel.projectedTotal, 5.4, 14.5);
    const rulesHomeWinPct = clamp(mlbIntel.runModel?.blendedHomeWinPct ?? 0.5, 0.24, 0.78);
    const governed = await governMlbProjection({ rulesHomeWinPct, rulesProjectedTotal: rulesTotal, volatilityIndex: mlbIntel.volatilityIndex, features: mlbIntel.features });
    const calibration = await getCachedMlbCalibrationConformal();
    const calibrated = applyMlbCalibration(calibration ?? null, governed.homeWinPct);
    const conformal = applyMlbConformalDecision(calibration ?? null, { probability: calibrated.calibratedProbability, projectedTotal: governed.projectedTotal, confidence: governed.confidence });
    const finalHomeWinPct = clamp(calibrated.calibratedProbability, 0.24, 0.78);
    const finalAwayWinPct = 1 - finalHomeWinPct;
    const total = clamp(governed.projectedTotal, 5.4, 14.5);
    const homeRunShare = mlbIntel.runModel ? mlbIntel.runModel.homeExpectedRuns / Math.max(0.001, mlbIntel.runModel.projectedTotal) : 0.51;
    const homeExpected = clamp(total * homeRunShare, 1.2, 11.5);
    const awayExpected = clamp(total - homeExpected, 1.2, 11.5);
    const lockReasons = mlbIntel.lock?.notes ?? [];
    const marketReason = mlbIntel.market?.available ? `Market home no-vig ${((mlbIntel.market.homeNoVigProbability ?? 0) * 100).toFixed(1)}%.` : "Market sanity unavailable.";
    const runModelReason = mlbIntel.runModel ? `Run model: Pyth ${((mlbIntel.runModel.pythagoreanHomeWinPct) * 100).toFixed(1)}%, Poisson ${((mlbIntel.runModel.poissonHomeWinPct) * 100).toFixed(1)}%, extras tie rate ${((mlbIntel.runModel.poissonTiePct) * 100).toFixed(1)}%.` : "Run model unavailable.";
    const read = governed.noBet ? `PASS: model confidence is not strong enough. ${lockReasons[0] ?? marketReason} ${runModelReason}` : finalHomeWinPct >= finalAwayWinPct ? `${matchup.home} cleared ${governed.tier.toUpperCase()} tier with xwOBA run anchoring, Pythagorean/Poisson win probability, official starter/lineup lock, live no-vig market sanity, and calibration checks.` : `${matchup.away} cleared ${governed.tier.toUpperCase()} tier with xwOBA run anchoring, Pythagorean/Poisson win probability, official starter/lineup lock, live no-vig market sanity, and calibration checks.`;
    const statSheet = buildMlbStatSheet(matchup, { avgAway: awayExpected, avgHome: homeExpected }, mlbIntel);
    return { matchup, distribution: { avgAway: Number(awayExpected.toFixed(2)), avgHome: Number(homeExpected.toFixed(2)), homeWinPct: Number(finalHomeWinPct.toFixed(3)), awayWinPct: Number(finalAwayWinPct.toFixed(3)) }, read, statSheet, nbaIntel: null, realityIntel: null, mlbIntel: { ...mlbIntel, projectedTotal: total, governor: { source: governed.source, confidence: conformal.calibratedConfidence, noBet: governed.noBet || conformal.calibratedConfidence < 0.6, tier: conformal.calibratedConfidence < 0.6 ? "pass" : governed.tier, reasons: [...(mlbIntel.lock?.notes ?? []), marketReason, ...governed.reasons, conformal.reason] }, calibration: { calibratedHomeWinPct: finalHomeWinPct, correction: calibrated.correction, ece: calibration?.ok ? calibration.ece : null }, uncertainty: { interval: conformal.interval, penalty: conformal.uncertaintyPenalty, reason: conformal.reason } } };
  }

  const [realityIntel, nbaProfiles] = await Promise.all([buildRealitySimIntel(input.leagueKey, matchup), input.leagueKey === "NBA" ? Promise.all([getNbaTeamPlayerProfileSummary(matchup.away), getNbaTeamPlayerProfileSummary(matchup.home)]) : Promise.resolve(null)]);
  if (realityIntel) {
    const reality = buildRealityDistribution(input.leagueKey, base, realityIntel);
    const decimals = scoreDecimals(input.leagueKey);
    const realityWithOutcome = { ...realityIntel, outcomeModel: reality.outcomeModel };
    const favorite = reality.homeWinPct >= reality.awayWinPct ? matchup.home : matchup.away;
    const favoritePct = Math.max(reality.homeWinPct, reality.awayWinPct);
    const realModules = realityIntel.modules.filter((module) => module.status === "real").length;
    const nbaGovernor = input.leagueKey === "NBA" ? buildNbaGovernor(realityIntel, reality.homeWinPct, reality.awayWinPct) : null;
    const outcomeReason = `Outcome ensemble: Bradley-Terry ${((reality.outcomeModel.bradleyTerryHomeWinPct) * 100).toFixed(1)}%${reality.outcomeModel.marginLogisticHomeWinPct == null ? "" : `, margin-logit ${((reality.outcomeModel.marginLogisticHomeWinPct) * 100).toFixed(1)}%`}${reality.outcomeModel.poissonHomeWinPct == null ? "" : `, Poisson ${((reality.outcomeModel.poissonHomeWinPct) * 100).toFixed(1)}%`}.`;
    const read = input.leagueKey === "NBA" && nbaGovernor ? nbaGovernor.noBet ? `PASS: ${favorite} has a ${(favoritePct * 100).toFixed(1)}% edge but NBA governor flagged low reliability (${nbaGovernor.reasons[0]}). ${outcomeReason}` : `${favorite} leads at ${(favoritePct * 100).toFixed(1)}% with ${nbaGovernor.tier.toUpperCase()} conviction. Model uses team, player, advanced, ratings, context feeds, and ${outcomeReason}` : `${favorite} leads the reality sim at ${(favoritePct * 100).toFixed(1)}%. Weighted model uses team stats, player impact, advanced analytics, video-game ratings, venue/rest context, ${realModules}/3 real feed modules, and ${outcomeReason}`;
    const nbaPlayerProjections = input.leagueKey === "NBA" && nbaProfiles ? await simulateNbaPlayerGameProjections({ awaySummary: nbaProfiles[0], homeSummary: nbaProfiles[1], projectedTotal: realityIntel.projectedTotal, volatilityIndex: realityIntel.volatilityIndex, confidence: nbaGovernor?.confidence ?? realityIntel.confidence, seedKey: `${input.id}:${input.startTime}:${matchup.away}:${matchup.home}` }) : [];
    return { matchup, distribution: { avgAway: Number(reality.avgAway.toFixed(decimals)), avgHome: Number(reality.avgHome.toFixed(decimals)), homeWinPct: Number(reality.homeWinPct.toFixed(3)), awayWinPct: Number(reality.awayWinPct.toFixed(3)) }, read, statSheet: input.leagueKey === "NBA" ? buildNbaStatSheet(matchup, { avgAway: reality.avgAway, avgHome: reality.avgHome }, realityWithOutcome, nbaPlayerProjections) : null, nbaIntel: input.leagueKey === "NBA" && nbaGovernor ? { modelVersion: realityIntel.modelVersion, dataSource: realityIntel.dataSource, confidence: nbaGovernor.confidence, noBet: nbaGovernor.noBet, tier: nbaGovernor.tier, reasons: [...nbaGovernor.reasons, ...reality.outcomeModel.notes], projectedTotal: realityIntel.projectedTotal, volatilityIndex: realityIntel.volatilityIndex, playerStatProjections: nbaPlayerProjections } : null, realityIntel: realityWithOutcome, mlbIntel: null };
  }

  const awayJitter = (seeded(seed, 1) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const homeJitter = (seeded(seed, 2) - 0.5) * (input.leagueKey === "NBA" ? 18 : 2.2);
  const spreadBias = (seeded(seed, 3) - 0.5) * 8 + base.spread;
  const avgAway = Number((base.away + awayJitter).toFixed(scoreDecimals(input.leagueKey)));
  const avgHome = Number((base.home + homeJitter).toFixed(scoreDecimals(input.leagueKey)));
  const homeWinPct = clamp(0.5 + spreadBias / 20, 0.05, 0.95);
  const awayWinPct = clamp(1 - homeWinPct, 0.05, 0.95);
  const volatility = seeded(seed, 4);
  const confidence = 1 - volatility;
  const read = homeWinPct >= 0.58 ? `${matchup.home} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.` : awayWinPct >= 0.58 ? `${matchup.away} project as the stronger side. Confidence ${(confidence * 100).toFixed(0)}%.` : `Tight simulated matchup. Confidence ${(confidence * 100).toFixed(0)}%.`;
  return { matchup, distribution: { avgAway, avgHome, homeWinPct: Number(homeWinPct.toFixed(3)), awayWinPct: Number(awayWinPct.toFixed(3)) }, read, statSheet: null, nbaIntel: null, realityIntel: null, mlbIntel: null };
}
