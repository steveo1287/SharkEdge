import assert from "node:assert/strict";

import {
  deriveMlbMicroGameAdjustment,
  deriveMlbMicroLineupAdjustment,
  deriveMlbMicroMatchupProjection,
  listMlbMicroRequiredVariables,
  type MlbBatterMicroTendency,
  type MlbPitcherMicroTendency
} from "@/services/simulation/mlb-micro-tendency-model";
import type { MlbEliteTeamRating } from "@/services/simulation/mlb-elite-rating-system";

const batterTendencies: MlbBatterMicroTendency[] = [
  {
    mlbId: 101,
    name: "Power Righty",
    team: "AAA",
    bats: "R",
    archetype: "POWER",
    reliability: 0.86,
    plateAppearances: 640,
    pitchTypeRunValue: { FF: 7.5, SL: 3.2, CH: -1.1, CU: 1.2 },
    pitchTypeWhiffRate: { FF: 0.21, SL: 0.31, CH: 0.28, CU: 0.25 },
    pitchTypeHardHitRate: { FF: 0.54, SL: 0.46, CH: 0.38, CU: 0.4 },
    outcomeByCount: {
      "0-0": { expectedWoba: 0.36, expectedSlug: 0.5, homeRunRate: 0.042 },
      "2-0": { expectedWoba: 0.43, expectedSlug: 0.63, homeRunRate: 0.07 },
      "1-2": { strikeoutRate: 0.31, expectedWoba: 0.29 }
    },
    outcomeByBaseState: {
      empty: { expectedWoba: 0.355, expectedSlug: 0.51 },
      "1--": { expectedWoba: 0.38, expectedSlug: 0.54 },
      "-2-": { expectedWoba: 0.395, extraBaseHitRate: 0.102 }
    },
    outcomeByPitcherHand: {
      L: { expectedWoba: 0.39, expectedSlug: 0.58, homeRunRate: 0.052 },
      R: { expectedWoba: 0.355, expectedSlug: 0.5 }
    },
    sprayOverall: { pull: 0.47, center: 0.32, opposite: 0.21, groundball: 0.34, lineDrive: 0.25, flyball: 0.35, popup: 0.06 },
    sprayByPitchType: {
      FF: { pull: 0.51, flyball: 0.39, lineDrive: 0.25 },
      SL: { pull: 0.44, groundball: 0.38, lineDrive: 0.24 }
    },
    runnersOnBase: {
      any: { expectedWoba: 0.37 },
      risp: { expectedWoba: 0.395, expectedSlug: 0.58, extraBaseHitRate: 0.11 },
      basesLoaded: { expectedWoba: 0.41, walkRate: 0.12 }
    },
    clutchIndex: 1.08
  },
  {
    mlbId: 102,
    name: "Contact Lefty",
    team: "AAA",
    bats: "L",
    archetype: "CONTACT",
    reliability: 0.82,
    plateAppearances: 590,
    pitchTypeRunValue: { FF: 2.1, SI: 1.4, SL: 0.2, CH: 3.9 },
    pitchTypeWhiffRate: { FF: 0.14, SI: 0.12, SL: 0.19, CH: 0.16 },
    pitchTypeHardHitRate: { FF: 0.39, SI: 0.36, SL: 0.34, CH: 0.41 },
    outcomeByCount: { "0-0": { expectedWoba: 0.335, strikeoutRate: 0.145 }, "3-2": { walkRate: 0.16, expectedWoba: 0.36 } },
    outcomeByBaseState: { empty: { expectedWoba: 0.33 }, "1--": { expectedWoba: 0.35 }, "-2-": { expectedWoba: 0.365 } },
    outcomeByPitcherHand: { R: { expectedWoba: 0.35, walkRate: 0.105 }, L: { expectedWoba: 0.315 } },
    sprayOverall: { pull: 0.35, center: 0.39, opposite: 0.26, groundball: 0.47, lineDrive: 0.27, flyball: 0.21, popup: 0.05 },
    runnersOnBase: { risp: { expectedWoba: 0.36, strikeoutRate: 0.13 } },
    clutchIndex: 1.03
  },
  ...Array.from({ length: 7 }, (_, index): MlbBatterMicroTendency => ({
    mlbId: 103 + index,
    name: `AAA Hitter ${index + 3}`,
    team: "AAA",
    bats: index % 2 === 0 ? "R" : "L",
    archetype: index % 3 === 0 ? "BALANCED" : "CONTACT",
    reliability: 0.72,
    plateAppearances: 440,
    pitchTypeRunValue: { FF: 0.7, SL: -0.2, CH: 0.4 },
    pitchTypeWhiffRate: { FF: 0.2, SL: 0.25, CH: 0.22 },
    pitchTypeHardHitRate: { FF: 0.38, SL: 0.34, CH: 0.36 },
    outcomeByCount: { "0-0": { expectedWoba: 0.315 }, "1-1": { expectedWoba: 0.31 }, "2-1": { expectedWoba: 0.34 } },
    outcomeByBaseState: { empty: { expectedWoba: 0.31 }, "1--": { expectedWoba: 0.325 }, "-2-": { expectedWoba: 0.34 } },
    sprayOverall: { pull: 0.38, center: 0.36, opposite: 0.26, groundball: 0.44, lineDrive: 0.24, flyball: 0.27, popup: 0.05 }
  })),
  ...Array.from({ length: 9 }, (_, index): MlbBatterMicroTendency => ({
    mlbId: 201 + index,
    name: `BBB Hitter ${index + 1}`,
    team: "BBB",
    bats: index % 2 === 0 ? "L" : "R",
    archetype: index === 2 ? "POWER" : "BALANCED",
    reliability: 0.69,
    plateAppearances: 410,
    pitchTypeRunValue: { FF: -0.1, SI: 0.3, SL: 0.2, CH: 0.1 },
    pitchTypeWhiffRate: { FF: 0.22, SL: 0.27, CH: 0.24 },
    pitchTypeHardHitRate: { FF: 0.37, SI: 0.36, SL: 0.35 },
    outcomeByCount: { "0-0": { expectedWoba: 0.31 }, "1-1": { expectedWoba: 0.305 }, "2-1": { expectedWoba: 0.325 } },
    outcomeByBaseState: { empty: { expectedWoba: 0.305 }, "1--": { expectedWoba: 0.32 }, "-2-": { expectedWoba: 0.33 } },
    sprayOverall: { pull: 0.37, center: 0.36, opposite: 0.27, groundball: 0.45, lineDrive: 0.23, flyball: 0.27, popup: 0.05 }
  }))
];

const pitcherTendencies: MlbPitcherMicroTendency[] = [
  {
    mlbId: 901,
    name: "Fastball Starter",
    team: "BBB",
    throws: "L",
    role: "starter",
    reliability: 0.84,
    battersFaced: 710,
    pitchMixOverall: { FF: 0.48, SI: 0.12, SL: 0.18, CH: 0.16, CU: 0.06 },
    pitchMixByCount: {
      "0-0": { FF: 0.55, SI: 0.15, SL: 0.12, CH: 0.12, CU: 0.06 },
      "0-2": { FF: 0.32, SL: 0.34, CH: 0.2, CU: 0.14 },
      "2-0": { FF: 0.62, SI: 0.18, CH: 0.1, SL: 0.1 },
      "3-2": { FF: 0.5, SL: 0.26, CH: 0.18, CU: 0.06 }
    },
    pitchMixByBatterHand: {
      R: { FF: 0.5, SI: 0.12, SL: 0.22, CH: 0.1, CU: 0.06 },
      L: { FF: 0.44, SI: 0.14, SL: 0.12, CH: 0.22, CU: 0.08 }
    },
    pitchMixByBaseState: {
      empty: { FF: 0.5, SI: 0.12, SL: 0.18, CH: 0.14, CU: 0.06 },
      "1--": { FF: 0.43, SI: 0.19, SL: 0.18, CH: 0.14, CU: 0.06 },
      "-2-": { FF: 0.42, SL: 0.24, CH: 0.22, CU: 0.12 }
    },
    pitchRunValueAllowed: { FF: 1.4, SI: -0.4, SL: -1.8, CH: -0.7, CU: -1.2 },
    whiffRateByPitch: { FF: 0.22, SI: 0.17, SL: 0.34, CH: 0.31, CU: 0.28 },
    calledStrikeRateByPitch: { FF: 0.19, SI: 0.18, SL: 0.16, CH: 0.15, CU: 0.2 },
    groundballRateByPitch: { FF: 0.35, SI: 0.54, SL: 0.42, CH: 0.46, CU: 0.48 },
    hardHitRateAllowedByPitch: { FF: 0.43, SI: 0.37, SL: 0.31, CH: 0.34, CU: 0.32 },
    outcomeByCount: { "0-0": { expectedWoba: 0.315 }, "0-2": { strikeoutRate: 0.41, expectedWoba: 0.24 }, "2-0": { walkRate: 0.16, expectedWoba: 0.38 } },
    outcomeByBatterHand: { R: { strikeoutRate: 0.25, expectedWoba: 0.32 }, L: { strikeoutRate: 0.22, expectedWoba: 0.31 } },
    outcomeByBaseState: { empty: { expectedWoba: 0.31 }, "1--": { groundballRate: 0.49 }, "-2-": { expectedWoba: 0.335 } },
    holdRunnersScore: 61,
    tempoScore: 70,
    fatigueIndex: 18
  },
  {
    mlbId: 801,
    name: "Groundball Starter",
    team: "AAA",
    throws: "R",
    role: "starter",
    reliability: 0.8,
    battersFaced: 680,
    pitchMixOverall: { SI: 0.38, FF: 0.22, SL: 0.21, CH: 0.13, CU: 0.06 },
    pitchMixByCount: { "0-0": { SI: 0.43, FF: 0.25, SL: 0.16, CH: 0.1, CU: 0.06 }, "0-2": { SI: 0.24, SL: 0.38, CH: 0.22, CU: 0.16 }, "2-1": { SI: 0.44, FF: 0.24, SL: 0.16, CH: 0.1, CU: 0.06 } },
    pitchMixByBatterHand: { L: { SI: 0.34, FF: 0.2, SL: 0.16, CH: 0.24, CU: 0.06 }, R: { SI: 0.41, FF: 0.22, SL: 0.25, CH: 0.07, CU: 0.05 } },
    pitchRunValueAllowed: { SI: -1.2, FF: 0.3, SL: -1.4, CH: -0.6, CU: -0.8 },
    whiffRateByPitch: { SI: 0.16, FF: 0.2, SL: 0.33, CH: 0.29, CU: 0.26 },
    hardHitRateAllowedByPitch: { SI: 0.33, FF: 0.4, SL: 0.3, CH: 0.34, CU: 0.32 },
    groundballRateByPitch: { SI: 0.59, FF: 0.37, SL: 0.46, CH: 0.5, CU: 0.49 },
    outcomeByCount: { "0-0": { expectedWoba: 0.305 }, "0-2": { strikeoutRate: 0.37, expectedWoba: 0.245 }, "2-1": { expectedWoba: 0.335 } },
    outcomeByBatterHand: { L: { expectedWoba: 0.32 }, R: { expectedWoba: 0.3, groundballRate: 0.52 } },
    outcomeByBaseState: { "1--": { groundballRate: 0.55 }, "12-": { groundballRate: 0.57 } },
    holdRunnersScore: 72,
    fatigueIndex: 12
  }
];

function teamRating(team: "AAA" | "BBB", starterId: number): MlbEliteTeamRating {
  const lineup = Array.from({ length: 9 }, (_, index) => ({ playerId: team === "AAA" ? 101 + index : 201 + index, playerName: team === "AAA" ? (index === 0 ? "Power Righty" : index === 1 ? "Contact Lefty" : `AAA Hitter ${index + 1}`) : `BBB Hitter ${index + 1}` }));
  return {
    team,
    context: {
      team,
      hitters: [],
      pitchers: [],
      lineup: {
        confirmed: true,
        starting_pitcher_id: String(starterId),
        starting_pitcher_name: starterId === 801 ? "Groundball Starter" : "Fastball Starter",
        batting_order_json: lineup
      }
    },
    offenseScore: team === "AAA" ? 82 : 74,
    contactScore: team === "AAA" ? 80 : 73,
    powerScore: team === "AAA" ? 86 : 72,
    disciplineScore: team === "AAA" ? 79 : 72,
    platoonScore: team === "AAA" ? 81 : 73,
    speedScore: 70,
    defenseScore: 74,
    starterScore: starterId === 801 ? 83 : 78,
    bullpenScore: team === "AAA" ? 79 : 75,
    bullpenFatiguePenalty: 1.2,
    confirmedLineup: true,
    reliability: 0.78,
    uncertainty: 0.22,
    warnings: []
  };
}

const matchup = deriveMlbMicroMatchupProjection({
  batter: batterTendencies[0],
  pitcher: pitcherTendencies[0],
  context: { count: "0-0", baseState: "empty", parkFactorRuns: 1.04, parkFactorHr: 1.1, weatherRunFactor: 1.03 }
});

assert.equal(matchup.modelVersion, "mlb-micro-tendency-model-v1");
assert.equal(matchup.batterName, "Power Righty");
assert.equal(matchup.pitcherName, "Fastball Starter");
assert.ok(Math.abs(Object.values(matchup.pitchMix).reduce((sum, value) => sum + value, 0) - 1) < 0.001);
assert.ok(matchup.pitchMix.FF > matchup.pitchMix.CH);
assert.ok(matchup.runMultiplier > 1);
assert.ok(matchup.homeRunMultiplier > 1);
assert.ok(matchup.spray.pull > matchup.spray.opposite);
assert.ok(matchup.reliability > 0.5);

const aaa = teamRating("AAA", 801);
const bbb = teamRating("BBB", 901);
const aaaAdjustment = deriveMlbMicroLineupAdjustment({
  battingTeam: aaa,
  pitchingTeam: bbb,
  batterTendencies,
  pitcherTendencies,
  parkFactorRuns: 1.04,
  parkFactorHr: 1.1,
  weatherRunFactor: 1.03
});

assert.equal(aaaAdjustment.team, "AAA");
assert.equal(aaaAdjustment.opponentPitcherName, "Fastball Starter");
assert.equal(aaaAdjustment.plateAppearanceCount, 9);
assert.ok(aaaAdjustment.firstInningRunMultiplier > 1);
assert.ok(aaaAdjustment.homeRunMultiplier > 1);
assert.ok(aaaAdjustment.pullAirMultiplier > 1);
assert.equal(aaaAdjustment.keyMatchups.length, 6);
assert.equal(aaaAdjustment.warnings.length, 0);

const gameAdjustment = deriveMlbMicroGameAdjustment({
  away: bbb,
  home: aaa,
  batterTendencies,
  pitcherTendencies,
  baseAwayRuns: 3.9,
  baseHomeRuns: 4.7,
  parkFactorRuns: 1.04,
  parkFactorHr: 1.1,
  weatherRunFactor: 1.03
});

assert.equal(gameAdjustment.modelVersion, "mlb-micro-game-adjustment-v1");
assert.equal(gameAdjustment.awayTeam, "BBB");
assert.equal(gameAdjustment.homeTeam, "AAA");
assert.ok(gameAdjustment.adjustedHomeRuns > gameAdjustment.adjustedAwayRuns);
assert.ok(gameAdjustment.adjustedTotalRuns > 8);
assert.ok(gameAdjustment.adjustedFirstFiveTotalRuns > 4);
assert.ok(gameAdjustment.dataQuality > 55);
assert.equal(gameAdjustment.warnings.length, 0);

const variables = listMlbMicroRequiredVariables();
assert.ok(variables.pitchContext.counts.includes("3-2"));
assert.ok(variables.pitchContext.baseStates.includes("123"));
assert.ok(variables.pitcherVariables.includes("pitchMixByCount"));
assert.ok(variables.hitterVariables.includes("sprayByPitchType"));

console.log("mlb-micro-tendency-model.test.ts passed");
