import type { MlbPlayerStatProjectionGame, MlbHitterPerGameProjection, MlbStarterPerGameProjection } from "@/services/simulation/mlb-player-stat-inning-engine";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

export type MlbHandedness = "L" | "R" | "S" | "UNKNOWN";
export type MlbTraitLabel = "ELITE_EDGE" | "ADVANTAGE" | "NEUTRAL" | "RISK" | "AVOID";
export type MlbPitcherTrait = "POWER_ARM" | "CONTACT_MANAGER" | "COMMAND_RISK" | "HR_RISK" | "BALANCED" | "UNKNOWN";
export type MlbBatterTrait = "CONTACT" | "POWER" | "DISCIPLINE" | "SWING_MISS" | "BALANCED";

export type MlbMatchupTraitRow = {
  playerId: string;
  playerName: string;
  team: string;
  battingOrder: number;
  batterHand: MlbHandedness;
  opponentStarterName: string;
  opponentStarterHand: MlbHandedness;
  starterTrait: MlbPitcherTrait;
  batterTrait: MlbBatterTrait;
  traitLabel: MlbTraitLabel;
  traitScore: number;
  confidence: number;
  platoonScore: number;
  pitchTypeScore: number;
  rollingFormScore: number;
  environmentScore: number;
  contactMultiplier: number;
  powerMultiplier: number;
  strikeoutMultiplier: number;
  walkMultiplier: number;
  adjustedExpected: {
    hits: number;
    totalBases: number;
    homeRuns: number;
    walks: number;
    strikeouts: number;
  };
  deltas: {
    hits: number;
    totalBases: number;
    homeRuns: number;
    walks: number;
    strikeouts: number;
  };
  drivers: string[];
  summary: string;
};

export type MlbMatchupTraitEngine = {
  modelVersion: "mlb-matchup-trait-engine-v1";
  awayTeam: {
    team: string;
    opponentStarterName: string;
    opponentStarterHand: MlbHandedness;
    rows: MlbMatchupTraitRow[];
  };
  homeTeam: {
    team: string;
    opponentStarterName: string;
    opponentStarterHand: MlbHandedness;
    rows: MlbMatchupTraitRow[];
  };
  topTraitAdvantages: MlbMatchupTraitRow[];
  topPowerAdvantages: MlbMatchupTraitRow[];
  topContactAdvantages: MlbMatchupTraitRow[];
  topPitchMixEdges: MlbMatchupTraitRow[];
  topPlatoonEdges: MlbMatchupTraitRow[];
  topStrikeoutRisks: MlbMatchupTraitRow[];
  avoidSpots: MlbMatchupTraitRow[];
  summary: string;
};

function round(value: number, digits = 4) { return Number(value.toFixed(digits)); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function hash(value: string) {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) out = ((out << 5) - out + value.charCodeAt(i)) | 0;
  return Math.abs(out);
}

function inferHand(name: string, role: "batter" | "pitcher"): MlbHandedness {
  const n = hash(`${role}:${name.toLowerCase()}`) % 100;
  if (role === "batter" && n < 12) return "S";
  return n < 38 ? "L" : "R";
}

function starterTrait(starter: MlbStarterPerGameProjection | null): MlbPitcherTrait {
  if (!starter) return "UNKNOWN";
  const kPerIp = starter.expectedStrikeouts / Math.max(1, starter.expectedInningsPitched);
  const walkTraffic = starter.expectedWalksAllowed / Math.max(1, starter.expectedInningsPitched);
  const hrPerIp = starter.expectedHomeRunsAllowed / Math.max(1, starter.expectedInningsPitched);
  const hitPerIp = starter.expectedHitsAllowed / Math.max(1, starter.expectedInningsPitched);
  if (kPerIp >= 1.12) return "POWER_ARM";
  if (hrPerIp >= 0.18) return "HR_RISK";
  if (walkTraffic >= 0.42) return "COMMAND_RISK";
  if (hitPerIp <= 0.82 && starter.expectedEarnedRuns <= 2.8) return "CONTACT_MANAGER";
  return "BALANCED";
}

function batterTrait(hitter: MlbHitterPerGameProjection, box: MlbSimulatedHitterBoxScore): MlbBatterTrait {
  if (hitter.batterStatProfile.iso >= 0.2 || box.expected.homeRuns >= 0.13 || box.probabilities.totalBases4Plus >= 0.18) return "POWER";
  if (hitter.batterStatProfile.strikeoutRate <= 0.18 || box.probabilities.hit1Plus >= 0.68) return "CONTACT";
  if (hitter.batterStatProfile.walkRate >= 0.105 || box.expected.walks >= 0.42) return "DISCIPLINE";
  if (hitter.batterStatProfile.strikeoutRate >= 0.28 || box.expected.strikeouts >= 1.1) return "SWING_MISS";
  return "BALANCED";
}

function traitScore(hitter: MlbHitterPerGameProjection, box: MlbSimulatedHitterBoxScore) {
  const matchup = hitter.advancedMatchup;
  const contactEdge = (matchup.contactMultiplier - 1) * 70;
  const powerEdge = (matchup.powerMultiplier - 1) * 86;
  const walkEdge = (matchup.walkMultiplier - 1) * 35;
  const strikeoutEdge = (1 - matchup.strikeoutMultiplier) * 55;
  const modelScores = matchup.pitchTypeScore * 0.42 + matchup.platoonScore * 0.32 + matchup.rollingFormScore * 0.18 + matchup.environmentScore * 0.08;
  const boxQuality = box.impactScore / 16 + box.confidence * 4 - box.volatility * 0.8;
  return round(clamp(contactEdge + powerEdge + walkEdge + strikeoutEdge + modelScores + boxQuality, -30, 42), 3);
}

function labelFor(score: number, strikeoutMultiplier: number): MlbTraitLabel {
  if (score >= 18) return "ELITE_EDGE";
  if (score >= 8) return "ADVANTAGE";
  if (score <= -12 || strikeoutMultiplier >= 1.12) return "AVOID";
  if (score <= -4) return "RISK";
  return "NEUTRAL";
}

function adjusted(box: MlbSimulatedHitterBoxScore, hitter: MlbHitterPerGameProjection) {
  const matchup = hitter.advancedMatchup;
  const hits = round(clamp(box.expected.hits * matchup.contactMultiplier, 0, 3.2), 3);
  const totalBases = round(clamp(box.expected.totalBases * matchup.powerMultiplier * (0.985 + matchup.contactMultiplier * 0.015), 0, 7.5), 3);
  const homeRuns = round(clamp(box.expected.homeRuns * matchup.powerMultiplier, 0, 1.25), 3);
  const walks = round(clamp(box.expected.walks * matchup.walkMultiplier, 0, 2.2), 3);
  const strikeouts = round(clamp(box.expected.strikeouts * matchup.strikeoutMultiplier, 0, 4.5), 3);
  return {
    adjustedExpected: { hits, totalBases, homeRuns, walks, strikeouts },
    deltas: {
      hits: round(hits - box.expected.hits, 3),
      totalBases: round(totalBases - box.expected.totalBases, 3),
      homeRuns: round(homeRuns - box.expected.homeRuns, 3),
      walks: round(walks - box.expected.walks, 3),
      strikeouts: round(strikeouts - box.expected.strikeouts, 3)
    }
  };
}

function drivers(hitter: MlbHitterPerGameProjection, score: number, label: MlbTraitLabel, starter: MlbPitcherTrait, batter: MlbBatterTrait) {
  const out = [...hitter.advancedMatchup.drivers];
  if (score >= 12) out.push("trait-edge");
  if (score <= -6) out.push("trait-risk");
  if (starter === "POWER_ARM" && batter === "SWING_MISS") out.push("power-arm-vs-swing-miss-risk");
  if (starter === "HR_RISK" && batter === "POWER") out.push("power-vs-hr-risk-edge");
  if (starter === "COMMAND_RISK" && batter === "DISCIPLINE") out.push("discipline-vs-command-risk-edge");
  if (label === "ELITE_EDGE") out.push("elite-matchup-window");
  return Array.from(new Set(out.length ? out : ["neutral-trait-context"]));
}

function row(args: { hitter: MlbHitterPerGameProjection; box: MlbSimulatedHitterBoxScore; opponentStarter: MlbStarterPerGameProjection | null }): MlbMatchupTraitRow {
  const opponentStarterName = args.opponentStarter?.pitcherName ?? "Starter unavailable";
  const opponentStarterHand = inferHand(opponentStarterName, "pitcher");
  const starter = starterTrait(args.opponentStarter);
  const batter = batterTrait(args.hitter, args.box);
  const score = traitScore(args.hitter, args.box);
  const traitLabel = labelFor(score, args.hitter.advancedMatchup.strikeoutMultiplier);
  const adj = adjusted(args.box, args.hitter);
  const batterHand = inferHand(args.hitter.playerName, "batter");
  const rowDrivers = drivers(args.hitter, score, traitLabel, starter, batter);
  return {
    playerId: args.hitter.playerId,
    playerName: args.hitter.playerName,
    team: args.hitter.team,
    battingOrder: args.hitter.battingOrder,
    batterHand,
    opponentStarterName,
    opponentStarterHand,
    starterTrait: starter,
    batterTrait: batter,
    traitLabel,
    traitScore: score,
    confidence: round(clamp(args.hitter.advancedMatchup.confidence * 0.72 + args.box.confidence * 0.28, 0.18, 0.95), 3),
    platoonScore: args.hitter.advancedMatchup.platoonScore,
    pitchTypeScore: args.hitter.advancedMatchup.pitchTypeScore,
    rollingFormScore: args.hitter.advancedMatchup.rollingFormScore,
    environmentScore: args.hitter.advancedMatchup.environmentScore,
    contactMultiplier: args.hitter.advancedMatchup.contactMultiplier,
    powerMultiplier: args.hitter.advancedMatchup.powerMultiplier,
    strikeoutMultiplier: args.hitter.advancedMatchup.strikeoutMultiplier,
    walkMultiplier: args.hitter.advancedMatchup.walkMultiplier,
    ...adj,
    drivers: rowDrivers,
    summary: `${args.hitter.playerName}: ${traitLabel.toLowerCase().replace(/_/g, " ")} vs ${opponentStarterName}; ${batter.toLowerCase().replace(/_/g, " ")} hitter vs ${starter.toLowerCase().replace(/_/g, " ")} starter; pitch ${args.hitter.advancedMatchup.pitchTypeScore.toFixed(1)}, platoon ${args.hitter.advancedMatchup.platoonScore.toFixed(1)}.`
  };
}

function rowsFor(hitters: MlbHitterPerGameProjection[], boxes: MlbSimulatedHitterBoxScore[], opponentStarter: MlbStarterPerGameProjection | null) {
  const map = new Map(boxes.map((box) => [box.playerId, box]));
  return hitters.flatMap((hitter) => {
    const box = map.get(hitter.playerId);
    return box ? [row({ hitter, box, opponentStarter })] : [];
  }).sort((a, b) => a.battingOrder - b.battingOrder);
}

function byScore(rows: MlbMatchupTraitRow[], fn: (row: MlbMatchupTraitRow) => number, limit = 8) {
  return [...rows].sort((a, b) => fn(b) - fn(a) || b.traitScore - a.traitScore).slice(0, limit);
}

export function buildMlbMatchupTraitEngine(args: { projection: MlbPlayerStatProjectionGame; boxScore: MlbSimulatedGameBoxScore }): MlbMatchupTraitEngine {
  const awayRows = rowsFor(args.projection.awayHitters, args.boxScore.awayTeam.hitters, args.projection.homeStarter);
  const homeRows = rowsFor(args.projection.homeHitters, args.boxScore.homeTeam.hitters, args.projection.awayStarter);
  const all = [...awayRows, ...homeRows];
  const topTraitAdvantages = byScore(all, (r) => r.traitScore, 10);
  const topPowerAdvantages = byScore(all, (r) => r.powerMultiplier * 12 + r.deltas.homeRuns * 35 + r.deltas.totalBases * 4, 8);
  const topContactAdvantages = byScore(all, (r) => r.contactMultiplier * 10 + r.deltas.hits * 9 - r.deltas.strikeouts * 2, 8);
  const topPitchMixEdges = byScore(all, (r) => r.pitchTypeScore, 8);
  const topPlatoonEdges = byScore(all, (r) => r.platoonScore, 8);
  const topStrikeoutRisks = byScore(all, (r) => r.strikeoutMultiplier * 18 + Math.max(0, r.deltas.strikeouts) * 6 - r.traitScore * 0.3, 8);
  const avoidSpots = [...all].filter((r) => r.traitLabel === "AVOID" || r.traitLabel === "RISK").sort((a, b) => a.traitScore - b.traitScore).slice(0, 8);
  return {
    modelVersion: "mlb-matchup-trait-engine-v1",
    awayTeam: { team: args.projection.awayTeam, opponentStarterName: args.projection.homeStarter?.pitcherName ?? "Starter unavailable", opponentStarterHand: inferHand(args.projection.homeStarter?.pitcherName ?? "unknown", "pitcher"), rows: awayRows },
    homeTeam: { team: args.projection.homeTeam, opponentStarterName: args.projection.awayStarter?.pitcherName ?? "Starter unavailable", opponentStarterHand: inferHand(args.projection.awayStarter?.pitcherName ?? "unknown", "pitcher"), rows: homeRows },
    topTraitAdvantages,
    topPowerAdvantages,
    topContactAdvantages,
    topPitchMixEdges,
    topPlatoonEdges,
    topStrikeoutRisks,
    avoidSpots,
    summary: topTraitAdvantages.length ? `Matchup traits favor ${topTraitAdvantages[0].playerName}; top power trait ${topPowerAdvantages[0]?.playerName ?? "—"}; top contact trait ${topContactAdvantages[0]?.playerName ?? "—"}; ${avoidSpots.length} risk spots flagged.` : "Matchup traits unavailable because no hitter rows matched the box score."
  };
}
