export type MlbCanonicalGameState = {
  modelVersion: "mlb-canonical-game-state-v2-player-fused";
  awayTeam: string;
  homeTeam: string;
  awayRuns: number;
  homeRuns: number;
  totalRuns: number;
  projectedScore: string;
  moneyline: { awayProbability: number; homeProbability: number; side: "AWAY" | "HOME"; selection: string; probability: number; runDiff: number };
  fullGameTotal: { projection: number };
  firstFive: { awayRuns: number; homeRuns: number; totalRuns: number; homeWinProbability: number; awayWinProbability: number; tieProbability: number; side: "AWAY" | "HOME" | "TIE" };
  nrfi: { firstInningAwayRuns: number; firstInningHomeRuns: number; firstInningTotalRuns: number; nrfiProbability: number; yrfiProbability: number; side: "NRFI" | "YRFI"; probability: number };
  innings: Array<{ inning: number; awayRuns: number; homeRuns: number; totalRuns: number; noRunProbability: number }>;
  realWorldContext: {
    usedPlayerContext: boolean;
    awayHitterCount: number;
    homeHitterCount: number;
    awayPlayerRunModel: number | null;
    homePlayerRunModel: number | null;
    awayStarterInnings: number | null;
    homeStarterInnings: number | null;
    awayStarterStrikeouts: number | null;
    homeStarterStrikeouts: number | null;
    blendWeight: number;
  };
  warnings: string[];
};

type ProjectionLike = {
  matchup?: { away?: string | null; home?: string | null } | null;
  distribution: { avgAway: number; avgHome: number; awayWinPct: number; homeWinPct: number };
  mlbIntel?: unknown;
};

type PlayerRunModel = { count: number; runs: number | null };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
function round(value: number, digits = 2) { return Number(value.toFixed(digits)); }
function poissonZero(lambda: number) { return Math.exp(-Math.max(0.01, lambda)); }
function get(source: unknown, path: string) {
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(part)) { current = current[Number(part)]; continue; }
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row))) : [];
}
function inningShape(side: "away" | "home") {
  return side === "away"
    ? [0.134, 0.106, 0.118, 0.11, 0.116, 0.103, 0.099, 0.096, 0.118]
    : [0.124, 0.112, 0.112, 0.118, 0.11, 0.102, 0.1, 0.108, 0.114];
}
function allocateInnings(totalRuns: number, side: "away" | "home") {
  const shape = inningShape(side);
  return shape.map((weight) => round(Math.max(0, totalRuns * weight), 2));
}
function stored(projection: ProjectionLike, paths: string[]) {
  for (const path of paths) {
    const value = num(get(projection.mlbIntel, path));
    if (value != null) return value;
  }
  return null;
}
function hitterRunModel(projection: ProjectionLike, side: "away" | "home"): PlayerRunModel {
  const key = side === "away" ? "awayHitters" : "homeHitters";
  const hitters = rows(get(projection.mlbIntel, `playerImpact.playerStatProjections.${key}`));
  const usable = hitters
    .map((row) => {
      const expectedRuns = num(row.expectedRuns ?? row.runs);
      const expectedRbi = num(row.expectedRbi ?? row.expectedRBI ?? row.rbi);
      const expectedTotalBases = num(row.expectedTotalBases ?? row.totalBases);
      const expectedHomeRuns = num(row.expectedHomeRuns ?? row.homeRuns);
      const expectedHits = num(row.expectedHits ?? row.hits);
      if (expectedRuns == null && expectedRbi == null && expectedTotalBases == null && expectedHits == null) return null;
      const runPiece = expectedRuns ?? 0;
      const rbiPiece = expectedRbi ?? 0;
      const basePiece = expectedTotalBases == null ? 0 : expectedTotalBases * 0.16;
      const hitPiece = expectedHits == null ? 0 : expectedHits * 0.08;
      const powerPiece = expectedHomeRuns == null ? 0 : expectedHomeRuns * 0.28;
      return runPiece * 0.48 + rbiPiece * 0.34 + basePiece + hitPiece + powerPiece;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (usable.length < 5) return { count: usable.length, runs: null };
  const lineupCoverage = clamp(usable.length / 9, 0.55, 1.05);
  const total = usable.slice(0, 9).reduce((sum, value) => sum + value, 0) / lineupCoverage;
  return { count: usable.length, runs: round(clamp(total, 1.5, 10.5), 2) };
}
function starterValue(projection: ProjectionLike, side: "away" | "home", field: "expectedInningsPitched" | "expectedStrikeouts") {
  const key = side === "away" ? "awayStarter" : "homeStarter";
  return num(get(projection.mlbIntel, `playerImpact.playerStatProjections.${key}.${field}`));
}
function blendTeamRuns(rawRuns: number, playerRuns: number | null, coverage: number, warnings: string[], label: string) {
  if (playerRuns == null) return { runs: rawRuns, weight: 0 };
  const weight = clamp(0.18 + coverage * 0.05, 0.25, 0.42);
  const blended = rawRuns * (1 - weight) + playerRuns * weight;
  const capped = clamp(blended, Math.max(0, rawRuns - 1.25), Math.min(15, rawRuns + 1.25));
  if (Math.abs(playerRuns - rawRuns) >= 1.4) warnings.push(`${label} player run model diverged from team sim by ${round(Math.abs(playerRuns - rawRuns), 2)} runs; blended with cap.`);
  return { runs: round(capped, 2), weight };
}
function adjustedWinProbability(rawHomeProbability: number, rawAwayRuns: number, rawHomeRuns: number, fusedAwayRuns: number, fusedHomeRuns: number) {
  const rawDiff = rawHomeRuns - rawAwayRuns;
  const fusedDiff = fusedHomeRuns - fusedAwayRuns;
  const shift = clamp((fusedDiff - rawDiff) * 0.035, -0.08, 0.08);
  return round(clamp(rawHomeProbability + shift, 0.03, 0.97), 4);
}

export function buildMlbCanonicalGameState(projection: ProjectionLike): MlbCanonicalGameState {
  const warnings: string[] = [];
  const awayTeam = projection.matchup?.away ?? "Away";
  const homeTeam = projection.matchup?.home ?? "Home";
  const rawAwayRuns = round(clamp(projection.distribution.avgAway, 0, 15), 2);
  const rawHomeRuns = round(clamp(projection.distribution.avgHome, 0, 15), 2);
  const awayPlayer = hitterRunModel(projection, "away");
  const homePlayer = hitterRunModel(projection, "home");
  const awayBlend = blendTeamRuns(rawAwayRuns, awayPlayer.runs, awayPlayer.count, warnings, awayTeam);
  const homeBlend = blendTeamRuns(rawHomeRuns, homePlayer.runs, homePlayer.count, warnings, homeTeam);
  const awayRuns = awayBlend.runs;
  const homeRuns = homeBlend.runs;
  const totalRuns = round(awayRuns + homeRuns, 2);
  const rawHomeProbability = round(clamp(projection.distribution.homeWinPct, 0.01, 0.99), 4);
  const homeProbability = adjustedWinProbability(rawHomeProbability, rawAwayRuns, rawHomeRuns, awayRuns, homeRuns);
  const awayProbability = round(1 - homeProbability, 4);
  const awayInnings = allocateInnings(awayRuns, "away");
  const homeInnings = allocateInnings(homeRuns, "home");
  const firstInningAwayRuns = stored(projection, ["playerImpact.inningProjection.innings.0.awayRuns", "inningProjection.innings.0.awayRuns"]) ?? awayInnings[0];
  const firstInningHomeRuns = stored(projection, ["playerImpact.inningProjection.innings.0.homeRuns", "inningProjection.innings.0.homeRuns"]) ?? homeInnings[0];
  const firstInningTotalRuns = round(firstInningAwayRuns + firstInningHomeRuns, 2);
  const nrfiProbability = round(clamp(poissonZero(firstInningTotalRuns), 0.08, 0.78), 4);
  const yrfiProbability = round(1 - nrfiProbability, 4);
  const f5AwayRuns = stored(projection, ["playerImpact.inningProjection.firstFiveAwayRuns", "inningProjection.firstFiveAwayRuns", "firstFive.projectedAwayRuns"]) ?? round(awayInnings.slice(0, 5).reduce((sum, value) => sum + value, 0), 2);
  const f5HomeRuns = stored(projection, ["playerImpact.inningProjection.firstFiveHomeRuns", "inningProjection.firstFiveHomeRuns", "firstFive.projectedHomeRuns"]) ?? round(homeInnings.slice(0, 5).reduce((sum, value) => sum + value, 0), 2);
  const f5TotalRuns = round(f5AwayRuns + f5HomeRuns, 2);
  const f5Diff = f5HomeRuns - f5AwayRuns;
  const tieProbability = round(clamp(0.18 - Math.abs(f5Diff) * 0.035, 0.06, 0.22), 4);
  const nonTie = 1 - tieProbability;
  const homeF5Win = round(clamp(nonTie * (0.5 + f5Diff * 0.09), 0.08, 0.86), 4);
  const awayF5Win = round(clamp(nonTie - homeF5Win, 0.08, 0.86), 4);
  const homeSide = homeProbability >= awayProbability;
  const nrfiSide = nrfiProbability >= yrfiProbability;
  const f5Side = Math.abs(f5Diff) < 0.08 ? "TIE" : f5Diff >= 0 ? "HOME" : "AWAY";
  const usedPlayerContext = awayPlayer.runs != null || homePlayer.runs != null;
  if (!usedPlayerContext) warnings.push("Canonical state is using team-level sim only; playerStatProjections were not rich enough for player/run fusion.");
  return {
    modelVersion: "mlb-canonical-game-state-v2-player-fused",
    awayTeam,
    homeTeam,
    awayRuns,
    homeRuns,
    totalRuns,
    projectedScore: `${round(awayRuns, 1)}-${round(homeRuns, 1)}`,
    moneyline: { awayProbability, homeProbability, side: homeSide ? "HOME" : "AWAY", selection: homeSide ? homeTeam : awayTeam, probability: homeSide ? homeProbability : awayProbability, runDiff: round(Math.abs(homeRuns - awayRuns), 3) },
    fullGameTotal: { projection: totalRuns },
    firstFive: { awayRuns: round(f5AwayRuns, 2), homeRuns: round(f5HomeRuns, 2), totalRuns: f5TotalRuns, homeWinProbability: homeF5Win, awayWinProbability: awayF5Win, tieProbability, side: f5Side },
    nrfi: { firstInningAwayRuns: round(firstInningAwayRuns, 2), firstInningHomeRuns: round(firstInningHomeRuns, 2), firstInningTotalRuns, nrfiProbability, yrfiProbability, side: nrfiSide ? "NRFI" : "YRFI", probability: nrfiSide ? nrfiProbability : yrfiProbability },
    innings: Array.from({ length: 9 }, (_, index) => {
      const away = index === 0 ? round(firstInningAwayRuns, 2) : awayInnings[index];
      const home = index === 0 ? round(firstInningHomeRuns, 2) : homeInnings[index];
      const total = round(away + home, 2);
      return { inning: index + 1, awayRuns: away, homeRuns: home, totalRuns: total, noRunProbability: round(poissonZero(total), 4) };
    }),
    realWorldContext: {
      usedPlayerContext,
      awayHitterCount: awayPlayer.count,
      homeHitterCount: homePlayer.count,
      awayPlayerRunModel: awayPlayer.runs,
      homePlayerRunModel: homePlayer.runs,
      awayStarterInnings: starterValue(projection, "away", "expectedInningsPitched"),
      homeStarterInnings: starterValue(projection, "home", "expectedInningsPitched"),
      awayStarterStrikeouts: starterValue(projection, "away", "expectedStrikeouts"),
      homeStarterStrikeouts: starterValue(projection, "home", "expectedStrikeouts"),
      blendWeight: round(Math.max(awayBlend.weight, homeBlend.weight), 3)
    },
    warnings
  };
}
