import { Badge } from "@/components/ui/badge";
import type { OpportunitySnapshotView, OpportunityView } from "@/lib/types/opportunity";

type OpportunityPostureLike = Pick<
  OpportunityView,
  "id" | "actionState" | "opportunityScore" | "confidenceTier" | "trapFlags"
> &
  Partial<Pick<OpportunityView, "whatCouldKillIt">> &
  Partial<Pick<OpportunitySnapshotView, "killSummary">>;

export function formatOpportunityAction(actionState: OpportunityPostureLike["actionState"]) {
  return actionState.replace(/_/g, " ");
}

export function getOpportunityTone(actionState: OpportunityPostureLike["actionState"]) {
  if (actionState === "BET_NOW") {
    return "success" as const;
  }

  if (actionState === "WAIT") {
    return "brand" as const;
  }

  if (actionState === "WATCH") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function getOpportunityScoreBand(score: number) {
  if (score >= 85) {
    return { label: "Elite", tone: "success" as const };
  }

  if (score >= 70) {
    return { label: "Strong", tone: "brand" as const };
  }

  if (score >= 55) {
    return { label: "Watch", tone: "premium" as const };
  }

  return { label: "Pass", tone: "muted" as const };
}

export function getConfidenceTone(tier: OpportunityPostureLike["confidenceTier"]) {
  if (tier === "A") {
    return "success" as const;
  }

  if (tier === "B") {
    return "brand" as const;
  }

  if (tier === "C") {
    return "premium" as const;
  }

  return "muted" as const;
}

export function formatOpportunityTrap(flag: OpportunityPostureLike["trapFlags"][number]) {
  switch (flag) {
    case "STALE_EDGE":
      return "Stale edge";
    case "THIN_MARKET":
      return "Thin market";
    case "ONE_BOOK_OUTLIER":
      return "One-book outlier";
    case "FAKE_MOVE_RISK":
      return "Fake move risk";
    case "LOW_CONFIDENCE_FAIR_PRICE":
      return "Weak fair price";
    case "INJURY_UNCERTAINTY":
      return "Injury risk";
    case "HIGH_MARKET_DISAGREEMENT":
      return "Book disagreement";
    case "LOW_PROVIDER_HEALTH":
      return "Low feed health";
    case "MODEL_MARKET_CONFLICT":
      return "Model conflict";
default:
  return "Unknown";
  }
}

export function getOpportunityTrapLine(opportunity: OpportunityPostureLike) {
  if (Array.isArray(opportunity.whatCouldKillIt) && opportunity.whatCouldKillIt.length) {
    return opportunity.whatCouldKillIt[0];
  }

  if (typeof opportunity.killSummary === "string" && opportunity.killSummary.length) {
    return opportunity.killSummary;
  }

  if (opportunity.trapFlags.length) {
    return `${formatOpportunityTrap(opportunity.trapFlags[0])} is already in play.`;
  }

  return null;
}

export function OpportunityBadgeRow({ opportunity }: { opportunity: OpportunityPostureLike }) {
  const scoreBand = getOpportunityScoreBand(opportunity.opportunityScore);
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone={getOpportunityTone(opportunity.actionState)}>{formatOpportunityAction(opportunity.actionState)}</Badge>
      <Badge tone={getConfidenceTone(opportunity.confidenceTier)}>
        {opportunity.confidenceTier} confidence
      </Badge>
      <Badge tone={scoreBand.tone}>
        {scoreBand.label} {opportunity.opportunityScore}
      </Badge>
      {opportunity.trapFlags.slice(0, 2).map((flag) => (
        <Badge key={`${opportunity.id}-${flag}`} tone="danger">
          {formatOpportunityTrap(flag)}
        </Badge>
      ))}
    </div>
  );
}
