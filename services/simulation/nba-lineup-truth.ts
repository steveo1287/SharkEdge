import {
  getNbaLineupImpact,
  getNbaPlayerImpactSnapshot,
  type NbaLineupImpact,
  type NbaPlayerImpactRecord,
  type PlayerStatus
} from "./nba-player-impact";

export type NbaLineupTruthStatus = "GREEN" | "YELLOW" | "RED";
export type NbaUsageTier = "STAR" | "HIGH" | "ROTATION" | "LOW";
export type NbaLineupRisk = "LOW" | "MEDIUM" | "HIGH";

export type NbaLineupTruthPlayerFlag = {
  playerName: string;
  team: string;
  status: "OUT" | "DOUBTFUL" | "QUESTIONABLE" | "PROBABLE" | "ACTIVE" | "UNKNOWN";
  usageTier: NbaUsageTier;
  projectedMinutes: number | null;
  usageImpact: number;
  netRatingImpact: number;
  risk: NbaLineupRisk;
};

export type NbaLineupTruth = {
  status: NbaLineupTruthStatus;
  injuryReportFresh: boolean;
  lastUpdatedAt: string | null;
  minutesTrusted: boolean;
  starQuestionable: boolean;
  highUsageOut: boolean;
  lateScratchRisk: boolean;
  projectedStarterConfidence: number;
  blockers: string[];
  warnings: string[];
  playerFlags: NbaLineupTruthPlayerFlag[];
};

export type NbaLineupTruthInput = {
  awayTeam: string;
  homeTeam: string;
  awayImpact?: NbaLineupImpact | null;
  homeImpact?: NbaLineupImpact | null;
  feedLastUpdatedAt?: string | Date | null;
  now?: string | Date | null;
  gameTime?: string | Date | null;
  projectionReasons?: string[];
  projectionModules?: Array<{ label: string; status: string }>;
  volatilityIndex?: number | null;
};

const FRESHNESS_WINDOW_MINUTES = 90;
const NEAR_TIPOFF_MINUTES = 180;

function minutesBetween(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / 60000;
}

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(status: PlayerStatus): NbaLineupTruthPlayerFlag["status"] {
  if (status === "out") return "OUT";
  if (status === "doubtful") return "DOUBTFUL";
  if (status === "questionable") return "QUESTIONABLE";
  if (status === "available") return "ACTIVE";
  return "UNKNOWN";
}

function usageTier(player: NbaPlayerImpactRecord): NbaUsageTier {
  const usage = Math.abs(player.usageImpact);
  const net = Math.abs(player.netRatingImpact);
  const minutes = Math.abs(player.minutesImpact);
  if (usage >= 7 || net >= 4 || minutes >= 30) return "STAR";
  if (usage >= 4 || net >= 2.25 || minutes >= 24) return "HIGH";
  if (usage >= 1.5 || net >= 1 || minutes >= 12) return "ROTATION";
  return "LOW";
}

function playerRisk(player: NbaPlayerImpactRecord): NbaLineupRisk {
  const tier = usageTier(player);
  if (player.status === "out" || player.status === "doubtful") {
    return tier === "STAR" || tier === "HIGH" ? "HIGH" : "MEDIUM";
  }
  if (player.status === "questionable" || player.status === "unknown") {
    return tier === "STAR" || tier === "HIGH" ? "HIGH" : "MEDIUM";
  }
  return "LOW";
}

function playerFlag(player: NbaPlayerImpactRecord): NbaLineupTruthPlayerFlag {
  return {
    playerName: player.playerName,
    team: player.teamName,
    status: normalizeStatus(player.status),
    usageTier: usageTier(player),
    projectedMinutes: Number.isFinite(player.minutesImpact) && player.minutesImpact > 0 ? player.minutesImpact : null,
    usageImpact: Number(player.usageImpact.toFixed(2)),
    netRatingImpact: Number(player.netRatingImpact.toFixed(2)),
    risk: playerRisk(player)
  };
}

function relevantFlags(impact: NbaLineupImpact | null | undefined) {
  return (impact?.players ?? [])
    .map(playerFlag)
    .filter((player) => player.status !== "ACTIVE" || player.risk !== "LOW")
    .sort((left, right) => {
      const riskRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
      const tierRank = { STAR: 4, HIGH: 3, ROTATION: 2, LOW: 1 } as const;
      return riskRank[right.risk] - riskRank[left.risk] || tierRank[right.usageTier] - tierRank[left.usageTier];
    });
}

function textHas(patterns: RegExp[], values: string[]) {
  const text = values.join(" | ").toLowerCase();
  return patterns.some((pattern) => pattern.test(text));
}

function moduleIsReal(patterns: RegExp[], modules: Array<{ label: string; status: string }>) {
  return modules.some((module) => patterns.some((pattern) => pattern.test(module.label.toLowerCase())) && module.status === "real");
}

function boundedConfidence(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

export function buildNbaLineupTruth(input: NbaLineupTruthInput): NbaLineupTruth {
  const now = parseDate(input.now) ?? new Date();
  const lastUpdated = parseDate(input.feedLastUpdatedAt);
  const gameTime = parseDate(input.gameTime);
  const minutesToTip = gameTime ? (gameTime.getTime() - now.getTime()) / 60000 : null;
  const nearTipoff = minutesToTip !== null && minutesToTip <= NEAR_TIPOFF_MINUTES && minutesToTip >= -30;
  const injuryReportFresh = Boolean(lastUpdated && minutesBetween(now, lastUpdated) <= FRESHNESS_WINDOW_MINUTES);
  const modules = input.projectionModules ?? [];
  const reasons = input.projectionReasons ?? [];
  const flags = [...relevantFlags(input.awayImpact), ...relevantFlags(input.homeImpact)];
  const highRiskFlags = flags.filter((flag) => flag.risk === "HIGH");
  const starQuestionable = flags.some((flag) => flag.usageTier === "STAR" && (flag.status === "QUESTIONABLE" || flag.status === "UNKNOWN"));
  const highUsageOut = flags.some((flag) => (flag.usageTier === "STAR" || flag.usageTier === "HIGH") && (flag.status === "OUT" || flag.status === "DOUBTFUL"));
  const lateScratchRisk = nearTipoff && (starQuestionable || flags.some((flag) => flag.status === "UNKNOWN" && flag.usageTier !== "LOW"));
  const explicitMinutesSignal = moduleIsReal([/rotation/, /availability/, /injury/], modules) || textHas([/minutes/, /rotation/, /availability/, /injury/], reasons);
  const minutesTrusted = explicitMinutesSignal && !lateScratchRisk && !starQuestionable;
  const syntheticLineup = Boolean(input.awayImpact?.summary.includes("No confirmed") || input.homeImpact?.summary.includes("No confirmed"));
  const activeCoreHealth = Math.min(input.awayImpact?.activeCoreHealth ?? 0, input.homeImpact?.activeCoreHealth ?? 0);
  const volatilityRisk = typeof input.volatilityIndex === "number" && input.volatilityIndex >= 1.75;

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!injuryReportFresh) blockers.push("stale injury report");
  if (syntheticLineup) blockers.push("no confirmed injury-impact feed");
  if (starQuestionable) blockers.push("star/high-usage player questionable or unknown");
  if (highUsageOut && !minutesTrusted) blockers.push("high-usage player out without trusted minutes redistribution");
  if (lateScratchRisk) blockers.push("late scratch risk near tipoff");
  if (!minutesTrusted) warnings.push("projected minutes are not fully trusted");
  if (volatilityRisk) warnings.push("high lineup volatility index");
  if (activeCoreHealth < 70) warnings.push(`active core health is ${activeCoreHealth}`);
  if (highRiskFlags.length) warnings.push(`${highRiskFlags.length} high-risk lineup player flag(s)`);

  const projectedStarterConfidence = boundedConfidence(
    0.95
    - (injuryReportFresh ? 0 : 0.28)
    - (syntheticLineup ? 0.2 : 0)
    - (starQuestionable ? 0.24 : 0)
    - (highUsageOut ? 0.18 : 0)
    - (lateScratchRisk ? 0.18 : 0)
    - (minutesTrusted ? 0 : 0.14)
    - Math.min(0.18, highRiskFlags.length * 0.06)
    - (volatilityRisk ? 0.08 : 0)
  );

  const status: NbaLineupTruthStatus = blockers.some((blocker) =>
    blocker === "stale injury report" ||
    blocker === "star/high-usage player questionable or unknown" ||
    blocker === "high-usage player out without trusted minutes redistribution" ||
    blocker === "late scratch risk near tipoff"
  )
    ? "RED"
    : blockers.length || warnings.length || projectedStarterConfidence < 0.82
      ? "YELLOW"
      : "GREEN";

  return {
    status,
    injuryReportFresh,
    lastUpdatedAt: lastUpdated?.toISOString() ?? null,
    minutesTrusted,
    starQuestionable,
    highUsageOut,
    lateScratchRisk,
    projectedStarterConfidence,
    blockers,
    warnings,
    playerFlags: flags
  };
}

export async function getNbaLineupTruth(input: Omit<NbaLineupTruthInput, "awayImpact" | "homeImpact" | "feedLastUpdatedAt"> & { feedLastUpdatedAt?: string | Date | null }): Promise<NbaLineupTruth> {
  const snapshot = await getNbaPlayerImpactSnapshot();
  const [awayImpact, homeImpact] = await Promise.all([
    getNbaLineupImpact(input.awayTeam),
    getNbaLineupImpact(input.homeTeam)
  ]);
  return buildNbaLineupTruth({
    ...input,
    awayImpact,
    homeImpact,
    feedLastUpdatedAt: input.feedLastUpdatedAt ?? snapshot?.lastUpdatedAt ?? null
  });
}
