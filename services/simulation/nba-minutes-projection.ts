import type { NbaLineupTruth } from "./nba-lineup-truth";
import type { NbaPlayerStatProfile } from "./nba-player-stat-profile";

export type NbaMinutesProjection = {
  projectedMinutes: number;
  floorMinutes: number;
  ceilingMinutes: number;
  confidence: number;
  role: "starter" | "bench" | "fringe" | "unknown";
  starterLikely: boolean;
  closingLineupLikely: boolean;
  blowoutRisk: number;
  foulRisk: number;
  injuryRisk: number;
  blockers: string[];
  warnings: string[];
};

export type NbaMinutesProjectionInput = {
  profile: NbaPlayerStatProfile;
  lineupTruth?: NbaLineupTruth | null;
  marketLine?: number | null;
  teamSpread?: number | null;
  backToBack?: boolean;
  playerStatus?: "ACTIVE" | "PROBABLE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN" | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function roleFrom(profile: NbaPlayerStatProfile): NbaMinutesProjection["role"] {
  if (profile.minutes.starterRate >= 0.65 || profile.minutes.weighted >= 29) return "starter";
  if (profile.minutes.weighted >= 17) return "bench";
  if (profile.minutes.weighted > 0) return "fringe";
  return "unknown";
}

function statusPenalty(status: NbaMinutesProjectionInput["playerStatus"]) {
  switch (status) {
    case "OUT": return { multiplier: 0, risk: 1, blocker: "player listed OUT" };
    case "DOUBTFUL": return { multiplier: 0.35, risk: 0.8, blocker: "player listed DOUBTFUL" };
    case "QUESTIONABLE": return { multiplier: 0.72, risk: 0.65, blocker: "player listed QUESTIONABLE" };
    case "UNKNOWN": return { multiplier: 0.82, risk: 0.5, blocker: "player status UNKNOWN" };
    case "PROBABLE": return { multiplier: 0.94, risk: 0.18, blocker: null };
    case "ACTIVE": return { multiplier: 1, risk: 0.05, blocker: null };
    default: return { multiplier: 0.9, risk: 0.35, blocker: "player status missing" };
  }
}

export function projectNbaPlayerMinutes(input: NbaMinutesProjectionInput): NbaMinutesProjection {
  const profile = input.profile;
  const role = roleFrom(profile);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const status = statusPenalty(input.playerStatus ?? null);
  if (status.blocker) blockers.push(status.blocker);
  if (profile.sampleSize < 5) warnings.push("low minutes sample");
  if (profile.minutes.stdDev >= 6) warnings.push("high recent minutes volatility");
  if (input.lineupTruth && input.lineupTruth.status !== "GREEN") blockers.push(`lineup truth ${input.lineupTruth.status}`);

  const blowoutRisk = typeof input.teamSpread === "number" ? clamp((Math.abs(input.teamSpread) - 8) / 12, 0, 0.55) : 0.12;
  const foulRisk = clamp(profile.attributes.foulRisk, 0, 1);
  const injuryRisk = Math.max(status.risk, input.lineupTruth?.playerFlags.some((flag) => flag.playerName === profile.playerName && flag.risk === "HIGH") ? 0.75 : 0);

  let projected = profile.minutes.weighted || profile.minutes.average || (role === "starter" ? 31 : role === "bench" ? 18 : 9);
  projected *= status.multiplier;
  projected *= input.backToBack ? 0.965 : 1;
  projected *= 1 - blowoutRisk * (role === "starter" ? 0.16 : 0.08);
  projected *= 1 - foulRisk * 0.08;

  if (role === "starter") projected = clamp(projected, 18, 39);
  else if (role === "bench") projected = clamp(projected, 8, 31);
  else if (role === "fringe") projected = clamp(projected, 0, 18);
  else projected = clamp(projected, 0, 24);

  if ((input.playerStatus === "OUT" || input.playerStatus === "DOUBTFUL") && role !== "unknown") projected = Math.min(projected, input.playerStatus === "OUT" ? 0 : 12);

  const volatilityBand = 3 + profile.minutes.stdDev * 0.65 + blowoutRisk * 5 + injuryRisk * 7 + (input.backToBack ? 1.5 : 0);
  const floorMinutes = clamp(projected - volatilityBand, 0, 42);
  const ceilingMinutes = clamp(projected + volatilityBand, 0, 44);
  const confidence = clamp(
    profile.reliability * 0.42
    + (1 - clamp(profile.minutes.stdDev / Math.max(6, profile.minutes.average || 1), 0, 1)) * 0.24
    + (input.lineupTruth?.status === "GREEN" ? 0.18 : input.lineupTruth?.status === "YELLOW" ? 0.08 : 0)
    + (1 - injuryRisk) * 0.12
    + (role === "starter" ? 0.04 : 0.02),
    0,
    1
  );

  return {
    projectedMinutes: round(projected, 2),
    floorMinutes: round(floorMinutes, 2),
    ceilingMinutes: round(ceilingMinutes, 2),
    confidence: round(confidence, 3),
    role,
    starterLikely: role === "starter" && projected >= 24,
    closingLineupLikely: role === "starter" && projected >= 29 && injuryRisk < 0.25 && blowoutRisk < 0.35,
    blowoutRisk: round(blowoutRisk, 3),
    foulRisk: round(foulRisk, 3),
    injuryRisk: round(injuryRisk, 3),
    blockers,
    warnings
  };
}
