import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

const CACHE_KEY = "mlb:data-quality-gate:v1";
const CACHE_TTL_SECONDS = 300;

export type MlbDataQualityGateResult = {
  pass: boolean;
  maxTier: "attack" | "watch" | "pass";
  dataQualityScore: number;
  blockers: string[];
  warnings: string[];
};

type GateArgs = {
  marketSource?: string | null;
  awayRatingsSource?: string | null;
  homeRatingsSource?: string | null;
  startersConfirmed?: boolean;
  lineupsConfirmed?: boolean;
};

type CachedQuality = {
  dataQualityScore: number;
  closingLinePct: number | null;
};

async function getCachedQualityScore(): Promise<CachedQuality | null> {
  const cached = await readHotCache<CachedQuality>(CACHE_KEY);
  if (cached) return cached;

  try {
    const { getMlbDataQualityReport } = await import("@/services/ops/mlb-data-quality");
    const report = await getMlbDataQualityReport({ lookbackDays: 3 });
    const closingMetric = report.coverage.find((c) => c.key === "closing_lines");
    const result: CachedQuality = {
      dataQualityScore: report.dataQualityScore,
      closingLinePct: closingMetric?.pct ?? null
    };
    await writeHotCache(CACHE_KEY, result, CACHE_TTL_SECONDS);
    return result;
  } catch {
    return null;
  }
}

export async function runMlbDataQualityGate(args: GateArgs): Promise<MlbDataQualityGateResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!args.marketSource || args.marketSource === "missing") {
    blockers.push("No-vig market anchor is missing; ATTACK requires a real market.");
  }

  const syntheticAway = args.awayRatingsSource === "synthetic";
  const syntheticHome = args.homeRatingsSource === "synthetic";
  if (syntheticAway || syntheticHome) {
    const which = [syntheticAway ? "away" : null, syntheticHome ? "home" : null].filter(Boolean).join("/");
    blockers.push(`Synthetic team ratings (${which}); ATTACK requires real analytics or spine-Elo-derived ratings.`);
  }

  const quality = await getCachedQualityScore();
  const score = quality?.dataQualityScore ?? 0;

  if (score < 0.75) {
    blockers.push(`Data quality score ${(score * 100).toFixed(1)}% is below the 75% ATTACK threshold.`);
  }

  if (!args.startersConfirmed) {
    warnings.push("Starting pitchers not confirmed; ATTACK capped at WATCH.");
  }
  if (!args.lineupsConfirmed) {
    warnings.push("Batting orders not locked; confidence is reduced.");
  }

  const closingPct = quality?.closingLinePct ?? null;
  if (closingPct !== null && closingPct < 0.5) {
    warnings.push(`Closing line coverage is low (${(closingPct * 100).toFixed(0)}%); CLV grading will be incomplete.`);
  }

  const pass = blockers.length === 0;
  let maxTier: "attack" | "watch" | "pass";
  if (!pass) {
    maxTier = "pass";
  } else if (!args.startersConfirmed || !args.lineupsConfirmed) {
    maxTier = "watch";
  } else {
    maxTier = "attack";
  }

  return { pass, maxTier, dataQualityScore: score, blockers, warnings };
}
