export type PickGrade = "A" | "B" | "C" | "PASS";
export type PickMarket = "moneyline" | "spread" | "total";
export type PickSide = "home" | "away" | "over" | "under";

export type PredictionSnapshot = {
  id: string;
  eventId: string;
  league: string;
  awayTeam: string;
  homeTeam: string;
  predictedAt: string;
  market: PickMarket;
  side: PickSide;
  grade: PickGrade;
  confidenceScore: number;
  modelSpreadHome?: number | null;
  modelTotal?: number | null;
  marketSpreadHome?: number | null;
  marketTotal?: number | null;
  closingSpreadHome?: number | null;
  closingTotal?: number | null;
  modelVersion?: string | null;
  notes?: string[];
};

export type GameResultSnapshot = {
  eventId: string;
  awayScore: number;
  homeScore: number;
  finalAt?: string | null;
  closingSpreadHome?: number | null;
  closingTotal?: number | null;
};

export type PredictionGradeResult = {
  predictionId: string;
  eventId: string;
  market: PickMarket;
  side: PickSide;
  grade: PickGrade;
  confidenceScore: number;
  won: boolean | null;
  pushed: boolean;
  closingLineValue: number | null;
  margin: number;
  total: number;
  notes: string[];
};

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function getSpreadResult(prediction: PredictionSnapshot, result: GameResultSnapshot) {
  const line = prediction.marketSpreadHome ?? prediction.closingSpreadHome ?? result.closingSpreadHome;
  if (typeof line !== "number") return { won: null, pushed: false, note: "No spread line available." };
  const marginHome = result.homeScore - result.awayScore;
  const adjusted = marginHome + line;
  if (adjusted === 0) return { won: null, pushed: true, note: "Spread push." };
  const homeCovers = adjusted > 0;
  const won = prediction.side === "home" ? homeCovers : !homeCovers;
  return { won, pushed: false, note: `Home margin ${marginHome}, line ${line}.` };
}

function getTotalResult(prediction: PredictionSnapshot, result: GameResultSnapshot) {
  const line = prediction.marketTotal ?? prediction.closingTotal ?? result.closingTotal;
  if (typeof line !== "number") return { won: null, pushed: false, note: "No total line available." };
  const total = result.homeScore + result.awayScore;
  if (total === line) return { won: null, pushed: true, note: "Total push." };
  const overHits = total > line;
  const won = prediction.side === "over" ? overHits : !overHits;
  return { won, pushed: false, note: `Final total ${total}, line ${line}.` };
}

function getMoneylineResult(prediction: PredictionSnapshot, result: GameResultSnapshot) {
  const homeWon = result.homeScore > result.awayScore;
  if (result.homeScore === result.awayScore) return { won: null, pushed: true, note: "Tie/no decision." };
  const won = prediction.side === "home" ? homeWon : !homeWon;
  return { won, pushed: false, note: homeWon ? "Home team won." : "Away team won." };
}

function getClv(prediction: PredictionSnapshot, result: GameResultSnapshot) {
  if (prediction.market === "spread") {
    const open = prediction.marketSpreadHome;
    const close = prediction.closingSpreadHome ?? result.closingSpreadHome;
    if (typeof open !== "number" || typeof close !== "number") return null;
    const raw = prediction.side === "home" ? close - open : open - close;
    return round(raw);
  }
  if (prediction.market === "total") {
    const open = prediction.marketTotal;
    const close = prediction.closingTotal ?? result.closingTotal;
    if (typeof open !== "number" || typeof close !== "number") return null;
    const raw = prediction.side === "over" ? close - open : open - close;
    return round(raw);
  }
  return null;
}

export function gradePrediction(prediction: PredictionSnapshot, result: GameResultSnapshot): PredictionGradeResult {
  const scored = prediction.market === "spread" ? getSpreadResult(prediction, result) : prediction.market === "total" ? getTotalResult(prediction, result) : getMoneylineResult(prediction, result);
  const margin = result.homeScore - result.awayScore;
  const total = result.homeScore + result.awayScore;
  const clv = getClv(prediction, result);
  return {
    predictionId: prediction.id,
    eventId: prediction.eventId,
    market: prediction.market,
    side: prediction.side,
    grade: prediction.grade,
    confidenceScore: prediction.confidenceScore,
    won: scored.won,
    pushed: scored.pushed,
    closingLineValue: clv,
    margin,
    total,
    notes: [scored.note, clv === null ? "CLV unavailable." : `CLV ${clv > 0 ? "+" : ""}${clv}.`]
  };
}

export type ModelPerformanceSummary = {
  totalGraded: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  avgClv: number | null;
  byGrade: Record<string, { graded: number; wins: number; losses: number; pushes: number; winRate: number | null; avgClv: number | null }>;
  byMarket: Record<string, { graded: number; wins: number; losses: number; pushes: number; winRate: number | null; avgClv: number | null }>;
};

function summarizeBucket(results: PredictionGradeResult[]) {
  const graded = results.filter((r) => r.won !== null);
  const pushes = results.filter((r) => r.pushed).length;
  const wins = graded.filter((r) => r.won).length;
  const losses = graded.filter((r) => r.won === false).length;
  const clvValues = results.map((r) => r.closingLineValue).filter((value): value is number => typeof value === "number");
  return {
    graded: graded.length,
    wins,
    losses,
    pushes,
    winRate: graded.length ? round(wins / graded.length, 4) : null,
    avgClv: clvValues.length ? round(clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length) : null
  };
}

export function summarizePerformance(results: PredictionGradeResult[]): ModelPerformanceSummary {
  const overall = summarizeBucket(results);
  const byGrade: ModelPerformanceSummary["byGrade"] = {};
  const byMarket: ModelPerformanceSummary["byMarket"] = {};
  for (const grade of ["A", "B", "C", "PASS"] as const) byGrade[grade] = summarizeBucket(results.filter((r) => r.grade === grade));
  for (const market of ["moneyline", "spread", "total"] as const) byMarket[market] = summarizeBucket(results.filter((r) => r.market === market));
  return {
    totalGraded: overall.graded,
    wins: overall.wins,
    losses: overall.losses,
    pushes: overall.pushes,
    winRate: overall.winRate,
    avgClv: overall.avgClv,
    byGrade,
    byMarket
  };
}
