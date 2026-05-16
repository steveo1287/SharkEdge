import type { UfcFighterSkillProfile } from "@/services/ufc/fighter-skill-profile";

export type UfcRoundByRoundFightResult = {
  engine: "round_by_round";
  simulations: number;
  seed: number;
  scheduledRounds: 3 | 5;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  methodProbabilities: {
    KO_TKO: number;
    SUBMISSION: number;
    DECISION: number;
  };
  roundFinishProbabilities: Record<string, number>;
  transitionProbabilities: Record<string, number>;
  averageFightLengthSeconds: number;
  averageDamage: { fighterA: number; fighterB: number };
  averageControlSeconds: { fighterA: number; fighterB: number };
  averageKnockdowns: { fighterA: number; fighterB: number };
  diagnosticProbabilities: {
    paceA: number;
    paceB: number;
    strikingEdgeA: number;
    grapplingEdgeA: number;
    finishPressureA: number;
    finishPressureB: number;
    decisionEdgeA: number;
  };
  pathSummary: string[];
  dangerFlags: string[];
};

type Options = {
  simulations?: number;
  seed?: number;
  scheduledRounds?: 3 | 5;
};

type FighterRuntime = {
  strikingOffense: number;
  strikingDefense: number;
  power: number;
  pressure: number;
  distance: number;
  takedownOffense: number;
  takedownDefense: number;
  control: number;
  getUps: number;
  submissionThreat: number;
  submissionDefense: number;
  grapplingDefense: number;
  cardioEarly: number;
  cardioLate: number;
  stamina: number;
  chin: number;
  recovery: number;
  heart: number;
  fightIq: number;
  experience: number;
  coldStart: boolean;
};

const DEFAULT_SIMULATIONS = 25_000;

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function skill(value: number | null | undefined, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, 0, 100) : fallback;
}

function runtime(profile: UfcFighterSkillProfile): FighterRuntime {
  return {
    strikingOffense: skill(profile.striking.offense),
    strikingDefense: skill(profile.striking.defense),
    power: skill(profile.striking.power),
    pressure: skill(profile.striking.pressure),
    distance: skill(profile.striking.distanceManagement),
    takedownOffense: skill(profile.wrestling.takedownOffense),
    takedownDefense: skill(profile.wrestling.takedownDefense),
    control: skill(profile.wrestling.control),
    getUps: skill(profile.wrestling.getUps),
    submissionThreat: skill(profile.grappling.submissionThreat),
    submissionDefense: skill(profile.grappling.submissionDefense),
    grapplingDefense: skill(profile.grappling.grapplingDefense),
    cardioEarly: skill(profile.cardio.earlyPace),
    cardioLate: skill(profile.cardio.latePace),
    stamina: skill(profile.cardio.stamina),
    chin: skill(profile.durability.chin),
    recovery: skill(profile.durability.recovery),
    heart: skill(profile.durability.heart),
    fightIq: skill(profile.intangibles.fightIq),
    experience: skill(profile.intangibles.experience),
    coldStart: profile.prospect.coldStartActive || profile.sampleQuality === "D"
  };
}

function fatigue(profile: FighterRuntime, roundNo: number, scheduledRounds: 3 | 5) {
  const roundPressureTax = (100 - profile.stamina) / 100;
  const roundIndex = roundNo - 1;
  const championshipTax = scheduledRounds === 5 && roundNo >= 4 ? 0.08 : 0;
  const lateBonus = (profile.cardioLate - 50) / 1000 * roundIndex;
  return clamp(1 - roundIndex * (0.055 + roundPressureTax * 0.055) - championshipTax + lateBonus, 0.68, 1.08);
}

function normalish(random: () => number) {
  return (random() + random() + random() + random() - 2) / 2;
}

function chanceFromEdge(base: number, edge: number, volatility = 0.018) {
  return clamp(base + edge / 1000 + volatility, 0.001, 0.55);
}

function roundScore(args: {
  damageFor: number;
  damageAgainst: number;
  controlFor: number;
  controlAgainst: number;
  pressureFor: number;
  pressureAgainst: number;
  fightIqFor: number;
  fightIqAgainst: number;
}) {
  return (args.damageFor - args.damageAgainst) * 0.62
    + (args.controlFor - args.controlAgainst) * 0.035
    + (args.pressureFor - args.pressureAgainst) * 0.08
    + (args.fightIqFor - args.fightIqAgainst) * 0.035;
}

function normalizeMethods(ko: number, sub: number, dec: number) {
  const total = Math.max(1, ko + sub + dec);
  return { KO_TKO: round(ko / total), SUBMISSION: round(sub / total), DECISION: round(dec / total) };
}

export function runUfcRoundByRoundFightEngine(profileA: UfcFighterSkillProfile, profileB: UfcFighterSkillProfile, options: Options = {}): UfcRoundByRoundFightResult {
  const simulations = Math.max(250, Math.min(100_000, Math.round(options.simulations ?? DEFAULT_SIMULATIONS)));
  const seed = options.seed ?? 1287;
  const scheduledRounds = options.scheduledRounds ?? 3;
  const random = rng(seed);
  const a = runtime(profileA);
  const b = runtime(profileB);
  const roundFinishCounts: Record<string, number> = {};
  for (let r = 1; r <= scheduledRounds; r += 1) roundFinishCounts[`R${r}`] = 0;

  let aWins = 0;
  let bWins = 0;
  let koCount = 0;
  let subCount = 0;
  let decisionCount = 0;
  let totalSeconds = 0;
  let aDamageTotal = 0;
  let bDamageTotal = 0;
  let aControlTotal = 0;
  let bControlTotal = 0;
  let aKdTotal = 0;
  let bKdTotal = 0;
  let strikingEdgeSum = 0;
  let grapplingEdgeSum = 0;
  let decisionEdgeSum = 0;
  let finishPressureASum = 0;
  let finishPressureBSum = 0;

  for (let sim = 0; sim < simulations; sim += 1) {
    let aRounds = 0;
    let bRounds = 0;
    let fightSeconds = 0;
    let aDamage = 0;
    let bDamage = 0;
    let aControl = 0;
    let bControl = 0;
    let aKnockdowns = 0;
    let bKnockdowns = 0;
    let finished = false;

    for (let roundNo = 1; roundNo <= scheduledRounds && !finished; roundNo += 1) {
      const aFatigue = fatigue(a, roundNo, scheduledRounds);
      const bFatigue = fatigue(b, roundNo, scheduledRounds);
      const aPace = (a.pressure * 0.45 + a.cardioEarly * 0.25 + a.cardioLate * 0.15 + a.fightIq * 0.15) * aFatigue;
      const bPace = (b.pressure * 0.45 + b.cardioEarly * 0.25 + b.cardioLate * 0.15 + b.fightIq * 0.15) * bFatigue;
      const strikingEdgeA = (a.strikingOffense - b.strikingDefense) * 0.45 + (a.distance - b.distance) * 0.22 + (a.power - b.chin) * 0.18 + (aPace - bPace) * 0.15 + normalish(random) * 12;
      const grapplingEdgeA = (a.takedownOffense - b.takedownDefense) * 0.34 + (a.control - b.getUps) * 0.24 + (a.submissionThreat - b.submissionDefense) * 0.18 + (a.fightIq - b.fightIq) * 0.12 + normalish(random) * 10;
      const strikingEdgeB = -strikingEdgeA + normalish(random) * 4;
      const grapplingEdgeB = -grapplingEdgeA + normalish(random) * 4;
      const aRoundDamage = clamp(12 + strikingEdgeA * 0.22 + a.power * 0.08 + aPace * 0.045 + normalish(random) * 6, 2, 58);
      const bRoundDamage = clamp(12 + strikingEdgeB * 0.22 + b.power * 0.08 + bPace * 0.045 + normalish(random) * 6, 2, 58);
      const aRoundControl = clamp(42 + grapplingEdgeA * 1.25 + a.control * 0.8 - b.getUps * 0.45 + normalish(random) * 35, 0, 265);
      const bRoundControl = clamp(42 + grapplingEdgeB * 1.25 + b.control * 0.8 - a.getUps * 0.45 + normalish(random) * 35, 0, 265);
      const aDamageToB = aRoundDamage * (1 + Math.max(0, 55 - b.chin) / 120) * (1 + Math.max(0, 55 - b.recovery) / 160);
      const bDamageToA = bRoundDamage * (1 + Math.max(0, 55 - a.chin) / 120) * (1 + Math.max(0, 55 - a.recovery) / 160);
      const aKdChance = clamp(0.012 + Math.max(0, a.power - b.chin) / 900 + Math.max(0, strikingEdgeA) / 1400 + Math.max(0, bDamage + aDamageToB - 55) / 2200, 0.001, 0.18);
      const bKdChance = clamp(0.012 + Math.max(0, b.power - a.chin) / 900 + Math.max(0, strikingEdgeB) / 1400 + Math.max(0, aDamage + bDamageToA - 55) / 2200, 0.001, 0.18);
      if (random() < aKdChance) aKnockdowns += 1;
      if (random() < bKdChance) bKnockdowns += 1;

      aDamage += aDamageToB;
      bDamage += bDamageToA;
      aControl += aRoundControl;
      bControl += bRoundControl;
      fightSeconds += 300;
      strikingEdgeSum += strikingEdgeA;
      grapplingEdgeSum += grapplingEdgeA;

      const aKoChance = chanceFromEdge(0.008, (a.power - b.chin) * 0.35 + strikingEdgeA * 0.45 + aKnockdowns * 16 + aDamage * 0.12, 0);
      const bKoChance = chanceFromEdge(0.008, (b.power - a.chin) * 0.35 + strikingEdgeB * 0.45 + bKnockdowns * 16 + bDamage * 0.12, 0);
      const aSubChance = chanceFromEdge(0.004, (a.submissionThreat - b.submissionDefense) * 0.34 + aRoundControl * 0.09 + grapplingEdgeA * 0.42, 0);
      const bSubChance = chanceFromEdge(0.004, (b.submissionThreat - a.submissionDefense) * 0.34 + bRoundControl * 0.09 + grapplingEdgeB * 0.42, 0);
      finishPressureASum += aKoChance + aSubChance;
      finishPressureBSum += bKoChance + bSubChance;

      const finishRoll = random();
      if (finishRoll < aKoChance) {
        aWins += 1;
        koCount += 1;
        roundFinishCounts[`R${roundNo}`] += 1;
        fightSeconds -= Math.floor(random() * 210);
        finished = true;
      } else if (finishRoll < aKoChance + bKoChance) {
        bWins += 1;
        koCount += 1;
        roundFinishCounts[`R${roundNo}`] += 1;
        fightSeconds -= Math.floor(random() * 210);
        finished = true;
      } else if (finishRoll < aKoChance + bKoChance + aSubChance) {
        aWins += 1;
        subCount += 1;
        roundFinishCounts[`R${roundNo}`] += 1;
        fightSeconds -= Math.floor(random() * 170);
        finished = true;
      } else if (finishRoll < aKoChance + bKoChance + aSubChance + bSubChance) {
        bWins += 1;
        subCount += 1;
        roundFinishCounts[`R${roundNo}`] += 1;
        fightSeconds -= Math.floor(random() * 170);
        finished = true;
      } else {
        const scoreA = roundScore({ damageFor: aDamageToB, damageAgainst: bDamageToA, controlFor: aRoundControl, controlAgainst: bRoundControl, pressureFor: aPace, pressureAgainst: bPace, fightIqFor: a.fightIq, fightIqAgainst: b.fightIq });
        decisionEdgeSum += scoreA;
        if (scoreA > 1.4) aRounds += 1;
        else if (scoreA < -1.4) bRounds += 1;
        else if (random() < 0.5 + clamp(scoreA / 12, -0.12, 0.12)) aRounds += 1;
        else bRounds += 1;
      }
    }

    if (!finished) {
      decisionCount += 1;
      if (aRounds > bRounds) aWins += 1;
      else if (bRounds > aRounds) bWins += 1;
      else if (random() < 0.5 + clamp((a.fightIq + a.heart - b.fightIq - b.heart) / 500, -0.08, 0.08)) aWins += 1;
      else bWins += 1;
    }

    totalSeconds += fightSeconds;
    aDamageTotal += bDamage;
    bDamageTotal += aDamage;
    aControlTotal += aControl;
    bControlTotal += bControl;
    aKdTotal += aKnockdowns;
    bKdTotal += bKnockdowns;
  }

  const methods = normalizeMethods(koCount, subCount, decisionCount);
  const roundFinishProbabilities: Record<string, number> = {};
  for (let r = 1; r <= scheduledRounds; r += 1) roundFinishProbabilities[`R${r}`] = round(roundFinishCounts[`R${r}`] / simulations);
  const transitionProbabilities = {
    standing: round(0.34 + (a.strikingOffense + b.strikingOffense) / 900),
    distance_striking: round(0.24 + (a.distance + b.distance) / 1100),
    clinch: round(0.08 + (a.control + b.control) / 1800),
    takedown_attempt: round(0.08 + (a.takedownOffense + b.takedownOffense) / 1800),
    ground_control: round(0.06 + (a.control + b.control) / 2100),
    submission_threat: round(methods.SUBMISSION),
    knockdown: round((aKdTotal + bKdTotal) / simulations),
    finish: round(methods.KO_TKO + methods.SUBMISSION),
    decision: methods.DECISION
  };
  const diagnostics = {
    paceA: round((a.pressure * 0.45 + a.cardioEarly * 0.25 + a.cardioLate * 0.15 + a.fightIq * 0.15) / 100),
    paceB: round((b.pressure * 0.45 + b.cardioEarly * 0.25 + b.cardioLate * 0.15 + b.fightIq * 0.15) / 100),
    strikingEdgeA: round(strikingEdgeSum / simulations / scheduledRounds),
    grapplingEdgeA: round(grapplingEdgeSum / simulations / scheduledRounds),
    finishPressureA: round(finishPressureASum / simulations / scheduledRounds),
    finishPressureB: round(finishPressureBSum / simulations / scheduledRounds),
    decisionEdgeA: round(decisionEdgeSum / simulations / scheduledRounds)
  };
  const pathSummary: string[] = [];
  if (diagnostics.strikingEdgeA > 2) pathSummary.push("Round engine gives Fighter A the cleaner striking-round lane.");
  if (diagnostics.strikingEdgeA < -2) pathSummary.push("Round engine gives Fighter B the cleaner striking-round lane.");
  if (diagnostics.grapplingEdgeA > 2) pathSummary.push("Round engine projects Fighter A grappling/control leverage.");
  if (diagnostics.grapplingEdgeA < -2) pathSummary.push("Round engine projects Fighter B grappling/control leverage.");
  if (methods.DECISION >= 0.55) pathSummary.push("Round engine leans toward scorecards over early finish volatility.");
  if (methods.KO_TKO + methods.SUBMISSION >= 0.5) pathSummary.push("Round engine flags elevated inside-distance volatility.");
  const dangerFlags: string[] = [];
  if (Math.abs(diagnostics.strikingEdgeA) < 1.5 && Math.abs(diagnostics.grapplingEdgeA) < 1.5) dangerFlags.push("round-engine-close-fight");
  if (a.coldStart || b.coldStart) dangerFlags.push("round-engine-cold-start-input");
  if (methods.KO_TKO >= 0.42) dangerFlags.push("round-engine-high-ko-volatility");

  return {
    engine: "round_by_round",
    simulations,
    seed,
    scheduledRounds,
    fighterAWinProbability: round(aWins / simulations),
    fighterBWinProbability: round(bWins / simulations),
    methodProbabilities: methods,
    roundFinishProbabilities,
    transitionProbabilities,
    averageFightLengthSeconds: round(totalSeconds / simulations, 1),
    averageDamage: { fighterA: round(aDamageTotal / simulations, 2), fighterB: round(bDamageTotal / simulations, 2) },
    averageControlSeconds: { fighterA: round(aControlTotal / simulations, 1), fighterB: round(bControlTotal / simulations, 1) },
    averageKnockdowns: { fighterA: round(aKdTotal / simulations, 3), fighterB: round(bKdTotal / simulations, 3) },
    diagnosticProbabilities: diagnostics,
    pathSummary: pathSummary.slice(0, 6),
    dangerFlags
  };
}
