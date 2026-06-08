import assert from "node:assert/strict";

import { upgradeMlbEliteIntelligence } from "@/services/simulation/mlb-elite-intelligence-upgrade";
import type { MlbEliteRatingBuild } from "@/services/simulation/mlb-elite-rating-system";
import { enforceMlbTeamByTeamPlayerRatings } from "@/services/simulation/mlb-team-by-team-rating-enforcer";

const ratings: MlbEliteRatingBuild = {
  modelVersion: "mlb-elite-rating-system-v1",
  baseModelVersion: "mlb-real-player-ratings-v1",
  season: 2026,
  generatedAt: "2026-06-08T12:00:00.000Z",
  hitters: [
    {
      id: "mlb-hitter-established",
      name: "Established MLB Hitter",
      team: "AAA",
      role_tier: "CORE_STARTER",
      contact: 82,
      power: 81,
      discipline: 80,
      current_form: 78,
      overall: 81,
      metrics_json: {
        eliteReliability: 0.82,
        eliteUncertainty: 0.18,
        dataQuality: 88,
        sample: { plateAppearances: 420, atBats: 370 }
      }
    },
    {
      id: "mlb-hitter-cup",
      name: "Cup Of Coffee Bat",
      team: "AAA",
      role_tier: "BENCH",
      contact: 61,
      power: 57,
      discipline: 59,
      current_form: 56,
      overall: 59,
      metrics_json: {
        eliteReliability: 0.34,
        eliteUncertainty: 0.66,
        dataQuality: 46,
        sample: { plateAppearances: 8, atBats: 7 }
      }
    },
    {
      id: "no-mlb-sample",
      name: "No MLB Sample",
      team: "AAA",
      role_tier: "PROSPECT",
      contact: 58,
      power: 54,
      discipline: 55,
      current_form: 54,
      overall: 55,
      metrics_json: {
        eliteReliability: 0.22,
        eliteUncertainty: 0.78,
        dataQuality: 30,
        sample: { plateAppearances: 0, atBats: 0 }
      }
    }
  ],
  pitchers: [
    {
      id: "mlb-pitcher-established",
      name: "Established MLB Pitcher",
      team: "BBB",
      role_tier: "MID_ROTATION",
      xera_quality: 78,
      fip_quality: 77,
      k_bb: 79,
      hr_risk: 32,
      groundball_rate: 74,
      stamina: 76,
      arsenal_quality: 78,
      overall: 78,
      metrics_json: {
        eliteReliability: 0.76,
        eliteUncertainty: 0.24,
        dataQuality: 82,
        sample: { battersFaced: 520, inningsPitched: 122 }
      }
    }
  ],
  warnings: [],
  diagnostics: {
    hitterCount: 3,
    pitcherCount: 1,
    hitterTendencyCoverage: 0,
    pitcherTendencyCoverage: 0,
    averageHitterReliability: 0.46,
    averagePitcherReliability: 0.76,
    averageHitterUncertainty: 0.54,
    averagePitcherUncertainty: 0.24,
    marketCalibrationRows: 0,
    dataQuality: 68
  },
  sourceSummary: {
    hitterRows: 3,
    pitcherRows: 1,
    hitterSplitRows: 0,
    pitcherSplitRows: 0,
    showRatingRows: 0,
    showPriorWeight: 0,
    hitterTendencyRows: 0,
    pitcherTendencyRows: 0,
    teamContextRows: 0,
    marketCalibrationRows: 0
  }
};

const upgraded = upgradeMlbEliteIntelligence({ ratings, batterTendencies: [], pitcherTendencies: [] });
const enforced = enforceMlbTeamByTeamPlayerRatings(upgraded);

const establishedHitter = enforced.teamByTeamReport.players.find((player) => player.playerId === "mlb-hitter-established");
const cupBat = enforced.teamByTeamReport.players.find((player) => player.playerId === "mlb-hitter-cup");
const noSample = enforced.teamByTeamReport.players.find((player) => player.playerId === "no-mlb-sample");
const establishedPitcher = enforced.teamByTeamReport.players.find((player) => player.playerId === "mlb-pitcher-established");

assert.ok(establishedHitter);
assert.ok(cupBat);
assert.ok(noSample);
assert.ok(establishedPitcher);
assert.equal(establishedHitter.experienceBand, "ESTABLISHED");
assert.equal(cupBat.experienceBand, "MLB_SAMPLE");
assert.equal(noSample.experienceBand, "NO_MLB_SAMPLE");
assert.equal(establishedPitcher.experienceBand, "ESTABLISHED");
assert.notEqual(establishedHitter.enforcedTier, "THIN");
assert.notEqual(establishedHitter.enforcedTier, "MISSING");
assert.notEqual(cupBat.enforcedTier, "THIN");
assert.notEqual(cupBat.enforcedTier, "MISSING");
assert.notEqual(establishedPitcher.enforcedTier, "THIN");
assert.notEqual(establishedPitcher.enforcedTier, "MISSING");
assert.equal(enforced.teamByTeamReport.noThinWithMlbSampleCount, 0);
assert.ok(enforced.teamByTeamReport.floorAppliedCount >= 2);
assert.equal(enforced.ratings.hitters[0].metrics_json?.teamByTeamRatingModel, "mlb-team-by-team-rating-enforcer-v1");
assert.equal(enforced.ratings.hitters[0].metrics_json?.experienceFloorApplied, true);
assert.equal(enforced.ratings.hitters[1].metrics_json?.noThinMlbSampleEnforced, true);
assert.equal(enforced.teamByTeamReport.teams.some((team) => team.team === "AAA"), true);

console.log("mlb-team-by-team-rating-enforcer.test.ts passed");
