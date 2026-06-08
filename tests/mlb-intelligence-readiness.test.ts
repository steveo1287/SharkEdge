import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { getMlbIntelligenceReadiness } from "@/services/simulation/mlb-intelligence-readiness";

const tmp = mkdtempSync(path.join(tmpdir(), "sharkedge-mlb-readiness-"));
const reportPath = path.join(tmp, "populate-feed-report-2026-06-08.json");
const batterPath = path.join(tmp, "batter-micro-tendencies.json");
const pitcherPath = path.join(tmp, "pitcher-micro-tendencies.json");

process.env.MLB_POPULATE_FEED_REPORT_PATH = reportPath;
process.env.MLB_BATTER_MICRO_TENDENCIES_PATH = batterPath;
process.env.MLB_PITCHER_MICRO_TENDENCIES_PATH = pitcherPath;
delete process.env.DATABASE_URL;

writeFileSync(batterPath, JSON.stringify([{ mlbId: "1", name: "Batter", team: "NYY", bats: "R" }]));
writeFileSync(pitcherPath, JSON.stringify([{ mlbId: "2", name: "Pitcher", team: "BOS", throws: "R", pitchMixOverall: { FF: 1 } }]));
writeFileSync(reportPath, JSON.stringify({
  ok: false,
  modelVersion: "mlb-populate-and-feed-v1",
  generatedAt: "2026-06-08T12:00:00.000Z",
  snapshotDate: "2026-06-08",
  dryRun: true,
  rosterRatings: {
    ok: true,
    persisted: false,
    teamsCovered: 30,
    teamsExpected: 30,
    playersSeen: 780,
    hittersRated: 391,
    pitchersRated: 389,
    warnings: []
  },
  microFeeds: {
    built: true,
    reason: "Statcast micro feeds refreshed and written to live feed paths.",
    diagnostics: {
      rawRows: 100,
      usableRows: 98,
      batterCount: 1,
      pitcherCount: 1,
      terminalPitchRows: 32,
      battedBallRows: 14,
      skippedRows: 2
    },
    warnings: [],
    outputs: {
      battersPath: batterPath,
      pitchersPath: pitcherPath
    }
  }
}));

const report = await getMlbIntelligenceReadiness();

assert.equal(report.snapshotDate, "2026-06-08");
assert.equal(report.rosterRatings.teamsCovered, 30);
assert.equal(report.rosterRatings.playersSeen, 780);
assert.equal(report.rosterRatings.hittersRated, 391);
assert.equal(report.rosterRatings.pitchersRated, 389);
assert.equal(report.rosterRatings.persisted, false);
assert.equal(report.rosterRatings.dryRun, true);
assert.equal(report.rosterRatings.state, "DEGRADED");
assert.equal(report.microTendencies.state, "READY");
assert.equal(report.microTendencies.batterFeedExists, true);
assert.equal(report.microTendencies.pitcherFeedExists, true);
assert.equal(report.syntheticFallback.blockedForHighConfidence, true);
assert.equal(report.gates.find((gate) => gate.key === "teams-covered")?.passed, true);
assert.equal(report.gates.find((gate) => gate.key === "database-persisted")?.passed, false);
assert.equal(report.state, "DEGRADED");

console.log("mlb-intelligence-readiness.test.ts passed");
