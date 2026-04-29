import type { MlbGameContextAuthority } from "@/services/simulation/mlb-game-context-authority";

export type MlbAuthorityAdjustment = {
  starterConfidenceCap: number;
  attackAllowed: boolean;
  volatilityMultiplier: number;
  projectedTotalAdjustment: number;
  reasons: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildMlbAuthorityAdjustment(authority: MlbGameContextAuthority): MlbAuthorityAdjustment {
  const startersOfficial =
    authority.starters.away.source === "mlb-statsapi" &&
    authority.starters.home.source === "mlb-statsapi" &&
    authority.starters.away.confirmed &&
    authority.starters.home.confirmed;
  const bothLineupsConfirmed = authority.lineups.awayConfirmed && authority.lineups.homeConfirmed;
  const anyMissingStarter = authority.starters.away.source === "missing" || authority.starters.home.source === "missing";
  const anyUsageInferredStarter = authority.starters.away.source === "usage-inferred" || authority.starters.home.source === "usage-inferred";
  const lateScratchCount = authority.lineups.lateScratches.length;
  const bullpenFatigue = authority.bullpen.awayFatigueScore + authority.bullpen.homeFatigueScore;
  const weatherKnown = authority.weather.gameTimeForecastJoined || authority.weather.liveJoined;

  const reasons: string[] = [];
  if (!startersOfficial) {
    reasons.push("Official MLB probable starters are not confirmed on both sides.");
  }
  if (!bothLineupsConfirmed) {
    reasons.push("At least one batting order is still projected.");
  }
  if (lateScratchCount > 0) {
    reasons.push(`Late scratch risk detected: ${lateScratchCount} player flag${lateScratchCount === 1 ? "" : "s"}.`);
  }
  if (!weatherKnown) {
    reasons.push("Weather is venue/baseline only, not a joined game-time forecast.");
  }
  if (bullpenFatigue >= 5) {
    reasons.push("Combined bullpen fatigue is elevated.");
  }

  const starterConfidenceCap = anyMissingStarter
    ? 0.52
    : anyUsageInferredStarter
      ? 0.58
      : startersOfficial
        ? 0.74
        : 0.62;

  const volatilityMultiplier = clamp(
    1 +
      (startersOfficial ? -0.06 : 0.08) +
      (bothLineupsConfirmed ? -0.04 : 0.06) +
      lateScratchCount * 0.035 +
      Math.max(0, bullpenFatigue - 3) * 0.018 +
      (weatherKnown ? -0.015 : 0.025),
    0.86,
    1.28
  );

  const projectedTotalAdjustment = clamp(
    (authority.bullpen.awayFatigueScore + authority.bullpen.homeFatigueScore) * 0.055 +
      (authority.weather.runFactor - 1) * 4.5,
    -0.65,
    0.95
  );

  return {
    starterConfidenceCap,
    attackAllowed: startersOfficial && bothLineupsConfirmed && lateScratchCount === 0,
    volatilityMultiplier,
    projectedTotalAdjustment: Number(projectedTotalAdjustment.toFixed(3)),
    reasons: reasons.length ? reasons : ["MLB game context authority confirms starters, lineups, bullpen, and weather guardrails." ]
  };
}
