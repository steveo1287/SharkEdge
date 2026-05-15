import type { OfficialVerdict, OfficialVerdictResult } from "@/services/decision/official-verdict";

export type PromotionGateInput = {
  sport: "MLB" | "MMA";
  verdict: OfficialVerdictResult;
  probability?: number | null;
  hasMarketOdds?: boolean;
  hasClosingLineValue?: boolean;
  closingLineValuePct?: number | null;
  dataQualityGrade?: string | null;
  confidenceGrade?: string | null;
  calibrationBucketStatus?: "good" | "watch" | "thin" | "bad" | "unknown";
  calibrationBucketSample?: number | null;
  settledProofSample?: number | null;
  actualOddsCoveragePct?: number | null;
};

export type PromotionGateDecision = {
  baseVerdict: OfficialVerdict;
  finalVerdict: OfficialVerdict;
  officialPlayEligible: boolean;
  blocked: boolean;
  downgraded: boolean;
  gateScore: number;
  blockers: string[];
  warnings: string[];
  promotionReasons: string[];
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function downgrade(verdict: OfficialVerdict, hardBlock: boolean): OfficialVerdict {
  if (hardBlock) return "PASS";
  if (verdict === "PLAY") return "LEAN";
  if (verdict === "LEAN") return "WATCH";
  return verdict;
}

export function applyPromotionGateV2(input: PromotionGateInput): PromotionGateDecision {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const promotionReasons: string[] = [...input.verdict.reasons];
  let score = input.verdict.score;

  if (input.verdict.verdict === "DATA_NOT_READY") {
    blockers.push("Base verdict is DATA_NOT_READY");
  }

  if (input.verdict.passReasons.length) {
    blockers.push(...input.verdict.passReasons.slice(0, 4));
    score -= Math.min(20, input.verdict.passReasons.length * 5);
  }

  if (!input.hasMarketOdds) {
    blockers.push("Market odds missing");
    score -= 18;
  }

  if (input.sport === "MMA" && !input.hasClosingLineValue) {
    warnings.push("MMA CLV missing; keep shadow/lean unless other gates are elite");
    score -= 8;
  }

  if (input.sport === "MMA" && isNumber(input.closingLineValuePct) && input.closingLineValuePct < 0) {
    blockers.push("Negative CLV");
    score -= 14;
  }

  if (input.dataQualityGrade === "D") {
    blockers.push("Data quality D");
    score -= 20;
  } else if (input.dataQualityGrade === "C") {
    warnings.push("Data quality C");
    score -= 8;
  }

  if (input.confidenceGrade === "LOW") {
    blockers.push("Low confidence grade");
    score -= 18;
  }

  if (isNumber(input.probability) && input.probability < 0.56) {
    blockers.push("Probability under 56%");
    score -= 16;
  }

  if (input.calibrationBucketStatus === "bad") {
    blockers.push("Calibration bucket is bad");
    score -= 25;
  } else if (input.calibrationBucketStatus === "thin") {
    warnings.push("Calibration bucket sample is thin");
    score -= 10;
  } else if (input.calibrationBucketStatus === "watch") {
    warnings.push("Calibration bucket is watchlist-only");
    score -= 8;
  } else if (input.calibrationBucketStatus === "good") {
    promotionReasons.push("Calibration bucket is good");
    score += 8;
  }

  if (isNumber(input.calibrationBucketSample) && input.calibrationBucketSample < 10) {
    warnings.push("Calibration bucket has fewer than 10 settled rows");
    score -= 6;
  }

  if (isNumber(input.settledProofSample) && input.settledProofSample < 25) {
    warnings.push("Sport proof sample is still thin");
    score -= 6;
  }

  if (isNumber(input.actualOddsCoveragePct) && input.actualOddsCoveragePct < 0.75) {
    warnings.push("Actual odds coverage below 75%");
    score -= 8;
  }

  const gateScore = clamp(score);
  const hardBlock = blockers.length > 0;
  let finalVerdict = input.verdict.verdict;

  if (input.verdict.verdict === "PLAY") {
    if (hardBlock || gateScore < 75) finalVerdict = downgrade(input.verdict.verdict, hardBlock);
  } else if (input.verdict.verdict === "LEAN" && hardBlock) {
    finalVerdict = "WATCH";
  }

  if (input.verdict.verdict === "DATA_NOT_READY") finalVerdict = "DATA_NOT_READY";

  return {
    baseVerdict: input.verdict.verdict,
    finalVerdict,
    officialPlayEligible: finalVerdict === "PLAY" && !hardBlock && gateScore >= 82,
    blocked: hardBlock,
    downgraded: finalVerdict !== input.verdict.verdict,
    gateScore,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    promotionReasons: Array.from(new Set(promotionReasons))
  };
}

export function probabilityBucketStatus(probability: number | null | undefined, settledCount: number | null | undefined): PromotionGateInput["calibrationBucketStatus"] {
  if (!isNumber(probability)) return "unknown";
  if (!isNumber(settledCount) || settledCount < 10) return "thin";
  return "unknown";
}
