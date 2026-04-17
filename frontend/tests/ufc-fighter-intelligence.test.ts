import assert from "node:assert/strict";

import { buildCombatProfileFromRows } from "@/services/modeling/fighter-history-service";
import { buildUfcFighterIntelligenceProfile } from "@/services/modeling/ufc-fighter-intelligence";

const historyRows = [
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "fighter_b",
    opponentRecord: "20-4-0",
    winnerCompetitorId: "fighter_a",
    loserCompetitorId: "fighter_b",
    method: "Submission",
    period: "2",
    officialAt: new Date("2024-06-01T00:00:00Z")
  },
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "fighter_c",
    opponentRecord: "18-3-0",
    winnerCompetitorId: "fighter_a",
    loserCompetitorId: "fighter_c",
    method: "Decision",
    period: "5",
    officialAt: new Date("2024-11-01T00:00:00Z")
  },
  {
    competitorId: "fighter_a",
    opponentCompetitorId: "fighter_d",
    opponentRecord: "16-5-0",
    winnerCompetitorId: "fighter_a",
    loserCompetitorId: "fighter_d",
    method: "KO/TKO",
    period: "1",
    officialAt: new Date("2025-03-01T00:00:00Z")
  }
];

const combatProfile = buildCombatProfileFromRows(historyRows);
const profile = buildUfcFighterIntelligenceProfile({
  record: "15-1-0",
  recentWinRate: 86,
  recentMargin: 3.6,
  combatProfile,
  historyRows,
  metadata: {
    camp: "American Kickboxing Academy",
    trainingPartners: ["Islam Makhachev", "Khabib Nurmagomedov"],
    amateurRecord: "6-1-0",
    wrestlingLevel: "NCAA Division 1",
    bjjBelt: "brown belt",
    sigStrikesLandedPerMin: 4.7,
    sigStrikesAbsorbedPerMin: 2.4,
    sigStrikeAccuracy: 51,
    sigStrikeDefense: 60,
    takedownAvgPer15: 3.4,
    takedownDefense: 82,
    submissionsPer15: 1.1,
    knockdownsPer15: 0.48,
    controlMinutesPer15: 5.3,
    reachInches: 72,
    age: 29,
    videoGameRating: 89
  }
});

assert.equal(profile.strengthOfScheduleScore > 6.5, true);
assert.equal(profile.winQualityScore > 6.5, true);
assert.equal(profile.campQualityScore > 8, true);
assert.equal(profile.trainingPartnerScore > 8, true);
assert.equal(profile.pedigreeScore > 7, true);
assert.equal(profile.compositeQualityScore > 7, true);
assert.equal(profile.scoutingFlags.includes("elite_room"), true);
assert.equal(profile.scoutingFlags.includes("proven_vs_quality"), true);

console.log("ufc-fighter-intelligence.test.ts passed");
