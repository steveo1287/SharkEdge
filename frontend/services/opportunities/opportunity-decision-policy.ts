import type { RankedOpportunity } from "@/lib/types/opportunity"
import { assessBookContext } from "@/services/market-intelligence/book-context"

export type OpportunityAction = "BET_NOW" | "WAIT" | "WATCH" | "PASS"

export type OpportunityDecision = {
  action: OpportunityAction
  stakeTier: "TINY" | "SMALL" | "MEDIUM" | "LARGE"
  rationale: string[]
}

function metric(opportunity: RankedOpportunity, key: string, fallback = 50): number {
  const raw = (opportunity as Record<string, unknown>)[key]
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback
}

function getStakeTier(opportunity: RankedOpportunity): OpportunityDecision["stakeTier"] {
  const edge = metric(opportunity, "score", metric(opportunity, "edgeScore", metric(opportunity, "opportunityScore", 50)))
  const fragility = metric(opportunity, "fragilityScore", 50)
  const clv = metric(opportunity, "expectedClvScore", 50)

  if (edge >= 85 && fragility <= 28 && clv >= 70) return "LARGE"
  if (edge >= 76 && fragility <= 40 && clv >= 62) return "MEDIUM"
  if (edge >= 66 && fragility <= 55) return "SMALL"
  return "TINY"
}

export function decideOpportunity(opportunity: RankedOpportunity): OpportunityDecision {
  const clv = metric(opportunity, "expectedClvScore", 50)
  const fragility = metric(opportunity, "fragilityScore", 50)
  const reliability = metric(opportunity, "trendReliabilityScore", 50)
  const market = metric(opportunity, "marketPathScore", 50)
  const efficiency = metric(opportunity, "capitalEfficiencyScore", 50)
  const edge = metric(opportunity, "score", metric(opportunity, "edgeScore", metric(opportunity, "opportunityScore", 50)))

  const context = assessBookContext({
    book: (opportunity as any).book ?? (opportunity as any).sportsbook ?? null,
    marketPathScore: market,
    expectedClvScore: clv,
    lineMovementScore: (opportunity as any).lineMovementScore ?? 50,
    liquidityScore: (opportunity as any).liquidityScore ?? 50,
    timeToStartMinutes: (opportunity as any).timeToStartMinutes ?? 180,
  })

  const rationale: string[] = []

  if (clv >= 65) rationale.push("positive expected closing-line path")
  if (context.executionQualityScore >= 60) rationale.push("execution quality is favorable")
  if (context.staleLineProbability >= 60) rationale.push("market context suggests a stale number")
  if (market >= 65) rationale.push("market path quality is supportive")
  if (reliability >= 60) rationale.push("trend evidence is sufficiently reliable")
  if (fragility >= 60) rationale.push("fragility is elevated")
  if (efficiency < 45) rationale.push("capital efficiency is weak")

  if (fragility >= 75 || reliability < 35 || edge < 45 || context.executionQualityScore < 35) {
    return { action: "PASS", stakeTier: "TINY", rationale: rationale.length ? rationale : ["insufficient edge quality"] }
  }

  if (clv >= 68 && market >= 65 && fragility <= 42 && reliability >= 58 && edge >= 70 && context.executionQualityScore >= 58) {
    return { action: "BET_NOW", stakeTier: getStakeTier(opportunity), rationale: [...rationale, ...context.reasons] }
  }

  if (clv < 55 && edge >= 65 && fragility <= 50) {
    return { action: "WAIT", stakeTier: "SMALL", rationale: [...(rationale.length ? rationale : ["edge exists but timing is not ideal yet"]), ...context.reasons] }
  }

  if (edge >= 58 && reliability >= 50 && fragility <= 60) {
    return { action: "WATCH", stakeTier: "TINY", rationale: [...(rationale.length ? rationale : ["monitor for line improvement or confirmation"]), ...context.reasons] }
  }

  return { action: "PASS", stakeTier: "TINY", rationale: [...(rationale.length ? rationale : ["opportunity does not clear action threshold"]), ...context.reasons] }
}
