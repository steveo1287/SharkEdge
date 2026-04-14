import type {
  MarketEfficiencyClass,
  OpportunityEdgeDecayView
} from "@/lib/types/opportunity";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getEfficiencyDecayMultiplier(classification: MarketEfficiencyClass) {
  switch (classification) {
    case "HIGH_EFFICIENCY":
      return 1.35;
    case "MID_EFFICIENCY":
      return 1;
    case "LOW_EFFICIENCY":
      return 0.82;
    case "FRAGMENTED_PROP":
      return 0.74;
    case "THIN_SPECIALTY":
      return 0.68;
  }
}

function getLabel(args: {
  penalty: number;
  compressed: boolean;
  freshnessMinutes: number | null;
}): OpportunityEdgeDecayView["label"] {
  if (args.compressed) {
    return "COMPRESSED";
  }

  if (args.freshnessMinutes !== null && args.freshnessMinutes >= 45) {
    return "STALE";
  }

  if (args.penalty >= 18) {
    return "DECAYING";
  }

  if (args.penalty >= 8) {
    return "AGING";
  }

  return "FRESH";
}

export function buildOpportunityEdgeDecay(args: {
  expectedValuePct: number | null;
  fairLineGap: number | null;
  providerFreshnessMinutes: number | null;
  snapshotAgeSeconds?: number | null;
  lineMovement: number | null;
  bestPriceFlag: boolean;
  marketEfficiency: MarketEfficiencyClass;
}): OpportunityEdgeDecayView {
  const minutesSinceSnapshot =
    args.providerFreshnessMinutes ??
    (typeof args.snapshotAgeSeconds === "number"
      ? Math.round(args.snapshotAgeSeconds / 60)
      : null);
  const minutesSinceDetection = minutesSinceSnapshot;
  const movementMagnitude = Math.abs(args.lineMovement ?? 0);
  const ev = args.expectedValuePct ?? 0;
  const fairGap = Math.abs(args.fairLineGap ?? 0);
  const compressed =
    !args.bestPriceFlag ||
    (ev > 0 && ev < 0.75) ||
    (fairGap > 0 && fairGap < 4 && movementMagnitude >= 4);
  const agePenalty =
    minutesSinceSnapshot === null
      ? 4
      : clamp(minutesSinceSnapshot * 0.38, 0, 24);
  const movementPenalty = clamp(movementMagnitude * 0.55, 0, 16);
  const compressionPenalty = compressed ? 12 : 0;
  const penalty = Math.round(
    clamp(
      (agePenalty + movementPenalty + compressionPenalty) *
        getEfficiencyDecayMultiplier(args.marketEfficiency),
      0,
      45
    )
  );
  const label = getLabel({
    penalty,
    compressed,
    freshnessMinutes: minutesSinceSnapshot
  });

  const notes = [
    minutesSinceSnapshot === null
      ? "No reliable snapshot age is attached."
      : `${minutesSinceSnapshot}m since the latest market snapshot.`,
    compressed
      ? "Tradable edge is compressed or no longer confirmed as best price."
      : "Tradable edge has not compressed yet.",
    `${args.marketEfficiency.replace(/_/g, " ").toLowerCase()} regime controls decay speed.`
  ];

  return {
    score: Math.round(clamp(100 - penalty, 0, 100)),
    penalty,
    label,
    minutesSinceDetection,
    minutesSinceSnapshot,
    compressed,
    notes
  };
}
