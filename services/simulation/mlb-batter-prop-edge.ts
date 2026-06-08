import type { MlbBatterPropSurface, MlbPropSurfaceOutcome } from "@/services/simulation/mlb-batter-prop-surface";

export type MlbBatterBookPropQuote = {
  book: string;
  market: MlbPropSurfaceOutcome["market"];
  line: number;
  side: MlbPropSurfaceOutcome["side"];
  americanOdds: number;
  available?: boolean | null;
  updatedAt?: string | null;
};

export type MlbBatterPropEdgeCandidate = {
  book: string;
  market: MlbPropSurfaceOutcome["market"];
  line: number;
  side: MlbPropSurfaceOutcome["side"];
  modelProbability: number;
  bookProbability: number;
  probabilityEdge: number;
  fairAmerican: number;
  bookAmerican: number;
  expectedValuePerUnit: number;
  confidence: number;
  grade: "PASS" | "WATCH" | "EDGE" | "STRONG_EDGE";
  reasons: string[];
};

export type MlbBatterPropEdgeReport = {
  modelVersion: "mlb-batter-prop-edge-v1";
  candidates: MlbBatterPropEdgeCandidate[];
  passes: MlbBatterPropEdgeCandidate[];
  warnings: string[];
};

export type MlbBatterPropEdgeConfig = {
  minProbabilityEdge?: number;
  minExpectedValue?: number;
  minConfidence?: number;
  maxCandidates?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function impliedProbability(americanOdds: number) {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return null;
  if (americanOdds < 0) return clamp(Math.abs(americanOdds) / (Math.abs(americanOdds) + 100), 0.01, 0.99);
  return clamp(100 / (americanOdds + 100), 0.01, 0.99);
}

function decimalOdds(americanOdds: number) {
  if (americanOdds < 0) return 1 + 100 / Math.abs(americanOdds);
  return 1 + americanOdds / 100;
}

function key(row: Pick<MlbPropSurfaceOutcome, "market" | "line" | "side">) {
  return `${row.market}:${row.line}:${row.side}`;
}

function grade(args: { probabilityEdge: number; expectedValue: number; confidence: number }) : MlbBatterPropEdgeCandidate["grade"] {
  if (args.confidence < 0.42 || args.probabilityEdge < 0.015 || args.expectedValue < 0.015) return "PASS";
  if (args.probabilityEdge >= 0.08 && args.expectedValue >= 0.1 && args.confidence >= 0.62) return "STRONG_EDGE";
  if (args.probabilityEdge >= 0.045 && args.expectedValue >= 0.055 && args.confidence >= 0.5) return "EDGE";
  return "WATCH";
}

export function evaluateMlbBatterPropEdges(args: {
  surface: MlbBatterPropSurface;
  quotes: MlbBatterBookPropQuote[];
  config?: MlbBatterPropEdgeConfig;
}): MlbBatterPropEdgeReport {
  const warnings: string[] = [];
  const byKey = new Map(args.surface.outcomes.map((outcome) => [key(outcome), outcome]));
  const minProbabilityEdge = args.config?.minProbabilityEdge ?? 0.03;
  const minExpectedValue = args.config?.minExpectedValue ?? 0.03;
  const minConfidence = args.config?.minConfidence ?? 0.45;
  const maxCandidates = args.config?.maxCandidates ?? 12;
  const candidates = args.quotes.flatMap((quote) => {
    if (quote.available === false) return [];
    const model = byKey.get(key(quote));
    if (!model) {
      warnings.push(`No model surface outcome for ${quote.market} ${quote.side} ${quote.line} at ${quote.book}.`);
      return [];
    }
    const bookProbability = impliedProbability(quote.americanOdds);
    if (bookProbability === null) {
      warnings.push(`Invalid odds for ${quote.market} ${quote.side} ${quote.line} at ${quote.book}.`);
      return [];
    }
    const decimal = decimalOdds(quote.americanOdds);
    const expectedValue = model.probability * (decimal - 1) - (1 - model.probability);
    const probabilityEdge = model.probability - bookProbability;
    const candidateGrade = grade({ probabilityEdge, expectedValue, confidence: model.confidence });
    const reasons = [
      `Model probability ${(model.probability * 100).toFixed(1)}% vs book implied ${(bookProbability * 100).toFixed(1)}%.`,
      `Fair price ${model.fairAmerican}; book price ${quote.americanOdds}.`,
      `EV/unit ${expectedValue.toFixed(3)} with confidence ${model.confidence.toFixed(2)}.`
    ];
    if (candidateGrade === "PASS") reasons.push("Did not clear probability, EV, or confidence gate.");
    return [{
      book: quote.book,
      market: quote.market,
      line: quote.line,
      side: quote.side,
      modelProbability: round(model.probability, 4),
      bookProbability: round(bookProbability, 4),
      probabilityEdge: round(probabilityEdge, 4),
      fairAmerican: model.fairAmerican,
      bookAmerican: quote.americanOdds,
      expectedValuePerUnit: round(expectedValue, 4),
      confidence: round(model.confidence, 3),
      grade: candidateGrade,
      reasons
    }];
  });

  const passes = candidates
    .filter((candidate) =>
      candidate.grade !== "PASS" &&
      candidate.probabilityEdge >= minProbabilityEdge &&
      candidate.expectedValuePerUnit >= minExpectedValue &&
      candidate.confidence >= minConfidence
    )
    .sort((a, b) => (b.expectedValuePerUnit * b.confidence) - (a.expectedValuePerUnit * a.confidence))
    .slice(0, maxCandidates);

  if (!args.quotes.length) warnings.push("No book quotes supplied for prop edge evaluation.");
  if (!passes.length) warnings.push("No batter prop candidate cleared the configured edge gates.");

  return {
    modelVersion: "mlb-batter-prop-edge-v1",
    candidates,
    passes,
    warnings
  };
}
