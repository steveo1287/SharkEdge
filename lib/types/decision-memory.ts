import type {
  ChangeDirection,
  ChangeIntelligenceView,
  ChangeSeverity,
  DecisionStateRecord
} from "@/lib/types/change-intelligence";

export type DecisionMemorySummary = {
  currentSemanticSignature: string | null;
  latestChangeSignature: string | null;
  lastChangeSeverity: ChangeSeverity | null;
  lastChangeDirection: ChangeDirection | null;
  shortExplanation: string | null;
  lastMeaningfulChangeAt: string | null;
  updatedAt: string;
};

export type DecisionMemoryRecord = {
  version: 1;
  decisionState: DecisionStateRecord | null;
  latestChange: ChangeIntelligenceView | null;
  latestSummary: DecisionMemorySummary;
};

export type DecisionMemorySyncResult = {
  previousMemory: DecisionMemoryRecord | null;
  nextMemory: DecisionMemoryRecord;
  changed: boolean;
};

export type DecisionMemoryLookup = {
  key: string;
  memory: DecisionMemoryRecord;
};
