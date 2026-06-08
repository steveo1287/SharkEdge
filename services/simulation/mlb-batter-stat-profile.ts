import type { MlbProjectionRating } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbBatterStatProfile = {
  hitRate: number;
  walkRate: number;
  strikeoutRate: number;
  hrRate: number;
  tbPerHit: number;
  xAvg: number;
  xSlug: number;
  xWoba: number;
  iso: number;
  barrelRate: number;
  hardHitRate: number;
  avgExitVelocity: number;
  plateAppearances: number;
  confidence: number;
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

function getMetric(metrics: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(metrics[key]);
    if (value !== null) return value;
  }
  return null;
}

function decimalRate(value: number | null, fallback: number, min: number, max: number) {
  if (value === null) return fallback;
  return clamp(value > 1.5 ? value / 100 : value, min, max);
}

function averageLike(value: number | null, fallback: number, min = 0.12, max = 0.5) {
  if (value === null) return fallback;
  return clamp(value > 1 ? value / 1000 : value, min, max);
}

function slugLike(value: number | null, fallback: number) {
  if (value === null) return fallback;
  return clamp(value > 3 ? value / 1000 : value, 0.22, 0.72);
}

function profileDrivers(args: { xWoba: number; xSlug: number; iso: number; barrelRate: number; hardHitRate: number; strikeoutRate: number; walkRate: number; confidence: number }) {
  const drivers: string[] = [];
  if (args.xWoba >= 0.36) drivers.push("xwoba-plus");
  if (args.xSlug >= 0.48 || args.iso >= 0.2) drivers.push("power-plus");
  if (args.barrelRate >= 0.105) drivers.push("barrel-plus");
  if (args.hardHitRate >= 0.45) drivers.push("hard-hit-plus");
  if (args.strikeoutRate <= 0.18) drivers.push("contact-plus");
  if (args.walkRate >= 0.105) drivers.push("discipline-plus");
  if (args.confidence < 0.45) drivers.push("thin-batter-sample");
  return drivers.length ? drivers : ["balanced-batter-profile"];
}

export function deriveMlbBatterStatProfile(row: MlbProjectionRating, pitcherHand: "L" | "R"): MlbBatterStatProfile {
  const metrics = row.metrics_json ?? {};
  const pa = getMetric(metrics, ["plateAppearances", "pa", "projectedPa", "samplePa"]) ?? 0;
  const hits = getMetric(metrics, ["hits", "h"]);
  const atBats = getMetric(metrics, ["atBats", "ab"]);
  const homers = getMetric(metrics, ["hr", "homeRuns"]);
  const walks = getMetric(metrics, ["walks", "bb"]);
  const strikeouts = getMetric(metrics, ["strikeouts", "so"]);
  const totalBases = getMetric(metrics, ["totalBases", "tb"]);

  const avg = averageLike(getMetric(metrics, ["avg", "battingAverage", "ba"]), hits !== null && atBats ? hits / Math.max(1, atBats) : 0.245);
  const xAvg = averageLike(getMetric(metrics, ["xba", "xAvg", "expectedAverage"]), avg);
  const obp = averageLike(getMetric(metrics, ["obp", "onBasePercentage"]), 0.31, 0.18, 0.48);
  const slug = slugLike(getMetric(metrics, ["slg", "slugging"]), 0.405);
  const xSlug = slugLike(getMetric(metrics, ["xslg", "xSlug", "expectedSlugging"]), slug);
  const xWoba = averageLike(getMetric(metrics, ["xwoba", "xWoba", "expectedWoba", "woba"]), 0.315, 0.22, 0.5);
  const iso = decimalRate(getMetric(metrics, ["iso", "isolatedPower", "isoPower"]), Math.max(0.04, slug - avg), 0.02, 0.35);

  const splitWoba = pitcherHand === "L"
    ? getMetric(metrics, ["vsLhpWoba", "vsLhpXwoba"])
    : getMetric(metrics, ["vsRhpWoba", "vsRhpXwoba"]);
  const splitBoost = splitWoba === null ? 0 : clamp((averageLike(splitWoba, xWoba, 0.2, 0.5) - xWoba) * 0.2, -0.025, 0.025);

  const hitRate = decimalRate(getMetric(metrics, ["hitRate", "hitsPerPa"]), hits !== null && pa ? hits / Math.max(1, pa) : xAvg * 0.9, 0.11, 0.39) + splitBoost;
  const walkRate = decimalRate(getMetric(metrics, ["walkRate", "bbRate"]), walks !== null && pa ? walks / Math.max(1, pa) : Math.max(0.035, obp - avg * 0.88), 0.03, 0.19);
  const strikeoutRate = decimalRate(getMetric(metrics, ["strikeoutRate", "kRate", "soRate"]), strikeouts !== null && pa ? strikeouts / Math.max(1, pa) : 0.225, 0.07, 0.4);
  const hrRate = decimalRate(getMetric(metrics, ["hrRate", "homeRunRate"]), homers !== null && pa ? homers / Math.max(1, pa) : Math.max(0.004, iso * 0.16), 0.003, 0.105);
  const tbPerHit = clamp(getMetric(metrics, ["totalBasesPerHit", "tbPerHit"]) ?? (totalBases !== null && hits ? totalBases / Math.max(1, hits) : 1 + iso * 2.7), 1.05, 2.55);
  const barrelRate = decimalRate(getMetric(metrics, ["barrelRate", "brlRate"]), 0.075, 0.01, 0.23);
  const hardHitRate = decimalRate(getMetric(metrics, ["hardHitRate", "hardHitPct"]), 0.39, 0.18, 0.62);
  const avgExitVelocity = clamp(getMetric(metrics, ["avgExitVelo", "averageExitVelocity", "exitVelocity"]) ?? 88.4, 80, 98);
  const fieldCount = [hits, atBats, homers, walks, strikeouts, totalBases, xAvg, xSlug, xWoba, iso, barrelRate, hardHitRate].filter((value) => value !== null).length;
  const confidence = round(clamp(Math.sqrt(Math.max(0, pa)) / Math.sqrt(500) * 0.65 + Math.min(1, fieldCount / 10) * 0.35, 0.18, 0.98), 3);

  return {
    hitRate: round(clamp(hitRate, 0.11, 0.39), 4),
    walkRate: round(walkRate, 4),
    strikeoutRate: round(strikeoutRate, 4),
    hrRate: round(clamp(hrRate + Math.max(0, splitBoost * 0.3), 0.003, 0.105), 4),
    tbPerHit: round(tbPerHit, 3),
    xAvg: round(xAvg, 3),
    xSlug: round(xSlug, 3),
    xWoba: round(xWoba + splitBoost, 3),
    iso: round(iso, 3),
    barrelRate: round(barrelRate, 4),
    hardHitRate: round(hardHitRate, 4),
    avgExitVelocity: round(avgExitVelocity, 1),
    plateAppearances: Math.round(pa),
    confidence,
    drivers: profileDrivers({ xWoba: xWoba + splitBoost, xSlug, iso, barrelRate, hardHitRate, strikeoutRate, walkRate, confidence })
  };
}
