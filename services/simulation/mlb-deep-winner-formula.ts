type DistributionLike = {
  avgAway: number;
  avgHome: number;
  homeWinPct: number;
  awayWinPct: number;
  [key: string]: unknown;
};

type ProjectionLike = {
  distribution: DistributionLike;
  mlbIntel?: {
    playerImpact?: unknown;
    market?: { homeNoVigProbability?: number | null; source?: string | null } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

type ProfileTeamLike = {
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

type PlayerProfileFeedLike = {
  applied: boolean;
  away: ProfileTeamLike;
  home: ProfileTeamLike;
  homeWinPctFromProfiles: number;
  awayWinPctFromProfiles: number;
  tightness: { isTooTight: boolean; runSeparation: number; minRunStdDev: number; reason: string | null };
  warnings: string[];
  reasons: string[];
};

export type MlbDeepWinnerFormulaComponent = {
  key: string;
  label: string;
  homeEdge: number;
  weight: number;
  homeProbability: number;
  detail: string;
};

export type MlbDeepWinnerFormula = {
  modelVersion: "mlb-deep-winner-formula-v1";
  applied: boolean;
  awayTeam: string;
  homeTeam: string;
  homeWinPct: number;
  awayWinPct: number;
  homeRuns: number;
  awayRuns: number;
  confidence: number;
  dataDepthScore: number;
  components: MlbDeepWinnerFormulaComponent[];
  warnings: string[];
  reasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function logistic(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function logit(probability: number) {
  const p = clamp(probability, 0.02, 0.98);
  return Math.log(p / (1 - p));
}

function invLogit(value: number) {
  return 1 / (1 + Math.exp(-value));
}

function blendLogit(items: Array<{ p: number; weight: number }>) {
  const valid = items.filter((item) => Number.isFinite(item.p) && item.weight > 0);
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!valid.length || total <= 0) return 0.5;
  return invLogit(valid.reduce((sum, item) => sum + logit(item.p) * (item.weight / total), 0));
}

function component(key: string, label: string, homeEdge: number, weight: number, scale: number, detail: string): MlbDeepWinnerFormulaComponent {
  const p = logistic(homeEdge * scale);
  return { key, label, homeEdge: round(homeEdge, 3), weight: round(weight, 3), homeProbability: round(p, 4), detail };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function starterProjection(playerImpact: Record<string, unknown> | null, side: "awayStarter" | "homeStarter") {
  const projections = record(playerImpact?.playerStatProjections);
  return record(projections?.[side]);
}

function diversityProfile(starter: Record<string, unknown> | null) {
  return record(starter?.diversityProfile);
}

function starterSkillEdge(homeStarter: Record<string, unknown> | null, awayStarter: Record<string, unknown> | null) {
  const home = diversityProfile(homeStarter);
  const away = diversityProfile(awayStarter);
  const homeSkill = safeNumber(home?.skill, safeNumber(homeStarter?.expectedStrikeouts, 4.5) * 8.5 + safeNumber(homeStarter?.expectedOuts, 15) * 1.1);
  const awaySkill = safeNumber(away?.skill, safeNumber(awayStarter?.expectedStrikeouts, 4.5) * 8.5 + safeNumber(awayStarter?.expectedOuts, 15) * 1.1);
  const homeEr = safeNumber(homeStarter?.expectedEarnedRuns, 3.2);
  const awayEr = safeNumber(awayStarter?.expectedEarnedRuns, 3.2);
  const homeK = safeNumber(homeStarter?.expectedStrikeouts, 4.7);
  const awayK = safeNumber(awayStarter?.expectedStrikeouts, 4.7);
  const homeOuts = safeNumber(homeStarter?.expectedOuts, 15.8);
  const awayOuts = safeNumber(awayStarter?.expectedOuts, 15.8);
  return (homeSkill - awaySkill) * 0.018 + (awayEr - homeEr) * 0.12 + (homeK - awayK) * 0.035 + (homeOuts - awayOuts) * 0.014;
}

function dataDepth(feed: PlayerProfileFeedLike | null, playerImpact: Record<string, unknown> | null) {
  const profileDepth = feed ? (feed.away.dataConfidence + feed.home.dataConfidence) / 2 : 0.2;
  const impactConfidence = safeNumber(playerImpact?.confidence, 0.45);
  const hasStarters = Boolean(starterProjection(playerImpact, "awayStarter") && starterProjection(playerImpact, "homeStarter"));
  const statProjectionDepth = hasStarters ? 0.18 : 0.04;
  const rangeDepth = feed && feed.away.volatility > 0 && feed.home.volatility > 0 ? 0.12 : 0.03;
  return clamp(profileDepth * 0.5 + impactConfidence * 0.25 + statProjectionDepth + rangeDepth, 0.2, 0.98);
}

export function buildMlbDeepWinnerFormula(args: {
  awayTeam: string;
  homeTeam: string;
  rawProjection: ProjectionLike;
  projection: ProjectionLike;
  playerProfileSimFeed: PlayerProfileFeedLike | null;
}): MlbDeepWinnerFormula {
  const playerImpact = record(args.projection.mlbIntel?.playerImpact);
  const feed = args.playerProfileSimFeed;
  const awayRuns = feed?.away.meanRuns ?? args.projection.distribution.avgAway;
  const homeRuns = feed?.home.meanRuns ?? args.projection.distribution.avgHome;
  const runEdge = homeRuns - awayRuns;
  const lineupEdge = feed ? (safeNumber(feed.home.lineupScore, 70) - safeNumber(feed.away.lineupScore, 70)) / 100 : 0;
  const starterEdge = starterSkillEdge(starterProjection(playerImpact, "homeStarter"), starterProjection(playerImpact, "awayStarter"));
  const bullpenEdge = feed ? (safeNumber(feed.home.bullpenScore, 70) - safeNumber(feed.away.bullpenScore, 70)) / 100 : 0;
  const profileImpactEdge = feed ? (safeNumber(feed.home.profileRunImpact, 0) - safeNumber(feed.away.profileRunImpact, 0)) * 0.22 : 0;
  const volatilityEdge = feed ? (feed.away.volatility - feed.home.volatility) * 0.045 : 0;
  const marketAnchor = args.projection.mlbIntel?.market?.homeNoVigProbability;
  const profileProb = feed?.homeWinPctFromProfiles ?? args.projection.distribution.homeWinPct;
  const depth = dataDepth(feed, playerImpact);
  const components = [
    component("run_gap", "Run gap", runEdge, 0.24, 0.42, `Profile/stat run gap ${args.homeTeam} ${homeRuns.toFixed(2)} vs ${args.awayTeam} ${awayRuns.toFixed(2)}.`),
    component("starter_edge", "Starter edge", starterEdge, 0.2, 2.8, "Starting-pitcher diversity: skill, K quality, expected outs, expected Ks, and earned-run suppression."),
    component("lineup_edge", "Lineup edge", lineupEdge, 0.16, 3.2, "Lineup profile score from player cards and raw batter stats."),
    component("bullpen_edge", "Bullpen edge", bullpenEdge, 0.12, 2.6, "Bullpen profile edge from player-card arm depth."),
    component("profile_impact", "Player impact", profileImpactEdge, 0.12, 2.4, "Direct player-profile run impact differential."),
    component("volatility", "Variance edge", volatilityEdge, 0.06, 3.0, "Lower team run volatility earns a small winner edge."),
    component("base_projection", "Base model", args.projection.distribution.homeWinPct - 0.5, 0.1, 3.2, "Existing sim model probability retained as a non-blocking anchor.")
  ];
  const deepHome = blendLogit([
    ...components.map((item) => ({ p: item.homeProbability, weight: item.weight })),
    { p: profileProb, weight: 0.16 * depth },
    { p: args.rawProjection.distribution.homeWinPct, weight: 0.08 },
    ...(typeof marketAnchor === "number" && Number.isFinite(marketAnchor) ? [{ p: marketAnchor, weight: 0.04 }] : [])
  ]);
  const depthShrink = clamp(0.38 + depth * 0.62, 0.38, 0.98);
  const finalHome = clamp(0.5 + (deepHome - 0.5) * depthShrink, 0.06, 0.94);
  const warnings = [...(feed?.warnings ?? [])];
  if (!feed?.applied) warnings.push("Deep winner formula ran without full player-profile sim feed; base projection received more weight.");
  if (feed?.tightness.isTooTight) warnings.push("Deep winner formula detected tight profile ranges; probability was allowed but depth-shrunk rather than blocked.");
  if (depth < 0.55) warnings.push(`Deep winner data depth is ${Math.round(depth * 100)}/100; confidence is capped but formula remains active.`);
  return {
    modelVersion: "mlb-deep-winner-formula-v1",
    applied: true,
    awayTeam: args.awayTeam,
    homeTeam: args.homeTeam,
    homeWinPct: round(finalHome, 4),
    awayWinPct: round(1 - finalHome, 4),
    homeRuns: round(homeRuns, 2),
    awayRuns: round(awayRuns, 2),
    confidence: round(clamp(0.46 + depth * 0.24 + Math.abs(finalHome - 0.5) * 0.35, 0.42, 0.76), 3),
    dataDepthScore: round(depth, 3),
    components,
    warnings,
    reasons: [
      `Deep winner formula active: home ${(finalHome * 100).toFixed(1)}%, away ${((1 - finalHome) * 100).toFixed(1)}%, data depth ${(depth * 100).toFixed(1)}%.`,
      `Integrated run gap, starter diversity, lineup profile, bullpen depth, direct player impact, volatility, existing sim, and optional market anchor into one winner probability.`,
      ...components.map((item) => `${item.label}: edge ${item.homeEdge}, component home ${(item.homeProbability * 100).toFixed(1)}%, weight ${item.weight}.`),
      ...warnings.map((warning) => `Deep formula warning: ${warning}`)
    ]
  };
}
