import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type {
  OpportunityActionState,
  OpportunityHomeSnapshot,
  OpportunityView
} from "@/lib/types/opportunity";

type ActionBucketConfig = {
  key: OpportunityActionState;
  label: string;
  description: string;
  tone: "success" | "premium" | "brand" | "danger";
};

const ACTION_BUCKETS: ActionBucketConfig[] = [
  {
    key: "BET_NOW",
    label: "Bet now",
    description: "The cleanest current windows with enough posture to act.",
    tone: "success"
  },
  {
    key: "WAIT",
    label: "Wait",
    description: "Idea is still alive, but the price or confirmation is not there yet.",
    tone: "premium"
  },
  {
    key: "WATCH",
    label: "Watch",
    description: "Worth tracking, not worth forcing into the slip yet.",
    tone: "brand"
  },
  {
    key: "PASS",
    label: "Pass",
    description: "Trap risk, weak posture, or too much uncertainty to lead with.",
    tone: "danger"
  }
];

function dedupeOpportunities(opportunities: OpportunityView[]) {
  return Array.from(
    new Map(opportunities.map((opportunity) => [opportunity.id, opportunity])).values()
  );
}

function formatOdds(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "No price";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function buildActionUniverse(snapshot: OpportunityHomeSnapshot) {
  return dedupeOpportunities([
    ...snapshot.boardTop,
    ...snapshot.propsTop,
    ...snapshot.timingWindows,
    ...snapshot.traps
  ]);
}

function getBucketItems(
  opportunities: OpportunityView[],
  actionState: OpportunityActionState
) {
  return opportunities.filter((opportunity) => opportunity.actionState === actionState);
}

function ActionBucketCard({
  config,
  items
}: {
  config: ActionBucketConfig;
  items: OpportunityView[];
}) {
  const lead = items[0] ?? null;

  return (
    <Card className="surface-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.22em] text-slate-500">
            {config.label}
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">{items.length}</div>
        </div>
        <Badge tone={config.tone}>{config.label}</Badge>
      </div>

      <div className="mt-3 text-sm leading-6 text-slate-400">
        {config.description}
      </div>

      <div className="mt-4 rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-4">
        {lead ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">
                {lead.selectionLabel}
              </div>
              <div className="text-sm font-semibold text-sky-300">
                {formatOdds(lead.displayOddsAmerican)}
              </div>
            </div>

            <div className="text-sm text-slate-400">{lead.eventLabel}</div>

            <div className="text-sm leading-6 text-slate-300">
              {lead.reasonSummary}
            </div>

            <div className="grid gap-2 text-sm text-slate-400">
              <div>
                <span className="font-medium text-white">Why now: </span>
                {lead.whyItShows[0] ?? "No specific support note attached."}
              </div>
              <div>
                <span className="font-medium text-white">Risk: </span>
                {lead.whatCouldKillIt[0] ?? "No major kill switch surfaced on this pass."}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Badge tone={config.tone}>{lead.confidenceTier}</Badge>
              {lead.sportsbookName ? (
                <Badge tone="muted">{lead.sportsbookName}</Badge>
              ) : null}
              {lead.bookCount > 0 ? (
                <Badge tone="muted">{lead.bookCount} books</Badge>
              ) : null}
            </div>

            <div className="pt-1">
              <Link
                href={`/game/${lead.eventId}`}
                className="rounded-full bg-sky-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
              >
                Open matchup
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-sm leading-7 text-slate-400">
            No qualified items are landing in this bucket on the current pass.
          </div>
        )}
      </div>
    </Card>
  );
}

export function HomeActionMatrix({
  snapshot
}: {
  snapshot: OpportunityHomeSnapshot;
}) {
  const universe = buildActionUniverse(snapshot);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {ACTION_BUCKETS.map((config) => (
        <ActionBucketCard
          key={config.key}
          config={config}
          items={getBucketItems(universe, config.key)}
        />
      ))}
    </div>
  );
}