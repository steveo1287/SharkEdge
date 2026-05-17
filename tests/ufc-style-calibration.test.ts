import assert from "node:assert/strict";

import { calculateUfcStyleCalibrationReport, type UfcStyleCalibrationRow } from "@/services/ufc/style-calibration";

const rows: UfcStyleCalibrationRow[] = [
  {
    fightId: "style-1",
    actualWinner: "A",
    pickSide: "A",
    fighterAWinProbability: 0.64,
    fighterBWinProbability: 0.36,
    styleMatchupFighterAWinProbability: 0.68,
    fighterAArchetype: "Chain Wrestler",
    fighterBArchetype: "Power Counterstriker",
    fighterASecondary: ["Control Grappler"],
    fighterBSecondary: ["Wild Finisher"],
    styleWarnings: ["Fighter A top-control path is live if takedowns land."],
    pathToVictoryA: ["Fighter A: wrestling initiation can turn into control time."],
    pathToVictoryB: ["Fighter B: power threat gets stronger if opponent durability fades."],
    paceProjection: 58,
    wrestlingInitiativeEdgeA: 24,
    chaosIndex: 61,
    finishVolatility: 64,
    decisionReliability: 52
  },
  {
    fightId: "style-2",
    actualWinner: "B",
    pickSide: "A",
    fighterAWinProbability: 0.57,
    fighterBWinProbability: 0.43,
    styleMatchupFighterAWinProbability: 0.48,
    fighterAArchetype: "Pressure Boxer",
    fighterBArchetype: "Power Counterstriker",
    fighterASecondary: ["Volume Kickboxer"],
    fighterBSecondary: ["Wild Finisher"],
    styleWarnings: ["Fighter A pressure runs into Fighter B counter-striking volatility."],
    pathToVictoryA: ["Fighter A: pressure volume can bank minutes and force defensive exchanges."],
    pathToVictoryB: ["Fighter B: counter-striking lane opens when opponent pressures."],
    paceProjection: 74,
    wrestlingInitiativeEdgeA: -4,
    chaosIndex: 78,
    finishVolatility: 82,
    decisionReliability: 31
  },
  {
    fightId: "style-3",
    actualWinner: "B",
    pickSide: "B",
    fighterAWinProbability: 0.44,
    fighterBWinProbability: 0.56,
    styleMatchupFighterAWinProbability: 0.39,
    fighterAArchetype: "Low Output Technician",
    fighterBArchetype: "Volume Kickboxer",
    fighterASecondary: ["Balanced MMA"],
    fighterBSecondary: ["Pressure Boxer"],
    styleWarnings: ["Fighter A pace-crash risk is amplified by Fighter B volume."],
    pathToVictoryA: ["Fighter A: balanced path depends on narrow skill edges and round-to-round variance."],
    pathToVictoryB: ["Fighter B: pressure volume can bank minutes and force defensive exchanges."],
    paceProjection: 69,
    wrestlingInitiativeEdgeA: -16,
    chaosIndex: 55,
    finishVolatility: 47,
    decisionReliability: 68
  }
];

const report = calculateUfcStyleCalibrationReport(rows, "2026-06-01T00:00:00.000Z");

assert.equal(report.version, "ufc-style-calibration-v1");
assert.equal(report.sampleCount, 3);
assert.equal(report.pickCount, 3);
assert.equal(report.pickAccuracyPct, 66.67);
assert.equal(report.stylePickAccuracyPct, 100);
assert.ok(report.avgStyleBrier != null && report.avgBrier != null && report.avgStyleBrier < report.avgBrier);
assert.ok(report.flags.includes("thin-style-calibration-sample"));
assert.ok(!report.flags.includes("missing-style-matchup-probabilities"));

const chainWrestler = report.archetypes.find((item) => item.key === "Chain Wrestler");
assert.equal(chainWrestler?.count, 1);
assert.equal(chainWrestler?.winRatePct, 100);
assert.equal(chainWrestler?.pickAccuracyPct, 100);

const counterStriker = report.archetypes.find((item) => item.key === "Power Counterstriker");
assert.equal(counterStriker?.count, 2);
assert.equal(counterStriker?.winRatePct, 50);

const topControlWarning = report.warnings.find((item) => item.key.includes("top-control path"));
assert.equal(topControlWarning?.count, 1);
assert.equal(topControlWarning?.pickAccuracyPct, 100);

const successfulPath = report.paths.find((item) => item.key.includes("wrestling initiation"));
assert.equal(successfulPath?.successRatePct, 100);

const highPace = report.clashBuckets.pace.find((item) => item.key === "high-pace");
assert.equal(highPace?.count, 2);

const fighterAWrestlingEdge = report.clashBuckets.wrestlingInitiative.find((item) => item.key === "fighter-a-wrestling-edge");
assert.equal(fighterAWrestlingEdge?.count, 1);
assert.equal(fighterAWrestlingEdge?.pickAccuracyPct, 100);

console.log("ufc-style-calibration tests passed");
