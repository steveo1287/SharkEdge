export type PricingInput = {
  marketType?: string | null
  line?: number | null
  projectionMean?: number | null
  projectionMedian?: number | null
  standardDeviation?: number | null
  offeredOddsAmerican?: number | null
}

export type PricingAssessment = {
  fairProbability: number
  fairOddsAmerican: number
  edgePercent: number
  pushProbability: number
  confidenceBandLow: number
  confidenceBandHigh: number
  pricingModel: "NORMAL_APPROX"
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function erf(x: number) {
  const sign = x >= 0 ? 1 : -1
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const absX = Math.abs(x)
  const t = 1 / (1 + p * absX)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX)
  return sign * y
}

function normalCdf(x: number, mean: number, sd: number) {
  if (!Number.isFinite(sd) || sd <= 0) return x >= mean ? 1 : 0
  return 0.5 * (1 + erf((x - mean) / (sd * Math.sqrt(2))))
}

function probabilityToAmerican(probability: number) {
  const p = clamp(probability, 0.001, 0.999)
  if (p >= 0.5) return Math.round(-(p / (1 - p)) * 100)
  return Math.round(((1 - p) / p) * 100)
}

function americanToProbability(odds: number) {
  if (!Number.isFinite(odds) || odds === 0) return 0.5
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100)
}

export function assessDistributionPricing(input: PricingInput): PricingAssessment {
  const mean = input.projectionMean ?? input.projectionMedian ?? input.line ?? 0
  const median = input.projectionMedian ?? mean
  const line = input.line ?? mean
  const sd = Math.max(0.75, input.standardDeviation ?? Math.max(1.5, Math.abs(mean) * 0.18))
  const offeredProb = americanToProbability(input.offeredOddsAmerican ?? -110)

  const overProbability = clamp(1 - normalCdf(line, mean, sd))
  const pushProbability = clamp(normalCdf(line + 0.5, median, sd) - normalCdf(line - 0.5, median, sd), 0, 0.25)
  const fairOddsAmerican = probabilityToAmerican(overProbability)
  const edgePercent = Math.round((overProbability - offeredProb) * 1000) / 10
  const confidenceBandLow = Math.round((mean - 1.28 * sd) * 100) / 100
  const confidenceBandHigh = Math.round((mean + 1.28 * sd) * 100) / 100

  return {
    fairProbability: Math.round(overProbability * 1000) / 1000,
    fairOddsAmerican,
    edgePercent,
    pushProbability: Math.round(pushProbability * 1000) / 1000,
    confidenceBandLow,
    confidenceBandHigh,
    pricingModel: "NORMAL_APPROX",
  }
}
