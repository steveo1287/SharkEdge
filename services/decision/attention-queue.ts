import type { ChangeIntelligenceView } from "@/lib/types/change-intelligence";
import type { DecisionMemorySummary } from "@/lib/types/decision-memory";
import type { DecisionView } from "@/lib/types/decision";
import type { PrioritizationView } from "@/lib/types/prioritization";
import { buildPrioritizationView } from "@/services/decision/prioritization-engine";

type AttentionSemantics = {
  decision: DecisionView | null;
  changeIntelligence?: ChangeIntelligenceView | null;
  summary?: DecisionMemorySummary | null;
};

type AttentionQueueOptions<T> = {
  getSecondarySortValue?: (item: T) => number | null | undefined;
};

type AttentionQueueItem<T> = T & {
  prioritization: PrioritizationView;
};

function compareSecondarySortValues(
  left: number | null | undefined,
  right: number | null | undefined
) {
  const leftValue = typeof left === "number" && Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY;
  const rightValue = typeof right === "number" && Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY;

  return rightValue - leftValue;
}

export function attachPrioritization<T extends AttentionSemantics>(
  item: T
): AttentionQueueItem<T> {
  return {
    ...item,
    prioritization: buildPrioritizationView({
      decision: item.decision,
      change: item.changeIntelligence ?? null,
      summary: item.summary ?? null
    })
  };
}

export function rankAttentionQueue<T extends { prioritization: PrioritizationView }>(
  items: T[],
  options: AttentionQueueOptions<T> = {}
) {
  return [...items].sort((left, right) => {
    const weightDelta = right.prioritization.sortWeight - left.prioritization.sortWeight;
    if (weightDelta !== 0) {
      return weightDelta;
    }

    if (options.getSecondarySortValue) {
      const secondaryDelta = compareSecondarySortValues(
        options.getSecondarySortValue(left),
        options.getSecondarySortValue(right)
      );

      if (secondaryDelta !== 0) {
        return secondaryDelta;
      }
    }

    return right.prioritization.stableAttentionSignature.localeCompare(
      left.prioritization.stableAttentionSignature
    );
  });
}

export function buildAttentionQueue<T extends AttentionSemantics>(
  items: T[],
  options: AttentionQueueOptions<AttentionQueueItem<T>> = {}
) {
  const prioritized = items.map(attachPrioritization);
  return rankAttentionQueue(prioritized, options);
}
