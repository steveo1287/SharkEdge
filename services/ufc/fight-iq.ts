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
  last3Wins?: number | null;
  last5Wins?: number | null;
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
  heightInches?: number | null;
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

export type UfcFightMarket = {
  fighterAOddsAmerican?: number | null;
  fighterBOddsAmerican?: number | null;
};

export type UfcFightIqInput = {
  fightId: string;
  eventLabel: string;
  startTime?: string | null;
  scheduledRounds?: 3 | 5;
  fighterA: UfcFighterProfile;
  fighterB: UfcFighterProfile;
  market?: UfcFightMarket | null;
  source?: string | null;
};

export type UfcFightIqOptions = {
  simulations?: number;
  seed?: number;
};

export type UfcFightIqPrediction = {
  fightId: string;
  eventLabel: string;
  generatedAt: string;
  simulations: number;
  source: string;
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

type FighterModelState = {
  profile: UfcFighterProfile;
  result: UfcFighterResult;
};

type SimWinner = "A" | "B";

type SimFightResult = {
  winner: SimWinner;
  method: UfcFightMethod;
  round: number;
};

const DEFAULT_SIMULATIONS = 25_000;
const MAX_SIMULATIONS = 100_000;
const MIN_SIMULATIONS = 250;

function numeric(value: number | null | undefined, fallback = 0) {
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

function normalizePct(value: number | null | undefined, fallback = 50) {
  return clamp(numeric(value, fallback), 0, 100) / 100;
}

function mulberry32(seed: number) {
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
  if (odds > 0) return round(100 / (odds + 100), 6);
  return round(Math.abs(odds) / (Math.abs(odds) + 100), 6);
}

export function probabilityToAmericanOdds(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  if (p >= 0.5) return Math.round((-100 * p) / (1 - p));
  return Math.round((100 * (1 - p)) / p);
}

function promotionTierScore(tier: UfcPromotionTier | null | undefined) {
  if (tier === "ELITE") return 0.18;
  if (tier === "MAJOR") return 0.12;
  if (tier === "REGIONAL_PLUS") return 0.07;
  if (tier === "REGIONAL") return 0.02;
  if (tier === "AMATEUR") return -0.02;
  return 0;
}

function ageCurve(age: number | null | undefined) {
  if (!age || !Number.isFinite(age)) return 0;
  if (age < 22) return -0.05;
  if (age <= 31) return 0.06;
  if (age <= 35) return 0.02;
  if (age <= 38) return -0.05;
  return -0.12;
}

function dataQuality(profile: UfcFighterProfile): UfcDataQualityGrade {
  const ufcFights = numeric(profile.ufcFights);
  const proFights = numeric(profile.proFights, numeric(profile.proWins) + numeric(profile.proLosses));
  const rounds = numeric(profile.roundsFought);
  const hasRates = Boolean(profile.stats && Object.values(profile.stats).some((value) => typeof value === "number" && Number.isFinite(value)));
  const hasProspectData = numeric(profile.amateurWins) + numeric(profile.amateurLosses) > 0 || Boolean(profile.promotionTier && profile.promotionTier !== "UNKNOWN");

  if (ufcFights >= 8 && rounds >= 24 && hasRates) return "A";
  if (ufcFights >= 4 && rounds >= 12 && hasRates) return "B";
  if ((ufcFights >= 2 || proFights >= 8) && (hasRates || hasProspectData)) return "C";
  return "D";
}

function gradeRank(grade: UfcDataQualityGrade) {
  if (grade === "A") return 4;
  if (grade === "B") return 3;
  if (grade === "C") return 2;
  return 1;
}

function weakerGrade(left: UfcDataQualityGrade, right: UfcDataQualityGrade): UfcDataQualityGrade {
  return gradeRank(left) <= gradeRank(right) ? left : right;
}

function coldStart(profile: UfcFighterProfile) {
  const ufcFights = numeric(profile.ufcFights);
  const proFights = numeric(profile.proFights, numeric(profile.proWins) + numeric(profile.proLosses));
  const active = ufcFights < 3 || proFights < 8;
  if (!active) return { active: false, reason: null, probabilityCap: null, confidenceCap: null as UfcConfidenceGrade | null };

  if (ufcFights === 0) {
    return {
      active,
      reason: "No UFC sample. Amateur/prospect and opponent-strength priors are used, so the probability is capped.",
      probabilityCap: 0.58,
      confidenceCap: "LOW" as UfcConfidenceGrade
    };
  }

  if (ufcFights <= 2) {
    return {
      active,
      reason: "Limited UFC sample. The model can rank the side, but confidence is capped until more UFC-level evidence exists.",
      probabilityCap: 0.62,
      confidenceCap: "MEDIUM" as UfcConfidenceGrade
    };
  }

  return {
    active,
    reason: "Limited pro sample. Prospect quality is included, but confidence is capped.",
    probabilityCap: 0.64,
    confidenceCap: "MEDIUM" as UfcConfidenceGrade
  };
}

function ratingScore(profile: UfcFighterProfile) {
  return (numeric(profile.elo, 1500) - 1500) / 400;
}

function strikingScore(profile: UfcFighterProfile) {
  const stats = profile.stats ?? {};
  const diff = numeric(stats.strikingDifferential, numeric(stats.sigStrikesLandedPerMin) - numeric(stats.sigStrikesAbsorbedPerMin));
  const acc = normalizePct(stats.sigStrikeAccuracyPct, 44) - 0.44;
  const defense = normalizePct(stats.sigStrikeDefensePct, 54) - 0.54;
  const knockdowns = numeric(stats.knockdownsPer15) * 0.08;
  const opponent = numeric(profile.opponentStrengthScore, 50) / 100;
  return diff * 0.13 + acc * 0.55 + defense * 0.65 + knockdowns + (opponent - 0.5) * 0.18;
}

function grapplingScore(profile: UfcFighterProfile) {
  const stats = profile.stats ?? {};
  const tdVolume = numeric(stats.takedownsPer15) * 0.08;
  const tdAcc = normalizePct(stats.takedownAccuracyPct, 35) - 0.35;
  const tdDef = normalizePct(stats.takedownDefensePct, 62) - 0.62;
  const subThreat = numeric(stats.submissionAttemptsPer15) * 0.07;
  const control = normalizePct(stats.controlTimePct, 18) - 0.18;
  const getUps = numeric(stats.getUpScore) * 0.05;
  return tdVolume + tdAcc * 0.35 + tdDef * 0.45 + subThreat + control * 0.55 + getUps;
}

function finishScore(profile: UfcFighterProfile) {
  const proWins = Math.max(0, numeric(profile.proWins));
  const proFights = Math.max(1, numeric(profile.proFights, proWins + numeric(profile.proLosses)));
  const recent = profile.recent ?? {};
  const finishWins = numeric(recent.finishWinsLast5) * 0.05;
  const finishLosses = numeric(recent.finishLossesLast5) * -0.05;
  const knockdowns = numeric(profile.stats?.knockdownsPer15) * 0.08;
  const subs = numeric(profile.stats?.submissionAttemptsPer15) * 0.06;
  return clamp((proWins / proFights - 0.5) * 0.22 + finishWins + finishLosses + knockdowns + subs, -0.35, 0.45);
}

function cardioScore(profile: UfcFighterProfile) {
  const recent = profile.recent ?? {};
  const round3 = normalizePct(recent.round3WinRatePct, 50) - 0.5;
  const cardio = numeric(recent.cardioScore) * 0.08;
  const damageTrend = numeric(recent.damageAbsorbedTrend) * -0.04;
  const rounds = Math.min(30, numeric(profile.roundsFought)) / 30;
  return round3 * 0.4 + cardio + damageTrend + rounds * 0.08;
}

function experienceScore(profile: UfcFighterProfile) {
  const ufc = Math.min(12, numeric(profile.ufcFights)) / 12;
  const pro = Math.min(25, numeric(profile.proFights, numeric(profile.proWins) + numeric(profile.proLosses))) / 25;
  const rounds = Math.min(45, numeric(profile.roundsFought)) / 45;
  return ufc * 0.16 + pro * 0.08 + rounds * 0.1;
}

function prospectScore(profile: UfcFighterProfile) {
  const amateurWins = numeric(profile.amateurWins);
  const amateurLosses = numeric(profile.amateurLosses);
  const amateurTotal = amateurWins + amateurLosses;
  const amateurWinRate = amateurTotal > 0 ? amateurWins / amateurTotal - 0.5 : 0;
  const opponent = numeric(profile.opponentStrengthScore, 50) / 100 - 0.5;
  const tier = promotionTierScore(profile.promotionTier);
  const scoutingTags = profile.manualScoutingTags ?? [];
  const positiveTags = scoutingTags.filter((tag) => /wrestl|cardio|speed|power|bjj|sambo|kickbox|elite|defense/i.test(tag)).length;
  const negativeTags = scoutingTags.filter((tag) => /gass|chin|reckless|low sample|padded|defensive hole|weight miss/i.test(tag)).length;
  return amateurWinRate * 0.18 + opponent * 0.2 + tier + positiveTags * 0.025 - negativeTags * 0.035;
}

function buildFighterState(profile: UfcFighterProfile): FighterModelState {
  const scores = {
    rating: ratingScore(profile),
    striking: strikingScore(profile),
    grappling: grapplingScore(profile),
    finish: finishScore(profile),
    cardio: cardioScore(profile),
    experience: experienceScore(profile),
    prospect: prospectScore(profile),
    composite: 0
  };
  scores.composite = scores.rating * 0.34 + scores.striking * 0.2 + scores.grappling * 0.19 + scores.finish * 0.1 + scores.cardio * 0.08 + scores.experience * 0.06 + scores.prospect * 0.03 + ageCurve(profile.age);

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
      scores
    }
  };
}

function applyProbabilityCaps(probA: number, a: FighterModelState, b: FighterModelState) {
  let capped = probA;
  if (a.result.coldStart.probabilityCap != null && capped > a.result.coldStart.probabilityCap) capped = a.result.coldStart.probabilityCap;
  if (b.result.coldStart.probabilityCap != null && capped < 1 - b.result.coldStart.probabilityCap) capped = 1 - b.result.coldStart.probabilityCap;
  return clamp(capped, 0.01, 0.99);
}

function confidenceGrade(probability: number, quality: UfcDataQualityGrade, coldCaps: Array<UfcConfidenceGrade | null>): UfcConfidenceGrade {
  const gap = Math.abs(probability - 0.5);
  let grade: UfcConfidenceGrade = "LOW";
  if (gap >= 0.18 && gradeRank(quality) >= 3) grade = "HIGH";
  else if (gap >= 0.12 && gradeRank(quality) >= 2) grade = "MEDIUM_HIGH";
  else if (gap >= 0.07) grade = "MEDIUM";

  if (coldCaps.includes("LOW")) return "LOW";
  if (coldCaps.includes("MEDIUM") && (grade === "HIGH" || grade === "MEDIUM_HIGH")) return "MEDIUM";
  return grade;
}

function stateWeightedWinner(probA: number, a: FighterModelState, b: FighterModelState, rand: () => number) {
  const chaos = (rand() - 0.5) * 0.11;
  const grapplingSwing = (a.result.scores.grappling - b.result.scores.grappling) * 0.05;
  const strikingSwing = (a.result.scores.striking - b.result.scores.striking) * 0.04;
  return rand() < clamp(probA + chaos + grapplingSwing + strikingSwing, 0.02, 0.98) ? "A" : "B";
}

function simulateFight(probA: number, a: FighterModelState, b: FighterModelState, scheduledRounds: 3 | 5, rand: () => number): SimFightResult {
  let scoreA = 0;
  let scoreB = 0;
  const finishA = clamp(0.065 + a.result.scores.finish * 0.07 + a.result.scores.striking * 0.03 + a.result.scores.grappling * 0.025, 0.01, 0.18);
  const finishB = clamp(0.065 + b.result.scores.finish * 0.07 + b.result.scores.striking * 0.03 + b.result.scores.grappling * 0.025, 0.01, 0.18);
  const subBiasA = clamp(0.32 + a.result.scores.grappling * 0.35 - a.result.scores.striking * 0.1, 0.12, 0.68);
  const subBiasB = clamp(0.32 + b.result.scores.grappling * 0.35 - b.result.scores.striking * 0.1, 0.12, 0.68);

  for (let roundNo = 1; roundNo <= scheduledRounds; roundNo += 1) {
    const lateRoundFatigueA = roundNo >= 3 ? Math.max(0, -a.result.scores.cardio) * 0.03 : 0;
    const lateRoundFatigueB = roundNo >= 3 ? Math.max(0, -b.result.scores.cardio) * 0.03 : 0;
    const exchanges = scheduledRounds === 5 ? 10 : 9;

    for (let exchange = 0; exchange < exchanges; exchange += 1) {
      const stateWinner = stateWeightedWinner(probA, a, b, rand);
      if (stateWinner === "A") scoreA += 1 + a.result.scores.striking * 0.15 + a.result.scores.grappling * 0.12;
      else scoreB += 1 + b.result.scores.striking * 0.15 + b.result.scores.grappling * 0.12;

      const finishRollA = finishA + lateRoundFatigueB;
      const finishRollB = finishB + lateRoundFatigueA;
      if (stateWinner === "A" && rand() < finishRollA / exchanges) {
        return { winner: "A", method: rand() < subBiasA ? "SUBMISSION" : "KO_TKO", round: roundNo };
      }
      if (stateWinner === "B" && rand() < finishRollB / exchanges) {
        return { winner: "B", method: rand() < subBiasB ? "SUBMISSION" : "KO_TKO", round: roundNo };
      }
    }
  }

  const decisionNoise = (rand() - 0.5) * 2.5;
  const decisionScore = scoreA - scoreB + decisionNoise;
  if (decisionScore === 0) return { winner: rand() < probA ? "A" : "B", method: "DECISION", round: scheduledRounds };
  return { winner: decisionScore > 0 ? "A" : "B", method: "DECISION", round: scheduledRounds };
}

function runMarkovSim(args: { probA: number; fighterA: FighterModelState; fighterB: FighterModelState; scheduledRounds: 3 | 5; simulations: number; seed: number }) {
  const rand = mulberry32(args.seed);
  const wins = { A: 0, B: 0 };
  const methodCounts: Record<UfcFightMethod, number> = { KO_TKO: 0, SUBMISSION: 0, DECISION: 0 };
  const roundCounts: Record<string, number> = {};

  for (let i = 0; i < args.simulations; i += 1) {
    const result = simulateFight(args.probA, args.fighterA, args.fighterB, args.scheduledRounds, rand);
    wins[result.winner] += 1;
    methodCounts[result.method] += 1;
    if (result.method !== "DECISION") {
      const key = `R${result.round}`;
      roundCounts[key] = (roundCounts[key] ?? 0) + 1;
    }
  }

  const methodProbabilities = Object.fromEntries(
    Object.entries(methodCounts).map(([key, value]) => [key, round(value / args.simulations, 4)])
  ) as Record<UfcFightMethod, number>;

  const roundFinishProbabilities: Record<string, number> = {};
  for (let i = 1; i <= args.scheduledRounds; i += 1) {
    roundFinishProbabilities[`R${i}`] = round((roundCounts[`R${i}`] ?? 0) / args.simulations, 4);
  }

  return {
    probabilityA: round(wins.A / args.simulations, 4),
    methodProbabilities,
    roundFinishProbabilities
  };
}

function buildPathToVictory(pick: FighterModelState, opponent: FighterModelState) {
  const reasons: string[] = [];
  if (pick.result.scores.rating > opponent.result.scores.rating + 0.06) reasons.push("Higher fighter-strength rating after opponent-quality adjustment.");
  if (pick.result.scores.striking > opponent.result.scores.striking + 0.05) reasons.push("Cleaner striking profile: differential, accuracy, defense, and knockdown threat point to the pick.");
  if (pick.result.scores.grappling > opponent.result.scores.grappling + 0.05) reasons.push("Grappling path is live: takedown pressure, control, submission threat, or get-up profile grades better.");
  if (pick.result.scores.cardio > opponent.result.scores.cardio + 0.04) reasons.push("Late-round profile grades better, reducing decision and fatigue risk.");
  if (pick.result.scores.prospect > opponent.result.scores.prospect + 0.04) reasons.push("Prospect module likes amateur/pro data, promotion tier, scouting tags, or opponent-strength history.");
  if (!reasons.length) reasons.push("Projected edge is narrow; pick is driven by the blended rating, feature, and Markov simulator agreement.");
  return reasons.slice(0, 5);
}

function buildDangerFlags(a: FighterModelState, b: FighterModelState, finalProbA: number, source: string) {
  const flags: string[] = [];
  if (a.result.coldStart.active) flags.push(`${a.result.name}: ${a.result.coldStart.reason}`);
  if (b.result.coldStart.active) flags.push(`${b.result.name}: ${b.result.coldStart.reason}`);
  if (Math.abs(finalProbA - 0.5) < 0.06) flags.push("Probability gap is thin; avoid presenting this as a strong edge.");
  if (a.result.dataQualityGrade === "D" || b.result.dataQualityGrade === "D") flags.push("Low data quality. Needs UFCStats/Tapology/FightMatrix snapshots before full confidence.");
  if (/fallback|sim twin/i.test(source)) flags.push("Generic Sim Twin fallback is active. Replace fallback profiles with pre-fight UFC data snapshots for production accuracy.");
  return [...new Set(flags)].slice(0, 6);
}

export function buildUfcFightIqPrediction(input: UfcFightIqInput, options: UfcFightIqOptions = {}): UfcFightIqPrediction {
  const simulations = Math.floor(clamp(options.simulations ?? DEFAULT_SIMULATIONS, MIN_SIMULATIONS, MAX_SIMULATIONS));
  const seed = Math.floor(numeric(options.seed, 1287));
  const scheduledRounds = input.scheduledRounds ?? 3;
  const fighterA = buildFighterState(input.fighterA);
  const fighterB = buildFighterState(input.fighterB);

  const ratingProbabilityA = sigmoid(fighterA.result.scores.rating - fighterB.result.scores.rating);
  const featureProbabilityA = sigmoid(fighterA.result.scores.composite - fighterB.result.scores.composite);
  const preSimProbabilityA = applyProbabilityCaps(ratingProbabilityA * 0.38 + featureProbabilityA * 0.62, fighterA, fighterB);
  const sim = runMarkovSim({ probA: preSimProbabilityA, fighterA, fighterB, scheduledRounds, simulations, seed });
  const calibratedProbabilityA = applyProbabilityCaps(preSimProbabilityA * 0.45 + sim.probabilityA * 0.55, fighterA, fighterB);
  const probabilityB = round(1 - calibratedProbabilityA, 4);
  const probabilityA = round(calibratedProbabilityA, 4);

  fighterA.result.winProbability = probabilityA;
  fighterB.result.winProbability = probabilityB;
  fighterA.result.fairOddsAmerican = probabilityToAmericanOdds(probabilityA);
  fighterB.result.fairOddsAmerican = probabilityToAmericanOdds(probabilityB);
  fighterA.result.marketOddsAmerican = input.market?.fighterAOddsAmerican ?? null;
  fighterB.result.marketOddsAmerican = input.market?.fighterBOddsAmerican ?? null;
  fighterA.result.marketImpliedProbability = americanOddsToImpliedProbability(input.market?.fighterAOddsAmerican);
  fighterB.result.marketImpliedProbability = americanOddsToImpliedProbability(input.market?.fighterBOddsAmerican);

  const pick = probabilityA >= probabilityB ? fighterA : fighterB;
  const opponent = probabilityA >= probabilityB ? fighterB : fighterA;
  const pickMarketProbability = pick.result.marketImpliedProbability;
  const pickProbability = pick.result.winProbability;
  const edgePct = pickMarketProbability == null ? null : round((pickProbability - pickMarketProbability) * 100, 2);
  const weakestQuality = weakerGrade(fighterA.result.dataQualityGrade, fighterB.result.dataQualityGrade);

  return {
    fightId: input.fightId,
    eventLabel: input.eventLabel,
    generatedAt: new Date().toISOString(),
    simulations,
    source: input.source ?? "ufc-fight-iq",
    pick: {
      fighterId: pick.result.id,
      fighterName: pick.result.name,
      winProbability: pickProbability,
      fairOddsAmerican: pick.result.fairOddsAmerican,
      confidenceGrade: confidenceGrade(pickProbability, weakestQuality, [fighterA.result.coldStart.confidenceCap, fighterB.result.coldStart.confidenceCap]),
      dataQualityGrade: weakestQuality
    },
    fighters: {
      fighterA: fighterA.result,
      fighterB: fighterB.result
    },
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
    pathToVictory: buildPathToVictory(pick, opponent),
    dangerFlags: buildDangerFlags(fighterA, fighterB, probabilityA, input.source ?? "ufc-fight-iq"),
    noFutureLeakagePolicy: "All production UFC features must be built from snapshots captured at or before scheduled fight time. Do not compute historical features from post-fight records."
  };
}

export function buildUfcFightIqFromSimTwin(twin: any, options: UfcFightIqOptions = {}) {
  const homeWinPct = clamp(numeric(twin?.base?.homeWinPct, 0.5), 0.01, 0.99);
  const awayWinPct = clamp(numeric(twin?.base?.awayWinPct, 1 - homeWinPct), 0.01, 0.99);
  const homeName = String(twin?.matchup?.home ?? "Fighter B");
  const awayName = String(twin?.matchup?.away ?? "Fighter A");
  const homeElo = 1500 + (homeWinPct - 0.5) * 420;
  const awayElo = 1500 + (awayWinPct - 0.5) * 420;

  return buildUfcFightIqPrediction({
    fightId: String(twin?.gameId ?? `${awayName}-vs-${homeName}`),
    eventLabel: String(twin?.eventLabel ?? `${awayName} vs ${homeName}`),
    startTime: twin?.startTime ?? null,
    scheduledRounds: 3,
    source: "sim-twin-fallback+ufc-fight-iq",
    fighterA: {
      id: `${String(twin?.gameId ?? "ufc")}:A`,
      name: awayName,
      elo: awayElo,
      proFights: 12,
      ufcFights: 3,
      roundsFought: 12,
      opponentStrengthScore: 52,
      promotionTier: "UNKNOWN",
      stats: {
        sigStrikesLandedPerMin: 3.1,
        sigStrikesAbsorbedPerMin: 3,
        strikingDifferential: (awayWinPct - 0.5) * 1.3,
        sigStrikeAccuracyPct: 44,
        sigStrikeDefensePct: 54,
        takedownDefensePct: 62,
        controlTimePct: 18
      }
    },
    fighterB: {
      id: `${String(twin?.gameId ?? "ufc")}:B`,
      name: homeName,
      elo: homeElo,
      proFights: 12,
      ufcFights: 3,
      roundsFought: 12,
      opponentStrengthScore: 52,
      promotionTier: "UNKNOWN",
      stats: {
        sigStrikesLandedPerMin: 3.1,
        sigStrikesAbsorbedPerMin: 3,
        strikingDifferential: (homeWinPct - 0.5) * 1.3,
        sigStrikeAccuracyPct: 44,
        sigStrikeDefensePct: 54,
        takedownDefensePct: 62,
        controlTimePct: 18
      }
    }
  }, options);
}
