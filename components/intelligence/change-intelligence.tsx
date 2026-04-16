import { Badge } from "@/components/ui/badge";
import type { ChangeIntelligenceView, ChangeReasonCode } from "@/lib/types/change-intelligence";
import type { DecisionMemorySummary } from "@/lib/types/decision-memory";

function formatDirection(direction: ChangeIntelligenceView["changeDirection"]) {
  switch (direction) {
    case "upgraded":
      return "Upgraded";
    case "downgraded":
      return "Downgraded";
    case "mixed":
      return "Mixed";
    default:
      return "No change";
  }
}

function formatSeverity(severity: ChangeIntelligenceView["changeSeverity"]) {
  switch (severity) {
    case "major":
      return "major";
    case "moderate":
      return "moderate";
    case "minor":
      return "minor";
    default:
      return "none";
  }
}

function formatSummaryDirection(direction: DecisionMemorySummary["lastChangeDirection"]) {
  switch (direction) {
    case "upgraded":
      return "Upgraded";
    case "downgraded":
      return "Downgraded";
    case "mixed":
      return "Mixed";
    default:
      return "No change";
  }
}

function formatSummarySeverity(severity: DecisionMemorySummary["lastChangeSeverity"]) {
  switch (severity) {
    case "major":
      return "major";
    case "moderate":
      return "moderate";
    case "minor":
      return "minor";
    default:
      return "none";
  }
}

function getReasonLabel(reason: ChangeReasonCode) {
  switch (reason) {
    case "recommendation_upgraded":
      return "Recommendation up";
    case "recommendation_downgraded":
      return "Recommendation down";
    case "priority_upgraded":
      return "Priority up";
    case "priority_downgraded":
      return "Priority down";
    case "action_shifted_to_bet_now":
      return "Bet now";
    case "action_shifted_to_wait":
      return "Wait";
    case "action_shifted_to_watch":
      return "Watch";
    case "action_shifted_to_pass":
      return "Pass";
    case "timing_became_live":
      return "Window open";
    case "timing_became_passive":
      return "Timing cooled";
    case "confidence_improved":
      return "Confidence up";
    case "confidence_weakened":
      return "Confidence down";
    case "trap_flag_added":
      return "Trap added";
    case "trap_flag_cleared":
      return "Trap cleared";
    case "alert_eligibility_gained":
      return "Alert gained";
    case "alert_eligibility_lost":
      return "Alert lost";
    case "stale_data_detected":
      return "Stale";
    case "stale_data_cleared":
      return "Fresh again";
    case "source_health_weakened":
      return "Source weaker";
    case "source_health_recovered":
      return "Source recovered";
    case "decision_appeared":
      return "Now tracked";
    case "decision_lost":
      return "Dropped out";
    default:
      return "Stable";
  }
}

export function hasRenderableChange(change: ChangeIntelligenceView | null | undefined) {
  return Boolean(
    change &&
      change.changeSeverity !== "none" &&
      typeof change.shortExplanation === "string" &&
      change.shortExplanation.trim().length > 0
  );
}

export function getChangeBadgeTone(change: ChangeIntelligenceView | null | undefined) {
  if (!change || change.changeSeverity === "none") {
    return "muted" as const;
  }

  if (change.changeDirection === "upgraded") {
    return "success" as const;
  }

  if (change.changeDirection === "downgraded") {
    return "danger" as const;
  }

  return "premium" as const;
}

export function getChangeBadgeLabel(change: ChangeIntelligenceView | null | undefined) {
  if (!change || change.changeSeverity === "none") {
    return "No change";
  }

  return `${formatDirection(change.changeDirection)} ${formatSeverity(change.changeSeverity)}`;
}

export function getChangeReasonLabels(change: ChangeIntelligenceView | null | undefined) {
  if (!hasRenderableChange(change)) {
    return [];
  }

  const renderableChange = change!;
  return renderableChange.changeReasons.slice(0, 3).map(getReasonLabel);
}

export function getChangeExplanation(change: ChangeIntelligenceView | null | undefined) {
  if (!hasRenderableChange(change)) {
    return null;
  }

  return change!.shortExplanation;
}

export function hasRenderableChangeSummary(summary: DecisionMemorySummary | null | undefined) {
  return Boolean(
    summary &&
      summary.lastChangeSeverity &&
      summary.lastChangeSeverity !== "none" &&
      summary.lastChangeDirection &&
      typeof summary.shortExplanation === "string" &&
      summary.shortExplanation.trim().length > 0
  );
}

export function getChangeSummaryBadgeTone(summary: DecisionMemorySummary | null | undefined) {
  if (!hasRenderableChangeSummary(summary)) {
    return "muted" as const;
  }

  const renderableSummary = summary!;

  if (renderableSummary.lastChangeDirection === "upgraded") {
    return "success" as const;
  }

  if (renderableSummary.lastChangeDirection === "downgraded") {
    return "danger" as const;
  }

  return "premium" as const;
}

export function getChangeSummaryBadgeLabel(summary: DecisionMemorySummary | null | undefined) {
  if (!hasRenderableChangeSummary(summary)) {
    return "No change";
  }

  const renderableSummary = summary!;
  return `${formatSummaryDirection(renderableSummary.lastChangeDirection)} ${formatSummarySeverity(renderableSummary.lastChangeSeverity)}`;
}

export function getChangeSummaryExplanation(summary: DecisionMemorySummary | null | undefined) {
  if (!hasRenderableChangeSummary(summary)) {
    return null;
  }

  return summary!.shortExplanation;
}

export function ChangeSummaryBadge({
  summary
}: {
  summary: DecisionMemorySummary | null | undefined;
}) {
  if (!hasRenderableChangeSummary(summary)) {
    return null;
  }

  return <Badge tone={getChangeSummaryBadgeTone(summary)}>{getChangeSummaryBadgeLabel(summary)}</Badge>;
}

export function ChangeBadge({
  change
}: {
  change: ChangeIntelligenceView | null | undefined;
}) {
  if (!hasRenderableChange(change)) {
    return null;
  }

  return <Badge tone={getChangeBadgeTone(change)}>{getChangeBadgeLabel(change)}</Badge>;
}
