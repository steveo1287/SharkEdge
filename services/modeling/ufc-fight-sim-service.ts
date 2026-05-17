type FighterRole = "COMPETITOR_A" | "COMPETITOR_B";

type MarketAnchor = {
  fighterAWinProb: number | null;
};

type UfcFighterWarehouseRow = {
  id: string;
  full_name: string;
  stance: string | null;
  height_inches: number | null;
  reach_inches: number | null;
  combat_base: string | null;
  payload_json: unknown;
};

type FighterMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  direction: "higher" | "lower";
  rankScore: number | null;
  rankBand: "ELITE" | "PLUS" | "AVERAGE" | "BELOW_AVERAGE" | "MISSING";
};

type FighterProfile = {
  competitorId: string;
  fighterId: string | null;
  fighterName: string;
  matchedWarehouseName: string | null;
  role: FighterRole;
  source: "ufc_fighters.eliteProfile" | "ufc_fighters.stats" | "player_game_stats" | "missing";
  dataQuality: "A" | "B" | "C" | "D";
  readyForSimulation: boolean;
  missingCritical: string[];
  sample: {
    proFights: number | null;
    ufcFights: number | null;
    wins: number | null;
    losses: number | null;
    roundsFought: number | null;
  };
  background: {
    stance: string | null;
    heightInches: number | null;
    reachInches: number | null;
    combatBase: string | null;
    camp: string | null;
  };
  stats: {
    slpm: number | null;
    sapm: number | null;
    strikingDifferential: number | null;
    sigStrikeAccuracyPct: number | null;
    sigStrikeDefensePct: number | null;
    knockdownsPer15: number | null;
    takedownsPer15: number | null;
    takedownAccuracyPct: number | null;
    takedownDefensePct: number | null;
    submissionAttemptsPer15: number | null;
    submissionDefensePct: number | null;
    controlTimePct: number | null;
    controlEscapePct: number | null;
    finishRate: number | null;
    koLossRate: number | null;
    submissionLossRate: number | null;
    daysSinceLastFight: number | null;
  };
  statRankings: FighterMetric[];
  skillScores: {
    striking: number | null;
    wrestling: number | null;
    grappling: number | null;
    durability: number | null;
    cardio: number | null;
    fightIq: number | null;
    overall: number | null;
  };
  strengths: string[];
  weaknesses: string[];
  notes: string[];
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
  confidence: number;
  dataQuality: "A" | "B" | "C" | "D";
  noPickReason: string | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[%,$]/g, "").replace(/[^0-9.+-]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (typeof parsed === "number") return parsed;
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function nestedNumber(payload: Record<string, unknown>, keys: string[]) {
  const sources = [
    payload,
    asRecord(payload.eliteProfile),
    asRecord(asRecord(payload.eliteProfile).sample),
    asRecord(asRecord(payload.eliteProfile).careerStats),
    asRecord(asRecord(payload.eliteProfile).background),
    asRecord(payload.careerStats),
    asRecord(payload.stats),
    asRecord(payload.spiderSkills),
    asRecord(payload.background),
    asRecord(payload.profile),
    asRecord(payload.rawPayload)
  ];

  for (const source of sources) {
    for (const key of keys) {
      const value = toNumber(source[key]);
      if (typeof value === "number") return value;
    }
  }
  return null;
}

function nestedString(payload: Record<string, unknown>, keys: string[]) {
  const sources = [
    payload,
    asRecord(payload.eliteProfile),
    asRecord(asRecord(payload.eliteProfile).background),
    asRecord(payload.background),
    asRecord(payload.profile),
    asRecord(payload.camp),
    asRecord(payload.rawPayload)
  ];

  for (const source of sources) {
    for (const key of keys) {
      const value = firstString(source[key]);
      if (value) return value;
    }
  }
  return null;
}

function normalizePercent(value: number | null) {
  if (typeof value !== "number") return null;
  return value > 1 ? value : value * 100;
}

function metricRankScore(value: number | null, baseline: number, spread: number, direction: "higher" | "lower") {
  if (typeof value !== "number") return null;
  const signed = direction === "higher" ? value - baseline : baseline - value;
  return round(clamp(50 + signed * spread, 1, 99), 1);
}

function rankBand(score: number | null): FighterMetric["rankBand"] {
  if (score == null) return "MISSING";
  if (score >= 75) return "ELITE";
  if (score >= 60) return "PLUS";
  if (score >= 42) return "AVERAGE";
  return "BELOW_AVERAGE";
}

function metric(args: Omit<FighterMetric, "rankBand">): FighterMetric {
  return { ...args, rankBand: rankBand(args.rankScore) };
}

function average(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function qualityRank(grade: FighterProfile["dataQuality"]) {
  if (grade === "A") return 4;
  if (grade === "B") return 3;
  if (grade === "C") return 2;
  return 1;
}

function weakerQuality(left: FighterProfile["dataQuality"], right: FighterProfile["dataQuality"]): FighterProfile["dataQuality"] {
  return qualityRank(left) <= qualityRank(right) ? left : right;
}

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function probabilityToScore(probability: number) {
  return clamp(probability * 100, 0, 100);
}

function impliedProbability(americanOdds: number) {
  return americanOdds > 0 ? 100 / (americanOdds + 100) : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function buildMarketAnchor(states: Array<{ marketType: string; period: string; bestHomeOddsAmerican: number | null; bestAwayOddsAmerican: number | null }>): MarketAnchor {
  const moneyline = states.find((state) => state.marketType === "fight_winner" || state.marketType === "moneyline");
  if (!moneyline || typeof moneyline.bestHomeOddsAmerican !== "number" || typeof moneyline.bestAwayOddsAmerican !== "number") {
    return { fighterAWinProb: null };
  }
  const a = impliedProbability(moneyline.bestHomeOddsAmerican);
  const b = impliedProbability(moneyline.bestAwayOddsAmerican);
  const total = a + b;
  return { fighterAWinProb: total > 0 ? a / total : null };
}

function buildStatRankings(stats: FighterProfile["stats"]): FighterMetric[] {
  const strikeDiff = typeof stats.strikingDifferential === "number"
    ? stats.strikingDifferential
    : typeof stats.slpm === "number" && typeof stats.sapm === "number"
      ? round(stats.slpm - stats.sapm, 3)
      : null;

  return [
    metric({ key: "slpm", label: "Significant strikes landed/min", value: stats.slpm, unit: "per min", direction: "higher", rankScore: metricRankScore(stats.slpm, 3.7, 11.5, "higher") }),
    metric({ key: "sapm", label: "Significant strikes absorbed/min", value: stats.sapm, unit: "per min", direction: "lower", rankScore: metricRankScore(stats.sapm, 3.1, 12, "lower") }),
    metric({ key: "strikingDifferential", label: "Striking differential", value: strikeDiff, unit: "per min", direction: "higher", rankScore: metricRankScore(strikeDiff, 0, 18, "higher") }),
    metric({ key: "sigStrikeAccuracyPct", label: "Significant strike accuracy", value: stats.sigStrikeAccuracyPct, unit: "%", direction: "higher", rankScore: metricRankScore(stats.sigStrikeAccuracyPct, 44, 1.35, "higher") }),
    metric({ key: "sigStrikeDefensePct", label: "Significant strike defense", value: stats.sigStrikeDefensePct, unit: "%", direction: "higher", rankScore: metricRankScore(stats.sigStrikeDefensePct, 54, 1.35, "higher") }),
    metric({ key: "knockdownsPer15", label: "Knockdowns/15", value: stats.knockdownsPer15, unit: "per 15", direction: "higher", rankScore: metricRankScore(stats.knockdownsPer15, 0.25, 75, "higher") }),
    metric({ key: "takedownsPer15", label: "Takedowns/15", value: stats.takedownsPer15, unit: "per 15", direction: "higher", rankScore: metricRankScore(stats.takedownsPer15, 1.2, 14, "higher") }),
    metric({ key: "takedownAccuracyPct", label: "Takedown accuracy", value: stats.takedownAccuracyPct, unit: "%", direction: "higher", rankScore: metricRankScore(stats.takedownAccuracyPct, 35, 1.15, "higher") }),
    metric({ key: "takedownDefensePct", label: "Takedown defense", value: stats.takedownDefensePct, unit: "%", direction: "higher", rankScore: metricRankScore(stats.takedownDefensePct, 62, 1.15, "higher") }),
    metric({ key: "submissionAttemptsPer15", label: "Submission attempts/15", value: stats.submissionAttemptsPer15, unit: "per 15", direction: "higher", rankScore: metricRankScore(stats.submissionAttemptsPer15, 0.45, 32, "higher") }),
    metric({ key: "submissionDefensePct", label: "Submission defense", value: stats.submissionDefensePct, unit: "%", direction: "higher", rankScore: metricRankScore(stats.submissionDefensePct, 62, 1.1, "higher") }),
    metric({ key: "controlTimePct", label: "Control time", value: stats.controlTimePct, unit: "%", direction: "higher", rankScore: metricRankScore(stats.controlTimePct, 18, 1.45, "higher") }),
    metric({ key: "controlEscapePct", label: "Control escape", value: stats.controlEscapePct, unit: "%", direction: "higher", rankScore: metricRankScore(stats.controlEscapePct, 50, 1.1, "higher") }),
    metric({ key: "finishRate", label: "Finish rate", value: stats.finishRate != null ? round(stats.finishRate * 100, 2) : null, unit: "%", direction: "higher", rankScore: metricRankScore(stats.finishRate != null ? stats.finishRate * 100 : null, 52, 0.95, "higher") }),
    metric({ key: "koLossRate", label: "KO/TKO loss rate", value: stats.koLossRate != null ? round(stats.koLossRate * 100, 2) : null, unit: "%", direction: "lower", rankScore: metricRankScore(stats.koLossRate != null ? stats.koLossRate * 100 : null, 12, 1.5, "lower") })
  ];
}

function skillFromRankings(rankings: FighterMetric[], keys: string[]) {
  return average(keys.map((key) => rankings.find((item) => item.key === key)?.rankScore ?? null));
}

function inferStrengths(rankings: FighterMetric[]) {
  const strengths = rankings
    .filter((item) => item.rankScore != null && item.rankScore >= 63)
    .sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ""} (${item.rankBand})`);
  return strengths.length ? strengths : ["No plus skill verified by current real profile data"];
}

function inferWeaknesses(rankings: FighterMetric[]) {
  const weaknesses = rankings
    .filter((item) => item.rankScore != null && item.rankScore < 42)
    .sort((a, b) => (a.rankScore ?? 100) - (b.rankScore ?? 100))
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.value}${item.unit ? ` ${item.unit}` : ""} (${item.rankBand})`);
  return weaknesses.length ? weaknesses : ["No major weakness verified by current real profile data"];
}

function buildProfileFromWarehouse(args: {
  competitorId: string;
  displayName: string;
  role: FighterRole;
  row: UfcFighterWarehouseRow | null;
}): FighterProfile {
  const payload = asRecord(args.row?.payload_json);
  const elite = asRecord(payload.eliteProfile);
  const sample = asRecord(elite.sample);
  const career = asRecord(elite.careerStats);
  const background = asRecord(elite.background);
  const statsPayload = asRecord(payload.stats);
  const hasElite = Object.keys(elite).length > 0;
  const hasStatsPayload = Object.keys(statsPayload).length > 0;

  const proFights = nestedNumber(payload, ["proFights", "pro_fights"]);
  const ufcFights = nestedNumber(payload, ["ufcFights", "ufc_fights"]);
  const wins = nestedNumber(payload, ["wins", "recordWins", "record_wins"]);
  const losses = nestedNumber(payload, ["losses", "recordLosses", "record_losses"]);
  const roundsFought = nestedNumber(payload, ["roundsFought", "rounds_fought"]);

  const slpm = nestedNumber(payload, ["slpm", "sigStrikesLandedPerMin", "sig_strikes_landed_per_min"]);
  const sapm = nestedNumber(payload, ["sapm", "sigStrikesAbsorbedPerMin", "sig_strikes_absorbed_per_min"]);
  const strikingDifferential = nestedNumber(payload, ["strikingDifferential", "striking_differential"])
    ?? (typeof slpm === "number" && typeof sapm === "number" ? round(slpm - sapm, 3) : null);
  const sigStrikeAccuracyPct = normalizePercent(nestedNumber(payload, ["sigStrikeAccuracyPct", "strikeAccuracyPct", "sig_strike_accuracy_pct"]));
  const sigStrikeDefensePct = normalizePercent(nestedNumber(payload, ["sigStrikeDefensePct", "strikeDefensePct", "sig_strike_defense_pct"]));
  const takedownsPer15 = nestedNumber(payload, ["takedownsPer15", "tdAvg", "td_avg", "takedowns_per_15"]);
  const takedownAccuracyPct = normalizePercent(nestedNumber(payload, ["takedownAccuracyPct", "tdAccuracy", "takedown_accuracy_pct"]));
  const takedownDefensePct = normalizePercent(nestedNumber(payload, ["takedownDefensePct", "tdDefense", "takedown_defense_pct"]));
  const submissionAttemptsPer15 = nestedNumber(payload, ["submissionAttemptsPer15", "subAvg", "submissionAverage", "submission_attempts_per_15"]);
  const submissionDefensePct = normalizePercent(nestedNumber(payload, ["submissionDefensePct", "subDefense", "submission_defense_pct"]));
  const controlTimePct = normalizePercent(nestedNumber(payload, ["controlTimePct", "control_time_pct"]));
  const controlEscapePct = normalizePercent(nestedNumber(payload, ["controlEscapePct", "escapePct", "control_escape_pct"]));
  const finishRate = firstNumber(career.finishRate, payload.finishRate, statsPayload.finishRate);
  const koLossRate = firstNumber(career.koLossRate, payload.koLossRate, statsPayload.koLossRate);
  const submissionLossRate = firstNumber(career.submissionLossRate, payload.submissionLossRate, statsPayload.submissionLossRate);
  const knockdownsPer15 = nestedNumber(payload, ["knockdownsPer15", "knockdowns_per_15", "kdAvg"]);
  const daysSinceLastFight = nestedNumber(payload, ["daysSinceLastFight", "days_since_last_fight"]);

  const stats: FighterProfile["stats"] = {
    slpm,
    sapm,
    strikingDifferential,
    sigStrikeAccuracyPct,
    sigStrikeDefensePct,
    knockdownsPer15,
    takedownsPer15,
    takedownAccuracyPct,
    takedownDefensePct,
    submissionAttemptsPer15,
    submissionDefensePct,
    controlTimePct,
    controlEscapePct,
    finishRate,
    koLossRate,
    submissionLossRate,
    daysSinceLastFight
  };

  const statRankings = buildStatRankings(stats);
  const critical = [
    ["SLpM", slpm],
    ["SApM", sapm],
    ["Significant strike defense", sigStrikeDefensePct],
    ["Takedowns/15", takedownsPer15],
    ["Takedown defense", takedownDefensePct],
    ["Submission attempts/15", submissionAttemptsPer15]
  ] as const;
  const missingCritical = critical.filter(([, value]) => typeof value !== "number").map(([label]) => label);
  const presentCritical = critical.length - missingCritical.length;
  const realSample = (proFights ?? 0) > 0 || (ufcFights ?? 0) > 0 || (wins ?? 0) + (losses ?? 0) > 0;
  const readyForSimulation = Boolean(args.row && realSample && presentCritical >= 4);

  const payloadQuality = firstString(payload.dataQuality, elite.dataQuality) as FighterProfile["dataQuality"] | null;
  const dataQuality: FighterProfile["dataQuality"] = payloadQuality && ["A", "B", "C", "D"].includes(payloadQuality)
    ? payloadQuality
    : !args.row || !realSample || presentCritical < 3
      ? "D"
      : presentCritical >= 6 && (ufcFights ?? proFights ?? 0) >= 8
        ? "A"
        : presentCritical >= 5 && (ufcFights ?? proFights ?? 0) >= 4
          ? "B"
          : "C";

  const striking = skillFromRankings(statRankings, ["slpm", "sapm", "strikingDifferential", "sigStrikeAccuracyPct", "sigStrikeDefensePct", "knockdownsPer15"]);
  const wrestling = skillFromRankings(statRankings, ["takedownsPer15", "takedownAccuracyPct", "takedownDefensePct", "controlTimePct", "controlEscapePct"]);
  const grappling = skillFromRankings(statRankings, ["submissionAttemptsPer15", "submissionDefensePct", "controlTimePct", "controlEscapePct"]);
  const durability = skillFromRankings(statRankings, ["sapm", "sigStrikeDefensePct", "koLossRate"]);
  const cardio = nestedNumber(payload, ["staminaScore", "lateRoundPerformance", "paceScore"]);
  const fightIq = nestedNumber(payload, ["fightIqScore", "fightIQ", "gamePlanScore"]);
  const overall = average([striking, wrestling, grappling, durability, cardio, fightIq]);

  const source: FighterProfile["source"] = hasElite
    ? "ufc_fighters.eliteProfile"
    : hasStatsPayload
      ? "ufc_fighters.stats"
      : args.row
        ? "player_game_stats"
        : "missing";

  return {
    competitorId: args.competitorId,
    fighterId: args.row?.id ?? null,
    fighterName: args.displayName,
    matchedWarehouseName: args.row?.full_name ?? null,
    role: args.role,
    source,
    dataQuality,
    readyForSimulation,
    missingCritical,
    sample: { proFights, ufcFights, wins, losses, roundsFought },
    background: {
      stance: args.row?.stance ?? nestedString(payload, ["stance"]),
      heightInches: args.row?.height_inches ?? nestedNumber(payload, ["heightInches", "height_inches"]),
      reachInches: args.row?.reach_inches ?? nestedNumber(payload, ["reachInches", "reach_inches"]),
      combatBase: args.row?.combat_base ?? nestedString(payload, ["combatBase", "combat_base", "base"]),
      camp: nestedString(payload, ["camp", "gym", "team", "trainingCamp"])
    },
    stats,
    statRankings,
    skillScores: { striking, wrestling, grappling, durability, cardio, fightIq, overall },
    strengths: inferStrengths(statRankings),
    weaknesses: inferWeaknesses(statRankings),
    notes: [
      args.row ? `Matched real warehouse profile: ${args.row.full_name}.` : "No real warehouse profile matched this fighter name.",
      readyForSimulation ? "Profile passed real-data simulation gate." : `Profile blocked from confident simulation; missing ${missingCritical.join(", ") || "real fight sample"}.`,
      hasElite ? "Elite profile payload applied." : hasStatsPayload ? "UFCStats payload applied." : "No elite/UFCStats payload found."
    ]
  };
}

async function findWarehouseFighter(prisma: any, fighterName: string): Promise<UfcFighterWarehouseRow | null> {
  const rows = await prisma.$queryRaw<UfcFighterWarehouseRow[]>`
    SELECT id, full_name, stance, height_inches, reach_inches, combat_base, payload_json
    FROM ufc_fighters
    WHERE regexp_replace(lower(full_name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(${fighterName}), '[^a-z0-9]+', '', 'g')
       OR lower(full_name) = lower(${fighterName})
    ORDER BY
      CASE WHEN payload_json ? 'eliteProfile' THEN 0 WHEN payload_json ? 'stats' THEN 1 ELSE 2 END,
      updated_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function profilePower(profile: FighterProfile, opponent: FighterProfile) {
  const strikeEdge = ((profile.skillScores.striking ?? 50) - (opponent.skillScores.striking ?? 50)) * 0.24;
  const wrestlingEdge = ((profile.skillScores.wrestling ?? 50) - (opponent.skillScores.wrestling ?? 50)) * 0.19;
  const grapplingEdge = ((profile.skillScores.grappling ?? 50) - (opponent.skillScores.grappling ?? 50)) * 0.17;
  const durabilityEdge = ((profile.skillScores.durability ?? 50) - (opponent.skillScores.durability ?? 50)) * 0.12;
  const cardioEdge = ((profile.skillScores.cardio ?? 50) - (opponent.skillScores.cardio ?? 50)) * 0.09;
  const iqEdge = ((profile.skillScores.fightIq ?? 50) - (opponent.skillScores.fightIq ?? 50)) * 0.08;
  const reachEdge = ((profile.background.reachInches ?? 72) - (opponent.background.reachInches ?? 72)) * 0.18;
  const experienceEdge = ((profile.sample.ufcFights ?? profile.sample.proFights ?? 0) - (opponent.sample.ufcFights ?? opponent.sample.proFights ?? 0)) * 0.12;
  return strikeEdge + wrestlingEdge + grapplingEdge + durabilityEdge + cardioEdge + iqEdge + reachEdge + experienceEdge;
}

function simulateFight(args: { fighterA: FighterProfile; fighterB: FighterProfile; marketAnchor: MarketAnchor }): FightSimulationSummary {
  const dataQuality = weakerQuality(args.fighterA.dataQuality, args.fighterB.dataQuality);
  const missing = [
    !args.fighterA.readyForSimulation ? `Fighter A ${args.fighterA.fighterName} profile incomplete` : null,
    !args.fighterB.readyForSimulation ? `Fighter B ${args.fighterB.fighterName} profile incomplete` : null
  ].filter((item): item is string => Boolean(item));

  if (missing.length) {
    return {
      winProbA: 0.5,
      winProbB: 0.5,
      finishProbA: 0,
      finishProbB: 0,
      koTkoProbA: 0,
      koTkoProbB: 0,
      submissionProbA: 0,
      submissionProbB: 0,
      decisionProb: 0,
      confidence: 0,
      dataQuality: "D",
      noPickReason: missing.join("; ")
    };
  }

  const edge = profilePower(args.fighterA, args.fighterB) - profilePower(args.fighterB, args.fighterA);
  const modelProbA = clamp(logistic(edge / 24), 0.08, 0.92);
  const marketProbA = args.marketAnchor.fighterAWinProb;
  const blendedA = typeof marketProbA === "number" ? modelProbA * 0.82 + marketProbA * 0.18 : modelProbA;
  const winProbA = clamp(blendedA, 0.08, 0.92);

  const finishA = clamp(((args.fighterA.stats.finishRate ?? 0.48) * 0.62) + ((100 - (args.fighterB.skillScores.durability ?? 50)) / 100) * 0.22, 0.05, 0.72);
  const finishB = clamp(((args.fighterB.stats.finishRate ?? 0.48) * 0.62) + ((100 - (args.fighterA.skillScores.durability ?? 50)) / 100) * 0.22, 0.05, 0.72);
  const koShareA = clamp(((args.fighterA.statRankings.find((item) => item.key === "knockdownsPer15")?.rankScore ?? 50) / 100) * 0.68, 0.22, 0.82);
  const koShareB = clamp(((args.fighterB.statRankings.find((item) => item.key === "knockdownsPer15")?.rankScore ?? 50) / 100) * 0.68, 0.22, 0.82);
  const finishProbA = winProbA * finishA;
  const finishProbB = (1 - winProbA) * finishB;
  const qualityConfidence = dataQuality === "A" ? 0.88 : dataQuality === "B" ? 0.76 : dataQuality === "C" ? 0.58 : 0.35;
  const probabilitySeparation = Math.abs(winProbA - 0.5) * 1.15;

  return {
    winProbA: round(winProbA, 4),
    winProbB: round(1 - winProbA, 4),
    finishProbA: round(finishProbA, 4),
    finishProbB: round(finishProbB, 4),
    koTkoProbA: round(finishProbA * koShareA, 4),
    koTkoProbB: round(finishProbB * koShareB, 4),
    submissionProbA: round(finishProbA * (1 - koShareA), 4),
    submissionProbB: round(finishProbB * (1 - koShareB), 4),
    decisionProb: round(clamp(1 - finishProbA - finishProbB, 0, 1), 4),
    confidence: round(clamp(qualityConfidence + probabilitySeparation, 0.1, 0.95), 3),
    dataQuality,
    noPickReason: null
  };
}

function matchupBreakdown(fighterA: FighterProfile, fighterB: FighterProfile) {
  const components = {
    strikingEdge: round(((fighterA.skillScores.striking ?? 50) - (fighterB.skillScores.striking ?? 50)) * 0.24, 4),
    wrestlingEdge: round(((fighterA.skillScores.wrestling ?? 50) - (fighterB.skillScores.wrestling ?? 50)) * 0.19, 4),
    grapplingEdge: round(((fighterA.skillScores.grappling ?? 50) - (fighterB.skillScores.grappling ?? 50)) * 0.17, 4),
    durabilityEdge: round(((fighterA.skillScores.durability ?? 50) - (fighterB.skillScores.durability ?? 50)) * 0.12, 4),
    cardioEdge: round(((fighterA.skillScores.cardio ?? 50) - (fighterB.skillScores.cardio ?? 50)) * 0.09, 4),
    fightIqEdge: round(((fighterA.skillScores.fightIq ?? 50) - (fighterB.skillScores.fightIq ?? 50)) * 0.08, 4),
    reachEdge: round(((fighterA.background.reachInches ?? 72) - (fighterB.background.reachInches ?? 72)) * 0.18, 4)
  };
  const totalEdge = Object.values(components).reduce((sum, value) => sum + value, 0);
  return {
    fighterAName: fighterA.fighterName,
    fighterBName: fighterB.fighterName,
    components: { ...components, totalEdge: round(totalEdge, 4) },
    notes: [
      `A strengths: ${fighterA.strengths.join("; ")}`,
      `A weaknesses: ${fighterA.weaknesses.join("; ")}`,
      `B strengths: ${fighterB.strengths.join("; ")}`,
      `B weaknesses: ${fighterB.weaknesses.join("; ")}`
    ]
  };
}

export async function buildUfcEventProjection(eventId: string) {
  const { prisma } = await import("@/lib/db/prisma");

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      league: true,
      participants: {
        include: {
          competitor: true
        }
      },
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
  if (!compA || !compB) return null;

  const [warehouseA, warehouseB] = await Promise.all([
    findWarehouseFighter(prisma, compA.competitor.name).catch(() => null),
    findWarehouseFighter(prisma, compB.competitor.name).catch(() => null)
  ]);

  const fighterA = buildProfileFromWarehouse({ competitorId: compA.competitorId, displayName: compA.competitor.name, role: "COMPETITOR_A", row: warehouseA });
  const fighterB = buildProfileFromWarehouse({ competitorId: compB.competitorId, displayName: compB.competitor.name, role: "COMPETITOR_B", row: warehouseB });
  const marketAnchor = buildMarketAnchor(event.currentMarketStates);
  const sim = simulateFight({ fighterA, fighterB, marketAnchor });
  const breakdown = matchupBreakdown(fighterA, fighterB);

  const projectedScoreA = sim.noPickReason ? 50 : probabilityToScore(sim.winProbA);
  const projectedScoreB = sim.noPickReason ? 50 : probabilityToScore(sim.winProbB);

  return {
    modelKey: "ufc-fight-sim",
    modelVersion: "v2-real-profile-gated",
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
      matchupBreakdown: breakdown,
      marketAnchor,
      simulation: sim,
      promotion: {
        allowed: !sim.noPickReason && sim.dataQuality !== "D" && sim.confidence >= 0.55,
        noPickReason: sim.noPickReason,
        dataQuality: sim.dataQuality,
        confidence: sim.confidence
      },
      pipeline: {
        coreStatsSource: "ufc_fighters.payload_json.eliteProfile || ufc_fighters.payload_json.stats",
        neutralFallbacksAllowed: false,
        notes: [
          "This path refuses to build a confident fighter profile from empty neutral priors.",
          "Profile stats are matched from the UFC warehouse by fighter name and carry source, quality, missing-critical, and stat-ranking diagnostics.",
          "When real fighter profiles are incomplete, the projection returns a no-pick 50/50 shell instead of fake generated advantages."
        ]
      }
    }
  };
}
