import assert from "node:assert/strict";

import {
  applyMlbV8PlayerImpactToProjection,
  calculateMlbV8PlayerImpact,
  type MlbV8PlayerImpactContext
} from "@/services/simulation/mlb-v8-player-impact-model";

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

const context: MlbV8PlayerImpactContext = {
  gameId: "game-1",
  awayTeam: "Away",
  homeTeam: "Home",
  available: true,
  away: {
    team: "Away",
    lineup: {
      confirmed: true,
      batting_order_json: [],
      bench_json: [],
      starting_pitcher_id: "away-sp",
      starting_pitcher_name: "Away Starter",
      available_relievers_json: [],
      unavailable_relievers_json: [],
      injuries_json: [],
      source: "test",
      captured_at: new Date()
    },
    hitters: Array.from({ length: 9 }, (_, index) => ({ ...hitter(`away-h${index}`, `Away H${index}`, 68), team: "Away" })),
    pitchers: [pitcher("away-sp", "Away Starter", "Away", 64), pitcher("away-rp", "Away Relief", "Away", 58, "MIDDLE_RELIEF")]
  },
  home: {
    team: "Home",
    lineup: {
      confirmed: true,
      batting_order_json: [],
      bench_json: [],
      starting_pitcher_id: "home-sp",
      starting_pitcher_name: "Home Starter",
      available_relievers_json: [],
      unavailable_relievers_json: [],
      injuries_json: [],
      source: "test",
      captured_at: new Date()
    },
    hitters: Array.from({ length: 9 }, (_, index) => hitter(`home-h${index}`, `Home H${index}`, 84)),
    pitchers: [pitcher("home-sp", "Home Starter", "Home", 82, "TOP_ROTATION"), pitcher("home-rp", "Home Relief", "Home", 78, "SETUP")]
  },
  reason: null
};

const impact = calculateMlbV8PlayerImpact({ projection, context });
assert.equal(impact.modelVersion, "mlb-intel-v8-player-impact");
assert.equal(impact.applied, true);
assert.ok(impact.confidence > 0.7);
assert.ok(impact.homeOffenseScore > impact.awayOffenseScore);
assert.ok(impact.homeStarterScore > impact.awayStarterScore);
assert.ok(impact.homeRunsAdjusted > projection.distribution.avgHome);
assert.ok(impact.awayRunsAdjusted <= projection.distribution.avgAway + 0.05);
assert.ok(impact.adjustedHomeWinPct > projection.distribution.homeWinPct);
assert.ok(impact.reasons.some((reason) => reason.includes("player-impact applied")));

const adjusted = applyMlbV8PlayerImpactToProjection(projection, impact);
assert.equal(adjusted.distribution.avgHome, impact.homeRunsAdjusted);
assert.equal(adjusted.distribution.homeWinPct, impact.adjustedHomeWinPct);
assert.equal(adjusted.mlbIntel.playerImpact.modelVersion, "mlb-intel-v8-player-impact");

const skipped = calculateMlbV8PlayerImpact({
  projection,
  context: { gameId: "game-2", awayTeam: "Away", homeTeam: "Home", available: false, away: null, home: null, reason: "missing rows" }
});
assert.equal(skipped.applied, false);
assert.equal(skipped.adjustedHomeWinPct, projection.distribution.homeWinPct);

console.log("mlb-v8-player-impact-model.test.ts passed");
