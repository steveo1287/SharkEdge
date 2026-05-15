import type { ActionView, SimCardViewModel } from "@/services/simulation/build-sim-card-view-model";
import type { UfcSettledLedgerRow } from "@/services/ufc/settled-ledger";

export type OfficialVerdict = "PLAY" | "LEAN" | "WATCH" | "PASS" | "DATA_NOT_READY";

export type OfficialVerdictResult = {
  verdict: OfficialVerdict;
  officialPlayEligible: boolean;
  score: number;
  reasons: string[];
  passReasons: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function absPct(value: number | null | undefined) {
  return isNumber(value) ? Math.abs(value) : 0;
}

function hasHardStops(action: ActionView) {
  return action.hardStops.length > 0 || action.action === "PASS";
}

export function gradeMlbOfficialVerdict(game: SimCardViewModel): OfficialVerdictResult {
  const action = game.primaryAction;
  const passReasons: string[] = [];
  const reasons: string[] = [];
  let score = 25;

  if (game.dataStatus !== "ready" || action.action === "NO_MARKET") {
    passReasons.push("Market context missing");
  } else {
    score += 15;
    reasons.push("Market joined");
  }

  if (hasHardStops(action)) {
    passReasons.push(...action.hardStops.length ? action.hardStops : ["Model marked pass"]);
    score -= 35;
  }

  if (action.warnings.length) {
    passReasons.push(...action.warnings.slice(0, 3));
    score -= Math.min(18, action.warnings.length * 6);
  }

  const probabilityEdge = absPct(action.probabilityEdge);
  if (probabilityEdge >= 0.045) {
    score += 25;
    reasons.push("Probability edge above official threshold");
  } else if (probabilityEdge >= 0.025) {
    score += 12;
    reasons.push("Probability edge supports lean only");
  } else if (action.marketType === "moneyline") {
    passReasons.push("Probability edge below official threshold");
  }

  if (isNumber(action.ev) && action.ev > 0.03) {
    score += 12;
    reasons.push("Positive expected value");
  }

  if (isNumber(game.confidence)) {
    if (game.confidence >= 70) {
      score += 12;
      reasons.push("Confidence clears gate");
    } else if (game.confidence < 50) {
      passReasons.push("Confidence below 50");
      score -= 10;
    }
  }

  if (action.action === "ATTACK" || action.action === "PLAY") score += 10;
  if (action.action === "LEAN") score += 3;
  if (action.action === "WATCH") score -= 5;

  const finalScore = clampScore(score);
  if (passReasons.length && game.dataStatus !== "ready") return { verdict: "DATA_NOT_READY", officialPlayEligible: false, score: finalScore, reasons, passReasons };
  if (passReasons.length && finalScore < 70) return { verdict: "PASS", officialPlayEligible: false, score: finalScore, reasons, passReasons };
  if (finalScore >= 82 && probabilityEdge >= 0.045 && !hasHardStops(action)) return { verdict: "PLAY", officialPlayEligible: true, score: finalScore, reasons, passReasons };
  if (finalScore >= 62) return { verdict: "LEAN", officialPlayEligible: false, score: finalScore, reasons, passReasons };
  return { verdict: "WATCH", officialPlayEligible: false, score: finalScore, reasons, passReasons };
}

export function gradeMmaLedgerVerdict(row: UfcSettledLedgerRow): OfficialVerdictResult {
  const reasons: string[] = [];
  const passReasons: string[] = [];
  let score = 20;

  if (!isNumber(row.pickProbability)) {
    passReasons.push("Pick probability missing");
    return { verdict: "DATA_NOT_READY", officialPlayEligible: false, score: 0, reasons, passReasons };
  }

  if (!row.pickOpenOddsAmerican && !row.pickCloseOddsAmerican) {
    passReasons.push("Winner market odds missing");
    score -= 15;
  } else {
    score += 10;
    reasons.push("Winner market odds present");
  }

  if (row.dataQualityGrade === "A" || row.dataQualityGrade === "B") {
    score += 18;
    reasons.push("Data quality clears gate");
  } else if (row.dataQualityGrade === "D") {
    passReasons.push("Data quality D");
    score -= 20;
  }

  if (row.confidenceGrade === "HIGH") {
    score += 18;
    reasons.push("High confidence grade");
  } else if (row.confidenceGrade === "LOW") {
    passReasons.push("Low confidence grade");
    score -= 18;
  }

  if (row.pickProbability >= 0.62) {
    score += 24;
    reasons.push("Pick probability clears official MMA threshold");
  } else if (row.pickProbability >= 0.56) {
    score += 10;
    reasons.push("Pick probability supports lean only");
  } else {
    passReasons.push("Pick probability under 56%");
    score -= 12;
  }

  if (isNumber(row.closingLineValuePct)) {
    if (row.closingLineValuePct > 0) {
      score += 10;
      reasons.push("Positive CLV");
    } else {
      score -= 4;
    }
  }

  if (row.shouldHavePassed) {
    passReasons.push(row.passReason ?? "Current pass discipline would avoid this fight");
    score -= 20;
  }

  const finalScore = clampScore(score);
  if (passReasons.length && finalScore < 70) return { verdict: "PASS", officialPlayEligible: false, score: finalScore, reasons, passReasons };
  if (finalScore >= 82 && row.pickProbability >= 0.62 && !passReasons.length) return { verdict: "PLAY", officialPlayEligible: true, score: finalScore, reasons, passReasons };
  if (finalScore >= 62) return { verdict: "LEAN", officialPlayEligible: false, score: finalScore, reasons, passReasons };
  return { verdict: "WATCH", officialPlayEligible: false, score: finalScore, reasons, passReasons };
}

export function summarizeVerdicts<T>(items: T[], grade: (item: T) => OfficialVerdictResult) {
  const counts: Record<OfficialVerdict, number> = { PLAY: 0, LEAN: 0, WATCH: 0, PASS: 0, DATA_NOT_READY: 0 };
  let eligible = 0;
  let scoreSum = 0;
  for (const item of items) {
    const result = grade(item);
    counts[result.verdict] += 1;
    if (result.officialPlayEligible) eligible += 1;
    scoreSum += result.score;
  }
  return {
    counts,
    officialPlayEligibleCount: eligible,
    averageScore: items.length ? scoreSum / items.length : null,
    total: items.length
  };
}
