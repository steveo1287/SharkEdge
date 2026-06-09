import { getMlbMatchupPlayerEdges, type MlbMatchupTeamProfile } from "@/services/players/mlb-matchup-player-edges";

export type MlbPlayerProfileSimTeam = {
  team: string;
  meanRuns: number;
  p10Runs: number;
  p50Runs: number;
  p90Runs: number;
  lineupScore: number | null;
  starterScore: number | null;
  bullpenScore: number | null;
  profileRunImpact: number | null;
  volatility: number;
  dataConfidence: number;
  drivers: string[];
  risks: string[];
};

export type MlbPlayerProfileSimFeed = {
  modelVersion: "mlb-player-profile-sim-feed-v1";
  applied: boolean;
  awayTeam: string;
  homeTeam: string;
  away: MlbPlayerProfileSimTeam;
  home: MlbPlayerProfileSimTeam;
  homeWinPctFromProfiles: number;
  awayWinPctFromProfiles: number;
  tightness: {
    isTooTight: boolean;
    reason: string | null;
    runSeparation: number;
    minRunStdDev: number;
  };
  warnings: string[];
  reasons: string[];
};

type ProjectionLike = {
  distribution: {
    avgAway: number;
    avgHome: number;
    homeWinPct: number;
    awayWinPct: number;
    [key: string]: unknown;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function num(value: number | null | undefined, fallback = 70) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function profileConfidence(team: MlbMatchupTeamProfile | null) {
  if (!team) return 0.15;
  const bats = team.topBats.length;
  const arms = team.topArms.length;
  const lineup = team.lineupScore == null ? 0 : 1;
  const starter = team.starterScore == null ? 0 : 1;
  const bullpen = team.bullpenScore == null ? 0 : 1;
  return clamp((Math.min(5, bats) / 5) * 0.38 + (Math.min(5, arms) / 5) * 0.22 + lineup * 0.14 + starter * 0.16 + bullpen * 0.1, 0.15, 0.95);
}

function volatility(team: MlbMatchupTeamProfile | null, opponent: MlbMatchupTeamProfile | null) {
  if (!team) return 1.85;
  const bats = team.topBats.map((player) => player.overall ?? 70);
  const powerTraits = team.topBats.flatMap((player) => player.traits.filter((trait) => /power|barrel|damage/i.test(`${trait.key} ${trait.label}`)).map((trait) => trait.score ?? 70));
  const power = powerTraits.length ? powerTraits.reduce((sum, value) => sum + value, 0) / powerTraits.length : 70;
  const spread = bats.length > 1 ? Math.max(...bats) - Math.min(...bats) : 10;
  const weakBullpen = 75 - num(opponent?.bullpenScore, 70);
  const riskCount = team.risks.length + (opponent?.risks.length ?? 0);
  return clamp(1.42 + Math.max(0, power - 70) * 0.009 + spread * 0.01 + Math.max(0, weakBullpen) * 0.008 + riskCount * 0.045, 1.35, 2.35);
}

function runDelta(team: MlbMatchupTeamProfile | null, opponent: MlbMatchupTeamProfile | null) {
  if (!team || !opponent) return 0;
  const lineup = num(team.lineupScore);
  const oppStarter = num(opponent.starterScore);
  const oppPen = num(opponent.bullpenScore);
  const directImpact = team.runImpact ?? 0;
  const lineupComponent = (lineup - 70) * 0.018;
  const starterComponent = (lineup - oppStarter) * 0.022;
  const bullpenComponent = (lineup - oppPen) * 0.012;
  return clamp(lineupComponent + starterComponent + bullpenComponent + directImpact * 0.35, -1.25, 1.25);
}

function teamFeed(team: string, baseRuns: number, side: MlbMatchupTeamProfile | null, opponent: MlbMatchupTeamProfile | null): MlbPlayerProfileSimTeam {
  const delta = runDelta(side, opponent);
  const meanRuns = clamp(baseRuns + delta, 1.2, 10.5);
  const std = volatility(side, opponent);
  const confidence = profileConfidence(side);
  return {
    team,
    meanRuns: round(meanRuns, 2),
    p10Runs: round(clamp(meanRuns - std * 1.28, 0, 14), 2),
    p50Runs: round(meanRuns, 2),
    p90Runs: round(clamp(meanRuns + std * 1.28, 0, 14), 2),
    lineupScore: side?.lineupScore ?? null,
    starterScore: side?.starterScore ?? null,
    bullpenScore: side?.bullpenScore ?? null,
    profileRunImpact: side?.runImpact ?? null,
    volatility: round(std, 2),
    dataConfidence: round(confidence, 3),
    drivers: side?.xFactors ?? [],
    risks: side?.risks ?? []
  };
}

export async function buildMlbPlayerProfileSimFeed(args: {
  awayTeam: string;
  homeTeam: string;
  projection: ProjectionLike;
}): Promise<MlbPlayerProfileSimFeed> {
  const board = await getMlbMatchupPlayerEdges({ away: args.awayTeam, home: args.homeTeam });
  const away = teamFeed(args.awayTeam, args.projection.distribution.avgAway, board.away, board.home);
  const home = teamFeed(args.homeTeam, args.projection.distribution.avgHome, board.home, board.away);
  const avgConfidence = clamp((away.dataConfidence + home.dataConfidence) / 2, 0.15, 0.95);
  const profileHomeWin = logistic((home.meanRuns - away.meanRuns) * 0.42);
  const blend = clamp(avgConfidence * 0.55, 0.18, 0.52);
  const homeWinPctFromProfiles = clamp(args.projection.distribution.homeWinPct * (1 - blend) + profileHomeWin * blend, 0.05, 0.95);
  const runSeparation = Math.abs(home.meanRuns - away.meanRuns);
  const minRunStdDev = Math.min(home.volatility, away.volatility);
  const isTooTight = runSeparation < 0.18 && minRunStdDev < 1.55;
  const warnings = [...board.warnings];
  if (isTooTight) warnings.push("Player-profile sim feed is too tight: run separation is narrow and variance floor is low.");
  if (away.dataConfidence < 0.55) warnings.push(`${args.awayTeam} player-profile sim confidence is thin.`);
  if (home.dataConfidence < 0.55) warnings.push(`${args.homeTeam} player-profile sim confidence is thin.`);
  return {
    modelVersion: "mlb-player-profile-sim-feed-v1",
    applied: board.ok && Boolean(board.away || board.home),
    awayTeam: args.awayTeam,
    homeTeam: args.homeTeam,
    away,
    home,
    homeWinPctFromProfiles: round(homeWinPctFromProfiles, 4),
    awayWinPctFromProfiles: round(1 - homeWinPctFromProfiles, 4),
    tightness: {
      isTooTight,
      reason: isTooTight ? "Run means are too close and variance floor is too low; keep profile ranges visible instead of collapsing to one tight number." : null,
      runSeparation: round(runSeparation, 3),
      minRunStdDev: round(minRunStdDev, 3)
    },
    warnings,
    reasons: [
      `Player profiles fed sim means: ${args.awayTeam} ${away.meanRuns} runs (${away.p10Runs}-${away.p90Runs}) and ${args.homeTeam} ${home.meanRuns} runs (${home.p10Runs}-${home.p90Runs}).`,
      `Profile-derived home win probability ${round(homeWinPctFromProfiles, 4)} blended from profile run gap and base projection with ${(blend * 100).toFixed(1)}% profile weight.`,
      isTooTight ? "Tightness monitor flagged this matchup; scenario range should be used for display and bet gating." : "Tightness monitor passed; profile feed has enough spread for simulation context."
    ]
  };
}
