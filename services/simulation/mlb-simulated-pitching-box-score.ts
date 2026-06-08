import type { MlbPlayerStatProjectionGame, MlbStarterPerGameProjection } from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbPitchingRiskLabel = "HIGH" | "MEDIUM" | "LOW";
export type MlbPitchingLeashLabel = "LONG" | "NORMAL" | "SHORT" | "UNKNOWN";

export type MlbOffenseTotalsForPitching = {
  team: string;
  projectedRuns: number;
  plateAppearances: number;
  hits: number;
  totalBases: number;
  homeRuns: number;
  walks: number;
  strikeouts: number;
};

export type MlbSimulatedPitchingLine = {
  pitcherId: string | null;
  pitcherName: string;
  team: string;
  role: "STARTER" | "BULLPEN";
  expected: {
    inningsPitched: number;
    outs: number;
    battersFaced: number;
    pitchCount: number;
    hitsAllowed: number;
    earnedRuns: number;
    walksAllowed: number;
    strikeouts: number;
    homeRunsAllowed: number;
    totalBasesAllowed: number;
  };
  labels: {
    leash: MlbPitchingLeashLabel;
    runRisk: MlbPitchingRiskLabel;
    strikeoutPressure: MlbPitchingRiskLabel;
    homeRunRisk: MlbPitchingRiskLabel;
    trafficRisk: MlbPitchingRiskLabel;
  };
  probabilities: {
    qualityStart: number | null;
    over17_5Outs: number | null;
    over4_5Strikeouts: number | null;
  };
  confidence: number;
  summary: string;
  reasons: string[];
};

export type MlbSimulatedTeamPitchingBoxScore = {
  team: string;
  opponentTeam: string;
  starter: MlbSimulatedPitchingLine | null;
  bullpen: MlbSimulatedPitchingLine;
  totals: {
    inningsPitched: number;
    outs: number;
    battersFaced: number;
    pitchCount: number;
    hitsAllowed: number;
    earnedRuns: number;
    walksAllowed: number;
    strikeouts: number;
    homeRunsAllowed: number;
    totalBasesAllowed: number;
  };
  exposure: {
    starterShareOfBattersFaced: number;
    bullpenShareOfBattersFaced: number;
    expectedBullpenInnings: number;
    earlyHookRisk: MlbPitchingRiskLabel;
    timesThroughOrderPenalty: MlbPitchingRiskLabel;
  };
  summary: string;
};

export type MlbPitchingMatchupSummary = {
  starterAdvantage: "AWAY" | "HOME" | "EVEN" | "UNKNOWN";
  bullpenLoadEdge: "AWAY" | "HOME" | "EVEN" | "UNKNOWN";
  strikeoutEdge: "AWAY" | "HOME" | "EVEN" | "UNKNOWN";
  runPreventionEdge: "AWAY" | "HOME" | "EVEN" | "UNKNOWN";
  summary: string;
};

export type MlbBatterPitcherReconciliation = {
  runsAligned: number;
  hitsAligned: number;
  totalBasesAligned: number;
  walksAligned: number;
  strikeoutsAligned: number;
  homeRunsAligned: number;
  overallAlignment: number;
  summary: string;
};

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function risk(value: number, high: number, medium: number): MlbPitchingRiskLabel {
  if (value >= high) return "HIGH";
  if (value >= medium) return "MEDIUM";
  return "LOW";
}

function leash(starter: MlbStarterPerGameProjection | null): MlbPitchingLeashLabel {
  if (!starter) return "UNKNOWN";
  if (starter.expectedInningsPitched >= 6.1 || starter.over17_5OutsProbability >= 0.62) return "LONG";
  if (starter.expectedInningsPitched <= 4.8 || starter.over17_5OutsProbability <= 0.42) return "SHORT";
  return "NORMAL";
}

function align(expected: number, allowed: number) {
  const base = Math.max(0.001, Math.max(Math.abs(expected), Math.abs(allowed)));
  return round(clamp(1 - Math.abs(expected - allowed) / base, 0, 1), 4);
}

function pitcherDisplayName(starter: MlbStarterPerGameProjection | null, team: string) {
  return starter?.pitcherName ?? `${team} starter unavailable`;
}

function starterPitchCount(starter: MlbStarterPerGameProjection) {
  return round(clamp(starter.expectedInningsPitched * 15.8 + starter.expectedStrikeouts * 1.25 + starter.expectedWalksAllowed * 2.2, 54, 112), 0);
}

function bullpenPitchCount(inningPitched: number, traffic: number) {
  return round(clamp(inningPitched * 16.7 + traffic * 2.8, 12, 92), 0);
}

function starterLine(args: {
  starter: MlbStarterPerGameProjection | null;
  team: string;
  opponent: MlbOffenseTotalsForPitching;
}): MlbSimulatedPitchingLine | null {
  const starter = args.starter;
  if (!starter) return null;
  const ipShare = clamp(starter.expectedInningsPitched / 9, 0.34, 0.81);
  const bf = clamp(args.opponent.plateAppearances * ipShare, starter.expectedOuts + starter.expectedHitsAllowed + starter.expectedWalksAllowed, 32);
  const starterTotalBasesAllowed = clamp(args.opponent.totalBases * ipShare * clamp(starter.expectedHomeRunsAllowed / Math.max(0.05, args.opponent.homeRuns * ipShare), 0.82, 1.22), starter.expectedHitsAllowed, args.opponent.totalBases);
  const expected = {
    inningsPitched: round(starter.expectedInningsPitched, 2),
    outs: round(starter.expectedOuts, 1),
    battersFaced: round(bf, 1),
    pitchCount: starterPitchCount(starter),
    hitsAllowed: round(clamp(starter.expectedHitsAllowed, 0, args.opponent.hits), 2),
    earnedRuns: round(clamp(starter.expectedEarnedRuns, 0, args.opponent.projectedRuns), 2),
    walksAllowed: round(clamp(starter.expectedWalksAllowed, 0, args.opponent.walks), 2),
    strikeouts: round(clamp(starter.expectedStrikeouts, 0, args.opponent.strikeouts), 2),
    homeRunsAllowed: round(clamp(starter.expectedHomeRunsAllowed, 0, args.opponent.homeRuns), 2),
    totalBasesAllowed: round(starterTotalBasesAllowed, 2)
  };
  const runRisk = risk(expected.earnedRuns / Math.max(1, expected.inningsPitched) * 9, 5.1, 3.7);
  const strikeoutPressure = risk(expected.strikeouts / Math.max(1, expected.inningsPitched) * 9, 9.2, 7.2);
  const homeRunRisk = risk(expected.homeRunsAllowed / Math.max(1, expected.inningsPitched) * 9, 1.45, 0.9);
  const trafficRisk = risk((expected.hitsAllowed + expected.walksAllowed) / Math.max(1, expected.inningsPitched), 1.55, 1.18);
  const leashLabel = leash(starter);
  const summary = `${starter.pitcherName} projects for ${expected.inningsPitched.toFixed(1)} IP, ${expected.strikeouts.toFixed(1)} K, ${expected.earnedRuns.toFixed(1)} ER, ${leashLabel.toLowerCase()} leash, ${strikeoutPressure.toLowerCase()} strikeout pressure.`;
  return {
    pitcherId: starter.pitcherId,
    pitcherName: starter.pitcherName,
    team: args.team,
    role: "STARTER",
    expected,
    labels: { leash: leashLabel, runRisk, strikeoutPressure, homeRunRisk, trafficRisk },
    probabilities: {
      qualityStart: starter.qualityStartProbability,
      over17_5Outs: starter.over17_5OutsProbability,
      over4_5Strikeouts: starter.over4_5StrikeoutsProbability
    },
    confidence: starter.confidence,
    summary,
    reasons: starter.reasons
  };
}

function bullpenLine(args: {
  team: string;
  opponent: MlbOffenseTotalsForPitching;
  starterLine: MlbSimulatedPitchingLine | null;
}): MlbSimulatedPitchingLine {
  const starter = args.starterLine;
  const ip = round(clamp(9 - (starter?.expected.inningsPitched ?? 4.6), 1.75, 5.9), 2);
  const remaining = {
    hits: Math.max(0, args.opponent.hits - (starter?.expected.hitsAllowed ?? 0)),
    runs: Math.max(0, args.opponent.projectedRuns - (starter?.expected.earnedRuns ?? 0)),
    walks: Math.max(0, args.opponent.walks - (starter?.expected.walksAllowed ?? 0)),
    strikeouts: Math.max(0, args.opponent.strikeouts - (starter?.expected.strikeouts ?? 0)),
    homeRuns: Math.max(0, args.opponent.homeRuns - (starter?.expected.homeRunsAllowed ?? 0)),
    totalBases: Math.max(0, args.opponent.totalBases - (starter?.expected.totalBasesAllowed ?? 0)),
    batters: Math.max(3, args.opponent.plateAppearances - (starter?.expected.battersFaced ?? 0))
  };
  const expected = {
    inningsPitched: ip,
    outs: round(ip * 3, 1),
    battersFaced: round(remaining.batters, 1),
    pitchCount: bullpenPitchCount(ip, remaining.hits + remaining.walks),
    hitsAllowed: round(remaining.hits, 2),
    earnedRuns: round(remaining.runs, 2),
    walksAllowed: round(remaining.walks, 2),
    strikeouts: round(remaining.strikeouts, 2),
    homeRunsAllowed: round(remaining.homeRuns, 2),
    totalBasesAllowed: round(remaining.totalBases, 2)
  };
  const runRisk = risk(expected.earnedRuns / Math.max(1, ip) * 9, 5.2, 3.9);
  const strikeoutPressure = risk(expected.strikeouts / Math.max(1, ip) * 9, 9.8, 7.4);
  const homeRunRisk = risk(expected.homeRunsAllowed / Math.max(1, ip) * 9, 1.55, 0.95);
  const trafficRisk = risk((expected.hitsAllowed + expected.walksAllowed) / Math.max(1, ip), 1.65, 1.22);
  const summary = `${args.team} bullpen projects for ${expected.inningsPitched.toFixed(1)} IP, ${expected.earnedRuns.toFixed(1)} ER, ${expected.strikeouts.toFixed(1)} K, ${trafficRisk.toLowerCase()} traffic risk.`;
  return {
    pitcherId: null,
    pitcherName: `${args.team} bullpen`,
    team: args.team,
    role: "BULLPEN",
    expected,
    labels: { leash: "UNKNOWN", runRisk, strikeoutPressure, homeRunRisk, trafficRisk },
    probabilities: { qualityStart: null, over17_5Outs: null, over4_5Strikeouts: null },
    confidence: starter ? round(clamp(starter.confidence * 0.82, 0.35, 0.82), 3) : 0.42,
    summary,
    reasons: [
      "Bullpen line is reconciled from opponent hitter totals after starter share.",
      "Higher remaining traffic/run volume indicates heavier late-inning exposure."
    ]
  };
}

function addTotals(starter: MlbSimulatedPitchingLine | null, bullpen: MlbSimulatedPitchingLine): MlbSimulatedTeamPitchingBoxScore["totals"] {
  const rows = [starter, bullpen].filter(Boolean) as MlbSimulatedPitchingLine[];
  return {
    inningsPitched: round(rows.reduce((sum, row) => sum + row.expected.inningsPitched, 0), 2),
    outs: round(rows.reduce((sum, row) => sum + row.expected.outs, 0), 1),
    battersFaced: round(rows.reduce((sum, row) => sum + row.expected.battersFaced, 0), 1),
    pitchCount: round(rows.reduce((sum, row) => sum + row.expected.pitchCount, 0), 0),
    hitsAllowed: round(rows.reduce((sum, row) => sum + row.expected.hitsAllowed, 0), 2),
    earnedRuns: round(rows.reduce((sum, row) => sum + row.expected.earnedRuns, 0), 2),
    walksAllowed: round(rows.reduce((sum, row) => sum + row.expected.walksAllowed, 0), 2),
    strikeouts: round(rows.reduce((sum, row) => sum + row.expected.strikeouts, 0), 2),
    homeRunsAllowed: round(rows.reduce((sum, row) => sum + row.expected.homeRunsAllowed, 0), 2),
    totalBasesAllowed: round(rows.reduce((sum, row) => sum + row.expected.totalBasesAllowed, 0), 2)
  };
}

function teamPitching(args: {
  team: string;
  opponent: MlbOffenseTotalsForPitching;
  starter: MlbStarterPerGameProjection | null;
}): MlbSimulatedTeamPitchingBoxScore {
  const starter = starterLine({ starter: args.starter, team: args.team, opponent: args.opponent });
  const bullpen = bullpenLine({ team: args.team, opponent: args.opponent, starterLine: starter });
  const totals = addTotals(starter, bullpen);
  const starterShare = starter ? round(clamp(starter.expected.battersFaced / Math.max(1, totals.battersFaced), 0, 1), 3) : 0;
  const bullpenShare = round(clamp(1 - starterShare, 0, 1), 3);
  const earlyHookRisk = starter ? risk(5.2 - starter.expected.inningsPitched + starter.expected.earnedRuns * 0.22, 1.2, 0.45) : "HIGH";
  const timesThroughOrderPenalty = starter ? risk(Math.max(0, starter.expected.inningsPitched - 5.1) + starter.expected.hitsAllowed * 0.08 + starter.expected.homeRunsAllowed * 0.35, 1.35, 0.72) : "HIGH";
  const summary = `${args.team} pitching is reconciled to ${args.opponent.team} hitters: ${totals.earnedRuns.toFixed(1)} R, ${totals.hitsAllowed.toFixed(1)} H, ${totals.walksAllowed.toFixed(1)} BB, ${totals.strikeouts.toFixed(1)} K allowed.`;
  return {
    team: args.team,
    opponentTeam: args.opponent.team,
    starter,
    bullpen,
    totals,
    exposure: {
      starterShareOfBattersFaced: starterShare,
      bullpenShareOfBattersFaced: bullpenShare,
      expectedBullpenInnings: bullpen.expected.inningsPitched,
      earlyHookRisk,
      timesThroughOrderPenalty
    },
    summary
  };
}

function edge(a: number | null | undefined, b: number | null | undefined, lowerIsBetter = false): "AWAY" | "HOME" | "EVEN" | "UNKNOWN" {
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) return "UNKNOWN";
  if (Math.abs(a - b) < 0.25) return "EVEN";
  if (lowerIsBetter) return a < b ? "AWAY" : "HOME";
  return a > b ? "AWAY" : "HOME";
}

export function buildMlbPitchingMatchupSummary(args: {
  awayPitching: MlbSimulatedTeamPitchingBoxScore;
  homePitching: MlbSimulatedTeamPitchingBoxScore;
}): MlbPitchingMatchupSummary {
  const awayStarter = args.awayPitching.starter;
  const homeStarter = args.homePitching.starter;
  const starterAdvantage = edge(awayStarter?.confidence, homeStarter?.confidence);
  const bullpenLoadEdge = edge(args.awayPitching.bullpen.expected.inningsPitched, args.homePitching.bullpen.expected.inningsPitched, true);
  const strikeoutEdge = edge(args.awayPitching.totals.strikeouts, args.homePitching.totals.strikeouts);
  const runPreventionEdge = edge(args.awayPitching.totals.earnedRuns, args.homePitching.totals.earnedRuns, true);
  const summary = `Pitching read: starter edge ${starterAdvantage.toLowerCase()}, bullpen load edge ${bullpenLoadEdge.toLowerCase()}, strikeout edge ${strikeoutEdge.toLowerCase()}, run prevention edge ${runPreventionEdge.toLowerCase()}.`;
  return { starterAdvantage, bullpenLoadEdge, strikeoutEdge, runPreventionEdge, summary };
}

export function buildBatterPitcherReconciliation(args: {
  awayOffense: MlbOffenseTotalsForPitching;
  homeOffense: MlbOffenseTotalsForPitching;
  awayPitching: MlbSimulatedTeamPitchingBoxScore;
  homePitching: MlbSimulatedTeamPitchingBoxScore;
}): MlbBatterPitcherReconciliation {
  const runsAligned = (align(args.awayOffense.projectedRuns, args.homePitching.totals.earnedRuns) + align(args.homeOffense.projectedRuns, args.awayPitching.totals.earnedRuns)) / 2;
  const hitsAligned = (align(args.awayOffense.hits, args.homePitching.totals.hitsAllowed) + align(args.homeOffense.hits, args.awayPitching.totals.hitsAllowed)) / 2;
  const totalBasesAligned = (align(args.awayOffense.totalBases, args.homePitching.totals.totalBasesAllowed) + align(args.homeOffense.totalBases, args.awayPitching.totals.totalBasesAllowed)) / 2;
  const walksAligned = (align(args.awayOffense.walks, args.homePitching.totals.walksAllowed) + align(args.homeOffense.walks, args.awayPitching.totals.walksAllowed)) / 2;
  const strikeoutsAligned = (align(args.awayOffense.strikeouts, args.homePitching.totals.strikeouts) + align(args.homeOffense.strikeouts, args.awayPitching.totals.strikeouts)) / 2;
  const homeRunsAligned = (align(args.awayOffense.homeRuns, args.homePitching.totals.homeRunsAllowed) + align(args.homeOffense.homeRuns, args.awayPitching.totals.homeRunsAllowed)) / 2;
  const overallAlignment = round((runsAligned + hitsAligned + totalBasesAligned + walksAligned + strikeoutsAligned + homeRunsAligned) / 6, 4);
  const summary = `Batter/pitcher reconciliation ${Math.round(overallAlignment * 100)}%: runs ${Math.round(runsAligned * 100)}%, hits ${Math.round(hitsAligned * 100)}%, TB ${Math.round(totalBasesAligned * 100)}%, BB ${Math.round(walksAligned * 100)}%, K ${Math.round(strikeoutsAligned * 100)}%, HR ${Math.round(homeRunsAligned * 100)}%.`;
  return {
    runsAligned: round(runsAligned, 4),
    hitsAligned: round(hitsAligned, 4),
    totalBasesAligned: round(totalBasesAligned, 4),
    walksAligned: round(walksAligned, 4),
    strikeoutsAligned: round(strikeoutsAligned, 4),
    homeRunsAligned: round(homeRunsAligned, 4),
    overallAlignment,
    summary
  };
}

export function buildMlbSimulatedPitchingBoxScores(args: {
  projection: MlbPlayerStatProjectionGame;
  awayOffense: MlbOffenseTotalsForPitching;
  homeOffense: MlbOffenseTotalsForPitching;
}) {
  const awayPitching = teamPitching({ team: args.projection.awayTeam, opponent: args.homeOffense, starter: args.projection.awayStarter });
  const homePitching = teamPitching({ team: args.projection.homeTeam, opponent: args.awayOffense, starter: args.projection.homeStarter });
  const pitchingMatchup = buildMlbPitchingMatchupSummary({ awayPitching, homePitching });
  const reconciliation = buildBatterPitcherReconciliation({ awayOffense: args.awayOffense, homeOffense: args.homeOffense, awayPitching, homePitching });
  return { awayPitching, homePitching, pitchingMatchup, reconciliation };
}
