export type TrendStrengthGrade = "A" | "B" | "C" | "D";

export type TrendStrengthScore = {
  score: number;
  grade: TrendStrengthGrade;
  reasons: string[];
  penalties: string[];
};

type TrendStrengthInput = {
  proof?: {
    grade?: string | null;
    verified?: boolean | null;
    sampleSize?: number | null;
    profitUnits?: number | null;
    roiPct?: number | null;
    winRatePct?: number | null;
    last30WinRatePct?: number | null;
    clvPct?: number | null;
    currentStreak?: string | null;
  } | null;
  verified?: boolean | null;
  activeMatches?: number | null;
  price?: number | null;
  edgePct?: number | null;
  confidencePct?: number | null;
  sharkScore?: number | null;
  score?: number | null;
  actionState?: string | null;
  actionLabel?: string | null;
  actionability?: string | null;
  tier?: string | null;
  blockers?: string[] | null;
  category?: string | null;
  market?: string | null;
};

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(clamp(value));
}

function numberValue(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function gradeFromScore(score: number): TrendStrengthGrade {
  if (score >= 82) return "A";
  if (score >= 68) return "B";
  if (score >= 52) return "C";
  return "D";
}

function includesAny(value: string | null | undefined, patterns: string[]) {
  const normalized = String(value ?? "").toUpperCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function streakBonus(value: string | null | undefined) {
  const streak = String(value ?? "").trim().toUpperCase();
  const match = streak.match(/^W(\d+)/);
  if (!match) return 0;
  return Math.min(6, Number(match[1] ?? 0));
}

function blockerPenalty(blockers: string[]) {
  return blockers.reduce((total, blocker) => {
    if (/ledger|proof|sample|roi|clv/i.test(blocker)) return total + 10;
    if (/price|edge|gate|active/i.test(blocker)) return total + 7;
    return total + 4;
  }, 0);
}

export function buildTrendStrengthScore(input: TrendStrengthInput): TrendStrengthScore {
  const proof = input.proof ?? {};
  const blockers = Array.isArray(input.blockers) ? input.blockers.filter(Boolean) : [];
  const reasons: string[] = [];
  const penalties: string[] = [];

  const verified = Boolean(input.verified || proof.verified || String(proof.grade ?? "").toUpperCase() === "A" || String(proof.grade ?? "").toUpperCase() === "B");
  const sampleSize = numberValue(proof.sampleSize);
  const roiPct = numberValue(proof.roiPct);
  const profitUnits = numberValue(proof.profitUnits);
  const winRatePct = numberValue(proof.winRatePct);
  const last30WinRatePct = numberValue(proof.last30WinRatePct);
  const clvPct = numberValue(proof.clvPct);
  const edgePct = numberValue(input.edgePct);
  const confidencePct = numberValue(input.confidencePct);
  const activeMatches = numberValue(input.activeMatches);
  const baseScore = numberValue(input.sharkScore ?? input.score);

  let score = 0;

  if (verified) {
    score += 18;
    reasons.push("Verified or high-grade proof packet.");
  } else {
    score += 5;
    penalties.push("Proof is provisional or not verified.");
  }

  const samplePoints = Math.min(18, sampleSize / 8);
  score += samplePoints;
  if (sampleSize >= 150) reasons.push("Large historical sample.");
  else if (sampleSize >= 75) reasons.push("Sample clears verification floor.");
  else penalties.push("Sample is below the preferred verification floor.");

  if (roiPct > 0) {
    score += Math.min(14, roiPct * 1.15);
    reasons.push("Positive historical ROI.");
  } else if (roiPct < 0) {
    score -= 9;
    penalties.push("Negative historical ROI.");
  }

  if (profitUnits > 0) {
    score += Math.min(10, profitUnits * 0.45);
    reasons.push("Positive profit units.");
  } else if (profitUnits < 0) {
    score -= 7;
    penalties.push("Negative profit units.");
  }

  if (winRatePct >= 58) {
    score += 8;
    reasons.push("Strong historical hit rate.");
  } else if (winRatePct >= 53) {
    score += 4;
    reasons.push("Hit rate is above baseline.");
  } else if (winRatePct > 0) {
    penalties.push("Hit rate is thin.");
  }

  if (last30WinRatePct >= 58) {
    score += 5;
    reasons.push("Recent form is positive.");
  } else if (last30WinRatePct > 0 && last30WinRatePct < 50) {
    score -= 4;
    penalties.push("Recent form is weak.");
  }

  if (clvPct > 0) {
    score += Math.min(8, clvPct * 4);
    reasons.push("Positive CLV support.");
  } else if (clvPct < 0) {
    score -= 8;
    penalties.push("Negative CLV drag.");
  }

  if (activeMatches > 0) {
    score += Math.min(8, activeMatches * 2);
    reasons.push("Currently attached to the slate.");
  }

  if (typeof input.price === "number" && Number.isFinite(input.price)) {
    score += 6;
    reasons.push("Current price is available.");
  } else if (activeMatches > 0 || includesAny(input.actionability ?? input.actionLabel ?? input.actionState, ["ACTIVE", "ACTIONABLE", "WATCH", "WAIT"])) {
    penalties.push("Current price is missing.");
  }

  if (edgePct > 0) {
    score += Math.min(10, edgePct * 2.2);
    reasons.push("Current edge is positive.");
  } else if (edgePct < 0) {
    score -= 8;
    penalties.push("Current edge is negative.");
  }

  if (confidencePct >= 60) {
    score += 6;
    reasons.push("Confidence is above baseline.");
  } else if (confidencePct > 0 && confidencePct < 50) {
    score -= 3;
    penalties.push("Confidence is below baseline.");
  }

  if (includesAny(input.actionState ?? input.actionLabel ?? input.actionability, ["ACTIONABLE", "ACTIVE", "PROMOTE"])) {
    score += 8;
    reasons.push("Action gate is elevated.");
  } else if (includesAny(input.actionState ?? input.actionLabel ?? input.actionability, ["PASS", "BENCH"])) {
    score -= 10;
    penalties.push("Action gate is blocking promotion.");
  } else if (includesAny(input.actionState ?? input.actionLabel ?? input.actionability, ["WATCH", "WAIT", "RESEARCH"])) {
    score += 2;
    reasons.push("Action gate is in review/watch state.");
  }

  if (includesAny(input.category, ["EDGE", "MARKET", "CLV"])) {
    score += 4;
    reasons.push("Category has edge or market-support context.");
  }

  score += streakBonus(proof.currentStreak);
  if (streakBonus(proof.currentStreak) > 0) reasons.push("Positive current streak.");

  if (baseScore > 0) {
    score += Math.min(8, baseScore / 12);
    reasons.push("Existing SharkTrends placement score supports the system.");
  }

  const penalty = blockerPenalty(blockers);
  if (penalty > 0) {
    score -= penalty;
    penalties.push(...blockers.slice(0, 8).map((blocker) => `Blocker: ${blocker}.`));
  }

  const finalScore = round(score);
  const grade = gradeFromScore(finalScore);

  return {
    score: finalScore,
    grade,
    reasons: Array.from(new Set(reasons)).slice(0, 8),
    penalties: Array.from(new Set(penalties)).slice(0, 8)
  };
}
