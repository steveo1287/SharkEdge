import type { LockedPickTicket } from "@/services/proof/locked-pick-tickets";
import { getMlbPlayerProfiles, type MlbPlayerProfileCard } from "@/services/players/mlb-player-profiles";

export type TicketPlayerEdge = {
  playerId: string;
  name: string;
  team: string;
  role: MlbPlayerProfileCard["role"];
  roleTier: string;
  overall: number | null;
  archetypeHint: string;
  href: string;
  insightHref: string;
  matchType: "PLAYER_NAME" | "TEAM_CONTEXT" | "MARKET_CONTEXT";
  matchStrength: number;
  modelRunImpact: number | null;
  modelWinProbabilityImpactPct: number | null;
  propSignal: string;
  reasons: string[];
};

export type TicketPlayerLinkReport = {
  ok: boolean;
  generatedAt: string;
  ticketId: string;
  ticketMarket: string;
  edgeCount: number;
  edges: TicketPlayerEdge[];
  warnings: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalize(value).split(" ").filter((token) => token.length >= 2));
}

function marketRolePreference(ticket: LockedPickTicket, profile: MlbPlayerProfileCard) {
  const text = normalize(`${ticket.marketLabel} ${ticket.pickLabel} ${ticket.sideLabel}`);
  if (/strikeout|pitcher|outs|earned|hits allowed|walks allowed/.test(text)) {
    return profile.role === "STARTER" || profile.role === "PITCHER" || profile.role === "RELIEVER" ? 18 : -12;
  }
  if (/hit|bases|home run|rbi|run scored|batter|stolen/.test(text)) {
    return profile.role === "BATTER" ? 18 : -12;
  }
  if (/moneyline|team total|first five|nrfi|yrfi|run line|total/.test(text)) {
    return profile.role === "STARTER" ? 8 : profile.role === "BATTER" ? 6 : 2;
  }
  return 0;
}

function nameScore(ticketText: string, profile: MlbPlayerProfileCard) {
  const name = normalize(profile.name);
  if (!name) return 0;
  if (ticketText.includes(name)) return 80;
  const nameTokens = tokens(profile.name);
  const textTokens = tokens(ticketText);
  const matches = [...nameTokens].filter((token) => textTokens.has(token)).length;
  if (!matches) return 0;
  return Math.min(65, matches * 24);
}

function teamScore(ticketText: string, profile: MlbPlayerProfileCard) {
  const team = normalize(profile.team);
  if (!team) return 0;
  if (ticketText.includes(team)) return 34;
  return 0;
}

function archetypeHint(profile: MlbPlayerProfileCard) {
  if (profile.role === "BATTER") {
    const power = profile.traits.find((trait) => trait.key === "power")?.score ?? 0;
    const contact = profile.traits.find((trait) => trait.key === "contact")?.score ?? 0;
    const discipline = profile.traits.find((trait) => trait.key === "discipline")?.score ?? 0;
    if (power >= 84) return "damage bat";
    if (contact >= 84) return "hit engine";
    if (discipline >= 84) return "on-base pressure";
    return "lineup piece";
  }
  const strikeout = profile.traits.find((trait) => trait.key === "strikeout")?.score ?? 0;
  const stamina = profile.traits.find((trait) => trait.key === "stamina")?.score ?? 0;
  const prevention = profile.traits.find((trait) => trait.key === "run_prevention")?.score ?? 0;
  if (strikeout >= 84 && stamina >= 75) return "strikeout workhorse";
  if (prevention >= 84) return "run suppressor";
  if (strikeout >= 84) return "bat-missing arm";
  return "pitching context";
}

function edgeFor(ticket: LockedPickTicket, profile: MlbPlayerProfileCard): TicketPlayerEdge | null {
  const ticketText = normalize(`${ticket.eventLabel} ${ticket.pickLabel} ${ticket.marketLabel} ${ticket.sideLabel}`);
  const nScore = nameScore(ticketText, profile);
  const tScore = teamScore(ticketText, profile);
  const mScore = marketRolePreference(ticket, profile);
  const overallBoost = Math.max(0, (profile.overall ?? 70) - 70) / 3;
  const strength = Math.round(nScore + tScore + mScore + overallBoost);
  if (strength < 28) return null;
  const matchType: TicketPlayerEdge["matchType"] = nScore >= 50 ? "PLAYER_NAME" : tScore > 0 ? "TEAM_CONTEXT" : "MARKET_CONTEXT";
  const reasons = [
    matchType === "PLAYER_NAME" ? "Ticket text directly matches this player." : matchType === "TEAM_CONTEXT" ? "Player belongs to a team named in the ticket context." : "Player role matches the ticket market type.",
    `${profile.role} profile: ${profile.overall ?? "—"}/100 overall, ${profile.confidenceTier} confidence.`,
    profile.modelImpact.propSignal
  ];
  return {
    playerId: profile.playerId,
    name: profile.name,
    team: profile.team,
    role: profile.role,
    roleTier: profile.roleTier,
    overall: profile.overall,
    archetypeHint: archetypeHint(profile),
    href: `/player-profiles/${encodeURIComponent(profile.playerId)}`,
    insightHref: `/api/mlb/players/${encodeURIComponent(profile.playerId)}/insights`,
    matchType,
    matchStrength: strength,
    modelRunImpact: profile.modelImpact.projectedRunImpact,
    modelWinProbabilityImpactPct: profile.modelImpact.winProbabilityImpactPct,
    propSignal: profile.modelImpact.propSignal,
    reasons
  };
}

export async function getTicketPlayerLinks(ticket: LockedPickTicket): Promise<TicketPlayerLinkReport> {
  const data = await getMlbPlayerProfiles({ limit: 250 });
  const edges = data.profiles
    .map((profile) => edgeFor(ticket, profile))
    .filter((edge): edge is TicketPlayerEdge => Boolean(edge))
    .sort((left, right) => right.matchStrength - left.matchStrength || (right.overall ?? 0) - (left.overall ?? 0))
    .slice(0, 8);
  const warnings = [...data.warnings];
  if (!edges.length) warnings.push("No player profile edges matched this ticket yet.");
  return {
    ok: data.ok,
    generatedAt: new Date().toISOString(),
    ticketId: ticket.ticketId,
    ticketMarket: ticket.marketLabel,
    edgeCount: edges.length,
    edges,
    warnings
  };
}
