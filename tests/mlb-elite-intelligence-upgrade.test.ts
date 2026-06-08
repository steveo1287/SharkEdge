import assert from "node:assert/strict";

import { upgradeMlbEliteIntelligence } from "@/services/simulation/mlb-elite-intelligence-upgrade";
import type { MlbEliteRatingBuild } from "@/services/simulation/mlb-elite-rating-system";
import type {
  MlbBatterMicroTendency,
  MlbPitcherMicroTendency
} from "@/services/simulation/mlb-micro-tendency-model";

const ratings: MlbEliteRatingBuild = {
  modelVersion: "mlb-elite-rating-system-v1",
  baseModelVersion: "mlb-real-player-ratings-v1",
  season: 2026,
  generatedAt: "2026-06-08T12:00:00.000Z",
  hitters: [
    {
      id: "101",
      name: "Elite Power Bat",
      team: "AAA",
      role_tier: "CORE_STARTER",
      contact: 82,
      power: 90,
      discipline: 84,
      vs_lhp: 86,
      vs_rhp: 84,
      baserunning: 66,
      fielding: 72,
      current_form: 88,
      overall: 86,
      metrics_json: {
        eliteReliability: 0.88,
        eliteUncertainty: 0.12,
        dataQuality: 91,
        sample: { plateAppearances: 610 }
      }
    },
    {
      id: "102",
      name: "Thin Bench Bat",
      team: "AAA",
      role_tier: "BENCH",
      contact: 66,
      power: 61,
      discipline: 64,
      vs_lhp: 63,
      vs_rhp: 64,
      baserunning: 58,
      fielding: 60,
      current_form: 60,
      overall: 63,
      metrics_json: {
        eliteReliability: 0.34,
        eliteUncertainty: 0.66,
        dataQuality: 44,
        sample: { plateAppearances: 45 }
      }
    }
  ],
  pitchers: [
    {
      id: "201",
      name: "Elite Starter",
      team: "BBB",
      role_tier: "ACE",
      xera_quality: 88,
      fip_quality: 86,
      k_bb: 89,
      hr_risk: 23,
      groundball_rate: 78,
      platoon_split: 82,
      stamina: 85,
      recent_workload: 20,
      arsenal_quality: 90,
      overall: 88,
      metrics_json: {
        eliteReliability: 0.9,
        eliteUncertainty: 0.1,
        dataQuality: 93,
        sample: { battersFaced: 720 }
      }
    }
  ],
  warnings: [],
  diagnostics: {
    hitterCount: 2,
    pitcherCount: 1,
    hitterTendencyCoverage: 0,
    pitcherTendencyCoverage: 0,
    averageHitterReliability: 0.61,
    averagePitcherReliability: 0.9,
    averageHitterUncertainty: 0.39,
    averagePitcherUncertainty: 0.1,
    marketCalibrationRows: 0,
    dataQuality: 74
  },
  sourceSummary: {
    hitterRows: 2,
    pitcherRows: 1,
    hitterSplits: 0,
    pitcherSplits: 0,
    theShowRatings: 0,
    hitterTendencyRows: 0,
    pitcherTendencyRows: 0,
    teamContextRows: 0,
    marketCalibrationRows: 0
  }
};

const batterTendencies: MlbBatterMicroTendency[] = [
  {
    mlbId: "101",
    name: "Elite Power Bat",
    team: "AAA",
    bats: "R",
    archetype: "POWER",
    reliability: 0.88,
    plateAppearances: 610,
    pitchTypeRunValue: { FF: 7, SI: 3, FC: 2, SL: 3, ST: 2, CU: 2, KC: 1, CH: 2, FS: 1, SPL: 1, KN: 0, OTHER: 0 },
    pitchTypeWhiffRate: { FF: 0.19, SI: 0.18, FC: 0.2, SL: 0.26, ST: 0.25, CU: 0.23, KC: 0.22, CH: 0.21, FS: 0.22, SPL: 0.22, KN: 0.18, OTHER: 0.24 },
    pitchTypeHardHitRate: { FF: 0.56, SI: 0.52, FC: 0.49, SL: 0.47, ST: 0.46, CU: 0.42, KC: 0.41, CH: 0.45, FS: 0.43, SPL: 0.42, KN: 0.38, OTHER: 0.39 },
    outcomeByCount: {
      "0-0": { expectedWoba: 0.37, expectedSlug: 0.54, homeRunRate: 0.052 },
      "0-1": { expectedWoba: 0.33 },
      "0-2": { expectedWoba: 0.27 },
      "1-0": { expectedWoba: 0.39 },
      "1-1": { expectedWoba: 0.36 },
      "1-2": { expectedWoba: 0.29, strikeoutRate: 0.28 },
      "2-0": { expectedWoba: 0.45 },
      "2-1": { expectedWoba: 0.42 },
      "2-2": { expectedWoba: 0.34 },
      "3-0": { expectedWoba: 0.48, walkRate: 0.34 },
      "3-1": { expectedWoba: 0.46 },
      "3-2": { expectedWoba: 0.38, walkRate: 0.16 }
    },
    outcomeByBaseState: {
      empty: { expectedWoba: 0.36 },
      "1--": { expectedWoba: 0.38 },
      "-2-": { expectedWoba: 0.41 },
      "--3": { expectedWoba: 0.42 },
      "12-": { expectedWoba: 0.4 },
      "1-3": { expectedWoba: 0.43 },
      "-23": { expectedWoba: 0.44 },
      "123": { expectedWoba: 0.45 }
    },
    outcomeByPitcherHand: { L: { expectedWoba: 0.39 }, R: { expectedWoba: 0.37 } },
    sprayOverall: { pull: 0.48, center: 0.32, opposite: 0.2, groundball: 0.33, lineDrive: 0.25, flyball: 0.36, popup: 0.06 },
    runnersOnBase: {
      any: { expectedWoba: 0.38 },
      risp: { expectedWoba: 0.42 },
      runnerOnFirst: { expectedWoba: 0.38 },
      runnerOnSecond: { expectedWoba: 0.41 },
      runnerOnThird: { expectedWoba: 0.42 },
      basesLoaded: { expectedWoba: 0.45 }
    }
  }
];

const pitcherTendencies: MlbPitcherMicroTendency[] = [
  {
    mlbId: "201",
    name: "Elite Starter",
    team: "BBB",
    throws: "R",
    role: "starter",
    reliability: 0.9,
    battersFaced: 720,
    pitchMixOverall: { FF: 0.42, SI: 0.12, FC: 0.05, SL: 0.22, ST: 0.02, CU: 0.08, KC: 0.01, CH: 0.08, FS: 0, SPL: 0, KN: 0, OTHER: 0 },
    pitchMixByCount: {
      "0-0": { FF: 0.5, SI: 0.13, SL: 0.15, CH: 0.12, CU: 0.1 },
      "0-1": { FF: 0.38, SL: 0.26, CH: 0.16, CU: 0.12, SI: 0.08 },
      "0-2": { FF: 0.25, SL: 0.4, CH: 0.2, CU: 0.15 },
      "1-0": { FF: 0.5, SI: 0.16, SL: 0.14, CH: 0.1, CU: 0.1 },
      "1-1": { FF: 0.4, SL: 0.25, CH: 0.16, CU: 0.11, SI: 0.08 },
      "1-2": { FF: 0.28, SL: 0.38, CH: 0.21, CU: 0.13 },
      "2-0": { FF: 0.61, SI: 0.17, SL: 0.1, CH: 0.07, CU: 0.05 },
      "2-1": { FF: 0.52, SI: 0.14, SL: 0.18, CH: 0.1, CU: 0.06 },
      "2-2": { FF: 0.32, SL: 0.36, CH: 0.2, CU: 0.12 },
      "3-0": { FF: 0.78, SI: 0.12, CH: 0.06, SL: 0.04 },
      "3-1": { FF: 0.58, SI: 0.13, SL: 0.14, CH: 0.1, CU: 0.05 },
      "3-2": { FF: 0.48, SL: 0.28, CH: 0.17, CU: 0.07 }
    },
    pitchMixByBatterHand: { L: { FF: 0.38, SL: 0.18, CH: 0.22, CU: 0.1, SI: 0.12 }, R: { FF: 0.44, SL: 0.28, CH: 0.06, CU: 0.08, SI: 0.14 } },
    pitchMixByBaseState: {
      empty: { FF: 0.43, SL: 0.22, CH: 0.08, CU: 0.08, SI: 0.12 },
      "1--": { FF: 0.36, SI: 0.2, SL: 0.22, CH: 0.12, CU: 0.1 },
      "-2-": { FF: 0.34, SL: 0.3, CH: 0.22, CU: 0.14 },
      "--3": { FF: 0.38, SL: 0.26, CH: 0.2, CU: 0.1, SI: 0.06 },
      "12-": { FF: 0.35, SI: 0.22, SL: 0.2, CH: 0.13, CU: 0.1 },
      "1-3": { FF: 0.37, SI: 0.2, SL: 0.22, CH: 0.11, CU: 0.1 },
      "-23": { FF: 0.34, SL: 0.3, CH: 0.22, CU: 0.14 },
      "123": { FF: 0.4, SI: 0.22, SL: 0.2, CH: 0.1, CU: 0.08 }
    },
    pitchRunValueAllowed: { FF: -1.5, SI: -0.7, FC: -0.4, SL: -2.2, ST: -0.5, CU: -0.9, KC: -0.4, CH: -1.1, FS: 0, SPL: 0, KN: 0, OTHER: 0 },
    whiffRateByPitch: { FF: 0.26, SI: 0.18, FC: 0.22, SL: 0.38, ST: 0.32, CU: 0.3, KC: 0.28, CH: 0.33, FS: 0.29, SPL: 0.3, KN: 0.1, OTHER: 0.18 },
    calledStrikeRateByPitch: { FF: 0.2, SI: 0.19, FC: 0.18, SL: 0.16, ST: 0.16, CU: 0.2, KC: 0.21, CH: 0.15, FS: 0.15, SPL: 0.15, KN: 0.1, OTHER: 0.14 },
    groundballRateByPitch: { FF: 0.37, SI: 0.55, FC: 0.45, SL: 0.43, ST: 0.44, CU: 0.49, KC: 0.48, CH: 0.47, FS: 0.46, SPL: 0.46, KN: 0.35, OTHER: 0.4 },
    hardHitRateAllowedByPitch: { FF: 0.33, SI: 0.35, FC: 0.34, SL: 0.29, ST: 0.3, CU: 0.31, KC: 0.31, CH: 0.32, FS: 0.33, SPL: 0.33, KN: 0.4, OTHER: 0.39 },
    outcomeByBatterHand: { L: { expectedWoba: 0.29 }, R: { expectedWoba: 0.28 } }
  }
];

const result = upgradeMlbEliteIntelligence({ ratings, batterTendencies, pitcherTendencies });

assert.equal(result.report.modelVersion, "mlb-elite-intelligence-upgrade-v1");
assert.equal(result.report.hitterCount, 2);
assert.equal(result.report.pitcherCount, 1);
assert.ok(result.report.averageRatingTrust > 0.5);
assert.ok(result.report.averageTendencyTrust > 0.3);
assert.ok(result.report.bettablePlayers >= 1);
assert.ok(result.ratings.hitters[0].metrics_json?.eliteUpgradeModel === "mlb-elite-intelligence-upgrade-v1");
assert.ok(result.ratings.hitters[0].metrics_json?.highConfidenceEligible === true);
assert.ok(result.ratings.hitters[1].metrics_json?.highConfidenceEligible === false);
assert.ok(Number(result.ratings.hitters[0].overall) >= Number(ratings.hitters[0].overall) - 2);
assert.ok(result.report.gates.some((gate) => gate.key === "hitter-micro-coverage"));
assert.ok(result.report.playerUpgrades.some((row) => row.tier === "ELITE" || row.tier === "BETTABLE"));

console.log("mlb-elite-intelligence-upgrade.test.ts passed");
