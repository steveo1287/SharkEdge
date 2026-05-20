export type ActiveUfcRosterInput = {
  payload?: unknown;
  hasUpcomingUfcFight?: boolean | null;
  hasRecentUfcFight?: boolean | null;
  recentUfcFightDate?: Date | string | null;
  ufcActivityCount?: number | null;
};

export type ActiveUfcRosterStatus = {
  active: boolean;
  signals: string[];
  blockers: string[];
  confidence: "high" | "medium" | "low";
  recentWindowMonths: number;
};

export const ACTIVE_UFC_RECENT_MONTHS = 24;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boolish(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "yes", "active", "current", "1", "under_contract"].includes(value.toLowerCase());
  return false;
}

function isoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function evaluateActiveUfcRosterStatus(input: ActiveUfcRosterInput): ActiveUfcRosterStatus {
  const payload = asRecord(input.payload);
  const roster = asRecord(payload.roster);
  const contract = asRecord(payload.contract);
  const canonical = asRecord(payload.canonicalProfile);
  const signals: string[] = [];

  if (input.hasUpcomingUfcFight) signals.push("upcoming_ufc_fight");
  if (input.hasRecentUfcFight) signals.push(`recent_ufc_fight_${ACTIVE_UFC_RECENT_MONTHS}mo`);
  const recentDate = isoDate(input.recentUfcFightDate);
  if (recentDate) signals.push(`last_ufc_fight:${recentDate}`);
  if ((input.ufcActivityCount ?? 0) > 0) signals.push(`ufc_activity_count:${input.ufcActivityCount}`);
  if (boolish(payload.activeUfcFighter) || boolish(payload.active) || boolish(payload.isActive) || boolish(payload.ufcActive)) signals.push("payload_active_flag");
  if (boolish(roster.active) || boolish(roster.current) || boolish(roster.underContract)) signals.push("roster_active_flag");
  if (boolish(contract.active) || boolish(contract.underContract)) signals.push("contract_active_flag");
  if (String(canonical.status ?? "") === "WHAT_IF_READY" && (input.hasRecentUfcFight || input.hasUpcomingUfcFight)) signals.push("canonical_current_with_activity");

  const uniqueSignals = [...new Set(signals)];
  const active = uniqueSignals.includes("upcoming_ufc_fight")
    || uniqueSignals.some((signal) => signal.startsWith("recent_ufc_fight"))
    || uniqueSignals.includes("payload_active_flag")
    || uniqueSignals.includes("roster_active_flag")
    || uniqueSignals.includes("contract_active_flag");

  const hardSignals = uniqueSignals.filter((signal) => signal === "upcoming_ufc_fight" || signal.startsWith("recent_ufc_fight") || signal === "roster_active_flag" || signal === "contract_active_flag");
  return {
    active,
    signals: uniqueSignals,
    blockers: active ? [] : ["inactive_or_unproven_active_ufc_roster"],
    confidence: hardSignals.length >= 2 || uniqueSignals.includes("upcoming_ufc_fight") ? "high" : active ? "medium" : "low",
    recentWindowMonths: ACTIVE_UFC_RECENT_MONTHS
  };
}

export function canUseActiveUfcWhatIfProfile(args: { canonicalStatus?: string | null; whatIfReady?: boolean | null; activeRoster: ActiveUfcRosterStatus; completenessScore?: number | null }) {
  const blockers: string[] = [];
  if (!args.activeRoster.active) blockers.push(...args.activeRoster.blockers);
  if (args.canonicalStatus !== "WHAT_IF_READY") blockers.push(`canonical_status:${args.canonicalStatus ?? "missing"}`);
  if (!args.whatIfReady) blockers.push("canonical_profile_not_what_if_ready");
  if ((args.completenessScore ?? 0) < 72) blockers.push("profile_score_below_72");
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}
