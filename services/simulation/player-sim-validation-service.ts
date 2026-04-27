import { buildPlayerSimProjection, type PlayerSimInput, type PlayerSimOutput } from "@/services/simulation/player-sim-engine";

export type PlayerSimPredictionLog = {
  id: string;
  createdAt: string;
  eventId: string;
  leagueKey: string;
  player: string;
  team: string;
  opponent: string;
  propType: string;
  side: "over" | "under";
  line: number;
  bookOdds: number;
  actualStat: number | null;
  result: "WIN" | "LOSS" | "PUSH" | "PENDING";
  projection: PlayerSimOutput;
};

export type PlayerSimAccuracyBucket = {
  label: string;
  minEdgePct: number;
  maxEdgePct: number | null;
  predictions: number;
  resolved: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  avgEdgePct: number | null;
  avgConfidence: number | null;
  roiPerUnitPct: number | null;
};

export type PlayerSimValidationDashboard = {
  generatedAt: string;
  sampleSize: number;
  resolvedCount: number;
  pendingCount: number;
  hitRate: number | null;
  attackHitRate: number | null;
  watchHitRate: number | null;
  passFadeRate: number | null;
  avgEdgePct: number | null;
  avgConfidence: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  roiPerUnitPct: number | null;
  buckets: PlayerSimAccuracyBucket[];
  recentPredictions: PlayerSimPredictionLog[];
  notes: string[];
};

type DemoPredictionSeed = {
  id: string;
  createdAt: string;
  eventId: string;
  leagueKey: string;
  player: string;
  team: string;
  opponent: string;
  propType: string;
  side: "over" | "under";
  line: number;
  bookOdds: number;
  actualStat: number | null;
  context: Pick<PlayerSimInput, "teamTotal" | "usageRate" | "minutes" | "opponentFactor">;
};

const DEMO_VALIDATION_SEEDS: DemoPredictionSeed[] = [
  { id: "simval-001", createdAt: "2026-04-20T23:12:00.000Z", eventId: "demo-nba-001", leagueKey: "NBA", player: "Primary Scorer", team: "LAL", opponent: "DEN", propType: "Points", side: "over", line: 27.5, bookOdds: -110, actualStat: 32, context: { teamTotal: 113, usageRate: 0.29, minutes: 36, opponentFactor: 1.03 } },
  { id: "simval-002", createdAt: "2026-04-20T23:18:00.000Z", eventId: "demo-nba-002", leagueKey: "NBA", player: "Lead Guard", team: "BOS", opponent: "NYK", propType: "Assists", side: "over", line: 6.5, bookOdds: 105, actualStat: 8, context: { teamTotal: 116, usageRate: 0.2, minutes: 35, opponentFactor: 1.08 } },
  { id: "simval-003", createdAt: "2026-04-21T00:04:00.000Z", eventId: "demo-mlb-001", leagueKey: "MLB", player: "Strikeout Arm", team: "CHC", opponent: "STL", propType: "Strikeouts", side: "over", line: 5.5, bookOdds: -102, actualStat: 7, context: { teamTotal: 4.4, usageRate: 1.1, minutes: 0, opponentFactor: 1.05 } },
  { id: "simval-004", createdAt: "2026-04-21T01:35:00.000Z", eventId: "demo-nhl-001", leagueKey: "NHL", player: "Shot Volume Wing", team: "CHI", opponent: "NSH", propType: "Shots", side: "over", line: 3.5, bookOdds: -115, actualStat: 2, context: { teamTotal: 3.0, usageRate: 0.31, minutes: 19, opponentFactor: 0.91 } },
  { id: "simval-005", createdAt: "2026-04-21T22:10:00.000Z", eventId: "demo-nba-003", leagueKey: "NBA", player: "Glass Cleaner", team: "MIL", opponent: "CLE", propType: "Rebounds", side: "over", line: 10.5, bookOdds: 100, actualStat: 12, context: { teamTotal: 111, usageRate: 0.18, minutes: 34, opponentFactor: 1.11 } },
  { id: "simval-006", createdAt: "2026-04-22T00:05:00.000Z", eventId: "demo-nba-004", leagueKey: "NBA", player: "Secondary Scorer", team: "DAL", opponent: "PHX", propType: "Points", side: "over", line: 21.5, bookOdds: -120, actualStat: 19, context: { teamTotal: 112, usageRate: 0.23, minutes: 34, opponentFactor: 0.97 } },
  { id: "simval-007", createdAt: "2026-04-22T22:55:00.000Z", eventId: "demo-mlb-002", leagueKey: "MLB", player: "Contact Bat", team: "LAD", opponent: "SF", propType: "Prop", side: "over", line: 1.5, bookOdds: 120, actualStat: 2, context: { teamTotal: 4.9, usageRate: 0.26, minutes: 0, opponentFactor: 1.07 } },
  { id: "simval-008", createdAt: "2026-04-23T00:50:00.000Z", eventId: "demo-nba-005", leagueKey: "NBA", player: "Spacing Wing", team: "GSW", opponent: "SAC", propType: "Threes", side: "over", line: 3.5, bookOdds: 130, actualStat: 4, context: { teamTotal: 118, usageRate: 0.28, minutes: 33, opponentFactor: 1.03 } },
  { id: "simval-009", createdAt: "2026-04-23T23:05:00.000Z", eventId: "demo-nba-006", leagueKey: "NBA", player: "Bench Guard", team: "MIA", opponent: "ORL", propType: "Points", side: "over", line: 12.5, bookOdds: -108, actualStat: 10, context: { teamTotal: 106, usageRate: 0.15, minutes: 24, opponentFactor: 0.92 } },
  { id: "simval-010", createdAt: "2026-04-24T00:40:00.000Z", eventId: "demo-mlb-003", leagueKey: "MLB", player: "Durable Starter", team: "SEA", opponent: "HOU", propType: "Outs", side: "over", line: 17.5, bookOdds: 110, actualStat: 18, context: { teamTotal: 3.9, usageRate: 1.05, minutes: 0, opponentFactor: 1.02 } },
  { id: "simval-011", createdAt: "2026-04-24T22:20:00.000Z", eventId: "demo-nba-007", leagueKey: "NBA", player: "High Usage Forward", team: "MIN", opponent: "OKC", propType: "Points", side: "over", line: 25.5, bookOdds: -105, actualStat: 30, context: { teamTotal: 114, usageRate: 0.27, minutes: 37, opponentFactor: 1.0 } },
  { id: "simval-012", createdAt: "2026-04-25T00:15:00.000Z", eventId: "demo-nhl-002", leagueKey: "NHL", player: "Goalie Workload", team: "BOS", opponent: "TOR", propType: "Saves", side: "under", line: 29.5, bookOdds: -112, actualStat: 27, context: { teamTotal: 3.2, usageRate: 0.24, minutes: 60, opponentFactor: 0.95 } },
  { id: "simval-013", createdAt: "2026-04-26T00:15:00.000Z", eventId: "demo-nba-008", leagueKey: "NBA", player: "Tonight Pending", team: "NYK", opponent: "BOS", propType: "Points", side: "over", line: 24.5, bookOdds: -110, actualStat: null, context: { teamTotal: 110, usageRate: 0.26, minutes: 35, opponentFactor: 1.01 } }
];

function decimalOdds(american: number) {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function isWin(seed: DemoPredictionSeed) {
  if (seed.actualStat == null) return "PENDING" as const;
  if (seed.actualStat === seed.line) return "PUSH" as const;
  if (seed.side === "under") return seed.actualStat < seed.line ? "WIN" as const : "LOSS" as const;
  return seed.actualStat > seed.line ? "WIN" as const : "LOSS" as const;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function sideProbability(log: PlayerSimPredictionLog) {
  return log.side === "under" ? log.projection.underPct : log.projection.overPct;
}

function roiPerUnit(logs: PlayerSimPredictionLog[]) {
  let net = 0;
  let risked = 0;
  for (const log of logs) {
    if (log.result === "PENDING" || log.result === "PUSH") continue;
    risked += 1;
    if (log.result === "WIN") net += decimalOdds(log.bookOdds) - 1;
    if (log.result === "LOSS") net -= 1;
  }
  return risked > 0 ? (net / risked) * 100 : null;
}

function buildLog(seed: DemoPredictionSeed): PlayerSimPredictionLog {
  const projection = buildPlayerSimProjection({
    player: seed.player,
    propType: seed.propType,
    line: seed.line,
    bookOdds: seed.bookOdds,
    seed: `${seed.id}:${seed.eventId}`,
    sims: 8000,
    ...seed.context
  });

  return {
    ...seed,
    result: isWin(seed),
    projection
  };
}

function buildBucket(label: string, minEdgePct: number, maxEdgePct: number | null, logs: PlayerSimPredictionLog[]): PlayerSimAccuracyBucket {
  const bucketLogs = logs.filter((log) => {
    const edge = log.projection.edgePct;
    return edge >= minEdgePct && (maxEdgePct == null || edge < maxEdgePct);
  });
  const resolved = bucketLogs.filter((log) => log.result !== "PENDING");
  const wins = resolved.filter((log) => log.result === "WIN").length;
  const losses = resolved.filter((log) => log.result === "LOSS").length;
  const pushes = resolved.filter((log) => log.result === "PUSH").length;

  return {
    label,
    minEdgePct,
    maxEdgePct,
    predictions: bucketLogs.length,
    resolved: resolved.length,
    wins,
    losses,
    pushes,
    hitRate: pct(wins, wins + losses),
    avgEdgePct: avg(bucketLogs.map((log) => log.projection.edgePct)),
    avgConfidence: avg(bucketLogs.map((log) => log.projection.confidence)),
    roiPerUnitPct: roiPerUnit(bucketLogs)
  };
}

function brierScore(logs: PlayerSimPredictionLog[]) {
  const resolved = logs.filter((log) => log.result === "WIN" || log.result === "LOSS");
  if (!resolved.length) return null;
  return avg(resolved.map((log) => {
    const forecast = sideProbability(log);
    const actual = log.result === "WIN" ? 1 : 0;
    return (forecast - actual) ** 2;
  }));
}

function calibrationError(logs: PlayerSimPredictionLog[]) {
  const resolved = logs.filter((log) => log.result === "WIN" || log.result === "LOSS");
  if (!resolved.length) return null;
  const bands = [
    [0, 0.45],
    [0.45, 0.55],
    [0.55, 0.65],
    [0.65, 1.01]
  ];
  let weightedError = 0;
  let total = 0;

  for (const [min, max] of bands) {
    const band = resolved.filter((log) => {
      const forecast = sideProbability(log);
      return forecast >= min && forecast < max;
    });
    if (!band.length) continue;
    const predicted = avg(band.map(sideProbability)) ?? 0;
    const actual = pct(band.filter((log) => log.result === "WIN").length, band.length) ?? 0;
    weightedError += Math.abs(predicted - actual) * band.length;
    total += band.length;
  }

  return total > 0 ? weightedError / total : null;
}

export async function getPlayerSimPredictionLogs(): Promise<PlayerSimPredictionLog[]> {
  return DEMO_VALIDATION_SEEDS.map(buildLog).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getPlayerSimValidationDashboard(): Promise<PlayerSimValidationDashboard> {
  const logs = await getPlayerSimPredictionLogs();
  const resolved = logs.filter((log) => log.result !== "PENDING");
  const wins = resolved.filter((log) => log.result === "WIN").length;
  const losses = resolved.filter((log) => log.result === "LOSS").length;
  const pending = logs.filter((log) => log.result === "PENDING").length;
  const attack = logs.filter((log) => log.projection.edgePct >= 5);
  const watch = logs.filter((log) => log.projection.edgePct >= 1.5 && log.projection.edgePct < 5);
  const pass = logs.filter((log) => log.projection.edgePct < 1.5);

  return {
    generatedAt: new Date().toISOString(),
    sampleSize: logs.length,
    resolvedCount: resolved.length,
    pendingCount: pending,
    hitRate: pct(wins, wins + losses),
    attackHitRate: pct(attack.filter((log) => log.result === "WIN").length, attack.filter((log) => log.result === "WIN" || log.result === "LOSS").length),
    watchHitRate: pct(watch.filter((log) => log.result === "WIN").length, watch.filter((log) => log.result === "WIN" || log.result === "LOSS").length),
    passFadeRate: pct(pass.filter((log) => log.result === "LOSS").length, pass.filter((log) => log.result === "WIN" || log.result === "LOSS").length),
    avgEdgePct: avg(logs.map((log) => log.projection.edgePct)),
    avgConfidence: avg(logs.map((log) => log.projection.confidence)),
    brierScore: brierScore(logs),
    calibrationError: calibrationError(logs),
    roiPerUnitPct: roiPerUnit(logs),
    buckets: [
      buildBucket("Attack", 5, null, logs),
      buildBucket("Watch", 1.5, 5, logs),
      buildBucket("Pass / Fade", -100, 1.5, logs)
    ],
    recentPredictions: logs.slice(0, 10),
    notes: [
      "Demo validation records keep the dashboard deployment-safe until live prop-result logging is connected.",
      "Metrics score predicted side probability against resolved outcomes, excluding pending rows.",
      "Next database step: persist each props-table Sim Edge click and settle it from player_game_stats after final results."
    ]
  };
}
