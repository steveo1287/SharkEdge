import assert from "node:assert/strict";

import {
  buildMlbPlayerMatchupDiagnostics,
  selectMlbProbableStarter
} from "@/services/simulation/mlb-player-matchup-diagnostics";
import type {
  MlbProjectionRating,
  MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";

const hitter = (id: string, name: string, team: string, skill: number, powerBoost = 0): MlbProjectionRating => ({
  id,
  name,
  team,
  role_tier: "STARTER",
  contact: skill,
  power: skill + powerBoost,
  discipline: skill - 1,
  vs_lhp: skill - 2,
  vs_rhp: skill + 2,
  baserunning: 68,
  fielding: 70,
  current_form: skill + 1,
  overall: skill,
  metrics_json: {
    hitRate: 0.225 + (skill - 70) * 0.002,
    walkRate: 0.083 + (skill - 70) * 0.0008,
    homeRunRate: 0.03 + powerBoost * 0.001
  }
});

const pitcher = (id: string, name: string, team: string, skill: number, role = "MID_ROTATION", throws: "L" | "R" = "R"): MlbProjectionRating => ({
  id,
  name,
  team,
  role_tier: role,
  xera_quality: skill,
  fip_quality: skill,
  k_bb: skill,
  hr_risk: skill >= 78 ? 22 : 44,
  groundball_rate: skill >= 78 ? 76 : 58,
  platoon_split: skill >= 78 ? 80 : 64,
  stamina: skill >= 78 ? 82 : 63,
  recent_workload: skill >= 78 ? 18 : 34,
  arsenal_quality: skill,
  overall: skill,
  metrics_json: { throws }
});

const lineupEntries = (rows: MlbProjectionRating[]) => rows.map((row) => ({ playerId: row.id, playerName: row.name }));

const awayHitters = Array.from({ length: 9 }, (_, index) => hitter(`away-h${index}`, `Away H${index}`, "AWY", 67 + (index % 2), index === 3 ? 8 : 0));
const homeHitters = Array.from({ length: 9 }, (_, index) => hitter(`home-h${index}`, `Home H${index}`, "HME", 84 + (index % 3), index <= 3 ? 11 : 2));

const away: MlbProjectionTeamContext = {
  team: "AWY",
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
    captured_at: "2026-06-07T12:00:00.000Z"
  },
  hitters: awayHitters,
  pitchers: [pitcher("away-sp", "Away Starter", "AWY", 62, "BACK_END"), pitcher("away-rp", "Away Relief", "AWY", 58, "MIDDLE_RELIEF")]
};

const home: MlbProjectionTeamContext = {
  team: "HME",
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
    captured_at: "2026-06-07T12:00:00.000Z"
  },
  hitters: homeHitters,
  pitchers: [pitcher("home-sp", "Home Starter", "HME", 84, "TOP_ROTATION"), pitcher("home-rp", "Home Relief", "HME", 78, "SETUP")]
};

const awayStarter = selectMlbProbableStarter(away);
const homeStarter = selectMlbProbableStarter(home);
assert.equal(awayStarter?.id, "away-sp");
assert.equal(homeStarter?.id, "home-sp");

const report = buildMlbPlayerMatchupDiagnostics({ away, home, awayRuns: 3.9, homeRuns: 4.8 });
assert.equal(report.modelVersion, "mlb-player-matchup-diagnostics-v1");
assert.equal(report.awayTeam, "AWY");
assert.equal(report.homeTeam, "HME");
assert.equal(report.matchupEdge.lean, "HOME");
assert.ok(report.home.teamEdgeScore > report.away.teamEdgeScore);
assert.ok(report.home.runDeltaSignal > report.away.runDeltaSignal);
assert.ok(report.home.starter.starterSkill > report.away.starter.starterSkill);
assert.ok(report.home.starter.volatilityRisk < report.away.starter.volatilityRisk);
assert.equal(report.home.topAdvantages.length, 5);
assert.ok(report.home.topAdvantages[0].edgeScore > 10);
assert.ok(["POWER", "CONTACT", "PLATOON", "LINEUP_SLOT"].includes(report.home.topAdvantages[0].primaryDriver));
assert.ok(report.home.topRisks[0].edgeScore <= report.home.topAdvantages[0].edgeScore);
assert.equal(report.warnings.length, 0);
assert.ok(report.reasons.some((reason) => reason.includes("Top player advantages")));

const fallbackReport = buildMlbPlayerMatchupDiagnostics({
  away: { ...away, lineup: null, hitters: awayHitters.slice(0, 4) },
  home,
  awayRuns: 3.7,
  homeRuns: 4.7
});
assert.ok(fallbackReport.warnings.some((warning) => warning.includes("AWY lineup is not confirmed")));
assert.ok(fallbackReport.warnings.some((warning) => warning.includes("only 4 hitter ratings")));
assert.ok(fallbackReport.away.confidence < report.away.confidence);

console.log("mlb-player-matchup-diagnostics.test.ts passed");
