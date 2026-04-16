import type { ChangeIntelligenceView } from "@/lib/types/change-intelligence";
import type {
  DecisionMemoryRecord,
  DecisionMemorySummary,
  DecisionMemorySyncResult
} from "@/lib/types/decision-memory";
import type { DecisionView } from "@/lib/types/decision";
import {
  buildChangeIntelligence,
  buildDecisionStateRecord
} from "@/services/decision/change-intelligence";

function buildDecisionMemorySummary(args: {
  decision: DecisionView | null;
  change: ChangeIntelligenceView | null;
  previousMemory: DecisionMemoryRecord | null;
  recordedAt: string;
}): DecisionMemorySummary {
  const previousSummary = args.previousMemory?.latestSummary ?? null;
  const meaningfulChange =
    args.change &&
    args.change.changeSeverity !== "none" &&
    typeof args.change.shortExplanation === "string" &&
    args.change.shortExplanation.trim().length > 0;

  return {
    currentSemanticSignature: args.decision?.dedupeSignature ?? null,
    latestChangeSignature: meaningfulChange ? args.change!.stableChangeSignature : previousSummary?.latestChangeSignature ?? null,
    lastChangeSeverity: meaningfulChange ? args.change!.changeSeverity : previousSummary?.lastChangeSeverity ?? null,
    lastChangeDirection: meaningfulChange ? args.change!.changeDirection : previousSummary?.lastChangeDirection ?? null,
    shortExplanation: meaningfulChange ? args.change!.shortExplanation : previousSummary?.shortExplanation ?? null,
    lastMeaningfulChangeAt: meaningfulChange ? args.recordedAt : previousSummary?.lastMeaningfulChangeAt ?? null,
    updatedAt: args.recordedAt
  };
}

export function buildDecisionMemorySync(args: {
  previousMemory: DecisionMemoryRecord | null;
  decision: DecisionView | null;
  recordedAt?: string;
}): DecisionMemorySyncResult {
  const recordedAt = args.recordedAt ?? new Date().toISOString();
  const previousDecisionState = args.previousMemory?.decisionState ?? null;
  const nextDecisionState = buildDecisionStateRecord(args.decision, recordedAt);
  const latestChange = buildChangeIntelligence(previousDecisionState, args.decision, recordedAt);
  const latestSummary = buildDecisionMemorySummary({
    decision: args.decision,
    change: latestChange,
    previousMemory: args.previousMemory,
    recordedAt
  });

  const nextMemory: DecisionMemoryRecord = {
    version: 1,
    decisionState: nextDecisionState,
    latestChange,
    latestSummary
  };

  const previousSignature = args.previousMemory?.decisionState?.decision?.dedupeSignature ?? "no-decision";
  const nextSignature = nextDecisionState.decision?.dedupeSignature ?? "no-decision";
  const previousChangeSignature = args.previousMemory?.latestChange?.stableChangeSignature ?? "no-change";

  return {
    previousMemory: args.previousMemory,
    nextMemory,
    changed:
      previousSignature !== nextSignature ||
      previousChangeSignature !== latestChange.stableChangeSignature
  };
}

export function getLatestDecisionMemorySummary(memory: DecisionMemoryRecord | null) {
  return memory?.latestSummary ?? null;
}

export function isDecisionMemoryMissing(memory: DecisionMemoryRecord | null) {
  return !memory || !memory.decisionState;
}

export function isDecisionMemoryStale(memory: DecisionMemoryRecord | null, maxAgeMinutes = 30) {
  if (!memory) {
    return true;
  }

  const updatedAt = Date.parse(memory.latestSummary.updatedAt);
  if (Number.isNaN(updatedAt)) {
    return true;
  }

  return Date.now() - updatedAt > maxAgeMinutes * 60 * 1000;
}
