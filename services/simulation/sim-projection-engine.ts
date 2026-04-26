import { buildNbaIntel, type NbaIntelResult } from "@/services/simulation/nba-intelligence-engine";
import { calibrateNbaAgainstMarket } from "@/services/simulation/nba-market-calibration";
import type { LeagueKey, ScoreboardPreviewView } from "@/lib/types/domain";

export type SimGame = ScoreboardPreviewView & { leagueKey: LeagueKey; leagueLabel: string };
export type Confidence = "A" | "B" | "C";
export type Pace = "Fast" | "Neutral" | "Slow";
export type Volatility = "High" | "Medium" | "Low";
export type UpsetRisk = "High" | "Medium" | "Low";
export type InsightTone = "strong" | "watch" | "avoid" | "neutral";
export type SmartInsight = { label: string; tone: InsightTone; detail: string };
export type SimDistribution = { runs: number; homeWinPct: number; awayWinPct: number; avgHome: number; avgAway: number; avgTotal: number; medianTotal: number; medianSpreadHome: number; homeBlowoutPct: number; awayBlowoutPct: number; oneScorePct: number; totalLow: number; totalHigh: number };
export type SimProjection = { matchup: { away: string; home: string }; homeScore: number; awayScore: number; homeWinPct: number; awayWinPct: number; total: number; spreadHome: number; confidence: Confidence; lean: string; pace: Pace; volatility: Volatility; upsetRisk: UpsetRisk; totalBand: { low: number; high: number }; spreadBand: { low: number; high: number }; modelTags: string[]; read: string; distribution: SimDistribution; insights: SmartInsight[]; nbaIntel?: NbaIntelResult };
// rest unchanged above...

export async function buildSimProjection(game: SimGame): Promise<SimProjection> {
  const matchup = parseMatchup(game.label);
  const base = BASE_SCORING[game.leagueKey] ?? { home: 24, away: 21, variance: 6, baselineTotal: 45 };
  const seed = hashString(`${game.id}:${game.leagueKey}:${game.label}:${game.startTime}`);

  const nbaIntel = game.leagueKey === "NBA"
    ? await buildNbaIntel(matchup.away, matchup.home)
    : undefined;

  const genericPaceSeed = seedUnit(seed >>> 5);
  const genericFormSwing = (seedUnit(seed >>> 9) - 0.5) * base.variance;

  const nbaHomeEdge = nbaIntel?.projectedHomeEdge ?? 0;
  const totalShift = nbaIntel?.projectedTotalShift ?? 0;
  const volatilityMultiplier = nbaIntel?.volatilityIndex ?? 1;

  const paceIndex = nbaIntel ? totalShift / 3 : genericPaceSeed > 0.68 ? 2 : genericPaceSeed < 0.32 ? -2 : 0;
  const paceMultiplier = 1 + paceIndex / 100;

  const homeRaw = base.home * paceMultiplier + 1.2 + genericFormSwing * 0.25 + totalShift / 2 + nbaHomeEdge * 0.58;
  const awayRaw = base.away * paceMultiplier - genericFormSwing * 0.18 + totalShift / 2 - nbaHomeEdge * 0.36;

  const homeScore = roundScore(homeRaw, game.leagueKey);
  const awayScore = roundScore(awayRaw, game.leagueKey);

  const spreadHome = Number((homeScore - awayScore).toFixed(1));
  const total = Number((homeScore + awayScore).toFixed(1));

  const market = game.leagueKey === "NBA"
    ? await calibrateNbaAgainstMarket({
        awayTeam: matchup.away,
        homeTeam: matchup.home,
        modelSpreadHome: spreadHome,
        modelTotal: total
      })
    : undefined;

  const adjustedConfidence = Math.max(
    20,
    Math.min(95, (nbaIntel?.confidenceScore ?? 50) + (market?.marketConfidenceAdjustment ?? 0))
  );

  const varianceSeed = Math.max(0, Math.min(1, seedUnit(seed >>> 13) + (volatilityMultiplier - 1) * 0.22));
  const distribution = buildDistribution({ game, homeScore, awayScore, varianceSeed, volatilityMultiplier });

  const volatility: Volatility = volatilityMultiplier >= 1.24 || varianceSeed > 0.72 ? "High" : volatilityMultiplier <= 0.92 && varianceSeed < 0.42 ? "Low" : "Medium";
  const pace: Pace = paceIndex > 1.2 ? "Fast" : paceIndex < -1.2 ? "Slow" : "Neutral";
  const upsetRisk: UpsetRisk = Math.abs(spreadHome) <= base.variance * 0.35 ? "High" : Math.abs(spreadHome) <= base.variance * 0.7 ? "Medium" : "Low";

  const confidence = confidenceFromScore(adjustedConfidence, volatility, upsetRisk);

  const bandWidth = (volatility === "High" ? base.variance * 1.3 : volatility === "Low" ? base.variance * 0.58 : base.variance * 0.88) * volatilityMultiplier;

  const withoutInsights: Omit<SimProjection, "insights"> = {
    matchup,
    homeScore,
    awayScore,
    homeWinPct: Math.max(0.29, Math.min(0.78, distribution.homeWinPct)),
    awayWinPct: 1 - Math.max(0.29, Math.min(0.78, distribution.homeWinPct)),
    total,
    spreadHome,
    confidence,
    lean: spreadHome >= 0 ? matchup.home : matchup.away,
    pace,
    volatility,
    upsetRisk,
    totalBand: { low: roundModelValue(total - bandWidth, game.leagueKey), high: roundModelValue(total + bandWidth, game.leagueKey) },
    spreadBand: { low: roundModelValue(spreadHome - bandWidth * 0.45, game.leagueKey), high: roundModelValue(spreadHome + bandWidth * 0.45, game.leagueKey) },
    modelTags: ["100-run sim", nbaIntel ? nbaIntel.modelVersion : "generic", market?.signal ?? "no-market"],
    read: nbaIntel ? nbaIntel.notes.join(" ") : "Model read unavailable.",
    distribution,
    nbaIntel
  };

  return { ...withoutInsights, insights: buildInsights({ projection: withoutInsights }) };
}
