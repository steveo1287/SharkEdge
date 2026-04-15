import type { BoardSupportStatus, ProviderHealthState, ProviderHealthView } from "@/lib/types/domain";

type ProviderHealthInput = {
  supportStatus?: BoardSupportStatus | null;
  source: "live" | "mock" | "catalog";
  generatedAt?: string | null;
  lastUpdatedAt?: string | null;
  warnings?: string[];
  healthySummary: string;
  degradedSummary?: string;
  fallbackSummary: string;
  offlineSummary: string;
};

const MINUTE_IN_MS = 60 * 1000;

function getFreshnessMinutes(timestamp?: string | null) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - parsed) / MINUTE_IN_MS));
}

function getFreshnessLabel(minutes: number | null, state: ProviderHealthState) {
  if (minutes === null) {
    return state === "OFFLINE" ? "No live timestamp" : "Timestamp pending";
  }

  if (minutes <= 5) {
    return "Fresh";
  }

  if (minutes <= 20) {
    return "Aging";
  }

  return "Stale";
}

function buildDerivedWarnings(
  warnings: string[],
  source: ProviderHealthInput["source"],
  freshnessMinutes: number | null
) {
  const derived = [...warnings];

  if (source === "live" && freshnessMinutes === null) {
    derived.push("Live feed returned without a usable timestamp.");
  }

  if (source === "live" && freshnessMinutes !== null && freshnessMinutes > 20) {
    derived.push("Live feed timestamp is stale enough to treat this desk with caution.");
  }

  return Array.from(new Set(derived));
}

function resolveProviderHealthState(
  source: ProviderHealthInput["source"],
  supportStatus: ProviderHealthInput["supportStatus"],
  warnings: string[],
  freshnessMinutes: number | null
): ProviderHealthState {
  if (source !== "live") {
    return source === "catalog" ? "FALLBACK" : "OFFLINE";
  }

  if (supportStatus === "PARTIAL" || warnings.length || (freshnessMinutes !== null && freshnessMinutes > 20)) {
    return "DEGRADED";
  }

  if (supportStatus === "COMING_SOON") {
    return "FALLBACK";
  }

  return "HEALTHY";
}

function getStateLabel(state: ProviderHealthState) {
  switch (state) {
    case "HEALTHY":
      return "Healthy feed";
    case "DEGRADED":
      return "Degraded feed";
    case "FALLBACK":
      return "Fallback mode";
    default:
      return "Offline feed";
  }
}

export function buildProviderHealth(input: ProviderHealthInput): ProviderHealthView {
  const asOf = input.lastUpdatedAt ?? input.generatedAt ?? null;
  const freshnessMinutes = getFreshnessMinutes(asOf);
  const warnings = buildDerivedWarnings(
    (input.warnings ?? []).filter(Boolean),
    input.source,
    freshnessMinutes
  );
  const state = resolveProviderHealthState(
    input.source,
    input.supportStatus ?? null,
    warnings,
    freshnessMinutes
  );

  const summary =
    state === "HEALTHY"
      ? input.healthySummary
      : state === "DEGRADED"
        ? input.degradedSummary ?? input.healthySummary
        : state === "FALLBACK"
          ? input.fallbackSummary
          : input.offlineSummary;

  return {
    state,
    label: getStateLabel(state),
    summary,
    freshnessLabel: getFreshnessLabel(freshnessMinutes, state),
    freshnessMinutes,
    asOf,
    warnings
  };
}
