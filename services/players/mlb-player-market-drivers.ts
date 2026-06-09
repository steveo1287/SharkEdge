import { getMlbPlayerProfiles, type MlbPlayerProfileCard, type MlbPlayerTrait } from "@/services/players/mlb-player-profiles";

export type MlbPlayerDriverMarket = "moneyline" | "team_total" | "first_five" | "pitcher_strikeouts" | "pitcher_outs" | "nrfi_yrfi" | "player_props" | "all";

export type MlbPlayerMarketDriver = {
  playerId: string;
  name: string;
  team: string;
  role: MlbPlayerProfileCard["role"];
  roleTier: string;
  overall: number | null;
  driverScore: number;
  market: MlbPlayerDriverMarket;
  href: string;
  primaryTrait: MlbPlayerTrait | null;
  secondaryTrait: MlbPlayerTrait | null;
  projectedRunImpact: number | null;
  winProbabilityImpactPct: number | null;
  propSignal: string;
  reasons: string[];
  riskNotes: string[];
};

export type MlbPlayerMarketDriverBoard = {
  ok: boolean;
  generatedAt: string;
  market: MlbPlayerDriverMarket;
  team: string | null;
  count: number;
  drivers: MlbPlayerMarketDriver[];
  marketNotes: string[];
  warnings: string[];
};

const MARKETS = new Set<MlbPlayerDriverMarket>(["moneyline", "team_total", "first_five", "pitcher_strikeouts", "pitcher_outs", "nrfi_yrfi", "player_props", "all"]);

function normalizeMarket(value: string | null | undefined): MlbPlayerDriverMarket {
  const key = String(value ?? "all").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") as MlbPlayerDriverMarket;
  return MARKETS.has(key) ? key : "all";
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function trait(profile: MlbPlayerProfileCard, key: string) {
  return profile.traits.find((item) => item.key === key) ?? null;
}

function traitScore(profile: MlbPlayerProfileCard, key: string, fallback = 70) {
  const value = trait(profile, key)?.score;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function strongestTraits(profile: MlbPlayerProfileCard) {
  const sorted = [...profile.traits].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return [sorted[0] ?? null, sorted[1] ?? null] as const;
}

function baseScore(profile: MlbPlayerProfileCard) {
  const overall = profile.overall ?? 70;
  const confidence = profile.confidenceTier === "HIGH" ? 8 : profile.confidenceTier === "MEDIUM" ? 4 : profile.confidenceTier === "LOW" ? -4 : -10;
  const runImpact = Math.abs(profile.modelImpact.projectedRunImpact ?? 0) * 18;
  const winImpact = Math.abs(profile.modelImpact.winProbabilityImpactPct ?? 0) * 1.3;
  return overall * 0.66 + confidence + runImpact + winImpact;
}

function moneylineScore(profile: MlbPlayerProfileCard) {
  const roleBoost = profile.role === "STARTER" ? 13 : profile.role === "BATTER" ? 8 : profile.role === "RELIEVER" ? 4 : 2;
  const prevention = traitScore(profile, "run_prevention");
  const power = traitScore(profile, "power");
  const contact = traitScore(profile, "contact");
  return baseScore(profile) + roleBoost + (profile.role === "STARTER" ? prevention * 0.18 : (power + contact) * 0.08);
}

function teamTotalScore(profile: MlbPlayerProfileCard) {
  if (profile.role !== "BATTER") return baseScore(profile) - 18;
  return baseScore(profile) + traitScore(profile, "power") * 0.24 + traitScore(profile, "contact") * 0.16 + traitScore(profile, "discipline") * 0.12;
}

function firstFiveScore(profile: MlbPlayerProfileCard) {
  if (profile.role === "STARTER") return baseScore(profile) + traitScore(profile, "run_prevention") * 0.28 + traitScore(profile, "stamina") * 0.1;
  if (profile.role === "BATTER") return baseScore(profile) + traitScore(profile, "power") * 0.12 + traitScore(profile, "contact") * 0.1;
  return baseScore(profile) - 18;
}

function strikeoutScore(profile: MlbPlayerProfileCard) {
  if (profile.role !== "STARTER" && profile.role !== "PITCHER" && profile.role !== "RELIEVER") return baseScore(profile) - 35;
  return baseScore(profile) + traitScore(profile, "strikeout") * 0.42 + traitScore(profile, "stamina") * 0.16 + traitScore(profile, "freshness") * 0.08;
}

function outsScore(profile: MlbPlayerProfileCard) {
  if (profile.role !== "STARTER") return baseScore(profile) - 45;
  return baseScore(profile) + traitScore(profile, "stamina") * 0.44 + traitScore(profile, "run_prevention") * 0.18 + traitScore(profile, "freshness") * 0.14;
}

function nrfiScore(profile: MlbPlayerProfileCard) {
  if (profile.role === "STARTER") return baseScore(profile) + traitScore(profile, "run_prevention") * 0.24 + traitScore(profile, "damage_avoidance") * 0.2;
  if (profile.role === "BATTER") return baseScore(profile) + traitScore(profile, "power") * 0.14 + traitScore(profile, "contact") * 0.08;
  return baseScore(profile) - 20;
}

function playerPropScore(profile: MlbPlayerProfileCard) {
  if (profile.role === "BATTER") return baseScore(profile) + Math.max(traitScore(profile, "power"), traitScore(profile, "contact"), traitScore(profile, "discipline")) * 0.32;
  return baseScore(profile) + Math.max(traitScore(profile, "strikeout"), traitScore(profile, "stamina"), traitScore(profile, "run_prevention")) * 0.32;
}

function scoreForMarket(profile: MlbPlayerProfileCard, market: MlbPlayerDriverMarket) {
  switch (market) {
    case "moneyline": return moneylineScore(profile);
    case "team_total": return teamTotalScore(profile);
    case "first_five": return firstFiveScore(profile);
    case "pitcher_strikeouts": return strikeoutScore(profile);
    case "pitcher_outs": return outsScore(profile);
    case "nrfi_yrfi": return nrfiScore(profile);
    case "player_props": return playerPropScore(profile);
    case "all": return Math.max(moneylineScore(profile), teamTotalScore(profile), firstFiveScore(profile), strikeoutScore(profile), outsScore(profile), nrfiScore(profile), playerPropScore(profile));
  }
}

function marketReasons(profile: MlbPlayerProfileCard, market: MlbPlayerDriverMarket) {
  const reasons = [`${profile.role} profile at ${profile.overall ?? "—"}/100 overall with ${profile.confidenceTier} confidence.`];
  if (market === "moneyline" || market === "all") reasons.push("Moneyline driver score blends starter strength, lineup value, player impact, and confidence.");
  if (market === "team_total" && profile.role === "BATTER") reasons.push("Team-total driver uses power, contact, discipline, and projected run contribution.");
  if (market === "first_five") reasons.push("First-five driver emphasizes starters and top-lineup pressure before bullpens dominate.");
  if (market === "pitcher_strikeouts") reasons.push("Strikeout driver emphasizes K grade, stamina, and freshness.");
  if (market === "pitcher_outs") reasons.push("Outs driver emphasizes stamina, run prevention, and low workload risk.");
  if (market === "nrfi_yrfi") reasons.push("NRFI/YRFI driver pairs early-run bats with starter damage avoidance.");
  if (market === "player_props") reasons.push(profile.modelImpact.propSignal);
  return reasons.slice(0, 4);
}

function riskNotes(profile: MlbPlayerProfileCard, market: MlbPlayerDriverMarket) {
  const notes: string[] = [];
  if (profile.confidenceTier === "LOW" || profile.confidenceTier === "DATA_GAP") notes.push(`Data confidence is ${profile.confidenceTier}.`);
  const weak = [...profile.traits].sort((a, b) => (a.score ?? 101) - (b.score ?? 101))[0];
  if (weak?.score != null && weak.score < 58) notes.push(`${weak.label} is thin at ${weak.score}.`);
  if (market === "pitcher_outs" && profile.role === "STARTER" && traitScore(profile, "freshness") < 62) notes.push("Freshness/workload profile is a possible outs-market limiter.");
  if (market === "nrfi_yrfi" && profile.role === "STARTER" && traitScore(profile, "damage_avoidance") < 62) notes.push("Damage avoidance is thin for NRFI risk control.");
  return notes.length ? notes.slice(0, 3) : ["No major driver-specific risk flag." ];
}

function driver(profile: MlbPlayerProfileCard, market: MlbPlayerDriverMarket): MlbPlayerMarketDriver {
  const [primaryTrait, secondaryTrait] = strongestTraits(profile);
  return {
    playerId: profile.playerId,
    name: profile.name,
    team: profile.team,
    role: profile.role,
    roleTier: profile.roleTier,
    overall: profile.overall,
    driverScore: round(clamp(scoreForMarket(profile, market), 0, 100), 1),
    market,
    href: `/player-profiles/${encodeURIComponent(profile.playerId)}`,
    primaryTrait,
    secondaryTrait,
    projectedRunImpact: profile.modelImpact.projectedRunImpact,
    winProbabilityImpactPct: profile.modelImpact.winProbabilityImpactPct,
    propSignal: profile.modelImpact.propSignal,
    reasons: marketReasons(profile, market),
    riskNotes: riskNotes(profile, market)
  };
}

function marketNotes(market: MlbPlayerDriverMarket) {
  const notes: Record<MlbPlayerDriverMarket, string[]> = {
    moneyline: ["Best used as explanation support for win probability movement.", "Prioritize starters, elite bats, and high-confidence profiles."],
    team_total: ["Best used for lineup pressure and run-distribution tails.", "Prioritize power/contact/discipline bats."],
    first_five: ["Best used for starter-vs-lineup framing.", "Bullpen is intentionally de-emphasized."],
    pitcher_strikeouts: ["Best used for K-market shortlists.", "Needs opponent K profile and price before betting."],
    pitcher_outs: ["Best used for workload and outs-market shortlists.", "Needs pitch count, bullpen state, and game script."],
    nrfi_yrfi: ["Best used for first-inning run-context explanation.", "Pair top-order bats against starter damage avoidance."],
    player_props: ["Best used for prop-market shortlists.", "Needs posted line, price, matchup, and lineup spot."],
    all: ["Cross-market player driver ranking.", "Use market filters to narrow action-specific explanations."]
  };
  return notes[market];
}

export async function getMlbPlayerMarketDrivers(args: { market?: string | null; team?: string | null; limit?: number | null }): Promise<MlbPlayerMarketDriverBoard> {
  const market = normalizeMarket(args.market);
  const data = await getMlbPlayerProfiles({ team: args.team, limit: 250 });
  const limit = Math.max(1, Math.min(100, Math.round(args.limit ?? 40)));
  const drivers = data.profiles
    .map((profile) => driver(profile, market))
    .filter((item) => item.driverScore >= 45)
    .sort((a, b) => b.driverScore - a.driverScore || (b.overall ?? 0) - (a.overall ?? 0))
    .slice(0, limit);
  const warnings = [...data.warnings];
  if (!drivers.length) warnings.push("No player market drivers met the current threshold.");
  return {
    ok: data.ok,
    generatedAt: new Date().toISOString(),
    market,
    team: args.team?.trim() || null,
    count: drivers.length,
    drivers,
    marketNotes: marketNotes(market),
    warnings
  };
}
