import type { MlbProjectionLineup, MlbProjectionRating } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbPlayerStatMarketVariance = {
  hits: number;
  totalBases: number;
  homeRun: number;
  walks: number;
  strikeouts: number;
};

export type MlbEliteHitterContextAdjustment = {
  modelVersion: "mlb-elite-hitter-context-v1";
  calibratedMeans: {
    expectedHits: number;
    expectedTotalBases: number;
    expectedHomeRuns: number;
    expectedWalks: number;
    expectedStrikeouts: number;
    expectedRuns: number;
    expectedRbi: number;
  };
  multipliers: {
    hit: number;
    totalBases: number;
    homeRun: number;
    walk: number;
    strikeout: number;
    run: number;
    rbi: number;
    confidence: number;
  };
  historicalErrorCorrection: {
    sampleSize: number;
    confidence: number;
    hitMeanBias: number;
    totalBasesMeanBias: number;
    homeRunMeanBias: number;
    walkMeanBias: number;
    strikeoutMeanBias: number;
  };
  umpireZoneImpact: {
    umpireId: string | null;
    confidence: number;
    strikeoutMultiplier: number;
    walkMultiplier: number;
    contactMultiplier: number;
    runEnvironmentMultiplier: number;
  };
  bullpenExposure: {
    expectedBullpenPlateAppearances: number;
    leverageExposure: number;
    handednessAdvantage: number;
    hitMultiplier: number;
    powerMultiplier: number;
    confidence: number;
  };
  varianceByMarket: MlbPlayerStatMarketVariance;
  lineupProtection: {
    protectionScore: number;
    baseStateRbiMultiplier: number;
    runMultiplier: number;
    confidence: number;
  };
  lineupConfirmation: {
    status: "CONFIRMED" | "PROBABLE" | "STALE";
    minutesSinceCapture: number | null;
    decayMultiplier: number;
    confidencePenalty: number;
  };
  settlementFeedback: {
    sampleSize: number;
    calibrationDrift: number;
    lastUpdated: string | null;
    notes: string[];
  };
  confidenceAdjustment: number;
  drivers: string[];
};

const RELIEF_ROLES = new Set(["CLOSER", "SETUP", "MIDDLE_RELIEF", "LONG_RELIEF", "MOP_UP"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function metric(row: MlbProjectionRating | null | undefined, keys: string[], fallback: number | null = null) {
  const metrics = row?.metrics_json ?? {};
  for (const key of keys) {
    const value = numberValue(metrics[key]);
    if (value !== null) return value;
  }
  return fallback;
}

function nestedMetric(source: Record<string, unknown> | null, keys: string[], fallback = 0) {
  if (!source) return fallback;
  for (const key of keys) {
    const value = numberValue(source[key]);
    if (value !== null) return value;
  }
  return fallback;
}

function rateValue(value: number | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  return clamp(value > 1.5 ? value / 100 : value, min, max);
}

function skill(value: unknown, fallback = 70) {
  const parsed = numberValue(value);
  return parsed === null ? fallback : parsed;
}

function pitcherSkill(row: MlbProjectionRating | null | undefined) {
  if (!row) return 70;
  return clamp(
    skill(row.xera_quality) * 0.22 +
    skill(row.fip_quality) * 0.18 +
    skill(row.k_bb) * 0.18 +
    (100 - skill(row.hr_risk, 30)) * 0.11 +
    skill(row.groundball_rate) * 0.07 +
    skill(row.platoon_split) * 0.08 +
    skill(row.arsenal_quality) * 0.16,
    35,
    95
  );
}

function pitcherThrows(row: MlbProjectionRating | null | undefined): "L" | "R" {
  const throwsValue = String(row?.metrics_json?.throws ?? row?.metrics_json?.handedness ?? "R").toUpperCase();
  return throwsValue.startsWith("L") ? "L" : "R";
}

function batterSplit(batter: MlbProjectionRating, hand: "L" | "R") {
  return hand === "L" ? skill(batter.vs_lhp) : skill(batter.vs_rhp);
}

function capturedMinutes(lineup: MlbProjectionLineup | null | undefined) {
  if (!lineup?.captured_at) return null;
  const captured = new Date(lineup.captured_at).getTime();
  if (!Number.isFinite(captured)) return null;
  const minutes = (Date.now() - captured) / 60000;
  return Number.isFinite(minutes) ? Math.max(0, minutes) : null;
}

function deriveHistoricalCorrection(batter: MlbProjectionRating) {
  const calibration = objectValue(batter.metrics_json?.historicalErrorCorrection ?? batter.metrics_json?.statCalibration ?? batter.metrics_json?.calibration);
  const sampleSize = Math.max(0, metric(batter, ["statCalibrationSample", "historicalErrorSample", "settledPropSample"], nestedMetric(calibration, ["sampleSize", "n"], 0)) ?? 0);
  const confidence = clamp(Math.sqrt(sampleSize) / Math.sqrt(180), 0, 0.82);
  return {
    sampleSize,
    confidence,
    hitMeanBias: nestedMetric(calibration, ["hitMeanBias", "hitsMeanBias", "expectedHitsBias"], metric(batter, ["hitMeanBias", "hitsMeanBias"], 0) ?? 0),
    totalBasesMeanBias: nestedMetric(calibration, ["totalBasesMeanBias", "tbMeanBias", "expectedTotalBasesBias"], metric(batter, ["totalBasesMeanBias", "tbMeanBias"], 0) ?? 0),
    homeRunMeanBias: nestedMetric(calibration, ["homeRunMeanBias", "hrMeanBias", "expectedHomeRunsBias"], metric(batter, ["homeRunMeanBias", "hrMeanBias"], 0) ?? 0),
    walkMeanBias: nestedMetric(calibration, ["walkMeanBias", "bbMeanBias", "expectedWalksBias"], metric(batter, ["walkMeanBias", "bbMeanBias"], 0) ?? 0),
    strikeoutMeanBias: nestedMetric(calibration, ["strikeoutMeanBias", "kMeanBias", "expectedStrikeoutsBias"], metric(batter, ["strikeoutMeanBias", "kMeanBias"], 0) ?? 0)
  };
}

function deriveUmpireImpact(batter: MlbProjectionRating, opponentStarter: MlbProjectionRating | null) {
  const umpire = objectValue(batter.metrics_json?.umpire ?? opponentStarter?.metrics_json?.umpire);
  const umpireId = stringValue(umpire?.id ?? umpire?.umpireId ?? batter.metrics_json?.umpireId ?? opponentStarter?.metrics_json?.umpireId);
  const sample = Math.max(0, nestedMetric(umpire, ["sampleSize", "calledGames", "n"], metric(batter, ["umpireSample", "umpireCalledGames"], 0) ?? 0));
  const confidence = clamp(Math.sqrt(sample) / Math.sqrt(120), 0, 0.78);
  const strikeZoneBoost = nestedMetric(umpire, ["strikeZoneBoost", "calledStrikeBoost", "kBoost"], metric(batter, ["umpireStrikeoutBoost", "umpireKBoost"], 0) ?? 0);
  const walkBoost = nestedMetric(umpire, ["walkBoost", "bbBoost", "walkRateBoost"], metric(batter, ["umpireWalkBoost", "umpireBbBoost"], 0) ?? 0);
  const runFactor = rateValue(nestedMetric(umpire, ["runFactor", "runEnvironmentFactor"], metric(batter, ["umpireRunFactor"], 1) ?? 1), 1, 0.88, 1.12);
  return {
    umpireId,
    confidence,
    strikeoutMultiplier: round(clamp(1 + strikeZoneBoost * confidence, 0.92, 1.12), 4),
    walkMultiplier: round(clamp(1 + walkBoost * confidence - strikeZoneBoost * 0.35 * confidence, 0.9, 1.13), 4),
    contactMultiplier: round(clamp(1 - strikeZoneBoost * 0.38 * confidence, 0.94, 1.06), 4),
    runEnvironmentMultiplier: round(clamp(1 + (runFactor - 1) * confidence, 0.94, 1.06), 4)
  };
}

function deriveBullpenExposure(args: {
  batter: MlbProjectionRating;
  opponentStarter: MlbProjectionRating | null;
  opponentPitchers: MlbProjectionRating[];
  battingOrder: number;
  expectedPlateAppearances: number;
}) {
  const relievers = args.opponentPitchers.filter((pitcher) => RELIEF_ROLES.has(String(pitcher.role_tier ?? "")));
  const starterIp = metric(args.opponentStarter, ["inningsPerStart", "projectedInnings", "expectedInnings"], 5.4) ?? 5.4;
  const expectedBullpenPa = clamp(args.expectedPlateAppearances * clamp((9 - starterIp) / 9, 0.14, 0.58) * (args.battingOrder <= 4 ? 1.08 : 0.96), 0.25, 2.9);
  if (!relievers.length) {
    return {
      expectedBullpenPlateAppearances: round(expectedBullpenPa, 2),
      leverageExposure: round(args.battingOrder <= 4 ? 0.72 : 0.45, 3),
      handednessAdvantage: 0,
      hitMultiplier: 1,
      powerMultiplier: 1,
      confidence: 0.12
    };
  }

  const weighted = relievers.map((reliever) => {
    const role = String(reliever.role_tier ?? "");
    const roleWeight = role === "CLOSER" ? 1.35 : role === "SETUP" ? 1.18 : role === "MIDDLE_RELIEF" ? 0.95 : 0.74;
    const unavailable = Boolean(reliever.metrics_json?.unavailable || reliever.metrics_json?.fatigued);
    return { reliever, weight: unavailable ? roleWeight * 0.35 : roleWeight };
  });
  const weightSum = weighted.reduce((sum, row) => sum + row.weight, 0) || 1;
  const bullpenSkill = weighted.reduce((sum, row) => sum + pitcherSkill(row.reliever) * row.weight, 0) / weightSum;
  const avgSplit = weighted.reduce((sum, row) => sum + (batterSplit(args.batter, pitcherThrows(row.reliever)) - 70) * row.weight, 0) / weightSum;
  const leverageExposure = clamp((args.battingOrder <= 4 ? 0.72 : args.battingOrder <= 6 ? 0.56 : 0.42) + expectedBullpenPa * 0.04, 0.34, 0.88);
  const confidence = clamp(Math.sqrt(relievers.length) / Math.sqrt(8), 0.18, 0.82);
  const bullpenEdge = clamp(70 - bullpenSkill + avgSplit * 0.45, -16, 16);
  const exposureWeight = clamp(expectedBullpenPa / Math.max(0.1, args.expectedPlateAppearances), 0.05, 0.62);

  return {
    expectedBullpenPlateAppearances: round(expectedBullpenPa, 2),
    leverageExposure: round(leverageExposure, 3),
    handednessAdvantage: round(avgSplit, 3),
    hitMultiplier: round(clamp(1 + bullpenEdge * 0.0022 * exposureWeight * confidence, 0.94, 1.07), 4),
    powerMultiplier: round(clamp(1 + bullpenEdge * 0.0032 * exposureWeight * confidence, 0.9, 1.11), 4),
    confidence: round(confidence, 3)
  };
}

function deriveVariance(batter: MlbProjectionRating, bullpenConfidence: number): MlbPlayerStatMarketVariance {
  const variance = objectValue(batter.metrics_json?.marketVariance ?? batter.metrics_json?.statVariance ?? batter.metrics_json?.playerVariance);
  const basePowerVol = rateValue(metric(batter, ["barrelRate", "barrelPct"], 0.075), 0.075, 0.02, 0.22);
  const contactVol = rateValue(metric(batter, ["strikeoutRate", "kRate"], 0.22), 0.22, 0.08, 0.38);
  const settlementVol = rateValue(metric(batter, ["settlementVolatility", "propVolatility"], 1), 1, 0.72, 1.45);
  return {
    hits: round(clamp(nestedMetric(variance, ["hits"], 1 + (contactVol - 0.22) * 0.7) * settlementVol, 0.72, 1.38), 3),
    totalBases: round(clamp(nestedMetric(variance, ["totalBases", "tb"], 1 + (basePowerVol - 0.075) * 2.2 + bullpenConfidence * 0.06) * settlementVol, 0.76, 1.52), 3),
    homeRun: round(clamp(nestedMetric(variance, ["homeRun", "hr"], 1 + (basePowerVol - 0.075) * 4.5) * settlementVol, 0.72, 1.78), 3),
    walks: round(clamp(nestedMetric(variance, ["walks", "bb"], 1), 0.76, 1.38), 3),
    strikeouts: round(clamp(nestedMetric(variance, ["strikeouts", "k"], 1 + (contactVol - 0.22) * 0.9), 0.76, 1.42), 3)
  };
}

function deriveLineupProtection(args: {
  batter: MlbProjectionRating;
  lineupHitters: MlbProjectionRating[];
  battingOrder: number;
}) {
  const idx = args.battingOrder - 1;
  const before = args.lineupHitters[idx - 1];
  const after = args.lineupHitters[idx + 1];
  const after2 = args.lineupHitters[idx + 2];
  const beforeObp = rateValue(metric(before, ["obp", "xobp", "onBaseRate"], 0.32), 0.32, 0.24, 0.45);
  const selfObp = rateValue(metric(args.batter, ["obp", "xobp", "onBaseRate"], 0.32), 0.32, 0.24, 0.45);
  const afterPower = rateValue(metric(after, ["slg", "xslg"], 0.41), 0.41, 0.29, 0.68);
  const after2Power = rateValue(metric(after2, ["slg", "xslg"], 0.4), 0.4, 0.28, 0.66);
  const protectionScore = clamp((beforeObp - 0.32) * 70 + (selfObp - 0.32) * 24 + (afterPower - 0.41) * 62 + (after2Power - 0.4) * 28 + (args.battingOrder <= 4 ? 4 : -2), -16, 18);
  const confidence = clamp((before ? 0.22 : 0) + (after ? 0.34 : 0) + (after2 ? 0.16 : 0) + 0.18, 0.18, 0.9);
  return {
    protectionScore: round(protectionScore, 3),
    baseStateRbiMultiplier: round(clamp(1 + protectionScore * 0.006 * confidence, 0.88, 1.14), 4),
    runMultiplier: round(clamp(1 + protectionScore * 0.004 * confidence, 0.91, 1.11), 4),
    confidence: round(confidence, 3)
  };
}

function deriveLineupDecay(lineup: MlbProjectionLineup | null | undefined) {
  const minutes = capturedMinutes(lineup);
  const confirmed = Boolean(lineup?.confirmed);
  const stale = minutes !== null && minutes > 240;
  const status: "CONFIRMED" | "PROBABLE" | "STALE" = stale ? "STALE" : confirmed ? "CONFIRMED" : "PROBABLE";
  const timeDecay = minutes === null ? 0.04 : clamp(minutes / 720, 0, 0.22);
  const confidencePenalty = clamp((confirmed ? 0 : 0.12) + (stale ? 0.1 : 0) + timeDecay, 0, 0.34);
  return {
    status,
    minutesSinceCapture: minutes === null ? null : Math.round(minutes),
    decayMultiplier: round(clamp(1 - confidencePenalty * 0.22, 0.91, 1), 4),
    confidencePenalty: round(confidencePenalty, 3)
  };
}

function deriveSettlementFeedback(batter: MlbProjectionRating) {
  const feedback = objectValue(batter.metrics_json?.settlementFeedback ?? batter.metrics_json?.postGameFeedback);
  const sampleSize = Math.max(0, nestedMetric(feedback, ["sampleSize", "n"], metric(batter, ["settlementSample"], 0) ?? 0));
  const calibrationDrift = clamp(nestedMetric(feedback, ["calibrationDrift", "drift"], metric(batter, ["calibrationDrift"], 0) ?? 0), -1, 1);
  const lastUpdated = stringValue(feedback?.lastUpdated ?? feedback?.updatedAt ?? batter.metrics_json?.settlementFeedbackUpdatedAt);
  const notes = [
    sampleSize ? `Settlement feedback sample ${sampleSize}.` : "No settlement feedback sample attached yet.",
    `Calibration drift ${calibrationDrift.toFixed(3)}.`
  ];
  return { sampleSize, calibrationDrift: round(calibrationDrift, 4), lastUpdated, notes };
}

export function deriveMlbEliteHitterContextAdjustment(args: {
  batter: MlbProjectionRating;
  lineup: MlbProjectionLineup | null | undefined;
  lineupHitters: MlbProjectionRating[];
  opponentStarter: MlbProjectionRating | null;
  opponentPitchers: MlbProjectionRating[];
  battingOrder: number;
  expectedPlateAppearances: number;
  expectedHits: number;
  expectedTotalBases: number;
  expectedHomeRuns: number;
  expectedWalks: number;
  expectedStrikeouts: number;
  expectedRuns: number;
  expectedRbi: number;
}): MlbEliteHitterContextAdjustment {
  const historical = deriveHistoricalCorrection(args.batter);
  const umpire = deriveUmpireImpact(args.batter, args.opponentStarter);
  const bullpen = deriveBullpenExposure(args);
  const variance = deriveVariance(args.batter, bullpen.confidence);
  const protection = deriveLineupProtection(args);
  const lineupConfirmation = deriveLineupDecay(args.lineup);
  const settlement = deriveSettlementFeedback(args.batter);

  const hitMultiplier = clamp(umpire.contactMultiplier * bullpen.hitMultiplier * lineupConfirmation.decayMultiplier, 0.86, 1.14);
  const tbMultiplier = clamp(umpire.contactMultiplier * bullpen.powerMultiplier * lineupConfirmation.decayMultiplier, 0.82, 1.2);
  const hrMultiplier = clamp(bullpen.powerMultiplier * lineupConfirmation.decayMultiplier * (umpire.runEnvironmentMultiplier * 0.55 + 0.45), 0.78, 1.24);
  const walkMultiplier = clamp(umpire.walkMultiplier * lineupConfirmation.decayMultiplier, 0.84, 1.16);
  const strikeoutMultiplier = clamp(umpire.strikeoutMultiplier / Math.max(0.92, lineupConfirmation.decayMultiplier), 0.88, 1.18);
  const runMultiplier = clamp(protection.runMultiplier * umpire.runEnvironmentMultiplier, 0.86, 1.16);
  const rbiMultiplier = clamp(protection.baseStateRbiMultiplier * umpire.runEnvironmentMultiplier, 0.84, 1.18);

  const calibratedMeans = {
    expectedHits: round(clamp(args.expectedHits * hitMultiplier - historical.hitMeanBias * historical.confidence, 0, 4.2), 4),
    expectedTotalBases: round(clamp(args.expectedTotalBases * tbMultiplier - historical.totalBasesMeanBias * historical.confidence, 0, 9), 4),
    expectedHomeRuns: round(clamp(args.expectedHomeRuns * hrMultiplier - historical.homeRunMeanBias * historical.confidence, 0, 1.5), 4),
    expectedWalks: round(clamp(args.expectedWalks * walkMultiplier - historical.walkMeanBias * historical.confidence, 0, 4), 4),
    expectedStrikeouts: round(clamp(args.expectedStrikeouts * strikeoutMultiplier - historical.strikeoutMeanBias * historical.confidence, 0, 6), 4),
    expectedRuns: round(clamp(args.expectedRuns * runMultiplier, 0, 3.5), 4),
    expectedRbi: round(clamp(args.expectedRbi * rbiMultiplier, 0, 4.5), 4)
  };

  const confidenceAdjustment = round(clamp(
    historical.confidence * 0.04 +
    umpire.confidence * 0.03 +
    bullpen.confidence * 0.04 +
    protection.confidence * 0.03 -
    lineupConfirmation.confidencePenalty * 0.72 -
    Math.abs(settlement.calibrationDrift) * 0.035,
    -0.24,
    0.12
  ), 4);

  const drivers: string[] = [];
  if (historical.confidence >= 0.25) drivers.push("historical-error-corrected");
  if (umpire.confidence >= 0.25 && umpire.strikeoutMultiplier > 1.015) drivers.push("umpire-k-boost");
  if (umpire.confidence >= 0.25 && umpire.walkMultiplier > 1.015) drivers.push("umpire-walk-boost");
  if (bullpen.confidence >= 0.25 && bullpen.powerMultiplier > 1.015) drivers.push("bullpen-power-window");
  if (bullpen.confidence >= 0.25 && bullpen.hitMultiplier < 0.985) drivers.push("bullpen-suppression-window");
  if (variance.totalBases >= 1.18 || variance.homeRun >= 1.2) drivers.push("high-variance-power-market");
  if (protection.protectionScore >= 5) drivers.push("lineup-protection-plus");
  if (protection.protectionScore <= -5) drivers.push("lineup-protection-minus");
  if (lineupConfirmation.status !== "CONFIRMED") drivers.push("lineup-confirmation-decay");
  if (settlement.sampleSize > 0) drivers.push("settlement-feedback-attached");

  return {
    modelVersion: "mlb-elite-hitter-context-v1",
    calibratedMeans,
    multipliers: {
      hit: round(hitMultiplier, 4),
      totalBases: round(tbMultiplier, 4),
      homeRun: round(hrMultiplier, 4),
      walk: round(walkMultiplier, 4),
      strikeout: round(strikeoutMultiplier, 4),
      run: round(runMultiplier, 4),
      rbi: round(rbiMultiplier, 4),
      confidence: round(clamp(1 + confidenceAdjustment, 0.76, 1.12), 4)
    },
    historicalErrorCorrection: {
      sampleSize: historical.sampleSize,
      confidence: round(historical.confidence, 3),
      hitMeanBias: round(historical.hitMeanBias, 4),
      totalBasesMeanBias: round(historical.totalBasesMeanBias, 4),
      homeRunMeanBias: round(historical.homeRunMeanBias, 4),
      walkMeanBias: round(historical.walkMeanBias, 4),
      strikeoutMeanBias: round(historical.strikeoutMeanBias, 4)
    },
    umpireZoneImpact: {
      umpireId: umpire.umpireId,
      confidence: round(umpire.confidence, 3),
      strikeoutMultiplier: umpire.strikeoutMultiplier,
      walkMultiplier: umpire.walkMultiplier,
      contactMultiplier: umpire.contactMultiplier,
      runEnvironmentMultiplier: umpire.runEnvironmentMultiplier
    },
    bullpenExposure: bullpen,
    varianceByMarket: variance,
    lineupProtection: protection,
    lineupConfirmation,
    settlementFeedback: settlement,
    confidenceAdjustment,
    drivers: drivers.length ? drivers : ["neutral-elite-context"]
  };
}
