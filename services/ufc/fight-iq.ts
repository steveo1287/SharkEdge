export type UfcPromotionTier = "ELITE" | "MAJOR" | "REGIONAL_PLUS" | "REGIONAL" | "AMATEUR" | "UNKNOWN";
export type UfcFightMethod = "KO_TKO" | "SUBMISSION" | "DECISION";
export type UfcDataQualityGrade = "A" | "B" | "C" | "D";
export type UfcConfidenceGrade = "LOW" | "MEDIUM" | "MEDIUM_HIGH" | "HIGH";

export type UfcRateStats = {
  sigStrikesLandedPerMin?: number | null;
  sigStrikesAbsorbedPerMin?: number | null;
  strikingDifferential?: number | null;
  sigStrikeAccuracyPct?: number | null;
  sigStrikeDefensePct?: number | null;
  knockdownsPer15?: number | null;
  takedownsPer15?: number | null;
  takedownAccuracyPct?: number | null;
  takedownDefensePct?: number | null;
  submissionAttemptsPer15?: number | null;
  controlTimePct?: number | null;
  getUpScore?: number | null;
};

export type UfcRecentForm = {
  finishWinsLast5?: number | null;
  finishLossesLast5?: number | null;
  round3WinRatePct?: number | null;
  cardioScore?: number | null;
  damageAbsorbedTrend?: number | null;
};

export type UfcFighterProfile = {
  id: string;
  name: string;
  age?: number | null;
  reachInches?: number | null;
  stance?: string | null;
  weightClass?: string | null;
  elo?: number | null;
  proWins?: number | null;
  proLosses?: number | null;
  proFights?: number | null;
  ufcFights?: number | null;
  roundsFought?: number | null;
  amateurWins?: number | null;
  amateurLosses?: number | null;
  opponentStrengthScore?: number | null;
  promotionTier?: UfcPromotionTier | null;
  combatBase?: string | null;
  manualScoutingTags?: string[] | null;
  stats?: UfcRateStats | null;
  recent?: UfcRecentForm | null;
};

export type UfcFightIqInput = {
  fightId: string;
  eventLabel: string;
  startTime?: string | null;
  scheduledRounds?: 3 | 5;
  fighterA: UfcFighterProfile;
  fighterB: UfcFighterProfile;
  market?: {
    fighterAOddsAmerican?: number | null;
    fighterBOddsAmerican?: number | null;
  } | null;
  source?: string | null;
};

export type UfcFightIqPrediction = {
  fightId: string;
  eventLabel: string;
  generatedAt: string;
  simulations: number;
  source: string;
  markovStates: string[];
  pick: {
    fighterId: string;
    fighterName: string;
    winProbability: number;
    fairOddsAmerican: number;
    confidenceGrade: UfcConfidenceGrade;
    dataQualityGrade: UfcDataQualityGrade;
  };
  fighters: {
    fighterA: UfcFighterResult;
    fighterB: UfcFighterResult;
  };
  modelBreakdown: {
    ratingProbabilityA: number;
    featureProbabilityA: number;
    markovProbabilityA: number;
    calibratedProbabilityA: number;
    winnerProbabilityGap: number;
  };
  methodProbabilities: Record<UfcFightMethod, number>;
  roundFinishProbabilities: Record<string, number>;
  edgePct: number | null;
  pathToVictory: string[];
  dangerFlags: string[];
  noFutureLeakagePolicy: string;
};

type UfcFighterResult = {
  id: string;
  name: string;
  winProbability: number;
  fairOddsAmerican: number;
  marketOddsAmerican: number | null;
  marketImpliedProbability: number | null;
  dataQualityGrade: UfcDataQualityGrade;
  coldStart: {
    active: boolean;
    reason: string | null;
    probabilityCap: number | null;
    confidenceCap: UfcConfidenceGrade | null;
  };
  scores: {
    rating: number;
    striking: number;
    grappling: number;
    finish: number;
    cardio: number;
    experience: number;
    prospect: number;
    composite: number;
  };
};

type UfcFightIqOptions = {
  simulations?: number;
  seed?: number;
};

type FighterState = {
  profile: UfcFighterProfile;
  result: UfcFighterResult;
};

const DEFAULT_SIMULATIONS = 25_000;
const MIN_SIMULATIONS = 250;
const MAX_SIMULATIONS = 100_000;

export const UFC_MARKOV_STATES = [
  "standing",
  "distance_striking",
  "clinch",
  "takedown_attempt",
  "takedown_success",
  "ground_control",
  "submission_threat",
  "scramble",
  "knockdown",
  "finish",
  "round_end",
  "decision"
];

function n(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function sigmoid(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function pct(value: number | null | undefined, fallback = 50) {
  return clamp(n(value, fallback), 0, 100) / 100;
}

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function americanOddsToImpliedProbability(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? round(100 / (odds + 100), 6) : round(Math.abs(odds) / (Math.abs(odds) + 100), 6);
}

export function probabilityToAmericanOdds(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  return p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

function tierScore(tier: UfcPromotionTier | null | undefined) {
  if (tier === "ELITE") return 0.18;
  if (tier === "MAJOR") return 0.12;
  if (tier === "REGIONAL_PLUS") return 0.07;
  if (tier === "REGIONAL") return 0.02;
  if (tier === "AMATEUR") return -0.02;
  return 0;
}

function ageCurve(age: number | null | undefined) {
  if (!age) return 0;
  if (age < 22) return -0.05;
  if (age <= 31) return 0.06;
  if (age <= 35) return 0.02;
  if (age <= 38) return -0.05;
  return -0.12;
}

function gradeRank(grade: UfcDataQualityGrade) {
  return grade === "A" ? 4 : grade === "B" ? 3 : grade === "C" ? 2 : 1;
}

function dataQuality(profile: UfcFighterProfile): UfcDataQualityGrade {
  const ufc = n(profile.ufcFights);
  const pro = n(profile.proFights, n(profile.proWins) + n(profile.proLosses));
  const rounds = n(profile.roundsFought);
  const hasRates = Boolean(profile.stats && Object.values(profile.stats).some((value) => typeof value === "number" && Number.isFinite(value)));
  const hasProspect = n(profile.amateurWins) + n(profile.amateurLosses) > 0 || Boolean(profile.promotionTier && profile.promotionTier !== "UNKNOWN");
  if (ufc >= 8 && rounds >= 24 && hasRates) return "A";
  if (ufc >= 4 && rounds >= 12 && hasRates) return "B";
  if ((ufc >= 2 || pro >= 8) && (hasRates || hasProspect)) return "C";
  return "D";
}

function coldStart(profile: UfcFighterProfile) {
  const ufc = n(profile.ufcFights);
  const pro = n(profile.proFights, n(profile.proWins) + n(profile.proLosses));
  if (ufc >= 3 && pro >= 8) return { active: false, reason: null, probabilityCap: null, confidenceCap: null as UfcConfidenceGrade | null };
  if (ufc === 0) return { active: true, reason: "No UFC sample. Amateur/prospect and opponent-strength priors are used, so the probability is capped.", probabilityCap: 0.58, confidenceCap: "LOW" as UfcConfidenceGrade };
  if (ufc <= 2) return { active: true, reason: "Limited UFC sample. Confidence is capped until more UFC-level evidence exists.", probabilityCap: 0.62, confidenceCap: "MEDIUM" as UfcConfidenceGrade };
  return { active: true, reason: "Limited pro sample. Prospect quality is included, but confidence is capped.", probabilityCap: 0.64, confidenceCap: "MEDIUM" as UfcConfidenceGrade };
}

function scores(profile: UfcFighterProfile) {
  const stats = profile.stats ?? {};
  const recent = profile.recent ?? {};
  const rating = (n(profile.elo, 1500) - 1500) / 400;
  const striking = n(stats.strikingDifferential, n(stats.sigStrikesLandedPerMin) - n(stats.sigStrikesAbsorbedPerMin)) * 0.13 + (pct(stats.sigStrikeAccuracyPct, 44) - 0.44) * 0.55 + (pct(stats.sigStrikeDefensePct, 54) - 0.54) * 0.65 + n(stats.knockdownsPer15) * 0.08 + (n(profile.opponentStrengthScore, 50) / 100 - 0.5) * 0.18;
  const grappling = n(stats.takedownsPer15) * 0.08 + (pct(stats.takedownAccuracyPct, 35) - 0.35) * 0.35 + (pct(stats.takedownDefensePct, 62) - 0.62) * 0.45 + n(stats.submissionAttemptsPer15) * 0.07 + (pct(stats.controlTimePct, 18) - 0.18) * 0.55 + n(stats.getUpScore) * 0.05;
  const proWins = Math.max(0, n(profile.proWins));
  const proFights = Math.max(1, n(profile.proFights, proWins + n(profile.proLosses)));
  const finish = clamp((proWins / proFights - 0.5) * 0.22 + n(recent.finishWinsLast5) * 0.05 - n(recent.finishLossesLast5) * 0.05 + n(stats.knockdownsPer15) * 0.08 + n(stats.submissionAttemptsPer15) * 0.06, -0.35, 0.45);
  const cardio = (pct(recent.round3WinRatePct, 50) - 0.5) * 0.4 + n(recent.cardioScore) * 0.08 - n(recent.damageAbsorbedTrend) * 0.04 + Math.min(30, n(profile.roundsFought)) / 30 * 0.08;
  const experience = Math.min(12, n(profile.ufcFights)) / 12 * 0.16 + Math.min(25, proFights) / 25 * 0.08 + Math.min(45, n(profile.roundsFought)) / 45 * 0.1;
  const amateurTotal = n(profile.amateurWins) + n(profile.amateurLosses);
  const prospect = (amateurTotal ? n(profile.amateurWins) / amateurTotal - 0.5 : 0) * 0.18 + (n(profile.opponentStrengthScore, 50) / 100 - 0.5) * 0.2 + tierScore(profile.promotionTier) + (profile.manualScoutingTags ?? []).filter((tag) => /wrestl|cardio|speed|power|bjj|sambo|kickbox|elite|defense/i.test(tag)).length * 0.025 - (profile.manualScoutingTags ?? []).filter((tag) => /gass|chin|reckless|low sample|padded|defensive hole|weight miss/i.test(tag)).length * 0.035;
  const composite = rating * 0.34 + striking * 0.2 + grappling * 0.19 + finish * 0.1 + cardio * 0.08 + experience * 0.06 + prospect * 0.03 + ageCurve(profile.age);
  return { rating, striking, grappling, finish, cardio, experience, prospect, composite };
}

function fighterState(profile: UfcFighterProfile): FighterState {
  return {
    profile,
    result: {
      id: profile.id,
      name: profile.name,
      winProbability: 0.5,
      fairOddsAmerican: 100,
      marketOddsAmerican: null,
      marketImpliedProbability: null,
      dataQualityGrade: dataQuality(profile),
      coldStart: coldStart(profile),
      scores: scores(profile)
    }
  };
}

function applyCaps(probA: number, fighterA: FighterState, fighterB: FighterState) {
  let capped = probA;
  if (fighterA.result.coldStart.probabilityCap != null && capped > fighterA.result.coldStart.probabilityCap) capped = fighterA.result.coldStart.probabilityCap;
  if (fighterB.result.coldStart.probabilityCap != null && capped < 1 - fighterB.result.coldStart.probabilityCap) capped = 1 - fighterB.result.coldStart.probabilityCap;
  return clamp(capped, 0.01, 0.99);
}

function simulateRound(probA: number, fighterA: FighterState, fighterB: FighterState, random: () => number) {
  const swing = (random() - 0.5) * 0.11 + (fighterA.result.scores.grappling - fighterB.result.scores.grappling) * 0.05 + (fighterA.result.scores.striking - fighterB.result.scores.striking) * 0.04;
  return random() < clamp(probA + swing, 0.02, 0.98) ? "A" : "B";
}

function runSim(probA: number, fighterA: FighterState, fighterB: FighterState, rounds: 3 | 5, simulations: number, seed: number) {
  const random = rng(seed);
  const wins = { A: 0, B: 0 };
  const methods: Record<UfcFightMethod, number> = { KO_TKO: 0, SUBMISSION: 0, DECISION: 0 };
  const roundFinishes: Record<string, number> = {};
  const finishA = clamp(0.065 + fighterA.result.scores.finish * 0.07 + fighterA.result.scores.striking * 0.03 + fighterA.result.scores.grappling * 0.025, 0.01, 0.18);
  const finishB = clamp(0.065 + fighterB.result.scores.finish * 0.07 + fighterB.result.scores.striking * 0.03 + fighterB.result.scores.grappling * 0.025, 0.01, 0.18);
  const subA = clamp(0.32 + fighterA.result.scores.grappling * 0.35 - fighterA.result.scores.striking * 0.1, 0.12, 0.68);
  const subB = clamp(0.32 + fighterB.result.scores.grappling * 0.35 - fighterB.result.scores.striking * 0.1, 0.12, 0.68);

  for (let i = 0; i < simulations; i += 1) {
    let scoreA = 0;
    let scoreB = 0;
    let done = false;
    for (let roundNo = 1; roundNo <= rounds && !done; roundNo += 1) {
      const exchanges = rounds === 5 ? 10 : 9;
      const fatigueA = roundNo >= 3 ? Math.max(0, -fighterA.result.scores.cardio) * 0.03 : 0;
      const fatigueB = roundNo >= 3 ? Math.max(0, -fighterB.result.scores.cardio) * 0.03 : 0;
      for (let exchange = 0; exchange < exchanges && !done; exchange += 1) {
        const exchangeWinner = simulateRound(probA, fighterA, fighterB, random);
        if (exchangeWinner === "A") scoreA += 1 + fighterA.result.scores.striking * 0.15 + fighterA.result.scores.grappling * 0.12;
        else scoreB += 1 + fighterB.result.scores.striking * 0.15 + fighterB.result.scores.grappling * 0.12;
        if (exchangeWinner === "A" && random() < (finishA + fatigueB) / exchanges) {
          wins.A += 1;
          const method: UfcFightMethod = random() < subA ? "SUBMISSION" : "KO_TKO";
          methods[method] += 1;
          roundFinishes[`R${roundNo}`] = (roundFinishes[`R${roundNo}`] ?? 0) + 1;
          done = true;
        } else if (exchangeWinner === "B" && random() < (finishB + fatigueA) / exchanges) {
          wins.B += 1;
          const method: UfcFightMethod = random() < subB ? "SUBMISSION" : "KO_TKO";
          methods[method] += 1;
          roundFinishes[`R${roundNo}`] = (roundFinishes[`R${roundNo}`] ?? 0) + 1;
          done = true;
        }
      }
    }
    if (!done) {
      const winner = scoreA - scoreB + (random() - 0.5) * 2.5 >= 0 ? "A" : "B";
      wins[winner] += 1;
      methods.DECISION += 1;
    }
  }

  const roundFinishProbabilities: Record<string, number> = {};
  for (let i = 1; i <= rounds; i += 1) roundFinishProbabilities[`R${i}`] = round((roundFinishes[`R${i}`] ?? 0) / simulations, 4);
  return {
    probabilityA: round(wins.A / simulations, 4),
    methodProbabilities: {
      KO_TKO: round(methods.KO_TKO / simulations, 4),
      SUBMISSION: round(methods.SUBMISSION / simulations, 4),
      DECISION: round(methods.DECISION / simulations, 4)
    },
    roundFinishProbabilities
  };
}

function confidence(probability: number, quality: UfcDataQualityGrade, caps: Array<UfcConfidenceGrade | null>): UfcConfidenceGrade {
  const gap = Math.abs(probability - 0.5);
  let grade: UfcConfidenceGrade = gap >= 0.18 && gradeRank(quality) >= 3 ? "HIGH" : gap >= 0.12 && gradeRank(quality) >= 2 ? "MEDIUM_HIGH" : gap >= 0.07 ? "MEDIUM" : "LOW";
  if (caps.includes("LOW")) grade = "LOW";
  else if (caps.includes("MEDIUM") && (grade === "HIGH" || grade === "MEDIUM_HIGH")) grade = "MEDIUM";
  return grade;
}

function pathToVictory(pick: FighterState, opponent: FighterState) {
  const reasons: string[] = [];
  if (pick.result.scores.rating > opponent.result.scores.rating + 0.06) reasons.push("Higher fighter-strength rating after opponent-quality adjustment.");
  if (pick.result.scores.striking > opponent.result.scores.striking + 0.05) reasons.push("Cleaner striking profile: differential, accuracy, defense, and knockdown threat point to the pick.");
  if (pick.result.scores.grappling > opponent.result.scores.grappling + 0.05) reasons.push("Grappling path is live through takedown pressure, control, submission threat, or get-up profile.");
  if (pick.result.scores.cardio > opponent.result.scores.cardio + 0.04) reasons.push("Late-round profile grades better, reducing decision and fatigue risk.");
  if (pick.result.scores.prospect > opponent.result.scores.prospect + 0.04) reasons.push("Prospect module likes amateur/pro data, promotion tier, scouting tags, or opponent-strength history.");
  return reasons.length ? reasons.slice(0, 5) : ["Projected edge is narrow; pick is driven by blended rating, feature, and Markov simulator agreement."];
}

function dangerFlags(fighterA: FighterState, fighterB: FighterState, finalProbA: number, source: string) {
  const flags: string[] = [];
  if (fighterA.result.coldStart.active) flags.push(`${fighterA.result.name}: ${fighterA.result.coldStart.reason}`);
  if (fighterB.result.coldStart.active) flags.push(`${fighterB.result.name}: ${fighterB.result.coldStart.reason}`);
  if (Math.abs(finalProbA - 0.5) < 0.06) flags.push("Probability gap is thin; avoid presenting this as a strong edge.");
  if (fighterA.result.dataQualityGrade === "D" || fighterB.result.dataQualityGrade === "D") flags.push("Low data quality. Needs UFCStats/Tapology/FightMatrix snapshots before full confidence.");
  if (/fallback|sim twin/i.test(source)) flags.push("Generic Sim Twin fallback is active. Replace fallback profiles with pre-fight UFC data snapshots for production accuracy.");
  return [...new Set(flags)].slice(0, 6);
}

export function buildUfcFightIqPrediction(input: UfcFightIqInput, options: UfcFightIqOptions = {}): UfcFightIqPrediction {
  const simulations = Math.floor(clamp(options.simulations ?? DEFAULT_SIMULATIONS, MIN_SIMULATIONS, MAX_SIMULATIONS));
  const seed = Math.floor(n(options.seed, 1287));
  const fighterA = fighterState(input.fighterA);
  const fighterB = fighterState(input.fighterB);
  const ratingProbabilityA = sigmoid(fighterA.result.scores.rating - fighterB.result.scores.rating);
  const featureProbabilityA = sigmoid(fighterA.result.scores.composite - fighterB.result.scores.composite);
  const preSimProbabilityA = applyCaps(ratingProbabilityA * 0.38 + featureProbabilityA * 0.62, fighterA, fighterB);
  const sim = runSim(preSimProbabilityA, fighterA, fighterB, input.scheduledRounds ?? 3, simulations, seed);
  const finalA = applyCaps(preSimProbabilityA * 0.45 + sim.probabilityA * 0.55, fighterA, fighterB);
  const probabilityA = round(finalA, 4);
  const probabilityB = round(1 - probabilityA, 4);
  fighterA.result.winProbability = probabilityA;
  fighterB.result.winProbability = probabilityB;
  fighterA.result.fairOddsAmerican = probabilityToAmericanOdds(probabilityA);
  fighterB.result.fairOddsAmerican = probabilityToAmericanOdds(probabilityB);
  fighterA.result.marketOddsAmerican = input.market?.fighterAOddsAmerican ?? null;
  fighterB.result.marketOddsAmerican = input.market?.fighterBOddsAmerican ?? null;
  fighterA.result.marketImpliedProbability = americanOddsToImpliedProbability(input.market?.fighterAOddsAmerican);
  fighterB.result.marketImpliedProbability = americanOddsToImpliedProbability(input.market?.fighterBOOddsAmerican ?? input.market?.fighterBOddsAmerican);
  const pick = probabilityA >= probabilityB ? fighterA : fighterB;
  const opponent = probabilityA >= probabilityB ? fighterB : fighterA;
  const weakestQuality = gradeRank(fighterA.result.dataQualityGrade) <= gradeRank(fighterB.result.dataQualityGrade) ? fighterA.result.dataQualityGrade : fighterB.result.dataQualityGrade;
  const edgePct = pick.result.marketImpliedProbability == null ? null : round((pick.result.winProbability - pick.result.marketImpliedProbability) * 100, 2);

  return {
    fightId: input.fightId,
    eventLabel: input.eventLabel,
    generatedAt: new Date().toISOString(),
    simulations,
    source: input.source ?? "ufc-fight-iq",
    markovStates: UFC_MARKOV_STATES,
    pick: {
      fighterId: pick.result.id,
      fighterName: pick.result.name,
      winProbability: pick.result.winProbability,
      fairOddsAmerican: pick.result.fairOddsAmerican,
      confidenceGrade: confidence(pick.result.winProbability, weakestQuality, [fighterA.result.coldStart.confidenceCap, fighterB.result.coldStart.confidenceCap]),
      dataQualityGrade: weakestQuality
    },
    fighters: { fighterA: fighterA.result, fighterB: fighterB.result },
    modelBreakdown: {
      ratingProbabilityA: round(ratingProbabilityA, 4),
      featureProbabilityA: round(featureProbabilityA, 4),
      markovProbabilityA: sim.probabilityA,
      calibratedProbabilityA: probabilityA,
      winnerProbabilityGap: round(Math.abs(probabilityA - probabilityB), 4)
    },
    methodProbabilities: sim.methodProbabilities,
    roundFinishProbabilities: sim.roundFinishProbabilities,
    edgePct,
    pathToVictory: pathToVictory(pick, opponent),
    dangerFlags: dangerFlags(fighterA, fighterB, probabilityA, input.source ?? "ufc-fight-iq"),
    noFutureLeakagePolicy: "All production UFC features must be built from snapshots captured at or before scheduled fight time. Do not compute historical features from post-fight records."
  };
}

function hashSeed(value: string) {
  return [...value].reduce((hash, char) => Math.imul(31, hash) + char.charCodeAt(0) | 0, 1287) >>> 0;
}

export function buildUfcFightIqFromSimTwin(twin: any, options: UfcFightIqOptions = {}) {
  const homeWinPct = clamp(n(twin?.base?.homeWinPct, 0.5), 0.01, 0.99);
  const awayWinPct = clamp(n(twin?.base?.awayWinPct, 1 - homeWinPct), 0.01, 0.99);
  const homeName = String(twin?.matchup?.home ?? "Fighter B");
  const awayName = String(twin?.matchup?.away ?? "Fighter A");
  const gameId = String(twin?.gameId ?? `${awayName}-vs-${homeName}`);
  return buildUfcFightIqPrediction({
    fightId: gameId,
    eventLabel: String(twin?.eventLabel ?? `${awayName} vs ${homeName}`),
    startTime: twin?.startTime ?? null,
    scheduledRounds: 3,
    source: "sim-twin-fallback+ufc-fight-iq",
    fighterA: {
      id: `${gameId}:A`,
      name: awayName,
      elo: 1500 + (awayWinPct - 0.5) * 420,
      proFights: 12,
      ufcFights: 3,
      roundsFought: 12,
      opponentStrengthScore: 52,
      promotionTier: "UNKNOWN",
      stats: { sigStrikesLandedPerMin: 3.1, sigStrikesAbsorbedPerMin: 3, strikingDifferential: (awayWinPct - 0.5) * 1.3, sigStrikeAccuracyPct: 44, sigStrikeDefensePct: 54, takedownDefensePct: 62, controlTimePct: 18 }
    },
    fighterB: {
      id: `${gameId}:B`,
      name: homeName,
      elo: 1500 + (homeWinPct - 0.5) * 420,
      proFights: 12,
      ufcFights: 3,
      roundsFought: 12,
      opponentStrengthScore: 52,
      promotionTier: "UNKNOWN",
      stats: { sigStrikesLandedPerMin: 3.1, sigStrikesAbsorbedPerMin: 3, strikingDifferential: (homeWinPct - 0.5) * 1.3, sigStrikeAccuracyPct: 44, sigStrikeDefensePct: 54, takedownDefensePct: 62, controlTimePct: 18 }
    }
  }, { seed: options.seed ?? hashSeed(gameId), simulations: options.simulations });
}
