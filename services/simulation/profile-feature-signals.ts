import { getPlayerTendencyCoverageReport, type TendencyCoverageLane } from "@/services/ops/player-tendency-coverage";

export type ProfileFeatureSignalStatus = "ELITE" | "USABLE" | "THIN" | "MISSING";

export type MlbProfileFeatureSignal = {
  sport: "MLB";
  status: ProfileFeatureSignalStatus;
  score: number;
  confidenceCap: number;
  rosterIdentityScore: number;
  playerStatDepthScore: number;
  statcastQualityScore: number;
  pitcherContextScore: number;
  probableStarterScore: number;
  bullpenUsageScore: number;
  modelReady: boolean;
  reasons: string[];
};

export type MmaProfileFeatureSignal = {
  sport: "MMA";
  status: ProfileFeatureSignalStatus;
  score: number;
  confidenceCap: number;
  bioProfileScore: number;
  reachStanceScore: number;
  fightHistoryScore: number;
  opponentStrengthScore: number;
  strikingTendencyScore: number;
  grapplingTendencyScore: number;
  finishProfileScore: number;
  layoffShortNoticeScore: number;
  modelReady: boolean;
  reasons: string[];
};

export type ProfileFeatureSignalReport = {
  generatedAt: string;
  score: number;
  status: ProfileFeatureSignalStatus;
  mlb: MlbProfileFeatureSignal;
  mma: MmaProfileFeatureSignal;
};

function pct(lane: TendencyCoverageLane | undefined, key: string) {
  const value = lane?.metrics.find((metric) => metric.key === key)?.pct;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function status(score: number): ProfileFeatureSignalStatus {
  if (score >= 85) return "ELITE";
  if (score >= 65) return "USABLE";
  if (score >= 30) return "THIN";
  return "MISSING";
}

function confidenceCap(score: number, floor = 0.42) {
  if (score >= 85) return 0.9;
  if (score >= 70) return 0.78;
  if (score >= 55) return 0.66;
  if (score >= 35) return 0.55;
  return floor;
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildMlbSignal(lane: TendencyCoverageLane | undefined): MlbProfileFeatureSignal {
  const rosterIdentityScore = toScore(avg([pct(lane, "mlb_roster_identity"), pct(lane, "mlb_positions")]));
  const playerStatDepthScore = toScore(avg([pct(lane, "mlb_recent_player_rows"), pct(lane, "mlb_starters_tagged")]));
  const statcastQualityScore = toScore(avg([pct(lane, "mlb_statcast_profiles"), pct(lane, "mlb_xwoba"), pct(lane, "mlb_hard_hit")]));
  const pitcherContextScore = toScore(avg([pct(lane, "mlb_pitch_mix"), pct(lane, "mlb_pitcher_context"), pct(lane, "mlb_plate_discipline")]));
  const probableStarterScore = toScore(pct(lane, "mlb_probable_pitchers"));
  const bullpenUsageScore = toScore(pct(lane, "mlb_bullpen_usage"));
  const score = Math.round(
    rosterIdentityScore * 0.12 +
    playerStatDepthScore * 0.18 +
    statcastQualityScore * 0.22 +
    pitcherContextScore * 0.22 +
    probableStarterScore * 0.14 +
    bullpenUsageScore * 0.12
  );
  const currentStatus = status(score);
  const reasons = [
    `Roster identity ${rosterIdentityScore}/100.`,
    `Player stat depth ${playerStatDepthScore}/100.`,
    `Statcast quality ${statcastQualityScore}/100.`,
    `Pitcher context ${pitcherContextScore}/100.`,
    `Probable starter context ${probableStarterScore}/100.`,
    `Bullpen usage context ${bullpenUsageScore}/100.`
  ];
  return {
    sport: "MLB",
    status: currentStatus,
    score,
    confidenceCap: confidenceCap(score, 0.45),
    rosterIdentityScore,
    playerStatDepthScore,
    statcastQualityScore,
    pitcherContextScore,
    probableStarterScore,
    bullpenUsageScore,
    modelReady: score >= 65 && playerStatDepthScore >= 50,
    reasons
  };
}

function buildMmaSignal(lane: TendencyCoverageLane | undefined): MmaProfileFeatureSignal {
  const bioProfileScore = toScore(pct(lane, "mma_bio_profiles"));
  const reachStanceScore = toScore(pct(lane, "mma_reach_stance"));
  const fightHistoryScore = toScore(pct(lane, "mma_fight_history"));
  const opponentStrengthScore = toScore(pct(lane, "mma_opponent_strength"));
  const strikingTendencyScore = toScore(pct(lane, "mma_striking_tendencies"));
  const grapplingTendencyScore = toScore(pct(lane, "mma_grappling_tendencies"));
  const finishProfileScore = toScore(pct(lane, "mma_finish_profile"));
  const layoffShortNoticeScore = toScore(pct(lane, "mma_layoff_short_notice"));
  const score = Math.round(
    bioProfileScore * 0.1 +
    reachStanceScore * 0.1 +
    fightHistoryScore * 0.18 +
    opponentStrengthScore * 0.16 +
    strikingTendencyScore * 0.18 +
    grapplingTendencyScore * 0.18 +
    finishProfileScore * 0.06 +
    layoffShortNoticeScore * 0.04
  );
  const currentStatus = status(score);
  const reasons = [
    `Bio profile ${bioProfileScore}/100.`,
    `Reach/stance ${reachStanceScore}/100.`,
    `Fight history ${fightHistoryScore}/100.`,
    `Opponent strength ${opponentStrengthScore}/100.`,
    `Striking tendencies ${strikingTendencyScore}/100.`,
    `Grappling tendencies ${grapplingTendencyScore}/100.`,
    `Finish profile ${finishProfileScore}/100.`,
    `Layoff/short-notice context ${layoffShortNoticeScore}/100.`
  ];
  return {
    sport: "MMA",
    status: currentStatus,
    score,
    confidenceCap: confidenceCap(score, 0.38),
    bioProfileScore,
    reachStanceScore,
    fightHistoryScore,
    opponentStrengthScore,
    strikingTendencyScore,
    grapplingTendencyScore,
    finishProfileScore,
    layoffShortNoticeScore,
    modelReady: score >= 65 && strikingTendencyScore >= 50 && grapplingTendencyScore >= 50,
    reasons
  };
}

export async function getProfileFeatureSignalReport(): Promise<ProfileFeatureSignalReport> {
  const coverage = await getPlayerTendencyCoverageReport();
  const mlbLane = coverage.lanes.find((lane) => lane.sport === "MLB");
  const mmaLane = coverage.lanes.find((lane) => lane.sport === "MMA");
  const mlb = buildMlbSignal(mlbLane);
  const mma = buildMmaSignal(mmaLane);
  const score = Math.round((mlb.score + mma.score) / 2);
  return {
    generatedAt: new Date().toISOString(),
    score,
    status: status(score),
    mlb,
    mma
  };
}
