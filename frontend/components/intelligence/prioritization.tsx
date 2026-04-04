import { Badge } from "@/components/ui/badge";
import type { PrioritizationView } from "@/lib/types/prioritization";

export function hasRenderablePrioritization(
  prioritization: PrioritizationView | null | undefined
) {
  return Boolean(prioritization?.surfaced);
}

export function getPrioritizationTone(prioritization: PrioritizationView | null | undefined) {
  if (!prioritization || !prioritization.surfaced) {
    return "muted" as const;
  }

  if (prioritization.attentionTier === "critical" || prioritization.attentionDirection === "rising") {
    return "success" as const;
  }

  if (prioritization.attentionDirection === "falling") {
    return "danger" as const;
  }

  if (prioritization.attentionDirection === "mixed") {
    return "premium" as const;
  }

  return prioritization.attentionTier === "high" ? "brand" as const : "muted" as const;
}

export function getPrioritizationLabel(prioritization: PrioritizationView | null | undefined) {
  if (!prioritization || !prioritization.surfaced) {
    return "Hidden";
  }

  return prioritization.shortAttentionLabel;
}

export function getPrioritizationExplanation(
  prioritization: PrioritizationView | null | undefined
) {
  if (!prioritization || !prioritization.surfaced) {
    return null;
  }

  if (
    typeof prioritization.shortAttentionExplanation !== "string" ||
    prioritization.shortAttentionExplanation.trim().length === 0
  ) {
    return null;
  }

  return prioritization.shortAttentionExplanation;
}

export function PrioritizationBadge({
  prioritization
}: {
  prioritization: PrioritizationView | null | undefined;
}) {
  if (!hasRenderablePrioritization(prioritization)) {
    return null;
  }

  return <Badge tone={getPrioritizationTone(prioritization)}>{getPrioritizationLabel(prioritization)}</Badge>;
}
