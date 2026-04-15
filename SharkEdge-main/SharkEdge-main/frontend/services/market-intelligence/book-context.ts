export type BookContextInput = {
  book?: string | null
  marketPathScore?: number | null
  expectedClvScore?: number | null
  lineMovementScore?: number | null
  liquidityScore?: number | null
  timeToStartMinutes?: number | null
}

export type MarketRegime =
  | "OPEN_SOFT"
  | "MID_MARKET"
  | "PRECLOSE_SHARP"
  | "NEWS_SENSITIVE"
  | "LOW_LIQUIDITY"

export type BookContextAssessment = {
  regime: MarketRegime
  staleLineProbability: number
  softnessScore: number
  executionQualityScore: number
  reasons: string[]
}

const SOFT_BOOKS = new Set([
  "fanduel",
  "betrivers",
  "caesars",
  "espnbet",
  "hardrock",
])

const SHARPER_BOOKS = new Set([
  "pinnacle",
  "circa",
  "draftkings",
])

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

export function assessBookContext(input: BookContextInput): BookContextAssessment {
  const book = (input.book ?? "").toLowerCase().trim()
  const market = input.marketPathScore ?? 50
  const clv = input.expectedClvScore ?? 50
  const move = input.lineMovementScore ?? 50
  const liquidity = input.liquidityScore ?? 50
  const tts = input.timeToStartMinutes ?? 180

  const reasons: string[] = []

  let regime: MarketRegime = "MID_MARKET"
  if (liquidity <= 35) regime = "LOW_LIQUIDITY"
  else if (tts <= 35) regime = "PRECLOSE_SHARP"
  else if (move >= 70 && tts <= 120) regime = "NEWS_SENSITIVE"
  else if (tts >= 12 * 60) regime = "OPEN_SOFT"

  let softnessScore = 50
  if (SOFT_BOOKS.has(book)) softnessScore += 18
  if (SHARPER_BOOKS.has(book)) softnessScore -= 12
  softnessScore += (market - 50) * 0.18
  softnessScore += (clv - 50) * 0.12
  softnessScore = clamp(Math.round(softnessScore))

  let staleLineProbability = 50
  staleLineProbability += (market - 50) * 0.35
  staleLineProbability += (clv - 50) * 0.25
  staleLineProbability -= (move - 50) * 0.10
  if (regime === "OPEN_SOFT") staleLineProbability += 10
  if (regime === "PRECLOSE_SHARP") staleLineProbability -= 12
  staleLineProbability = clamp(Math.round(staleLineProbability))

  let executionQualityScore = 50
  executionQualityScore += (softnessScore - 50) * 0.30
  executionQualityScore += (staleLineProbability - 50) * 0.25
  executionQualityScore += (liquidity - 50) * 0.15
  if (regime === "PRECLOSE_SHARP") executionQualityScore -= 8
  executionQualityScore = clamp(Math.round(executionQualityScore))

  if (softnessScore >= 62) reasons.push("book profile appears softer than baseline")
  if (staleLineProbability >= 62) reasons.push("line may be stale relative to market path")
  if (regime === "OPEN_SOFT") reasons.push("opening regime can preserve weaker numbers")
  if (regime === "PRECLOSE_SHARP") reasons.push("pre-close market tends to be more efficient")
  if (regime === "NEWS_SENSITIVE") reasons.push("market may be reacting to new information")
  if (regime === "LOW_LIQUIDITY") reasons.push("thin liquidity can distort apparent edge")

  return {
    regime,
    staleLineProbability,
    softnessScore,
    executionQualityScore,
    reasons,
  }
}
