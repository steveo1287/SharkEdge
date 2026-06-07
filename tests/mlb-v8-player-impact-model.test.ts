import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resetMlbV8MicroTendencyFeedCache } from "@/services/simulation/mlb-v8-micro-tendency-integration";
import {
  applyMlbV8PlayerImpactToProjection,
  calculateMlbV8PlayerImpact,
  type MlbV8PlayerImpactContext
} from "@/services/simulation/mlb-v8-player-impact-model";
import type {
  MlbBatterMicroTendency,
  MlbPitcherMicroTendency
} from "@/services/simulation/mlb-micro-tendency-model";

const tmp = mkdtempSync(path.join(tmpdir(), "sharkedge-mlb-micro-"));
const batterPath = path.join(tmp, "batter-micro-tendencies.json");
const pitcherPath = path.join(tmp, "pitcher-micro-tendencies.json");
process.env.MLB_BATTER_MICRO_TENDENCIES_PATH = batterPath;
process.env.MLB_PITCHER_MICRO_TENDENCIES_PATH = pitcherPath;
resetMlbV8MicroTendencyFeedCache();

const projection = {
  matchup: { away: "Away", home: "Home" },
  distribution: {
    avgAway: 4.2,
    avgHome: 4.4,
    homeWinPct: 0.52,
    awayWinPct: 0.48
  },
  mlbIntel: {
    market: { homeNoVigProbability: 0.51 },
    governor: { confidence: 0.62, tier: "watch", noBet: false, reasons: [] }
  }
};

const hitter = (id: string, name: string, overall = 82) => ({
  id,
  name,
  team: "Home",
  role_tier: "STARTER",
  contact: overall,
  power: overall + 3,
  discipline: overall - 1,
  vs_lhp: overall,
  vs_rhp: overall + 2,
  baserunning: 68,
  fielding: 70,
  current_form: overall + 1,
  xera_quality: null,
  fip_quality: null,
  k_bb: null,
  hr_risk: null,
  groundball_rate: null,
  platoon_split: null,
  stamina: null,
  recent_workload: null,
  arsenal_quality: null,
  overall,
  metrics_json: null
});

const pitcher = (id: string, name: string, team: string, overall = 76, role = "MID_ROTATION") => ({
  id,
  name,
  team,
  role_tier: role,
  contact: null,
  power: null,
  discipline: null,
  vs_lhp: null,
  vs_rhp: null,
  baserunning: null,
  fielding: null,
  current_form: null,
  xera_quality: overall,
  fip_quality: overall,
  k_bb: overall,
  hr_risk: 35,
  groundball_rate: 68,
  platoon_split: 72,
  stamina: role === "MID_ROTATION" ? 76 : 45,
  recent_workload: 22,
  arsenal_quality: overall,
  overall,
  metrics_json: { throws: "R" }
});

const awayHitters = Array.from({ length: 9 }, (_, index) => ({ ...hitter(`away-h${index}`, `Away H${index}`, 68), team: "Away" }));
const homeHitters = Array.from({ length: 9 }, (_, index) => hitter(`home-h${index}`, `Home H${index}`, 84));
const lineupEntries = (rows: Array<{ id: string; name: string }>) => rows.map((row) => ({ playerId: row.id, playerName: row.name }));

const batterMicro = (row: { id: string; name: string; team: string }, power = false): MlbBatterMicroTendency => ({
  mlbId: row.id,
  name: row.name,
  team: row.team,
  bats: power ? "R" : "L",
  archetype: power ? "POWER" : "BALANCED",
  reliability: 0.84,
  plateAppearances: 550,
  pitchTypeRunValue: { FF: power ? 6 : 1.5, SI: 0.8, SL: power ? 2.5 : 0.2, CH: 0.5 },
  pitchTypeWhiffRate: { FF: power ? 0.24 : 0.18, SL: power ? 0.3 : 0.22, CH: 0.2 },
  pitchTypeHardHitRate: { FF: power ? 0.52 : 0.38, SL: power ? 0.45 : 0.34, CH: 0.37 },
  outcomeByCount: {
    "0-0": { expectedWoba: power ? 0.37 : 0.32, expectedSlug: power ? 0.53 : 0.41, homeRunRate: power ? 0.05 : 0.024 },
    "1-1": { expectedWoba: power ? 0.36 : 0.31 },
    "2-1": { expectedWoba: power ? 0.42 : 0.34 },
    "1-2": { strikeoutRate: power ? 0.29 : 0.21, expectedWoba: power ? 0.29 : 0.28 },
    "2-2": { expectedWoba: power ? 0.33 : 0.3 },
    "3-2": { walkRate: power ? 0.13 : 0.1, expectedWoba: power ? 0.37 : 0.33 }
  },
  outcomeByBaseState: {
    empty: { expectedWoba: power ? 0.36 : 0.31 },
    "1--": { expectedWoba: power ? 0.38 : 0.33 },
    "-2-": { expectedWoba: power ? 0.4 : 0.34 },
    "12-": { expectedWoba: power ? 0.39 : 0.33 },
    "1-3": { expectedWoba: power ? 0.41 : 0.35 }
  },
  outcomeByPitcherHand: {
    R: { expectedWoba: power ? 0.37 : 0.32, expectedSlug: power ? 0.53 : 0.41 },
    L: { expectedWoba: power ? 0.35 : 0.31 }
  },
  sprayOverall: { pull: power ? 0.48 : 0.38, center: power ? 0.31 : 0.36, opposite: power ? 0.21 : 0.26, groundball: power ? 0.34 : 0.44, lineDrive: 0.25, flyball: power ? 0.35 : 0.26, popup: 0.06 },
  sprayByPitchType: {
    FF: { pull: power ? 0.52 : 0.39, flyball: power ? 0.39 : 0.27, lineDrive: 0.25 },
    SL: { pull: power ? 0.45 : 0.36, groundball: 0.39 }
  },
  runnersOnBase: {
    any: { expectedWoba: power ? 0.38 : 0.33 },
    risp: { expectedWoba: power ? 0.41 : 0.35, expectedSlug: power ? 0.58 : 0.43 }
  },
  clutchIndex: power ? 1.08 : 1.01
});

const pitcherMicro = (id: string, name: string, team: string, tougher = false): MlbPitcherMicroTendency => ({
  mlbId: id,
  name,
  team,
  throws: "R",
  role: "starter",
  reliability: 0.86,
  battersFaced: 690,
  pitchMixOverall: { FF: 0.46, SI: 0.12, SL: 0.22, CH: 0.14, CU: 0.06 },
  pitchMixByCount: {
    "0-0": { FF: 0.54, SI: 0.14, SL: 0.16, CH: 0.1, CU: 0.06 },
    "1-1": { FF: 0.44, SI: 0.12, SL: 0.24, CH: 0.14, CU: 0.06 },
    "2-1": { FF: 0.55, SI: 0.14, SL: 0.18, CH: 0.08, CU: 0.05 },
    "1-2": { FF: 0.32, SL: 0.38, CH: 0.22, CU: 0.08 },
    "2-2": { FF: 0.34, SL: 0.36, CH: 0.22, CU: 0.08 },
    "3-2": { FF: 0.48, SL: 0.28, CH: 0.18, CU: 0.06 }
  },
  pitchMixByBatterHand: {
    L: { FF: 0.42, SI: 0.12, SL: 0.18, CH: 0.22, CU: 0.06 },
    R: { FF: 0.48, SI: 0.12, SL: 0.26, CH: 0.08, CU: 0.06 }
  },
  pitchMixByBaseState: {
    empty: { FF: 0.47, SI: 0.12, SL: 0.22, CH: 0.13, CU: 0.06 },
    "1--": { FF: 0.42, SI: 0.19, SL: 0.22, CH: 0.11, CU: 0.06 },
    "-2-": { FF: 0.42, SL: 0.27, CH: 0.23, CU: 0.08 }
  },
  pitchRunValueAllowed: { FF: tougher ? -1.2 : 1.4, SI: tougher ? -0.7 : 0.2, SL: tougher ? -1.8 : -0.3, CH: tougher ? -0.9 : 0.1, CU: -0.4 },
  whiffRateByPitch: { FF: tougher ? 0.26 : 0.2, SI: 0.17, SL: tougher ? 0.36 : 0.28, CH: tougher ? 0.32 : 0.24, CU: 0.26 },
  calledStrikeRateByPitch: { FF: 0.19, SI: 0.18, SL: 0.16, CH: 0.15, CU: 0.2 },
  groundballRateByPitch: { FF: 0.36, SI: 0.53, SL: 0.42, CH: 0.45, CU: 0.48 },
  hardHitRateAllowedByPitch: { FF: tougher ? 0.34 : 0.43, SI: 0.37, SL: tougher ? 0.3 : 0.38, CH: tougher ? 0.32 : 0.39, CU: 0.33 },
  outcomeByCount: {
    "0-0": { expectedWoba: tougher ? 0.3 : 0.33 },
    "1-1": { expectedWoba: tougher ? 0.29 : 0.32 },
    "2-1": { expectedWoba: tougher ? 0.32 : 0.36 },
    "1-2": { strikeoutRate: tougher ? 0.4 : 0.3, expectedWoba: tougher ? 0.24 : 0.29 },
    "2-2": { expectedWoba: tougher ? 0.27 : 0.31 },
    "3-2": { walkRate: tougher ? 0.11 : 0.14, expectedWoba: tougher ? 0.31 : 0.35 }
  },
  outcomeByBaseState: {
    empty: { expectedWoba: tougher ? 0.3 : 0.33 },
    "1--": { expectedWoba: tougher ? 0.31 : 0.35, groundballRate: 0.5 },
    "-2-": { expectedWoba: tougher ? 0.32 : 0.37 },
    "12-": { expectedWoba: tougher ? 0.32 : 0.36 },
    "1-3": { expectedWoba: tougher ? 0.33 : 0.38 }
  },
  outcomeByBatterHand: {
    L: { expectedWoba: tougher ? 0.3 : 0.33 },
    R: { expectedWoba: tougher ? 0.29 : 0.34 }
  }
});

writeFileSync(batterPath, JSON.stringify([
  ...awayHitters.map((row, index) => batterMicro(row, index < 1)),
  ...homeHitters.map((row, index) => batterMicro(row, index < 4))
], null, 2));
writeFileSync(pitcherPath, JSON.stringify([
  pitcherMicro("away-sp", "Away Starter", "Away", false),
  pitcherMicro("home-sp", "Home Starter", "Home", true)
], null, 2));

const context: MlbV8PlayerImpactContext = {
  gameId: "game-1",
  awayTeam: "Away",
  homeTeam: "Home",
  available: true,
  away: {
    team: "Away",
    lineup: {
      confirmed: true,
      batting_order_json: lineupEntries(awayHitters),
      bench_json: [],
      starting_pitcher_id: "away-sp",
      starting_pitcher_name: "Away Starter",
      available_relievers_json: [],
      unavailable_relievers_json: [],
      injuries_json: [],
      source: "test",
      captured_at: new Date()
    },
    hitters: awayHitters,
    pitchers: [pitcher("away-sp", "Away Starter", "Away", 64), pitcher("away-rp", "Away Relief", "Away", 58, "MIDDLE_RELIEF")]
  },
  home: {
    team: "Home",
    lineup: {
      confirmed: true,
      batting_order_json: lineupEntries(homeHitters),
      bench_json: [],
      starting_pitcher_id: "home-sp",
      starting_pitcher_name: "Home Starter",
      available_relievers_json: [],
      unavailable_relievers_json: [],
      injuries_json: [],
      source: "test",
      captured_at: new Date()
    },
    hitters: homeHitters,
    pitchers: [pitcher("home-sp", "Home Starter", "Home", 82, "TOP_ROTATION"), pitcher("home-rp", "Home Relief", "Home", 78, "SETUP")]
  },
  reason: null
};

const impact = calculateMlbV8PlayerImpact({ projection, context });
assert.equal(impact.modelVersion, "mlb-intel-v8-player-impact");
assert.equal(impact.applied, true);
assert.ok(impact.microTendencyAdjustment);
assert.equal(impact.microTendencyAdjustment.applied, true);
assert.ok(impact.microTendencyAdjustment.dataQuality > 55);
assert.ok(impact.confidence > 0.7);
assert.ok(impact.homeOffenseScore > impact.awayOffenseScore);
assert.ok(impact.homeStarterScore > impact.awayStarterScore);
assert.ok(impact.homeRunsAdjusted > projection.distribution.avgHome);
assert.ok(impact.awayRunsAdjusted <= projection.distribution.avgAway + 0.25);
assert.ok(impact.adjustedHomeWinPct > projection.distribution.homeWinPct);
assert.ok(impact.reasons.some((reason) => reason.includes("player-impact applied")));
assert.ok(impact.reasons.some((reason) => reason.includes("Micro tendencies applied")));

const adjusted = applyMlbV8PlayerImpactToProjection(projection, impact);
assert.equal(adjusted.distribution.avgHome, impact.homeRunsAdjusted);
assert.equal(adjusted.distribution.homeWinPct, impact.adjustedHomeWinPct);
assert.equal(adjusted.mlbIntel?.playerImpact?.modelVersion, "mlb-intel-v8-player-impact");
assert.equal(adjusted.mlbIntel?.playerImpact?.microTendencyAdjustment?.applied, true);

const skipped = calculateMlbV8PlayerImpact({
  projection,
  context: { gameId: "game-2", awayTeam: "Away", homeTeam: "Home", available: false, away: null, home: null, reason: "missing rows" }
});
assert.equal(skipped.applied, false);
assert.equal(skipped.microTendencyAdjustment, null);
assert.equal(skipped.adjustedHomeWinPct, projection.distribution.homeWinPct);

console.log("mlb-v8-player-impact-model.test.ts passed");
