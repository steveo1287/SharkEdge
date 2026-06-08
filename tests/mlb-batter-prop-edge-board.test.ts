import assert from "node:assert/strict";

import { buildMlbBatterPropEdgeBoard, type MlbBatterBookPropQuoteWithPlayer } from "@/services/simulation/mlb-batter-prop-edge-board";
import {
  projectMlbPlayerStatsForGame,
  type MlbProjectionRating,
  type MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";

function hitter(id: string, name: string, team: string, overall: number): MlbProjectionRating {
  const xwoba = 0.325 + (overall - 70) * 0.003;
  return {
    id,
    name,
    team,
    role_tier: "STARTER",
    contact: overall,
    power: overall,
    discipline: overall,
    vs_lhp: overall - 1,
    vs_rhp: overall + 2,
    baserunning: overall,
    fielding: 70,
    current_form: overall,
    overall,
    metrics_json: {
      plateAppearances: 540,
      xba: 0.255 + (overall - 70) * 0.002,
      xslg: 0.42 + (overall - 70) * 0.006,
      xwoba,
      iso: 0.165 + (overall - 70) * 0.0035,
      hitRate: 0.23 + (overall - 70) * 0.0022,
      walkRate: 0.085,
      strikeoutRate: 0.22 - (overall - 70) * 0.001,
      hrRate: 0.028 + (overall - 70) * 0.0011,
      barrelRate: 0.08 + (overall - 70) * 0.001,
      hardHitRate: 0.4 + (overall - 70) * 0.002,
      totalBasesPerHit: 1.55 + (overall - 70) * 0.009,
      rolling30Pa: 104,
      rolling30Xwoba: xwoba + 0.02,
      rolling14Xwoba: xwoba + 0.028,
      rolling7Xwoba: xwoba + 0.036,
      pitchTypeXwoba: { fourSeam: xwoba + 0.055, slider: xwoba + 0.02 },
      parkRunFactor: 1.04,
      parkHrFactor: 1.1,
      weatherRunFactor: 1.02,
      weatherHrFactor: 1.08
    }
  };
}

function pitcher(id: string, name: string, team: string, overall: number): MlbProjectionRating {
  return {
    id,
    name,
    team,
    role_tier: "TOP_ROTATION",
    xera_quality: overall,
    fip_quality: overall,
    k_bb: overall,
    hr_risk: 100 - overall,
    groundball_rate: overall,
    platoon_split: overall,
    stamina: overall,
    recent_workload: 25,
    arsenal_quality: overall,
    overall,
    metrics_json: {
      throws: "R",
      pitchMix: { fourSeam: 0.46, slider: 0.24, changeup: 0.12 },
      inningsPerStart: 5.8,
      strikeoutsPer9: 8.8,
      walksPer9: 2.6,
      hitsPer9: 7.7,
      homeRunsPer9: 1.0
    }
  };
}

function team(teamName: string, hitterBase: number, starterBase: number): MlbProjectionTeamContext {
  const hitters = Array.from({ length: 9 }, (_, index) => hitter(`${teamName}-h${index + 1}`, `${teamName} H${index + 1}`, teamName, hitterBase - index));
  const starter = pitcher(`${teamName}-sp`, `${teamName} Starter`, teamName, starterBase);
  return {
    team: teamName,
    lineup: {
      confirmed: true,
      starting_pitcher_id: starter.id,
      starting_pitcher_name: starter.name,
      batting_order_json: hitters.map((row) => ({ playerId: row.id, playerName: row.name }))
    },
    hitters,
    pitchers: [starter]
  };
}

const projection = projectMlbPlayerStatsForGame({
  away: team("AWY", 82, 78),
  home: team("HME", 89, 83),
  awayRuns: 4.2,
  homeRuns: 5.2,
  awayOffenseScore: 79,
  homeOffenseScore: 86,
  awayWinProbability: 0.43,
  homeWinProbability: 0.57
});

const topHome = projection.homeHitters[0];
const secondHome = projection.homeHitters[1];
const quotes: MlbBatterBookPropQuoteWithPlayer[] = [
  { playerId: topHome.playerId, playerName: topHome.playerName, team: topHome.team, book: "DraftKings", market: "HITS", line: 0.5, side: "OVER", americanOdds: -145 },
  { playerId: topHome.playerId, playerName: topHome.playerName, team: topHome.team, book: "FanDuel", market: "TOTAL_BASES", line: 1.5, side: "OVER", americanOdds: 145 },
  { playerId: secondHome.playerId, playerName: secondHome.playerName, team: secondHome.team, book: "DraftKings", market: "HOME_RUN", line: 0.5, side: "OVER", americanOdds: 950 },
  { playerName: "Missing Batter", team: "AWY", book: "FanDuel", market: "HITS", line: 0.5, side: "OVER", americanOdds: 120 }
];

const board = buildMlbBatterPropEdgeBoard({
  projection,
  quotes,
  config: {
    minProbabilityEdge: 0.02,
    minExpectedValue: 0.02,
    minConfidence: 0.38,
    maxCandidates: 8
  }
});

assert.equal(board.modelVersion, "mlb-batter-prop-edge-board-v1");
assert.equal(board.awayTeam, "AWY");
assert.equal(board.homeTeam, "HME");
assert.equal(board.quoteCount, quotes.length);
assert.ok(board.evaluatedPlayers >= 2);
assert.ok(board.players.some((player) => player.playerId === topHome.playerId && player.quoteCount === 2));
assert.ok(board.candidates.length >= 3);
assert.ok(board.candidates.every((candidate) => candidate.playerId && candidate.playerName && candidate.team));
assert.ok(board.candidates.every((candidate) => Number.isFinite(candidate.expectedValuePerUnit)));
assert.ok(board.passes.length >= 1);
assert.ok(board.passes.every((candidate) => candidate.grade !== "PASS"));
assert.ok(board.passes.every((candidate) => candidate.expectedPlateAppearances > 0));
assert.ok(board.warnings.some((warning) => warning.includes("No projected hitter matched")));

const emptyBoard = buildMlbBatterPropEdgeBoard({ projection, quotes: [] });
assert.equal(emptyBoard.evaluatedPlayers, 0);
assert.ok(emptyBoard.warnings.some((warning) => warning.includes("No book quotes supplied")));

console.log("mlb-batter-prop-edge-board.test.ts passed");
