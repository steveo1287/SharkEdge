import type { MlbProjectionRating } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbBatterAdvancedMatchup = {
  contactMultiplier: number;
  powerMultiplier: number;
  strikeoutMultiplier: number;
  walkMultiplier: number;
  paMultiplier: number;
  confidence: number;
  rollingFormScore: number;
  pitchTypeScore: number;
  environmentScore: number;
  platoonScore: number;
  drivers: string[];
};

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

function metric(metrics: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(metrics[key]);
    if (value !== null) return value;
  }
  return null;
}

function rate(value: number | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  return clamp(value > 1.5 ? value / 100 : value, min, max);
}

function averageLike(value: number | null, fallback: number, min = 0.18, max = 0.52) {
  if (value === null) return fallback;
  return clamp(value > 1 ? value / 1000 : value, min, max);
}

function getNestedNumber(source: Record<string, unknown> | null, keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const value = numberValue(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function rollingScore(metrics: Record<string, unknown>) {
  const season = averageLike(metric(metrics, ["xwoba", "xWoba", "expectedWoba", "woba"]), 0.315);
  const d7 = averageLike(metric(metrics, ["rolling7Xwoba", "last7Xwoba", "xwoba7"]), season);
  const d14 = averageLike(metric(metrics, ["rolling14Xwoba", "last14Xwoba", "xwoba14"]), season);
  const d30 = averageLike(metric(metrics, ["rolling30Xwoba", "last30Xwoba", "xwoba30"]), season);
  const recentPa = metric(metrics, ["rolling30Pa", "last30Pa", "recentPa"]);
  const confidence = clamp(Math.sqrt(Math.max(0, recentPa ?? 0)) / Math.sqrt(120), 0.15, 1);
  const score = clamp(((d7 - season) * 0.45 + (d14 - season) * 0.35 + (d30 - season) * 0.2) * 1000, -22, 22);
  return { score: score * confidence, confidence, season, d7, d14, d30 };
}

function pitchTypeScore(batterMetrics: Record<string, unknown>, pitcherMetrics: Record<string, unknown>) {
  const mix = objectValue(pitcherMetrics.pitchMix ?? pitcherMetrics.pitch_mix ?? pitcherMetrics.pitchMixJson);
  const batterByPitch = objectValue(batterMetrics.pitchTypeXwoba ?? batterMetrics.pitch_type_xwoba ?? batterMetrics.pitchTypeRunValues);
  if (!mix || !batterByPitch) return { score: 0, confidence: 0, matchedTypes: 0 };

  let weighted = 0;
  let weight = 0;
  let matchedTypes = 0;
  for (const [pitchName, mixValue] of Object.entries(mix)) {
    const pitchWeight = rate(numberValue(mixValue), 0, 0, 1);
    if (pitchWeight <= 0) continue;
    const batterValue = getNestedNumber(batterByPitch, [pitchName, pitchName.toLowerCase(), pitchName.toUpperCase()]);
    if (batterValue === null) continue;
    const normalized = averageLike(batterValue, 0.315, 0.16, 0.58);
    weighted += (normalized - 0.315) * pitchWeight;
    weight += pitchWeight;
    matchedTypes += 1;
  }

  if (!matchedTypes || weight <= 0) return { score: 0, confidence: 0, matchedTypes: 0 };
  const confidence = clamp(weight * Math.min(1, matchedTypes / 3), 0.15, 1);
  return { score: clamp((weighted / weight) * 1000, -24, 24) * confidence, confidence, matchedTypes };
}

function environmentScore(metrics: Record<string, unknown>) {
  const parkRun = rate(metric(metrics, ["parkRunFactor", "parkFactorRun", "parkFactor"]), 1, 0.78, 1.28);
  const parkHr = rate(metric(metrics, ["parkHrFactor", "parkHomeRunFactor", "hrParkFactor"]), 1, 0.68, 1.45);
  const weatherRun = rate(metric(metrics, ["weatherRunFactor", "weatherRun"]), 1, 0.78, 1.25);
  const weatherHr = rate(metric(metrics, ["weatherHrFactor", "weatherHomeRunFactor", "weatherHr"]), 1, 0.68, 1.5);
  const score = clamp(((parkRun - 1) * 12 + (weatherRun - 1) * 10 + (parkHr - 1) * 9 + (weatherHr - 1) * 8), -14, 18);
  const confidence = [parkRun, parkHr, weatherRun, weatherHr].filter((value) => Math.abs(value - 1) > 0.001).length / 4;
  return { score, confidence: clamp(confidence, 0, 1), parkRun, parkHr, weatherRun, weatherHr };
}

function platoonScore(batter: MlbProjectionRating, pitcherHand: "L" | "R") {
  const split = pitcherHand === "L" ? numberValue(batter.vs_lhp) : numberValue(batter.vs_rhp);
  const base = numberValue(batter.overall) ?? 70;
  return clamp(((split ?? base) - base) * 0.35, -8, 8);
}

export function deriveMlbBatterAdvancedMatchup(args: {
  batter: MlbProjectionRating;
  opponentStarter: MlbProjectionRating | null;
  pitcherHand: "L" | "R";
  battingOrder: number;
  teamRuns: number;
}): MlbBatterAdvancedMatchup {
  const batterMetrics = args.batter.metrics_json ?? {};
  const pitcherMetrics = args.opponentStarter?.metrics_json ?? {};
  const rolling = rollingScore(batterMetrics);
  const pitchTypes = pitchTypeScore(batterMetrics, pitcherMetrics);
  const environment = environmentScore(batterMetrics);
  const platoon = platoonScore(args.batter, args.pitcherHand);
  const lineupBoost = args.battingOrder <= 4 ? 1.01 : args.battingOrder >= 8 ? 0.985 : 1;
  const runBoost = clamp(0.985 + args.teamRuns / 300, 0.985, 1.018);
  const combined = rolling.score * 0.42 + pitchTypes.score * 0.34 + environment.score * 0.14 + platoon * 0.1;
  const confidence = clamp(0.22 + rolling.confidence * 0.34 + pitchTypes.confidence * 0.28 + environment.confidence * 0.16, 0.22, 0.92);
  const contactMultiplier = clamp(1 + combined * 0.0022 * confidence, 0.86, 1.16);
  const powerMultiplier = clamp(1 + (combined * 0.0032 + environment.score * 0.004) * confidence, 0.78, 1.28);
  const strikeoutMultiplier = clamp(1 - (rolling.score * 0.0015 + pitchTypes.score * 0.0012 + platoon * 0.001) * confidence, 0.86, 1.18);
  const walkMultiplier = clamp(1 + (rolling.score * 0.001 + pitchTypes.score * 0.0008) * confidence, 0.9, 1.14);
  const drivers: string[] = [];
  if (rolling.score >= 5) drivers.push("recent-form-up");
  if (rolling.score <= -5) drivers.push("recent-form-down");
  if (pitchTypes.score >= 5) drivers.push("pitch-mix-advantage");
  if (pitchTypes.score <= -5) drivers.push("pitch-mix-risk");
  if (environment.score >= 4) drivers.push("environment-lift");
  if (environment.score <= -4) drivers.push("environment-drag");
  if (platoon >= 3) drivers.push("platoon-edge");
  if (platoon <= -3) drivers.push("platoon-risk");

  return {
    contactMultiplier: round(contactMultiplier * lineupBoost * runBoost, 4),
    powerMultiplier: round(powerMultiplier * lineupBoost * runBoost, 4),
    strikeoutMultiplier: round(strikeoutMultiplier, 4),
    walkMultiplier: round(walkMultiplier, 4),
    paMultiplier: round(clamp(lineupBoost * runBoost, 0.96, 1.04), 4),
    confidence: round(confidence, 3),
    rollingFormScore: round(rolling.score, 3),
    pitchTypeScore: round(pitchTypes.score, 3),
    environmentScore: round(environment.score, 3),
    platoonScore: round(platoon, 3),
    drivers: drivers.length ? drivers : ["neutral-advanced-context"]
  };
}
