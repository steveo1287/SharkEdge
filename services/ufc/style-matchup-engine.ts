import type { UfcFighterSkillProfile } from "@/services/ufc/fighter-skill-profile";

export type UfcStyleArchetype =
  | "PRESSURE_STRIKER"
  | "COUNTER_STRIKER"
  | "RANGE_KICKBOXER"
  | "WRESTLING_GRINDER"
  | "SUBMISSION_HUNTER"
  | "SCRAMBLE_ATHLETE"
  | "DURABLE_CARDIO"
  | "BALANCED_MMA";

export type UfcStyleMatchupResult = {
  engine: "style_matchup";
  simulations: number;
  seed: number;
  scheduledRounds: 3 | 5;
  fighterAWinProbability: number;
  fighterBWinProbability: number;
  methodProbabilities: { KO_TKO: number; SUBMISSION: number; DECISION: number };
  roundFinishProbabilities: Record<string, number>;
  transitionProbabilities: Record<string, number>;
  style: {
    fighterA: UfcStyleArchetype;
    fighterB: UfcStyleArchetype;
    fighterAScores: Record<UfcStyleArchetype, number>;
    fighterBScores: Record<UfcStyleArchetype, number>;
    matchupLevers: Record<string, number>;
  };
  pathWins: Record<string, number>;
  pathSummary: string[];
  dangerFlags: string[];
};

type Options = {
  simulations?: number;
  seed?: number;
  scheduledRounds?: 3 | 5;
};

type Runtime = {
  profile: UfcFighterSkillProfile;
  archetype: UfcStyleArchetype;
  scores: Record<UfcStyleArchetype, number>;
  pressure: number;
  countering: number;
  range: number;
  boxingPower: number;
  kickVolume: number;
  wrestling: number;
  antiWrestling: number;
  topControl: number;
  getUps: number;
  subThreat: number;
  subDefense: number;
  scramble: number;
  cardio: number;
  durability: number;
  fightIq: number;
  volatility: number;
  reliability: number;
  coldStart: boolean;
};

const DEFAULT_SIMULATIONS = 25_000;
const ARCHETYPES: UfcStyleArchetype[] = ["PRESSURE_STRIKER", "COUNTER_STRIKER", "RANGE_KICKBOXER", "WRESTLING_GRINDER", "SUBMISSION_HUNTER", "SCRAMBLE_ATHLETE", "DURABLE_CARDIO", "BALANCED_MMA"];

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

function avg(...values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function normalish(random: () => number) {
  return (random() + random() + random() + random() + random() - 2.5) / 2.5;
}

function styleScores(profile: UfcFighterSkillProfile): Record<UfcStyleArchetype, number> {
  const pressureStriker = avg(profile.striking.pressure, profile.striking.volume, profile.striking.power, profile.durability.heart);
  const counterStriker = avg(profile.striking.defense, profile.striking.accuracy, profile.striking.distanceManagement, profile.intangibles.fightIq);
  const rangeKickboxer = avg(profile.kicking.offense, profile.kicking.kickingVolume, profile.striking.distanceManagement, profile.physical.reachAdvantagePotential);
  const wrestlingGrinder = avg(profile.wrestling.takedownOffense, profile.wrestling.control, profile.wrestling.clinchControl, profile.cardio.paceSustain);
  const submissionHunter = avg(profile.grappling.submissionThreat, profile.grappling.topGame, profile.grappling.guardGame, profile.wrestling.control);
  const scrambleAthlete = avg(profile.wrestling.scramble, profile.wrestling.getUps, profile.grappling.reversals, profile.cardio.earlyPace);
  const durableCardio = avg(profile.durability.chin, profile.durability.recovery, profile.durability.heart, profile.cardio.latePace, profile.cardio.stamina);
  const balanced = avg(profile.striking.offense, profile.striking.defense, profile.wrestling.takedownDefense, profile.grappling.grapplingDefense, profile.intangibles.fightIq);
  return {
    PRESSURE_STRIKER: round(pressureStriker, 2),
    COUNTER_STRIKER: round(counterStriker, 2),
    RANGE_KICKBOXER: round(rangeKickboxer, 2),
    WRESTLING_GRINDER: round(wrestlingGrinder, 2),
    SUBMISSION_HUNTER: round(submissionHunter, 2),
    SCRAMBLE_ATHLETE: round(scrambleAthlete, 2),
    DURABLE_CARDIO: round(durableCardio, 2),
    BALANCED_MMA: round(balanced, 2)
  };
}

function primaryStyle(scores: Record<UfcStyleArchetype, number>) {
  return ARCHETYPES.reduce((best, key) => scores[key] > scores[best] ? key : best, "BALANCED_MMA" as UfcStyleArchetype);
}

function runtime(profile: UfcFighterSkillProfile): Runtime {
  const scores = styleScores(profile);
  const coldStart = profile.prospect.coldStartActive || profile.sampleQuality === "D";
  const reliability = clamp(profile.sampleReliability ?? 0.25, 0.18, 1);
  return {
    profile,
    archetype: primaryStyle(scores),
    scores,
    pressure: avg(profile.striking.pressure, profile.striking.volume, profile.cardio.earlyPace),
    countering: avg(profile.striking.defense, profile.striking.accuracy, profile.striking.distanceManagement, profile.intangibles.fightIq),
    range: avg(profile.striking.distanceManagement, profile.kicking.defense, profile.physical.reachAdvantagePotential),
    boxingPower: avg(profile.striking.power, profile.durability.koResistance, profile.striking.accuracy),
    kickVolume: avg(profile.kicking.offense, profile.kicking.kickingVolume, profile.kicking.legKicks, profile.kicking.bodyKicks, profile.kicking.headKicks),
    wrestling: avg(profile.wrestling.takedownOffense, profile.wrestling.control, profile.wrestling.clinchControl),
    antiWrestling: avg(profile.wrestling.takedownDefense, profile.wrestling.getUps, profile.grappling.bottomSurvival),
    topControl: avg(profile.wrestling.control, profile.grappling.topGame, profile.wrestling.clinchControl),
    getUps: avg(profile.wrestling.getUps, profile.wrestling.scramble, profile.grappling.bottomSurvival),
    subThreat: avg(profile.grappling.submissionThreat, profile.grappling.guardGame, profile.grappling.topGame),
    subDefense: avg(profile.grappling.submissionDefense, profile.grappling.bottomSurvival, profile.durability.submissionResistance),
    scramble: avg(profile.wrestling.scramble, profile.grappling.reversals, profile.grappling.guardGame),
    cardio: avg(profile.cardio.earlyPace, profile.cardio.latePace, profile.cardio.stamina, profile.cardio.paceSustain),
    durability: avg(profile.durability.chin, profile.durability.recovery, profile.durability.heart, profile.durability.koResistance),
    fightIq: avg(profile.intangibles.fightIq, profile.intangibles.gamePlan, profile.intangibles.experience),
    volatility: clamp((100 - reliability * 100) * 0.55 + (coldStart ? 18 : 0), 8, 48),
    reliability,
    coldStart
  };
}

function leverMap(a: Runtime, b: Runtime) {
  const pressureBreaksDefense = a.pressure - b.countering;
  const counterPunishesPressure = a.countering - b.pressure;
  const rangeKeepsDistance = a.range + a.kickVolume * 0.25 - b.pressure - b.wrestling * 0.2;
  const wrestlingControl = a.wrestling + a.topControl * 0.35 - b.antiWrestling - b.getUps * 0.25;
  const getUpDefense = a.getUps + a.scramble * 0.35 - b.topControl;
  const subChain = a.subThreat + a.topControl * 0.25 - b.subDefense - b.scramble * 0.2;
  const lateFight = a.cardio + a.durability * 0.25 + a.fightIq * 0.2 - b.cardio - b.durability * 0.15;
  const powerThreat = a.boxingPower - b.durability + a.pressure * 0.12;
  const decisionFloor = a.fightIq + a.cardio * 0.25 + a.countering * 0.18 - b.fightIq - b.cardio * 0.15;
  return { pressureBreaksDefense, counterPunishesPressure, rangeKeepsDistance, wrestlingControl, getUpDefense, subChain, lateFight, powerThreat, decisionFloor };
}

function pathScores(a: Runtime, b: Runtime, random: () => number) {
  const aL = leverMap(a, b);
  const bL = leverMap(b, a);
  const volatility = (a.volatility + b.volatility) / 2;
  const noise = () => normalish(random) * volatility;
  return {
    aPressureKo: aL.pressureBreaksDefense * 0.38 + aL.powerThreat * 0.42 + a.cardio * 0.06 + noise(),
    bPressureKo: bL.pressureBreaksDefense * 0.38 + bL.powerThreat * 0.42 + b.cardio * 0.06 + noise(),
    aCounterKo: aL.counterPunishesPressure * 0.5 + aL.powerThreat * 0.27 + a.fightIq * 0.08 + noise(),
    bCounterKo: bL.counterPunishesPressure * 0.5 + bL.powerThreat * 0.27 + b.fightIq * 0.08 + noise(),
    aRangeDecision: aL.rangeKeepsDistance * 0.44 + aL.decisionFloor * 0.3 + a.kickVolume * 0.12 + noise(),
    bRangeDecision: bL.rangeKeepsDistance * 0.44 + bL.decisionFloor * 0.3 + b.kickVolume * 0.12 + noise(),
    aWrestleDecision: aL.wrestlingControl * 0.55 + aL.lateFight * 0.2 + a.topControl * 0.12 + noise(),
    bWrestleDecision: bL.wrestlingControl * 0.55 + bL.lateFight * 0.2 + b.topControl * 0.12 + noise(),
    aSubmission: aL.subChain * 0.58 + aL.wrestlingControl * 0.22 + a.scramble * 0.08 + noise(),
    bSubmission: bL.subChain * 0.58 + bL.wrestlingControl * 0.22 + b.scramble * 0.08 + noise(),
    aLateDecision: aL.lateFight * 0.54 + aL.decisionFloor * 0.28 + a.durability * 0.08 + noise(),
    bLateDecision: bL.lateFight * 0.54 + bL.decisionFloor * 0.28 + b.durability * 0.08 + noise(),
    aScrambleSwing: (a.scramble - b.scramble) * 0.4 + (a.getUps - b.topControl) * 0.2 + noise(),
    bScrambleSwing: (b.scramble - a.scramble) * 0.4 + (b.getUps - a.topControl) * 0.2 + noise()
  };
}

function pickPath(scores: Record<string, number>) {
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0] ?? ["coinFlip", 0];
}

function methodForPath(path: string) {
  if (path.includes("Ko")) return "KO_TKO" as const;
  if (path.includes("Submission")) return "SUBMISSION" as const;
  return "DECISION" as const;
}

function winnerForPath(path: string) {
  return path.startsWith("a") ? "A" : "B";
}

function finishRound(method: "KO_TKO" | "SUBMISSION" | "DECISION", scheduledRounds: 3 | 5, random: () => number, lateBias: boolean) {
  if (method === "DECISION") return null;
  const r = random();
  if (scheduledRounds === 5) {
    if (lateBias) return r < 0.1 ? 1 : r < 0.28 ? 2 : r < 0.52 ? 3 : r < 0.76 ? 4 : 5;
    return r < 0.27 ? 1 : r < 0.5 ? 2 : r < 0.7 ? 3 : r < 0.86 ? 4 : 5;
  }
  if (lateBias) return r < 0.16 ? 1 : r < 0.48 ? 2 : 3;
  return r < 0.38 ? 1 : r < 0.68 ? 2 : 3;
}

function normalizeMethods(ko: number, sub: number, dec: number) {
  const total = Math.max(1, ko + sub + dec);
  return { KO_TKO: round(ko / total), SUBMISSION: round(sub / total), DECISION: round(dec / total) };
}

function topPaths(pathWins: Record<string, number>, simulations: number) {
  return Object.entries(pathWins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([path, count]) => `${path}:${Math.round((count / simulations) * 100)}%`);
}

export function runUfcStyleMatchupEngine(profileA: UfcFighterSkillProfile, profileB: UfcFighterSkillProfile, options: Options = {}): UfcStyleMatchupResult {
  const simulations = Math.max(250, Math.min(100_000, Math.round(options.simulations ?? DEFAULT_SIMULATIONS)));
  const seed = options.seed ?? 1287;
  const scheduledRounds = options.scheduledRounds ?? 3;
  const random = rng(seed);
  const a = runtime(profileA);
  const b = runtime(profileB);
  const matchupLeversA = leverMap(a, b);
  const matchupLeversB = leverMap(b, a);
  const pathWins: Record<string, number> = {};
  const roundFinishCounts: Record<string, number> = {};
  for (let roundNo = 1; roundNo <= scheduledRounds; roundNo += 1) roundFinishCounts[`R${roundNo}`] = 0;
  let aWins = 0;
  let bWins = 0;
  let ko = 0;
  let sub = 0;
  let dec = 0;

  for (let i = 0; i < simulations; i += 1) {
    const scores = pathScores(a, b, random);
    const [path, score] = pickPath(scores);
    const closeFight = Math.abs(score) < 7;
    let winner = winnerForPath(path);
    if (closeFight && random() < 0.34 + (a.volatility + b.volatility) / 300) winner = random() < 0.5 ? "A" : "B";
    const method = methodForPath(path);
    const lateBias = path.includes("Late") || path.includes("Decision") || path.includes("Wrestle");
    const finish = finishRound(method, scheduledRounds, random, lateBias);
    const adjustedPath = `${winner === "A" ? "A" : "B"}_${path.replace(/^[ab]/, "")}`;
    pathWins[adjustedPath] = (pathWins[adjustedPath] ?? 0) + 1;
    if (winner === "A") aWins += 1;
    else bWins += 1;
    if (method === "KO_TKO") ko += 1;
    else if (method === "SUBMISSION") sub += 1;
    else dec += 1;
    if (finish) roundFinishCounts[`R${finish}`] += 1;
  }

  const methods = normalizeMethods(ko, sub, dec);
  const roundFinishProbabilities: Record<string, number> = {};
  for (let roundNo = 1; roundNo <= scheduledRounds; roundNo += 1) roundFinishProbabilities[`R${roundNo}`] = round(roundFinishCounts[`R${roundNo}`] / simulations);
  const transitionProbabilities = {
    pressure_exchange: round((Math.max(0, matchupLeversA.pressureBreaksDefense) + Math.max(0, matchupLeversB.pressureBreaksDefense)) / 180),
    counter_window: round((Math.max(0, matchupLeversA.counterPunishesPressure) + Math.max(0, matchupLeversB.counterPunishesPressure)) / 180),
    range_kicking: round((Math.max(0, matchupLeversA.rangeKeepsDistance) + Math.max(0, matchupLeversB.rangeKeepsDistance)) / 180),
    wrestling_control: round((Math.max(0, matchupLeversA.wrestlingControl) + Math.max(0, matchupLeversB.wrestlingControl)) / 180),
    submission_chain: round((Math.max(0, matchupLeversA.subChain) + Math.max(0, matchupLeversB.subChain)) / 180),
    scramble_swing: round((a.scramble + b.scramble) / 200),
    finish: round(methods.KO_TKO + methods.SUBMISSION),
    decision: methods.DECISION
  };
  const pathSummary: string[] = [
    `Style engine: Fighter A archetype ${a.archetype}; Fighter B archetype ${b.archetype}.`,
    `Top style paths: ${topPaths(pathWins, simulations).join(" | ")}.`
  ];
  if (Math.abs(matchupLeversA.wrestlingControl) > 8 || Math.abs(matchupLeversB.wrestlingControl) > 8) pathSummary.push("Style engine found a meaningful wrestling/control separation.");
  if (methods.KO_TKO >= 0.34) pathSummary.push("Style engine flags a higher KO/TKO lane than baseline.");
  if (methods.SUBMISSION >= 0.24) pathSummary.push("Style engine flags a live submission-chain lane.");
  if (methods.DECISION >= 0.62) pathSummary.push("Style engine leans scorecard-heavy due to path control and durability.");

  const dangerFlags: string[] = [];
  if (a.coldStart || b.coldStart) dangerFlags.push("style-engine-cold-start-input");
  if (Math.abs(aWins / simulations - 0.5) < 0.035) dangerFlags.push("style-engine-close-fight");
  if (a.volatility + b.volatility > 70) dangerFlags.push("style-engine-high-input-volatility");

  return {
    engine: "style_matchup",
    simulations,
    seed,
    scheduledRounds,
    fighterAWinProbability: round(aWins / simulations),
    fighterBWinProbability: round(bWins / simulations),
    methodProbabilities: methods,
    roundFinishProbabilities,
    transitionProbabilities,
    style: {
      fighterA: a.archetype,
      fighterB: b.archetype,
      fighterAScores: a.scores,
      fighterBScores: b.scores,
      matchupLevers: Object.fromEntries(Object.entries({ ...matchupLeversA }).map(([key, value]) => [`fighterA_${key}`, round(value, 2)]))
    },
    pathWins: Object.fromEntries(Object.entries(pathWins).map(([key, value]) => [key, round(value / simulations)])),
    pathSummary: pathSummary.slice(0, 7),
    dangerFlags
  };
}
