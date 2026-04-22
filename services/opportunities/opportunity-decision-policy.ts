import type { RankedOpportunity } from "@/lib/types/opportunity"
import type { RankedTrendPlay } from "@/services/trends/play-types";
import { assessBookContext } from "@/services/market-intelligence/book-context"

export type OpportunityAction = "BET_NOW" | "WAIT" | "WATCH" | "PASS"

export type OpportunityDecision = {
  action: OpportunityAction
  stakeTier: "TINY" | "SMALL" | "MEDIUM" | "LARGE"
  rationale: string[]
}

function getStakeTier(opportunity: RankedOpportunity): OpportunityDecision["stakeTier"] {
  const edge = opportunity.score
  const fragility = opportunity.fragilityScore ?? 50
  const clv = opportunity.expectedClvScore ?? 50

  if (edge >= 85 && fragility <= 28 && clv >= 70) return "LARGE"
  if (edge >= 76 && fragility <= 40 && clv >= 62) return "MEDIUM"
  if (edge >= 66 && fragility <= 55) return "SMALL"
  return "TINY"
}

function bestPlayTierWeight(tier: string): number {
  if (tier === "A") return 1.0;
  if (tier === "B") return 0.7;
  return 0.4;
}

export function decideOpportunity(opportunity: RankedOpportunity): OpportunityDecision {
  const clv = opportunity.expectedClvScore ?? 50
  const fragility = opportunity.fragilityScore ?? 50
  const reliability = opportunity.trendReliabilityScore ?? 50
  const market = opportunity.marketPathScore ?? 50
  const efficiency = opportunity.capitalEfficiencyScore ?? 50
  const edge = opportunity.score

  const matchingPlays: RankedTrendPlay[] = (opportunity as any).matchingTrendPlays ?? [];
  const livePlays = matchingPlays.filter(p => p.activationState === "LIVE_NOW");
  const bestLivePlay = livePlays.sort((a, b) => b.finalScore - a.finalScore)[0] ?? null;
  const trendConfirmation = bestLivePlay ? bestPlayTierWeight(bestLivePlay.tier) : 0;

  const context = assessBookContext({
    book: (opportunity as any).book ?? (opportunity as any).sportsbook ?? null,
    marketPathScore: opportunity.marketPathScore ?? 50,
    expectedClvScore: opportunity.expectedClvScore ?? 50,
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
  if (bestLivePlay) {
    rationale.push(
      `${livePlays.length} live trend system${livePlays.length > 1 ? "s" : ""} firing on this market (best: ${bestLivePlay.tier}-tier, score ${bestLivePlay.finalScore})`
    );
  }

  if (fragility >= 75 || reliability < 35 || edge < 45 || context.executionQualityScore < 35) {
    return { action: "PASS", stakeTier: "TINY", rationale: rationale.length ? rationale : ["insufficient edge quality"] }
  }

  // Live trend confirmation relaxes the fragility and reliability gates for BET_NOW.
  // A-tier play: fragility gate opens to 52 (vs 42), reliability drops to 52 (vs 58).
  // B-tier play: fragility gate opens to 46, reliability drops to 55.
  const fragilityGate = trendConfirmation >= 1.0 ? 52 : trendConfirmation >= 0.7 ? 46 : 42;
  const reliabilityGate = trendConfirmation >= 1.0 ? 52 : trendConfirmation >= 0.7 ? 55 : 58;

  if (clv >= 68 && market >= 65 && fragility <= fragilityGate && reliability >= reliabilityGate && edge >= 70 && context.executionQualityScore >= 58) {
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
