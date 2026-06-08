import type {
  MlbPlayerMatchupDiagnosticReport,
  MlbPlayerMatchupEdge,
  MlbStarterMatchupDiagnostic
} from "@/services/simulation/mlb-player-matchup-diagnostics";

export type MlbPlayerSimulationSpotlightCard = {
  playerId: string | null;
  playerName: string;
  team: string;
  side: "HITTER" | "STARTER";
  statFocus: "CONTACT" | "POWER" | "BASE_REACH" | "PLATOON" | "STRIKEOUT_SKILL" | "STARTER_LENGTH" | "RUN_PREVENTION" | "SUPPRESSION_RISK";
  impactDirection: "POSITIVE" | "NEGATIVE" | "VOLATILE";
  impactScore: number;
  confidence: number;
  rank: number;
  tags: string[];
  reason: string;
};

export type MlbPlayerSimulationSpotlight = {
  modelVersion: "mlb-player-simulation-spotlight-v1";
  awayTeam: string;
  homeTeam: string;
  cards: MlbPlayerSimulationSpotlightCard[];
  warnings: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function confidenceFromImpact(impactScore: number, teamConfidence: number, extra = 0) {
  return round(clamp(0.3 + Math.abs(impactScore) / 70 + teamConfidence * 0.3 + extra, 0.25, 0.92), 3);
}

function hitterFocus(edge: MlbPlayerMatchupEdge): MlbPlayerSimulationSpotlightCard["statFocus"] {
  if (edge.edgeScore < -8) return "SUPPRESSION_RISK";
  if (edge.primaryDriver === "POWER") return "POWER";
  if (edge.primaryDriver === "DISCIPLINE") return "BASE_REACH";
  if (edge.primaryDriver === "PLATOON") return "PLATOON";
  return "CONTACT";
}

function hitterCards(edges: MlbPlayerMatchupEdge[], teamConfidence: number): MlbPlayerSimulationSpotlightCard[] {
  return edges.map((edge) => {
    const focus = hitterFocus(edge);
    const direction = edge.edgeScore >= 0 ? "POSITIVE" : edge.edgeScore <= -8 ? "NEGATIVE" : "VOLATILE";
    const tags = [focus.toLowerCase().replace(/_/g, "-"), edge.opponentStarterHand === "L" ? "vs-lhp" : "vs-rhp"];
    if (edge.battingOrder <= 4) tags.push("premium-lineup-slot");

    return {
      playerId: edge.playerId,
      playerName: edge.playerName,
      team: edge.team,
      side: "HITTER",
      statFocus: focus,
      impactDirection: direction,
      impactScore: round(edge.edgeScore, 3),
      confidence: confidenceFromImpact(edge.edgeScore, teamConfidence, edge.battingOrder <= 4 ? 0.04 : 0),
      rank: 0,
      tags,
      reason: edge.edgeScore >= 0
        ? `${edge.playerName} lifts the simulation through ${edge.primaryDriver.toLowerCase().replace(/_/g, " ")} against ${edge.opponentStarterName ?? "the probable starter"}.`
        : `${edge.playerName} is suppressed by ${edge.opponentStarterName ?? "the probable starter"}; matchup edge ${edge.edgeScore.toFixed(1)}.`
    };
  });
}

function starterCards(starter: MlbStarterMatchupDiagnostic, teamConfidence: number): MlbPlayerSimulationSpotlightCard[] {
  if (!starter.pitcherId || !starter.pitcherName) return [];
  const cards: MlbPlayerSimulationSpotlightCard[] = [];
  const strikeoutImpact = starter.edgeAgainstOpponent + (starter.strikeoutScore - 70) * 0.38;
  const lengthImpact = starter.edgeAgainstOpponent + (starter.staminaScore - 70) * 0.44 - Math.max(0, starter.volatilityRisk - 48) * 0.16;
  const preventionImpact = starter.edgeAgainstOpponent + (starter.runPreventionScore - 70) * 0.28 + (starter.powerSuppressionScore - 70) * 0.18;

  if (strikeoutImpact >= 5) {
    cards.push({
      playerId: starter.pitcherId,
      playerName: starter.pitcherName,
      team: starter.team,
      side: "STARTER",
      statFocus: "STRIKEOUT_SKILL",
      impactDirection: "POSITIVE",
      impactScore: round(strikeoutImpact, 3),
      confidence: confidenceFromImpact(strikeoutImpact, teamConfidence, starter.strikeoutScore >= 80 ? 0.06 : 0),
      rank: 0,
      tags: ["starter-k-skill", starter.throws === "L" ? "lhp" : "rhp"],
      reason: `${starter.pitcherName} adds strikeout pressure with K score ${starter.strikeoutScore.toFixed(1)} against opponent lineup skill ${starter.opponentOffenseSkill.toFixed(1)}.`
    });
  }

  if (lengthImpact >= 5) {
    cards.push({
      playerId: starter.pitcherId,
      playerName: starter.pitcherName,
      team: starter.team,
      side: "STARTER",
      statFocus: "STARTER_LENGTH",
      impactDirection: "POSITIVE",
      impactScore: round(lengthImpact, 3),
      confidence: confidenceFromImpact(lengthImpact, teamConfidence, starter.staminaScore >= 80 ? 0.05 : 0),
      rank: 0,
      tags: ["starter-length", "stamina"],
      reason: `${starter.pitcherName} projects for stronger length from stamina ${starter.staminaScore.toFixed(1)} and volatility ${starter.volatilityRisk.toFixed(1)}.`
    });
  }

  if (preventionImpact <= -6) {
    cards.push({
      playerId: starter.pitcherId,
      playerName: starter.pitcherName,
      team: starter.team,
      side: "STARTER",
      statFocus: "RUN_PREVENTION",
      impactDirection: "NEGATIVE",
      impactScore: round(preventionImpact, 3),
      confidence: confidenceFromImpact(preventionImpact, teamConfidence, 0.02),
      rank: 0,
      tags: ["run-prevention-risk", "starter-volatility"],
      reason: `${starter.pitcherName} carries run-prevention drag against this opponent lineup.`
    });
  }

  return cards;
}

export function buildMlbPlayerSimulationSpotlight(report: MlbPlayerMatchupDiagnosticReport): MlbPlayerSimulationSpotlight {
  const hitterSpotlights = [
    ...hitterCards(report.away.topAdvantages.slice(0, 4), report.away.confidence),
    ...hitterCards(report.home.topAdvantages.slice(0, 4), report.home.confidence),
    ...hitterCards(report.away.topRisks.filter((edge) => edge.edgeScore <= -6).slice(0, 2), report.away.confidence),
    ...hitterCards(report.home.topRisks.filter((edge) => edge.edgeScore <= -6).slice(0, 2), report.home.confidence)
  ];
  const starterSpotlights = [
    ...starterCards(report.away.starter, report.away.confidence),
    ...starterCards(report.home.starter, report.home.confidence)
  ];

  const cards = [...hitterSpotlights, ...starterSpotlights]
    .sort((a, b) => (b.confidence * Math.abs(b.impactScore)) - (a.confidence * Math.abs(a.impactScore)))
    .slice(0, 14)
    .map((card, index) => ({ ...card, rank: index + 1 }));

  return {
    modelVersion: "mlb-player-simulation-spotlight-v1",
    awayTeam: report.awayTeam,
    homeTeam: report.homeTeam,
    cards,
    warnings: report.warnings
  };
}
