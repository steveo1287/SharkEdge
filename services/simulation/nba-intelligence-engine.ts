import { buildAdvancedNbaFeatures } from "@/services/simulation/nba-advanced-feature-engine";
import { getNbaDecisionContext } from "@/services/simulation/nba-decision-context";
import { getNbaSynergyContext } from "@/services/simulation/nba-synergy-context";
import { compareNbaProfilesReal } from "@/services/simulation/nba-team-analytics";
import { getNbaLineupImpact } from "@/services/simulation/nba-player-impact";
import { getNbaTeamPlayerProfileSummary } from "@/services/simulation/nba-player-profiles";

export type NbaIntelFactor = { key: string; label: string; value: number; weight: number; contribution: number; explanation: string };
export type NbaIntelResult = { modelVersion: "nba-intel-v6"; awayTeam: string; homeTeam: string; projectedHomeEdge: number; projectedTotalShift: number; volatilityIndex: number; confidenceScore: number; factorStrength: "elite" | "strong" | "medium" | "thin"; dataSource: string; dataCompleteness: number; correlationRisk: number; modelRiskPenalty: number; factors: NbaIntelFactor[]; notes: string[] };
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function rounded(value: number, digits = 2) { return Number(value.toFixed(digits)); }
function strength(score: number): NbaIntelResult["factorStrength"] { if (score >= 72) return "elite"; if (score >= 61) return "strong"; if (score >= 49) return "medium"; return "thin"; }

export async function buildNbaIntel(awayTeam: string, homeTeam: string): Promise<NbaIntelResult> {
  const [comparison, awayImpact, homeImpact, decisionContext, synergyContext, awayProfiles, homeProfiles] = await Promise.all([
    compareNbaProfilesReal(awayTeam, homeTeam),
    getNbaLineupImpact(awayTeam),
    getNbaLineupImpact(homeTeam),
    getNbaDecisionContext(awayTeam, homeTeam),
    getNbaSynergyContext(awayTeam, homeTeam),
    getNbaTeamPlayerProfileSummary(awayTeam),
    getNbaTeamPlayerProfileSummary(homeTeam)
  ]);
  const advanced = buildAdvancedNbaFeatures({ comparison, awayImpact, homeImpact });
  const playerOffenseEdge = rounded(homeProfiles.offensiveProfileBoost - awayProfiles.offensiveProfileBoost);
  const playerDefenseEdge = rounded(homeProfiles.defensiveProfileBoost - awayProfiles.defensiveProfileBoost);
  const playerReliabilityEdge = rounded((homeProfiles.rotationReliability - awayProfiles.rotationReliability) / 12);
  const playerVolatility = rounded(clamp((homeProfiles.volatilityBoost + awayProfiles.volatilityBoost) / 2, 0.85, 1.8));
  const playerModelRisk = rounded((homeProfiles.availabilityDrag + awayProfiles.availabilityDrag) * 0.7 + Math.max(0, 90 - homeProfiles.rotationReliability) / 8 + Math.max(0, 90 - awayProfiles.rotationReliability) / 8);
  const factors: NbaIntelFactor[] = [
    ...advanced.features.map((item) => ({ key: item.key, label: item.label, value: item.value, weight: item.sideWeight, contribution: item.sideContribution, explanation: item.explanation })),
    { key: "decision_context", label: "Decision-context edge", value: decisionContext.decisionEdge, weight: 1, contribution: decisionContext.decisionEdge, explanation: "Schedule, travel, referee, public bias, sharp split, matchup mechanics, bench, and game-script context." },
    { key: "synergy_context", label: "Synergy matchup edge", value: synergyContext.synergySideEdge, weight: 1, contribution: synergyContext.synergySideEdge, explanation: "Coach, player, team, play-type, shot-profile, defensive-scheme, star, and bench creation matchup context." },
    { key: "player_offense", label: "Player creation / spacing edge", value: playerOffenseEdge, weight: 0.72, contribution: rounded(playerOffenseEdge * 0.72), explanation: "Aggregated player creation, usage, spacing, playmaking, and star power." },
    { key: "player_defense", label: "Player defensive profile edge", value: playerDefenseEdge, weight: 0.48, contribution: rounded(playerDefenseEdge * 0.48), explanation: "Aggregated player defense, rim protection, glass, and point-of-attack profile." },
    { key: "rotation_reliability", label: "Rotation reliability edge", value: playerReliabilityEdge, weight: 0.65, contribution: rounded(playerReliabilityEdge * 0.65), explanation: "Projected minutes stability, fatigue, and availability drag." }
  ];
  const playerSideEdge = rounded(playerOffenseEdge * 0.72 + playerDefenseEdge * 0.48 + playerReliabilityEdge * 0.65);
  const playerTotalEdge = rounded(playerOffenseEdge * 0.52 - playerDefenseEdge * 0.22 - (homeProfiles.availabilityDrag + awayProfiles.availabilityDrag) * 0.25);
  const projectedHomeEdge = rounded(advanced.sideEdge + decisionContext.decisionEdge + synergyContext.synergySideEdge + playerSideEdge);
  const projectedTotalShift = rounded(advanced.totalEdge + decisionContext.totalContextEdge + synergyContext.synergyTotalEdge + playerTotalEdge);
  const volatilityIndex = rounded(clamp(advanced.volatilityEdge * decisionContext.volatilityContext * synergyContext.synergyVolatility * playerVolatility, 0.72, 2.35));
  const combinedModelRisk = rounded(advanced.modelRiskPenalty + Math.max(0, decisionContext.volatilityContext - 1) * 6 + Math.max(0, synergyContext.synergyVolatility - 1) * 7 + Math.max(0, playerVolatility - 1) * 8 + playerModelRisk + decisionContext.garbageTimeRisk * 3 + decisionContext.blowoutRisk * 2);
  const profileCompleteness = awayProfiles.source === "real" && homeProfiles.source === "real" ? 100 : 70;
  const dataCompleteness = rounded(clamp((advanced.dataCompleteness * 0.75 + profileCompleteness * 0.25), 30, 100));
  const factorAgreement = factors.filter((item) => Math.sign(item.contribution) === Math.sign(projectedHomeEdge) && Math.abs(item.contribution) >= 0.35).length;
  const confidenceScore = rounded(clamp(48 + Math.abs(projectedHomeEdge) * 3.35 + factorAgreement * 1.9 + (dataCompleteness - 65) * 0.18 + decisionContext.confidenceAdjustment + synergyContext.confidenceAdjustment - combinedModelRisk, 16, 96));
  return {
    modelVersion: "nba-intel-v6",
    awayTeam,
    homeTeam,
    projectedHomeEdge,
    projectedTotalShift,
    volatilityIndex,
    confidenceScore,
    factorStrength: strength(confidenceScore),
    dataSource: `${comparison.away.source}/${comparison.home.source}+lineups+advanced-features+decision-context:${decisionContext.source}+synergy:${synergyContext.source}+player-profiles:${awayProfiles.source}/${homeProfiles.source}`,
    dataCompleteness,
    correlationRisk: advanced.correlationRisk,
    modelRiskPenalty: combinedModelRisk,
    factors,
    notes: [homeImpact.summary, awayImpact.summary, ...advanced.notes, ...decisionContext.notes, ...synergyContext.notes, ...homeProfiles.notes, ...awayProfiles.notes]
  };
}
