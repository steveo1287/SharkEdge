import { buildEventGameRatingsPrior } from "@/services/simulation/game-ratings-prior";

type FighterSignal = {
  strikingOffense: number;
  strikingDefense: number;
  grapplingOffense: number;
  grapplingDefense: number;
  takedownAccuracy: number;
  takedownDefense: number;
  submissionThreat: number;
  knockdownThreat: number;
  controlPressure: number;
  cardio: number;
  durability: number;
  fightIQ: number;
  pace: number;
};

type FighterProfile = {
  competitorId: string;
  fighterName: string;
  role: "COMPETITOR_A" | "COMPETITOR_B";
  confidence: number;
  sampleSize: number;
  amateurRankScore: number;
  campScore: number;
  trainingPartnerScore: number;
  formScore: number;
  opponentAdjustedFormScore: number;
  videoGameOverall: number | null;
  styleTag: "STRIKER" | "GRAPPLER" | "MIXED";
  strengths: string[];
  weaknesses: string[];
  context: {
    daysRest: number | null;
    recentWinRate: number | null;
    recentMargin: number | null;
    travelProxyScore: number | null;
    revengeSpot: boolean;
  };
  signal: FighterSignal;
  notes: string[];
};

type OptionalEnrichment = {
  amateurRank?: number | null;
  campTier?: number | null;
  trainingPartnerTier?: number | null;
  metadata?: Record<string, unknown>;
};

type MarketAnchor = {
  homeWinProb: number | null;
};

type FightSimulationSummary = {
  winProbA: number;
  winProbB: number;
  finishProbA: number;
  finishProbB: number;
  koTkoProbA: number;
  koTkoProbB: number;
  submissionProbA: number;
  submissionProbB: number;
  decisionProb: number;
  expectedDamageA: number;
  expectedDamageB: number;
  expectedControlA: number;
  expectedControlB: number;
  expectedPace: number;
  confidence: number;
  roundsEstimated: number;
  upsetRisk: number;
};

type UfcMatchupBreakdown = {
  fighterAName: string;
  fighterBName: string;
  styleA: FighterProfile["styleTag"];
  styleB: FighterProfile["styleTag"];
  components: {
    strikingEdge: number;
    grapplingEdge: number;
    tacticalEdge: number;
    formEdge: number;
    prepEdge: number;
    gameRatingEdge: number;
    styleEdge: number;
    weaknessExposureEdge: number;
    contextEdge: number;
    totalEdge: number;
  };
  notes: string[];
};

const DEFAULT_SIGNAL: FighterSignal = {
  strikingOffense: 50,
  strikingDefense: 50,
  grapplingOffense: 50,
  grapplingDefense: 50,
  takedownAccuracy: 50,
  takedownDefense: 50,
  submissionThreat: 50,
  knockdownThreat: 50,
  controlPressure: 50,
  cardio: 50,
  durability: 50,
  fightIQ: 50,
  pace: 50
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function average(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.88) {
  let weighted = 0;
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    const weight = decay ** index;
    weighted += value * weight;
    total += weight;
  }
  return total ? weighted / total : null;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.+-]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBoolean(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "y"].includes(normalized)) return true;
      if (["false", "0", "no", "n"].includes(normalized)) return false;
    }
  }
  return null;
}

function readStat(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
}

function normalize0100(raw: number | null, baseline: number, scale: number, min = 10, max = 95) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 50;
  }
  return clamp(50 + (raw - baseline) * scale, min, max);
}

function normalizePercent(raw: number | null, baseline: number, scale: number) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 50;
  const normalized = raw > 1 ? raw / 100 : raw;
  return clamp(50 + (normalized - baseline) * scale, 10, 95);
}

function toStyleTag(signal: FighterSignal): FighterProfile["styleTag"] {
  const strikingTilt = signal.strikingOffense + signal.knockdownThreat - signal.controlPressure * 0.25;
  const grapplingTilt = signal.grapplingOffense + signal.submissionThreat + signal.controlPressure * 0.35;
  if (strikingTilt - grapplingTilt >= 8) return "STRIKER";
  if (grapplingTilt - strikingTilt >= 8) return "GRAPPLER";
  return "MIXED";
}

function inferStrengths(signal: FighterSignal) {
  const strengths: string[] = [];
  if (signal.strikingOffense >= 64) strengths.push("High-output striking offense");
  if (signal.knockdownThreat >= 62) strengths.push("Knockdown power threat");
  if (signal.grapplingOffense >= 62) strengths.push("Strong grappling entries");
  if (signal.submissionThreat >= 60) strengths.push("Live submission chain threat");
  if (signal.takedownDefense >= 63) strengths.push("Reliable takedown defense");
  if (signal.cardio >= 60) strengths.push("Sustained cardio pace");
  if (signal.fightIQ >= 60) strengths.push("Disciplined fight IQ");
  return strengths.length > 0 ? strengths.slice(0, 4) : ["Balanced profile without a dominant axis"];
}

function inferWeaknesses(signal: FighterSignal) {
  const weaknesses: string[] = [];
  if (signal.strikingDefense <= 43) weaknesses.push("Absorbs significant strike volume");
  if (signal.durability <= 44) weaknesses.push("Durability/chin risk under pressure");
  if (signal.grapplingDefense <= 44) weaknesses.push("Vulnerable in defensive grappling");
  if (signal.takedownDefense <= 45) weaknesses.push("Can be controlled by takedown pressure");
  if (signal.cardio <= 44) weaknesses.push("Cardio dropoff in later rounds");
  if (signal.fightIQ <= 44) weaknesses.push("Lower tactical discipline in exchanges");
  return weaknesses.length > 0 ? weaknesses.slice(0, 4) : ["No obvious structural weakness from current sample"];
}

function styleCompatibilityEdge(profile: FighterProfile, opponent: FighterProfile) {
  let edge = 0;
  if (profile.styleTag === "STRIKER" && opponent.styleTag === "GRAPPLER") {
    edge += (profile.signal.takedownDefense > opponent.signal.takedownAccuracy ? 3.2 : -2.8);
  } else if (profile.styleTag === "GRAPPLER" && opponent.styleTag === "STRIKER") {
    edge += (profile.signal.takedownAccuracy > opponent.signal.takedownDefense ? 3.2 : -2.8);
  } else if (profile.styleTag === opponent.styleTag) {
    edge += (profile.signal.fightIQ - opponent.signal.fightIQ) * 0.08;
  }
  return { edge };
}

function calculateWeaknessExposureEdge(profile: FighterProfile, opponent: FighterProfile) {
  const strikeExposure =
    (100 - opponent.signal.strikingDefense) * (profile.signal.strikingOffense / 100) * 0.08 +
    (100 - opponent.signal.durability) * (profile.signal.knockdownThreat / 100) * 0.09;
  const grappleExposure =
    (100 - opponent.signal.grapplingDefense) * (profile.signal.grapplingOffense / 100) * 0.08 +
    (100 - opponent.signal.takedownDefense) * (profile.signal.takedownAccuracy / 100) * 0.07 +
    (100 - opponent.signal.cardio) * (profile.signal.controlPressure / 100) * 0.05;
  return strikeExposure + grappleExposure;
}

function contextEdge(profile: FighterProfile, opponent: FighterProfile) {
  const restDelta = (profile.context.daysRest ?? 1) - (opponent.context.daysRest ?? 1);
  const formDelta = (profile.context.recentWinRate ?? 0.5) - (opponent.context.recentWinRate ?? 0.5);
  const marginDelta = (profile.context.recentMargin ?? 0) - (opponent.context.recentMargin ?? 0);
  const travelDelta = (opponent.context.travelProxyScore ?? 0) - (profile.context.travelProxyScore ?? 0);
  const revengeBoost = profile.context.revengeSpot ? 0.9 : 0;
  return clamp(
    restDelta * 0.7 + formDelta * 7.2 + marginDelta * 0.16 + travelDelta * 1.1 + revengeBoost,
    -6.2,
    6.2
  );
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function randomNormal(rand: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function fetchOptionalEnrichment(url: string, lookupKey: string) {
  const normalized = url.trim();
  if (!normalized) return null;
  const endpoint = `${normalized.replace(/\/$/, "")}?fighter=${encodeURIComponent(lookupKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "SharkEdge-UFC-Sim/1.0" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    if (!payload || typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    return {
      amateurRank: toNumber(record.amateurRank ?? record.amateurRankScore ?? record.amateur_rank),
      campTier: toNumber(record.campTier ?? record.campScore ?? record.camp_tier),
      trainingPartnerTier: toNumber(record.trainingPartnerTier ?? record.trainingPartnerScore ?? record.training_partner_tier),
      metadata: record
    } satisfies OptionalEnrichment;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildMarketAnchor(states: Array<{ marketType: string; period: string; bestHomeOddsAmerican: number | null; bestAwayOddsAmerican: number | null }>): MarketAnchor {
  const moneyline = states.find((state) => state.marketType === "fight_winner" || state.marketType === "moneyline");
  if (!moneyline || typeof moneyline.bestHomeOddsAmerican !== "number" || typeof moneyline.bestAwayOddsAmerican !== "number") {
    return { homeWinProb: null };
  }

  const homePrice = moneyline.bestHomeOddsAmerican;
  const awayPrice = moneyline.bestAwayOddsAmerican;
  const homeProb = homePrice > 0 ? 100 / (homePrice + 100) : Math.abs(homePrice) / (Math.abs(homePrice) + 100);
  const awayProb = awayPrice > 0 ? 100 / (awayPrice + 100) : Math.abs(awayPrice) / (Math.abs(awayPrice) + 100);
  const noVig = homeProb + awayProb;
  if (noVig <= 0) return { homeWinProb: null };
  return { homeWinProb: homeProb / noVig };
}

function computeSignalFromRows(rows: Array<{ statsJson: unknown }>): FighterSignal {
  const strikingOffenseRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["sig_strikes_landed_per_min", "slpm", "sigStrikesLandedPerMinute", "significantStrikesLandedPerMinute"])));
  const strikingDefenseRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["sig_strikes_absorbed_per_min", "sapm", "sigStrikesAbsorbedPerMinute"])));
  const grapplingOffenseRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["takedowns_per_15", "td_avg", "takedownAverage"])));
  const takedownAccuracyRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["takedown_accuracy", "td_acc", "takedownAccuracy"])));
  const takedownDefenseRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["takedown_defense", "td_def", "takedownDefense"])));
  const submissionThreatRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["sub_attempts_per_15", "sub_avg", "submissionAverage"])));
  const knockdownThreatRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["knockdowns_per_15", "kd_avg", "knockdownAverage"])));
  const controlRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["control_time_ratio", "control_share", "ground_control_pct"])));
  const cardioRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["late_round_output", "round3_sig_strike_ratio", "cardio_index"])));
  const durabilityRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["chin_rating", "durability", "finish_defense"])));
  const iqRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["fight_iq", "fightIQ", "decision_quality"])));
  const paceRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["pace", "engagement_rate", "attempts_per_minute"])));
  const grapplingDefenseRaw = weightedAverage(rows.map((row) => readStat(row.statsJson, ["grappling_defense", "wrestling_defense", "scramble_defense"])));

  const strikingAbsorbedScore = normalize0100(strikingDefenseRaw, 3.1, -11);

  return {
    strikingOffense: normalize0100(strikingOffenseRaw, 3.7, 12),
    strikingDefense: strikingAbsorbedScore,
    grapplingOffense: normalize0100(grapplingOffenseRaw, 1.3, 18),
    grapplingDefense: normalize0100(grapplingDefenseRaw ?? takedownDefenseRaw, 58, 0.42),
    takedownAccuracy: normalizePercent(takedownAccuracyRaw, 0.42, 80),
    takedownDefense: normalizePercent(takedownDefenseRaw, 0.58, 70),
    submissionThreat: normalize0100(submissionThreatRaw, 0.45, 35),
    knockdownThreat: normalize0100(knockdownThreatRaw, 0.24, 42),
    controlPressure: normalize0100(controlRaw, 0.26, 95),
    cardio: normalize0100(cardioRaw, 1, 42),
    durability: normalize0100(durabilityRaw, 55, 0.5),
    fightIQ: normalize0100(iqRaw, 58, 0.45),
    pace: normalize0100(paceRaw, 1, 46)
  };
}

function buildFormScore(rows: Array<{ statsJson: unknown }>) {
  const resultValues = rows.map((row) => readStat(row.statsJson, ["result_value", "resultValue", "won", "win"]));
  const scoreValues = resultValues.map((value, index) => {
    if (typeof value !== "number") return null;
    const normalized = value > 1 ? (value > 0 ? 1 : 0) : value;
    const recencyWeight = 1 - Math.min(0.35, index * 0.05);
    return normalized * recencyWeight;
  });
  const avg = average(scoreValues);
  if (typeof avg !== "number") return 50;
  return clamp(35 + avg * 52, 18, 92);
}

function buildOpponentAdjustedForm(rows: Array<{ statsJson: unknown }>) {
  const values = rows.map((row) => {
    const resultValue = readStat(row.statsJson, ["result_value", "resultValue", "won", "win"]);
    const opponentQuality = readStat(row.statsJson, ["opponent_quality", "opponentQuality", "opponentElo", "opponent_rating"]);
    if (typeof resultValue !== "number") return null;
    const normalizedResult = resultValue > 1 ? (resultValue > 0 ? 1 : 0) : resultValue;
    const qualityScale = typeof opponentQuality === "number" ? clamp(opponentQuality / 100, 0.65, 1.35) : 1;
    return normalizedResult * qualityScale;
  });
  const avg = average(values);
  if (typeof avg !== "number") return 50;
  return clamp(34 + avg * 51, 16, 93);
}

function buildProfileConfidence(args: {
  sampleSize: number;
  enrichmentCount: number;
  gameRatingSeen: boolean;
}) {
  return clamp(
    26 + args.sampleSize * 5 + args.enrichmentCount * 10 + (args.gameRatingSeen ? 8 : 0),
    24,
    95
  );
}

function profileToPower(profile: FighterProfile, opponent: FighterProfile) {
  const strikingEdge =
    (profile.signal.strikingOffense - opponent.signal.strikingDefense) * 0.22 +
    (profile.signal.knockdownThreat - opponent.signal.durability) * 0.18;
  const grapplingEdge =
    (profile.signal.grapplingOffense - opponent.signal.grapplingDefense) * 0.2 +
    (profile.signal.takedownAccuracy - opponent.signal.takedownDefense) * 0.16 +
    (profile.signal.submissionThreat - opponent.signal.grapplingDefense) * 0.14 +
    (profile.signal.controlPressure - opponent.signal.cardio) * 0.1;
  const tacticalEdge = (profile.signal.fightIQ - opponent.signal.fightIQ) * 0.12;
  const formEdge = (profile.opponentAdjustedFormScore - opponent.opponentAdjustedFormScore) * 0.11;
  const prepEdge =
    (profile.campScore - opponent.campScore) * 0.08 +
    (profile.trainingPartnerScore - opponent.trainingPartnerScore) * 0.05 +
    (profile.amateurRankScore - opponent.amateurRankScore) * 0.03;
  const gameRatingEdge =
    ((profile.videoGameOverall ?? 50) - (opponent.videoGameOverall ?? 50)) * 0.07;
  const styleMatch = styleCompatibilityEdge(profile, opponent).edge;
  const weaknessExposure = calculateWeaknessExposureEdge(profile, opponent) - calculateWeaknessExposureEdge(opponent, profile);
  const situationalEdge = contextEdge(profile, opponent);

  return strikingEdge + grapplingEdge + tacticalEdge + formEdge + prepEdge + gameRatingEdge + styleMatch + weaknessExposure * 0.28 + situationalEdge;
}

function buildMatchupBreakdown(fighterA: FighterProfile, fighterB: FighterProfile): UfcMatchupBreakdown {
  const strikingEdge =
    (fighterA.signal.strikingOffense - fighterB.signal.strikingDefense) * 0.22 +
    (fighterA.signal.knockdownThreat - fighterB.signal.durability) * 0.18;
  const grapplingEdge =
    (fighterA.signal.grapplingOffense - fighterB.signal.grapplingDefense) * 0.2 +
    (fighterA.signal.takedownAccuracy - fighterB.signal.takedownDefense) * 0.16 +
    (fighterA.signal.submissionThreat - fighterB.signal.grapplingDefense) * 0.14 +
    (fighterA.signal.controlPressure - fighterB.signal.cardio) * 0.1;
  const tacticalEdge = (fighterA.signal.fightIQ - fighterB.signal.fightIQ) * 0.12;
  const formEdge = (fighterA.opponentAdjustedFormScore - fighterB.opponentAdjustedFormScore) * 0.11;
  const prepEdge =
    (fighterA.campScore - fighterB.campScore) * 0.08 +
    (fighterA.trainingPartnerScore - fighterB.trainingPartnerScore) * 0.05 +
    (fighterA.amateurRankScore - fighterB.amateurRankScore) * 0.03;
  const gameRatingEdge =
    ((fighterA.videoGameOverall ?? 50) - (fighterB.videoGameOverall ?? 50)) * 0.07;
  const styleEdge = styleCompatibilityEdge(fighterA, fighterB).edge;
  const weaknessExposureComponent =
    (calculateWeaknessExposureEdge(fighterA, fighterB) - calculateWeaknessExposureEdge(fighterB, fighterA)) * 0.28;
  const contextComponent = contextEdge(fighterA, fighterB);
  const totalEdge =
    strikingEdge +
    grapplingEdge +
    tacticalEdge +
    formEdge +
    prepEdge +
    gameRatingEdge +
    styleEdge +
    weaknessExposureComponent +
    contextComponent;

  return {
    fighterAName: fighterA.fighterName,
    fighterBName: fighterB.fighterName,
    styleA: fighterA.styleTag,
    styleB: fighterB.styleTag,
    components: {
      strikingEdge: round(strikingEdge, 4),
      grapplingEdge: round(grapplingEdge, 4),
      tacticalEdge: round(tacticalEdge, 4),
      formEdge: round(formEdge, 4),
      prepEdge: round(prepEdge, 4),
      gameRatingEdge: round(gameRatingEdge, 4),
      styleEdge: round(styleEdge, 4),
      weaknessExposureEdge: round(weaknessExposureComponent, 4),
      contextEdge: round(contextComponent, 4),
      totalEdge: round(totalEdge, 4)
    },
    notes: [
      `A strengths: ${fighterA.strengths.join("; ")}`,
      `A weaknesses: ${fighterA.weaknesses.join("; ")}`,
      `B strengths: ${fighterB.strengths.join("; ")}`,
      `B weaknesses: ${fighterB.weaknesses.join("; ")}`
    ]
  };
}

function simulateFight(args: {
  fighterA: FighterProfile;
  fighterB: FighterProfile;
  marketAnchor: MarketAnchor;
  seed: number;
  samples: number;
}) {
  const random = seededRandom(args.seed);
  const homeWins: number[] = [];
  const finishesA: number[] = [];
  const finishesB: number[] = [];
  const koA: number[] = [];
  const koB: number[] = [];
  const subA: number[] = [];
  const subB: number[] = [];
  const decisions: number[] = [];
  const damageA: number[] = [];
  const damageB: number[] = [];
  const controlA: number[] = [];
  const controlB: number[] = [];
  const paceIndex: number[] = [];

  const baseEdge = profileToPower(args.fighterA, args.fighterB);
  const marketNudge = typeof args.marketAnchor.homeWinProb === "number"
    ? (args.marketAnchor.homeWinProb - 0.5) * 18
    : 0;
  const confidenceDrag = (args.fighterA.confidence + args.fighterB.confidence) / 2;

  for (let i = 0; i < args.samples; i += 1) {
    const variance = randomNormal(random) * (11 - confidenceDrag * 0.07);
    const edge = baseEdge + marketNudge + variance;
    const pA = clamp(0.5 + edge / 100, 0.06, 0.94);
    const winnerA = random() < pA;
    homeWins.push(winnerA ? 1 : 0);

    const finishPressureA =
      (args.fighterA.signal.knockdownThreat * 0.38 +
        args.fighterA.signal.submissionThreat * 0.26 +
        args.fighterA.signal.strikingOffense * 0.18 +
        args.fighterA.signal.grapplingOffense * 0.18) / 100;
    const finishPressureB =
      (args.fighterB.signal.knockdownThreat * 0.38 +
        args.fighterB.signal.submissionThreat * 0.26 +
        args.fighterB.signal.strikingOffense * 0.18 +
        args.fighterB.signal.grapplingOffense * 0.18) / 100;

    const defenseA = (args.fighterA.signal.durability * 0.55 + args.fighterA.signal.cardio * 0.45) / 100;
    const defenseB = (args.fighterB.signal.durability * 0.55 + args.fighterB.signal.cardio * 0.45) / 100;

    const finishChanceA = clamp(finishPressureA - defenseB * 0.34 + 0.08, 0.06, 0.74);
    const finishChanceB = clamp(finishPressureB - defenseA * 0.34 + 0.08, 0.06, 0.74);
    const finishRoll = random();
    const isFinishA = winnerA && finishRoll < finishChanceA;
    const isFinishB = !winnerA && finishRoll < finishChanceB;
    const koShareA = clamp(
      (args.fighterA.signal.knockdownThreat * 0.55 + args.fighterA.signal.strikingOffense * 0.25 - args.fighterB.signal.grapplingDefense * 0.1) / 100,
      0.2,
      0.82
    );
    const koShareB = clamp(
      (args.fighterB.signal.knockdownThreat * 0.55 + args.fighterB.signal.strikingOffense * 0.25 - args.fighterA.signal.grapplingDefense * 0.1) / 100,
      0.2,
      0.82
    );
    const methodRoll = random();
    const isKoA = isFinishA && methodRoll < koShareA;
    const isSubA = isFinishA && !isKoA;
    const isKoB = isFinishB && methodRoll < koShareB;
    const isSubB = isFinishB && !isKoB;

    finishesA.push(isFinishA ? 1 : 0);
    finishesB.push(isFinishB ? 1 : 0);
    koA.push(isKoA ? 1 : 0);
    koB.push(isKoB ? 1 : 0);
    subA.push(isSubA ? 1 : 0);
    subB.push(isSubB ? 1 : 0);
    decisions.push(!isFinishA && !isFinishB ? 1 : 0);

    damageA.push(clamp(args.fighterA.signal.strikingOffense * 0.8 + randomNormal(random) * 7, 8, 95));
    damageB.push(clamp(args.fighterB.signal.strikingOffense * 0.8 + randomNormal(random) * 7, 8, 95));
    controlA.push(clamp(args.fighterA.signal.controlPressure * 0.9 + randomNormal(random) * 8, 4, 95));
    controlB.push(clamp(args.fighterB.signal.controlPressure * 0.9 + randomNormal(random) * 8, 4, 95));
    paceIndex.push(clamp((args.fighterA.signal.pace + args.fighterB.signal.pace) / 2 + randomNormal(random) * 5, 20, 90));
  }

  const winProbA = average(homeWins) ?? 0.5;
  const confidence = clamp((args.fighterA.confidence + args.fighterB.confidence) / 2, 20, 95);
  const winSkew = Math.abs((winProbA - 0.5) * 2);
  const upsetRisk = clamp((1 - winSkew) * (1 - confidence / 100), 0.04, 0.62);
  const roundsEstimated = clamp(
    2.1 + (average(decisions) ?? 0) * 1.7 + (confidence / 100) * 0.5,
    1,
    5
  );

  return {
    winProbA: round(winProbA, 4),
    winProbB: round(1 - winProbA, 4),
    finishProbA: round(average(finishesA) ?? 0, 4),
    finishProbB: round(average(finishesB) ?? 0, 4),
    koTkoProbA: round(average(koA) ?? 0, 4),
    koTkoProbB: round(average(koB) ?? 0, 4),
    submissionProbA: round(average(subA) ?? 0, 4),
    submissionProbB: round(average(subB) ?? 0, 4),
    decisionProb: round(average(decisions) ?? 0, 4),
    expectedDamageA: round(average(damageA) ?? 0, 3),
    expectedDamageB: round(average(damageB) ?? 0, 3),
    expectedControlA: round(average(controlA) ?? 0, 3),
    expectedControlB: round(average(controlB) ?? 0, 3),
    expectedPace: round(average(paceIndex) ?? 0, 3),
    confidence: round(confidence, 2),
    roundsEstimated: round(roundsEstimated, 2),
    upsetRisk: round(upsetRisk, 4)
  } satisfies FightSimulationSummary;
}

export async function buildUfcEventProjection(eventId: string) {
  const { prisma } = await import("@/lib/db/prisma");

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: {
          competitor: {
            include: {
              player: {
                include: {
                  playerGameStats: {
                    orderBy: { createdAt: "desc" },
                    take: 12
                  }
                }
              }
            }
          }
        }
      },
      participantContexts: true,
      currentMarketStates: {
        select: {
          marketType: true,
          period: true,
          bestHomeOddsAmerican: true,
          bestAwayOddsAmerican: true
        }
      }
    }
  });

  if (!event || event.league.key !== "UFC") {
    return null;
  }

  const compA = event.participants.find((participant) => participant.role === "COMPETITOR_A") ?? event.participants[0] ?? null;
  const compB = event.participants.find((participant) => participant.role === "COMPETITOR_B") ?? event.participants[1] ?? null;
  if (!compA || !compB) {
    return null;
  }

  const ratingsPrior = buildEventGameRatingsPrior({
    leagueKey: "UFC",
    homePlayers: compA.competitor.player ? [{
      id: compA.competitor.player.id,
      name: compA.competitor.player.name,
      position: compA.competitor.player.position,
      recentStats: compA.competitor.player.playerGameStats.map((row) => row.statsJson)
    }] : [],
    awayPlayers: compB.competitor.player ? [{
      id: compB.competitor.player.id,
      name: compB.competitor.player.name,
      position: compB.competitor.player.position,
      recentStats: compB.competitor.player.playerGameStats.map((row) => row.statsJson)
    }] : []
  });

  const buildProfile = async (participant: typeof compA, role: "COMPETITOR_A" | "COMPETITOR_B") => {
    const rowStats = participant.competitor.player?.playerGameStats ?? [];
    const signal = computeSignalFromRows(rowStats);
    const styleTag = toStyleTag(signal);
    const strengths = inferStrengths(signal);
    const weaknesses = inferWeaknesses(signal);
    const formScore = buildFormScore(rowStats);
    const opponentAdjustedFormScore = buildOpponentAdjustedForm(rowStats);
    const contextRow = event.participantContexts.find((context) => context.competitorId === participant.competitorId) ?? null;
    const latestStats = rowStats[0]?.statsJson;
    const lookupKey = participant.competitor.player?.name ?? participant.competitor.name;
    const amateurEnrichment = await fetchOptionalEnrichment(process.env.UFC_AMATEUR_PROFILE_URL ?? "", lookupKey);
    const campEnrichment = await fetchOptionalEnrichment(process.env.UFC_FIGHT_CAMP_PROFILE_URL ?? "", lookupKey);
    const campTier = campEnrichment?.campTier ?? readStat(latestStats, ["camp_tier", "campScore", "camp_quality"]) ?? 50;
    const trainingTier =
      campEnrichment?.trainingPartnerTier ??
      readStat(latestStats, ["training_partner_tier", "trainingPartnerScore", "sparring_partner_score"]) ??
      50;
    const amateurRank =
      amateurEnrichment?.amateurRank ??
      readStat(latestStats, ["amateur_rank_score", "amateurRankScore", "amateur_ranking"]) ??
      50;
    const gameOverall = readStat(latestStats, ["ufc_game_rating", "ea_ufc_overall", "overall", "ovr"]);
    const restOverride = readStat(latestStats, ["days_rest", "daysRest"]);
    const winRateOverride = readStat(latestStats, ["recent_win_rate", "recentWinRate"]);
    const marginOverride = readStat(latestStats, ["recent_margin", "recentMargin"]);
    const travelOverride = readStat(latestStats, ["travel_proxy_score", "travelProxyScore"]);
    const revengeOverride = readBoolean(latestStats, ["revenge_spot", "revengeSpot"]);
    const enrichmentCount = [amateurEnrichment, campEnrichment, typeof gameOverall === "number" ? 1 : null].filter(Boolean).length;
    const confidence = buildProfileConfidence({
      sampleSize: rowStats.length,
      enrichmentCount,
      gameRatingSeen: typeof gameOverall === "number"
    });

    const notes = [
      rowStats.length > 0
        ? `Recent sample uses ${rowStats.length} fights.`
        : "No fighter stat rows found; profile uses neutral priors.",
      styleTag === "STRIKER"
        ? "Primary style inference: striker-led offense."
        : styleTag === "GRAPPLER"
          ? "Primary style inference: grappling-led offense."
          : "Primary style inference: mixed style.",
      typeof amateurRank === "number" ? "Amateur ranking signal applied." : "Amateur ranking signal missing.",
      typeof campTier === "number" ? "Fight camp signal applied." : "Fight camp signal missing.",
      typeof trainingTier === "number" ? "Training partner signal applied." : "Training partner signal missing.",
      typeof gameOverall === "number"
        ? "UFC video-game overall ingested as a bounded prior."
        : "No UFC video-game rating detected in profile feed."
    ];

    return {
      competitorId: participant.competitorId,
      fighterName: participant.competitor.name,
      role,
      confidence,
      sampleSize: rowStats.length,
      amateurRankScore: clamp(amateurRank, 10, 98),
      campScore: clamp(campTier, 10, 98),
      trainingPartnerScore: clamp(trainingTier, 10, 98),
      formScore,
      opponentAdjustedFormScore,
      videoGameOverall: typeof gameOverall === "number" ? clamp(gameOverall, 40, 99) : null,
      styleTag,
      strengths,
      weaknesses,
      context: {
        daysRest: typeof restOverride === "number" ? restOverride : contextRow?.daysRest ?? null,
        recentWinRate: typeof winRateOverride === "number" ? winRateOverride : contextRow?.recentWinRate ?? null,
        recentMargin: typeof marginOverride === "number" ? marginOverride : contextRow?.recentMargin ?? null,
        travelProxyScore: typeof travelOverride === "number" ? travelOverride : contextRow?.travelProxyScore ?? null,
        revengeSpot: typeof revengeOverride === "boolean" ? revengeOverride : contextRow?.revengeSpot ?? false
      },
      signal,
      notes
    } satisfies FighterProfile;
  };

  const fighterA = await buildProfile(compA, "COMPETITOR_A");
  const fighterB = await buildProfile(compB, "COMPETITOR_B");
  const marketAnchor = buildMarketAnchor(event.currentMarketStates);
  const matchupBreakdown = buildMatchupBreakdown(fighterA, fighterB);
  const sim = simulateFight({
    fighterA,
    fighterB,
    marketAnchor,
    seed: event.id.length * 53 + event.startTime.getUTCDate() * 101,
    samples: 6000
  });

  const qualityGap = profileToPower(fighterA, fighterB);
  const projectedScoreA = clamp(50 + qualityGap * 0.45, 8, 92);
  const projectedScoreB = clamp(100 - projectedScoreA, 8, 92);

  return {
    modelKey: "ufc-fight-sim",
    modelVersion: "v1-opponent-adjusted",
    eventId: event.id,
    projectedHomeScore: round(projectedScoreA, 3),
    projectedAwayScore: round(projectedScoreB, 3),
    projectedTotal: round(projectedScoreA + projectedScoreB, 3),
    projectedSpreadHome: round(projectedScoreA - projectedScoreB, 3),
    winProbHome: sim.winProbA,
    winProbAway: sim.winProbB,
    metadata: {
      engine: "ufc-fight-sim",
      league: "UFC",
      sport: event.league.sport,
      eventType: event.eventType,
      fighterA,
      fighterB,
      matchupBreakdown,
      marketAnchor,
      ratingsPrior,
      simulation: sim,
      pipeline: {
        coreStatsSource: "player_game_stats.statsJson",
        optionalAmateurSource: process.env.UFC_AMATEUR_PROFILE_URL ? "UFC_AMATEUR_PROFILE_URL" : "not_configured",
        optionalCampSource: process.env.UFC_FIGHT_CAMP_PROFILE_URL ? "UFC_FIGHT_CAMP_PROFILE_URL" : "not_configured",
        notes: [
          "Opponent-adjusted form blends fight outcome quality with opponent strength signals.",
          "Camp/training/amateur/game-rating priors are bounded so they guide but do not overpower fight metrics.",
          "Market moneyline anchor is used as a light nudge when available."
        ]
      }
    }
  };
}
