export type TrendQualityTier = "S" | "A" | "B" | "C" | "HIDE";
export type TrendOverfitRisk = "low" | "medium" | "high";
export type TrendBaseRisk = "low" | "medium" | "high";
export type TrendQualityMarketType = "moneyline" | "spread" | "total" | "prop" | "unknown";
export type TrendActionability = "ACTIONABLE" | "WATCHLIST" | "RESEARCH_ONLY" | "HIDE";

export type TrendQualityInput = {
  id?: string;
  market?: string | null;
  marketType?: string | null;
  sampleSize?: number | null;
  wins?: number | null;
  losses?: number | null;
  pushes?: number | null;
  hitRate?: number | null;
  roi?: number | null;
  profitUnits?: number | null;
  currentOddsAmerican?: number | null;
  currentEdge?: number | null;
  fairProbability?: number | null;
  averageClv?: number | null;
  positiveClvRate?: number | null;
  recencyHitRate?: number | null;
  marketBreadth?: number | null;
  missingDataRate?: number | null;
  filterCount?: number | null;
  seasonCount?: number | null;
  teamScopeCount?: number | null;
  activeMatchCount?: number | null;
  todayMatchCount?: number | null;
  line?: number | null;
  validLineRange?: { min?: number | null; max?: number | null } | null;
  source?: string | null;
  baseRisk?: TrendBaseRisk | null;
};

export type TrendLineSensitivity = {
  marketType: TrendQualityMarketType;
  bucket: string | null;
  inValidRange: boolean | null;
  warning: string | null;
};

export type TrendQualityResult = {
  quality: {
    score: number;
    tier: TrendQualityTier;
    actionability: TrendActionability;
    confidence: number;
    overfitRisk: TrendOverfitRisk;
    dataHealth: number;
    historicalRoiScore: number;
    clvScore: number;
    sampleScore: number;
    recencyScore: number;
    marketScore: number;
  };
  market: {
    currentOddsAmerican: number | null;
    impliedProbability: number | null;
    fairProbability: number | null;
    fairOddsAmerican: number | null;
    edgePercent: number | null;
  };
  lineSensitivity: TrendLineSensitivity;
  warnings: string[];
  gateReasons: string[];
  explanation: string[];
};

const MIN_ACTIONABLE_SAMPLE = 75;
const MIN_DISPLAY_SAMPLE = 30;
const MIN_ACTIONABLE_EDGE_PERCENT = 1.5;
const MAX_MISSING_DATA_RATE = 0.03;
const MIN_ACTIONABLE_BOOKS = 2;
const MAX_RECENCY_DRIFT_PERCENT = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePercent(value: number | null | undefined): number | null {
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
}

function normalizeRate(value: number | null | undefined): number | null {
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}

function normalizeProbability(value: number | null | undefined): number | null {
  const numeric = finiteNumber(value);
  if (numeric == null) return null;
  const probability = numeric > 1 ? numeric / 100 : numeric;
  if (probability <= 0 || probability >= 1) return null;
  return probability;
}

function normalizeMarketType(marketType?: string | null, market?: string | null): TrendQualityMarketType {
  const raw = `${marketType ?? ""} ${market ?? ""}`.toLowerCase();
  if (raw.includes("moneyline") || raw.includes("ml")) return "moneyline";
  if (raw.includes("spread") || raw.includes("ats")) return "spread";
  if (raw.includes("total") || raw.includes("over") || raw.includes("under")) return "total";
  if (raw.includes("prop")) return "prop";
  return "unknown";
}

function isCurrentGameSource(input: TrendQualityInput) {
  return Boolean(input.activeMatchCount || input.todayMatchCount || input.source === "sim-engine" || input.source === "market-edge");
}

export function americanToImpliedProbability(oddsAmerican: number | null | undefined) {
  const odds = finiteNumber(oddsAmerican);
  if (odds == null || odds === 0 || Math.abs(odds) < 100) return null;
  if (odds < 0) {
    const abs = Math.abs(odds);
    return abs / (abs + 100);
  }
  return 100 / (odds + 100);
}

export function probabilityToAmericanOdds(probability: number | null | undefined) {
  const prob = normalizeProbability(probability);
  if (prob == null) return null;
  if (prob >= 0.5) {
    return Math.round(-(prob / (1 - prob)) * 100);
  }
  return Math.round(((1 - prob) / prob) * 100);
}

export function profitForAmericanOdds(oddsAmerican: number, stakeUnits = 1) {
  if (oddsAmerican < 0) return stakeUnits * (100 / Math.abs(oddsAmerican));
  return stakeUnits * (oddsAmerican / 100);
}

export function calculateFlatStakeRoi(results: Array<{ result: "W" | "L" | "P"; oddsAmerican: number }>) {
  const graded = results.filter((row) => row.result !== "P");
  if (!graded.length) return 0;
  const profit = graded.reduce((sum, row) => {
    if (row.result === "W") return sum + profitForAmericanOdds(row.oddsAmerican, 1);
    if (row.result === "L") return sum - 1;
    return sum;
  }, 0);
  return round((profit / graded.length) * 100, 2);
}

export function getLineSensitivity(
  marketType: TrendQualityMarketType,
  line: number | null | undefined,
  validLineRange?: { min?: number | null; max?: number | null } | null
): TrendLineSensitivity {
  const numericLine = finiteNumber(line);
  let bucket: string | null = null;

  if (numericLine != null) {
    if (marketType === "moneyline") {
      if (numericLine <= -200) bucket = "heavy favorite";
      else if (numericLine < -130) bucket = "favorite";
      else if (numericLine <= 130) bucket = "near pick'em";
      else if (numericLine <= 200) bucket = "underdog";
      else bucket = "long dog";
    } else if (marketType === "spread") {
      const abs = Math.abs(numericLine);
      if (abs < 3) bucket = "short spread";
      else if (abs <= 6.5) bucket = "key spread range";
      else bucket = "wide spread";
    } else if (marketType === "total") {
      if (numericLine < 7.5) bucket = "low total";
      else if (numericLine <= 9.5) bucket = "standard total";
      else bucket = "high total";
    } else {
      bucket = "unbucketed line";
    }
  }

  const min = finiteNumber(validLineRange?.min);
  const max = finiteNumber(validLineRange?.max);
  const inValidRange =
    numericLine == null || (min == null && max == null)
      ? null
      : (min == null || numericLine >= min) && (max == null || numericLine <= max);

  return {
    marketType,
    bucket,
    inValidRange,
    warning: inValidRange === false ? "Current line is outside the trend's validated range." : null
  };
}

function scoreSample(sampleSize: number | null, currentGame: boolean) {
  if (sampleSize == null) return currentGame ? 42 : 15;
  if (sampleSize >= 300) return 100;
  if (sampleSize >= 200) return 92;
  if (sampleSize >= 150) return 84;
  if (sampleSize >= MIN_ACTIONABLE_SAMPLE) return 68;
  if (sampleSize >= 50) return 36;
  if (sampleSize >= MIN_DISPLAY_SAMPLE) return 20;
  return 4;
}

function scoreRoi(roiPercent: number | null, currentGame: boolean) {
  if (roiPercent == null) return currentGame ? 32 : 15;
  if (roiPercent <= 0) return 0;
  if (roiPercent >= 15) return 100;
  return clamp(roiPercent * 6.6, 0, 100);
}

function scoreClv(averageClv: number | null, positiveClvRate: number | null, currentGame: boolean) {
  const clv = finiteNumber(averageClv);
  const positiveRate = normalizePercent(positiveClvRate);
  if (clv == null && positiveRate == null) return currentGame ? 22 : 0;

  const clvScore = clv == null ? 0 : clamp(Math.max(clv, 0) * 22, 0, 70);
  const positiveRateScore = positiveRate == null ? 0 : clamp((positiveRate - 50) * 2, 0, 30);
  return clamp(clvScore + positiveRateScore, 0, 100);
}

function scoreRecency(hitRatePercent: number | null, recencyHitRatePercent: number | null, currentGame: boolean) {
  const base = recencyHitRatePercent ?? hitRatePercent;
  if (base == null) return currentGame ? 56 : 35;

  const strength = clamp((base - 50) * 8, 0, 80);
  const stabilityPenalty =
    hitRatePercent != null && recencyHitRatePercent != null
      ? clamp(Math.abs(hitRatePercent - recencyHitRatePercent) * 4, 0, 45)
      : 0;
  return clamp(30 + strength - stabilityPenalty, 0, 100);
}

function scoreMarket(input: TrendQualityInput, edgePercent: number | null, impliedProbability: number | null, currentGame: boolean) {
  const breadth = finiteNumber(input.marketBreadth);
  const breadthScore = breadth == null ? 0 : clamp(breadth * 24, 0, 60);
  const oddsScore = impliedProbability == null ? 0 : 20;
  const edgeScore = edgePercent == null ? 0 : clamp(Math.abs(edgePercent) * 8, 0, 35);
  return clamp(breadthScore + oddsScore + edgeScore + (currentGame ? 10 : 0), 0, 100);
}

function scoreDataHealth(input: TrendQualityInput, currentGame: boolean) {
  const missingRate = normalizeRate(input.missingDataRate) ?? 0;
  let score = 100 - clamp(missingRate * 1000, 0, 75);
  if (input.currentOddsAmerican == null) score -= currentGame ? 8 : 18;
  if (input.sampleSize == null) score -= currentGame ? 6 : 16;
  if (input.hitRate == null) score -= currentGame ? 4 : 10;
  return clamp(score, 0, 100);
}

function assessOverfitRisk(input: TrendQualityInput, sampleSize: number | null): TrendOverfitRisk {
  let points = 0;
  const filterCount = finiteNumber(input.filterCount) ?? 0;
  const seasonCount = finiteNumber(input.seasonCount);
  const teamScopeCount = finiteNumber(input.teamScopeCount);
  const currentGame = isCurrentGameSource(input);

  if (filterCount >= 6) points += 3;
  else if (filterCount >= 4) points += 2;
  else if (filterCount >= 3) points += 1;

  if (!currentGame) {
    if (sampleSize != null && sampleSize < MIN_DISPLAY_SAMPLE) points += 3;
    else if (sampleSize != null && sampleSize < MIN_ACTIONABLE_SAMPLE) points += 2;
    else if (sampleSize != null && filterCount >= 5 && sampleSize < 150) points += 2;
  }

  if (seasonCount === 1) points += 2;
  if (teamScopeCount === 1) points += 2;

  if (points >= 5) return "high";
  if (points >= 3) return "medium";
  return "low";
}

function tierFromScore(score: number): TrendQualityTier {
  if (score >= 88) return "S";
  if (score >= 78) return "A";
  if (score >= 66) return "B";
  if (score >= 48) return "C";
  return "HIDE";
}

function capTier(tier: TrendQualityTier, cap: TrendQualityTier) {
  const rank: Record<TrendQualityTier, number> = { HIDE: 0, C: 1, B: 2, A: 3, S: 4 };
  return rank[tier] > rank[cap] ? cap : tier;
}

function actionabilityFromTier(tier: TrendQualityTier, hasCurrentPrice: boolean, source?: string | null): TrendActionability {
  if (tier === "HIDE") return "HIDE";
  if (!hasCurrentPrice && source !== "research-pattern") return "WATCHLIST";
  if (!hasCurrentPrice || source === "research-pattern") return "RESEARCH_ONLY";
  if (tier === "C") return "WATCHLIST";
  return "ACTIONABLE";
}

export function assessTrendQuality(input: TrendQualityInput): TrendQualityResult {
  const currentGame = isCurrentGameSource(input);
  const sampleSize = finiteNumber(input.sampleSize);
  const hitRatePercent = normalizePercent(input.hitRate);
  const roiPercent = normalizePercent(input.roi);
  const currentOddsAmerican = finiteNumber(input.currentOddsAmerican);
  const impliedProbability = americanToImpliedProbability(currentOddsAmerican);
  const fairProbability = normalizeProbability(input.fairProbability) ?? normalizeProbability(hitRatePercent);
  const fairOddsAmerican = probabilityToAmericanOdds(fairProbability);
  const explicitEdgePercent = normalizePercent(input.currentEdge);
  const edgePercent =
    explicitEdgePercent ??
    (fairProbability != null && impliedProbability != null ? (fairProbability - impliedProbability) * 100 : null);
  const missingRate = normalizeRate(input.missingDataRate) ?? 0;
  const marketType = normalizeMarketType(input.marketType, input.market);
  const lineSensitivity = getLineSensitivity(marketType, input.line ?? input.currentOddsAmerican, input.validLineRange);
  const marketBreadth = finiteNumber(input.marketBreadth);
  const hasClvSupport = input.averageClv != null || input.positiveClvRate != null;
  const recencyHitRatePercent = normalizePercent(input.recencyHitRate);
  const recencyDrift =
    hitRatePercent != null && recencyHitRatePercent != null
      ? Math.abs(hitRatePercent - recencyHitRatePercent)
      : null;

  const dataHealth = scoreDataHealth(input, currentGame);
  const historicalRoiScore = scoreRoi(roiPercent, currentGame);
  const clvScore = scoreClv(input.averageClv ?? null, input.positiveClvRate ?? null, currentGame);
  const sampleScore = scoreSample(sampleSize, currentGame);
  const recencyScore = scoreRecency(hitRatePercent, recencyHitRatePercent, currentGame);
  const marketScore = scoreMarket(input, edgePercent, impliedProbability, currentGame);
  const overfitRisk = assessOverfitRisk(input, sampleSize);

  const rawScore =
    dataHealth * 0.2 +
    historicalRoiScore * 0.2 +
    clvScore * 0.2 +
    sampleScore * 0.15 +
    recencyScore * 0.15 +
    marketScore * 0.1;

  const warnings: string[] = [];
  const gateReasons: string[] = [];
  const explanation: string[] = [];

  if (!currentGame && sampleSize != null && sampleSize < MIN_ACTIONABLE_SAMPLE) {
    const message = `Sample below actionable floor (${sampleSize}/${MIN_ACTIONABLE_SAMPLE}).`;
    warnings.push(message);
    gateReasons.push(message);
  }
  if (sampleSize == null) {
    const message = currentGame ? "No historical sample attached; current-game model signal only." : "No historical sample attached to this signal.";
    warnings.push(message);
    gateReasons.push(message);
  }
  if (missingRate > MAX_MISSING_DATA_RATE) {
    const message = `Missing-data rate exceeds ${(MAX_MISSING_DATA_RATE * 100).toFixed(0)}%.`;
    warnings.push(message);
    gateReasons.push(message);
  }
  if (currentOddsAmerican == null) {
    const message = currentGame
      ? "No current sportsbook price attached; show as watchlist until price is matched."
      : "No current sportsbook price attached; keep as research/watchlist only.";
    warnings.push(message);
    gateReasons.push("Missing current sportsbook price.");
  }
  if (currentOddsAmerican != null && edgePercent == null) {
    warnings.push("Current price exists but no fair-probability edge could be calculated.");
    gateReasons.push("Missing calculable current edge.");
  }
  if (edgePercent != null && edgePercent < 0) {
    warnings.push(`Current price is negative EV (${round(edgePercent, 2)}%).`);
    gateReasons.push("Negative current edge.");
  } else if (edgePercent != null && edgePercent < MIN_ACTIONABLE_EDGE_PERCENT) {
    const message = `Current edge below actionable floor (${round(edgePercent, 2)}%).`;
    warnings.push(message);
    gateReasons.push(message);
  }
  if (!currentGame && roiPercent != null && roiPercent < 2) {
    warnings.push("Historical ROI below 2% quality floor.");
    gateReasons.push("Weak historical ROI.");
  }
  if (!hasClvSupport && !currentGame) {
    warnings.push("No closing-line-value support attached.");
    gateReasons.push("Missing CLV support.");
  }
  if (marketBreadth != null && marketBreadth < MIN_ACTIONABLE_BOOKS && currentOddsAmerican != null) {
    warnings.push(`Market breadth below actionable floor (${marketBreadth}/${MIN_ACTIONABLE_BOOKS} books).`);
    gateReasons.push("Thin sportsbook coverage.");
  }
  if (recencyDrift != null && recencyDrift > MAX_RECENCY_DRIFT_PERCENT) {
    warnings.push(`Recent form drift exceeds ${MAX_RECENCY_DRIFT_PERCENT}% (${round(recencyDrift, 1)}%).`);
    gateReasons.push("Unstable recent split.");
  }
  if (overfitRisk === "high") {
    warnings.push("High overfit risk from filter/sample concentration.");
    gateReasons.push("High overfit risk.");
  } else if (overfitRisk === "medium") {
    warnings.push("Moderate overfit risk; verify by season and team split.");
  }
  if (lineSensitivity.warning) {
    warnings.push(lineSensitivity.warning);
    gateReasons.push(lineSensitivity.warning);
  }

  explanation.push(`Data health ${round(dataHealth, 1)}/100.`);
  explanation.push(`Sample quality ${round(sampleScore, 1)}/100${sampleSize == null ? " with no historical row count" : ` from ${sampleSize} rows`}.`);
  explanation.push(`CLV quality ${round(clvScore, 1)}/100.`);
  if (currentGame) explanation.push("Current-game model signal; price confirmation required before action.");
  if (edgePercent != null) explanation.push(`Current market edge ${round(edgePercent, 2)}%.`);
  if (fairOddsAmerican != null) explanation.push(`Fair odds estimate ${fairOddsAmerican > 0 ? "+" : ""}${fairOddsAmerican}.`);
  if (lineSensitivity.bucket) explanation.push(`Line bucket: ${lineSensitivity.bucket}.`);

  let tier = tierFromScore(rawScore);
  if (!currentGame && sampleSize != null && sampleSize < MIN_DISPLAY_SAMPLE) tier = "HIDE";
  else if (!currentGame && sampleSize != null && sampleSize < MIN_ACTIONABLE_SAMPLE) tier = capTier(tier, "C");
  if (missingRate > MAX_MISSING_DATA_RATE) tier = "HIDE";
  if (currentOddsAmerican == null) {
    tier = capTier(tier, currentGame ? "C" : input.source === "research-pattern" ? "C" : "HIDE");
  }
  if (currentOddsAmerican != null && edgePercent == null) tier = capTier(tier, "C");
  if (edgePercent != null && edgePercent < 0) tier = "HIDE";
  else if (edgePercent != null && edgePercent < MIN_ACTIONABLE_EDGE_PERCENT) tier = capTier(tier, "C");
  if (!currentGame && roiPercent != null && roiPercent < 2) tier = capTier(tier, "C");
  if (!hasClvSupport && !currentGame) tier = capTier(tier, input.source === "research-pattern" ? "C" : "B");
  if (marketBreadth != null && marketBreadth < MIN_ACTIONABLE_BOOKS && currentOddsAmerican != null) tier = capTier(tier, "C");
  if (recencyDrift != null && recencyDrift > MAX_RECENCY_DRIFT_PERCENT) tier = capTier(tier, "C");
  if (overfitRisk === "high") tier = sampleSize != null && sampleSize < MIN_ACTIONABLE_SAMPLE ? "HIDE" : capTier(tier, "C");
  if (lineSensitivity.inValidRange === false) tier = capTier(tier, "C");

  const score = round(rawScore, 1);
  const actionability = actionabilityFromTier(tier, currentOddsAmerican != null, input.source);

  return {
    quality: {
      score,
      tier,
      actionability,
      confidence: clamp(score / 100, 0, 1),
      overfitRisk,
      dataHealth: round(dataHealth, 1),
      historicalRoiScore: round(historicalRoiScore, 1),
      clvScore: round(clvScore, 1),
      sampleScore: round(sampleScore, 1),
      recencyScore: round(recencyScore, 1),
      marketScore: round(marketScore, 1)
    },
    market: {
      currentOddsAmerican,
      impliedProbability: impliedProbability == null ? null : round(impliedProbability, 4),
      fairProbability: fairProbability == null ? null : round(fairProbability, 4),
      fairOddsAmerican,
      edgePercent: edgePercent == null ? null : round(edgePercent, 2)
    },
    lineSensitivity,
    warnings,
    gateReasons,
    explanation
  };
}

export function mapQualityTierToTrendGrade(tier: TrendQualityTier): "A" | "B" | "C" | "Watch" | "Pass" {
  if (tier === "S" || tier === "A") return "A";
  if (tier === "B") return "B";
  if (tier === "C") return "Watch";
  return "Pass";
}

export function mergeTrendRisk(baseRisk: TrendBaseRisk, overfitRisk: TrendOverfitRisk): TrendBaseRisk {
  if (baseRisk === "high" || overfitRisk === "high") return "high";
  if (baseRisk === "medium" || overfitRisk === "medium") return "medium";
  return "low";
}

export function buildTrendQualityInputFromSignal(signal: {
  id: string;
  market?: string | null;
  sample?: number | null;
  hitRate?: number | null;
  edge?: number | null;
  risk?: TrendBaseRisk;
  source?: string;
  gameId?: string;
  notes?: string[];
}): TrendQualityInput {
  return {
    id: signal.id,
    market: signal.market,
    marketType: signal.market,
    sampleSize: signal.sample,
    hitRate: signal.hitRate,
    currentEdge: signal.edge,
    marketBreadth: signal.source === "market-edge" ? 2 : 0,
    filterCount: signal.source === "research-pattern" ? 4 : signal.gameId ? 2 : 3,
    activeMatchCount: signal.gameId ? 1 : 0,
    todayMatchCount: signal.gameId ? 1 : 0,
    source: signal.source,
    baseRisk: signal.risk
  };
}
