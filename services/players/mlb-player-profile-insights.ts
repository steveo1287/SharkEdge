import { getMlbPlayerProfile, getMlbPlayerProfiles, type MlbPlayerProfileCard, type MlbPlayerTrait } from "@/services/players/mlb-player-profiles";

export type MlbPlayerProfileInsight = {
  key: string;
  label: string;
  value: string;
  note: string;
  tone: "elite" | "good" | "watch" | "risk" | "neutral";
};

export type MlbPlayerProfileWeakness = {
  key: string;
  label: string;
  score: number | null;
  note: string;
};

export type MlbPlayerProfileBettingAngle = {
  market: string;
  angle: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
};

export type MlbPlayerProfileInsightReport = {
  ok: boolean;
  generatedAt: string;
  profile: MlbPlayerProfileCard;
  archetype: string;
  percentile: number | null;
  rankLabel: string;
  strongestTraits: MlbPlayerTrait[];
  weakestTraits: MlbPlayerProfileWeakness[];
  xFactors: MlbPlayerProfileInsight[];
  bettingAngles: MlbPlayerProfileBettingAngle[];
  riskFlags: MlbPlayerProfileInsight[];
  scoutingSummary: string[];
  warnings: string[];
};

function score(trait: MlbPlayerTrait | undefined) {
  return typeof trait?.score === "number" && Number.isFinite(trait.score) ? trait.score : null;
}

function trait(profile: MlbPlayerProfileCard, key: string) {
  return profile.traits.find((item) => item.key === key);
}

function fmt(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : "—";
}

function signed(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}` : "—";
}

function percentileFor(profile: MlbPlayerProfileCard, peers: MlbPlayerProfileCard[]) {
  if (profile.overall == null) return null;
  const comparable = peers.filter((peer) => peer.role === profile.role && peer.overall != null);
  if (comparable.length < 2) return null;
  const belowOrEqual = comparable.filter((peer) => (peer.overall ?? 0) <= (profile.overall ?? 0)).length;
  return Number(((belowOrEqual / comparable.length) * 100).toFixed(1));
}

function rankLabel(percentile: number | null) {
  if (percentile == null) return "Unranked";
  if (percentile >= 95) return "Top 5% role peer";
  if (percentile >= 90) return "Top 10% role peer";
  if (percentile >= 75) return "Top quartile role peer";
  if (percentile >= 50) return "Above median role peer";
  return "Below median role peer";
}

function hitterArchetype(profile: MlbPlayerProfileCard) {
  const contact = score(trait(profile, "contact")) ?? 0;
  const power = score(trait(profile, "power")) ?? 0;
  const discipline = score(trait(profile, "discipline")) ?? 0;
  const form = score(trait(profile, "form")) ?? 0;
  if (power >= 85 && discipline >= 76) return "Power anchor";
  if (contact >= 84 && form >= 75) return "Hit-probability engine";
  if (discipline >= 84) return "On-base pressure bat";
  if (power >= 78) return "Damage bat";
  if (contact >= 76) return "Table-setter";
  return "Depth bat";
}

function pitcherArchetype(profile: MlbPlayerProfileCard) {
  const k = score(trait(profile, "strikeout")) ?? 0;
  const stamina = score(trait(profile, "stamina")) ?? 0;
  const prevention = score(trait(profile, "run_prevention")) ?? 0;
  const damage = score(trait(profile, "damage_avoidance")) ?? 0;
  if (profile.role === "STARTER" && k >= 82 && stamina >= 75) return "Strikeout workhorse";
  if (profile.role === "STARTER" && prevention >= 82) return "Run-prevention starter";
  if (k >= 84) return "Bat-missing arm";
  if (damage >= 82) return "Contact-management arm";
  return profile.role === "RELIEVER" ? "Bullpen piece" : "Pitching depth";
}

function archetype(profile: MlbPlayerProfileCard) {
  return profile.role === "BATTER" ? hitterArchetype(profile) : pitcherArchetype(profile);
}

function toneFor(scoreValue: number | null): MlbPlayerProfileInsight["tone"] {
  if (scoreValue == null) return "neutral";
  if (scoreValue >= 86) return "elite";
  if (scoreValue >= 75) return "good";
  if (scoreValue >= 62) return "watch";
  return "risk";
}

function xFactors(profile: MlbPlayerProfileCard): MlbPlayerProfileInsight[] {
  const strongest = [...profile.traits].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 3);
  const base: MlbPlayerProfileInsight[] = strongest.map((item) => ({
    key: item.key,
    label: item.label,
    value: item.score == null ? "—" : String(item.score),
    note: item.note,
    tone: toneFor(item.score)
  }));

  base.push({
    key: "run_impact",
    label: "Projected run impact",
    value: signed(profile.modelImpact.projectedRunImpact),
    note: "Directional player-level contribution used to explain team and market movement.",
    tone: (profile.modelImpact.projectedRunImpact ?? 0) > 0.15 ? "good" : (profile.modelImpact.projectedRunImpact ?? 0) < -0.15 ? "risk" : "watch"
  });

  return base;
}

function weaknesses(profile: MlbPlayerProfileCard): MlbPlayerProfileWeakness[] {
  return [...profile.traits]
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101))
    .slice(0, 3)
    .map((item) => ({ key: item.key, label: item.label, score: item.score, note: item.note }));
}

function riskFlags(profile: MlbPlayerProfileCard): MlbPlayerProfileInsight[] {
  const flags: MlbPlayerProfileInsight[] = [];
  if (profile.confidenceTier === "LOW" || profile.confidenceTier === "DATA_GAP") {
    flags.push({ key: "confidence", label: "Data confidence", value: profile.confidenceTier, note: "Model should avoid over-weighting this card until fresher source rows exist.", tone: "risk" });
  }
  for (const item of profile.traits) {
    if (item.score != null && item.score < 55) {
      flags.push({ key: item.key, label: item.label, value: String(item.score), note: item.note, tone: "risk" });
    }
  }
  if (!flags.length) {
    flags.push({ key: "clean_profile", label: "Risk profile", value: "No major flags", note: "No trait below the current risk threshold.", tone: "good" });
  }
  return flags.slice(0, 4);
}

function bettingAngles(profile: MlbPlayerProfileCard): MlbPlayerProfileBettingAngle[] {
  const angles: MlbPlayerProfileBettingAngle[] = [];
  const overall = profile.overall ?? 0;
  const impact = profile.modelImpact.projectedRunImpact ?? 0;
  if (profile.role === "BATTER") {
    const power = score(trait(profile, "power")) ?? 0;
    const contact = score(trait(profile, "contact")) ?? 0;
    const discipline = score(trait(profile, "discipline")) ?? 0;
    if (power >= 82) angles.push({ market: "Player props", angle: "HR / total bases / RBI watch", confidence: power >= 90 ? "HIGH" : "MEDIUM", reason: "Power trait is strong enough to affect damage markets when matchup context agrees." });
    if (contact >= 82) angles.push({ market: "Player props", angle: "Hits / bases watch", confidence: contact >= 90 ? "HIGH" : "MEDIUM", reason: "Contact trait supports hit probability and ball-in-play pressure." });
    if (discipline >= 82) angles.push({ market: "Team totals", angle: "On-base and inning-extension support", confidence: "MEDIUM", reason: "Discipline trait can extend innings and raise run-distribution tails." });
    if (impact >= 0.15) angles.push({ market: "Moneyline / team total", angle: "Positive lineup contribution", confidence: overall >= 82 ? "HIGH" : "MEDIUM", reason: "Player-level run impact is above card threshold." });
  } else {
    const k = score(trait(profile, "strikeout")) ?? 0;
    const stamina = score(trait(profile, "stamina")) ?? 0;
    const prevention = score(trait(profile, "run_prevention")) ?? 0;
    const damage = score(trait(profile, "damage_avoidance")) ?? 0;
    if (k >= 82) angles.push({ market: "Pitcher strikeouts", angle: "K-over candidate when umpire/opponent K profile agrees", confidence: k >= 90 ? "HIGH" : "MEDIUM", reason: "Strikeout grade is a primary prop-market driver." });
    if (stamina >= 80) angles.push({ market: "Pitcher outs", angle: "Outs-over candidate if game script stays clean", confidence: stamina >= 88 ? "HIGH" : "MEDIUM", reason: "Stamina profile supports workload and deeper start projection." });
    if (prevention >= 82) angles.push({ market: "F5 / opponent team total", angle: "Run suppression lean", confidence: prevention >= 90 ? "HIGH" : "MEDIUM", reason: "Run prevention trait supports first-five and opponent-total markets." });
    if (damage < 55) angles.push({ market: "NRFI/YRFI", angle: "YRFI volatility warning", confidence: "LOW", reason: "Damage avoidance is thin, raising one-swing risk." });
  }

  if (!angles.length) {
    angles.push({ market: "Model context", angle: "No standalone bet angle", confidence: "LOW", reason: "Use this card as supporting context until a stronger trait edge appears." });
  }
  return angles.slice(0, 5);
}

function scoutingSummary(profile: MlbPlayerProfileCard, percentile: number | null) {
  return [
    `${profile.name} profiles as a ${archetype(profile).toLowerCase()} with ${profile.overall ?? "—"}/100 overall and ${rankLabel(percentile).toLowerCase()} standing.`,
    `Model contribution sits at ${signed(profile.modelImpact.projectedRunImpact)} runs and ${signed(profile.modelImpact.winProbabilityImpactPct, "%")} win probability impact before full matchup context.`,
    `Primary prop note: ${profile.modelImpact.propSignal}`
  ];
}

export async function getMlbPlayerProfileInsight(playerId: string): Promise<MlbPlayerProfileInsightReport | null> {
  const [profile, peers] = await Promise.all([
    getMlbPlayerProfile(playerId),
    getMlbPlayerProfiles({ limit: 250 })
  ]);
  if (!profile) return null;
  const percentile = percentileFor(profile, peers.profiles);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    profile,
    archetype: archetype(profile),
    percentile,
    rankLabel: rankLabel(percentile),
    strongestTraits: [...profile.traits].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 4),
    weakestTraits: weaknesses(profile),
    xFactors: xFactors(profile),
    bettingAngles: bettingAngles(profile),
    riskFlags: riskFlags(profile),
    scoutingSummary: scoutingSummary(profile, percentile),
    warnings: peers.warnings
  };
}
