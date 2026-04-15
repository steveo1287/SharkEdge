import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { ChangeIntelligenceView, DecisionStateRecord } from "@/lib/types/change-intelligence";
import type { DecisionMemoryRecord, DecisionMemorySummary } from "@/lib/types/decision-memory";
import { DEFAULT_USER_ID } from "@/services/account/user-service";
import {
  isChangeIntelligenceView,
  parseDecisionStateRecord
} from "@/services/decision/change-intelligence";

const DECISION_MEMORY_KEY = "semanticMemory";

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export function toRecord(raw: Prisma.JsonValue | Prisma.InputJsonValue | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  return raw as Record<string, unknown>;
}

function buildLegacyDecisionMemorySummary(
  decisionState: DecisionStateRecord | null,
  latestChange: ChangeIntelligenceView | null
): DecisionMemorySummary {
  const meaningfulChange =
    latestChange &&
    latestChange.changeSeverity !== "none" &&
    latestChange.shortExplanation.trim().length > 0;
  const updatedAt =
    latestChange?.currentRecordedAt ??
    decisionState?.recordedAt ??
    "1970-01-01T00:00:00.000Z";

  return {
    currentSemanticSignature: decisionState?.decision?.dedupeSignature ?? null,
    latestChangeSignature: meaningfulChange ? latestChange.stableChangeSignature : null,
    lastChangeSeverity: meaningfulChange ? latestChange.changeSeverity : null,
    lastChangeDirection: meaningfulChange ? latestChange.changeDirection : null,
    shortExplanation: meaningfulChange ? latestChange.shortExplanation : null,
    lastMeaningfulChangeAt: meaningfulChange ? latestChange.currentRecordedAt : null,
    updatedAt
  };
}

function buildLegacyDecisionMemoryRecord(
  decisionState: DecisionStateRecord | null,
  latestChange: ChangeIntelligenceView | null
): DecisionMemoryRecord | null {
  if (!decisionState && !latestChange) {
    return null;
  }

  return {
    version: 1,
    decisionState,
    latestChange,
    latestSummary: buildLegacyDecisionMemorySummary(decisionState, latestChange)
  };
}

function isDecisionMemorySummary(value: unknown): value is DecisionMemoryRecord["latestSummary"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.currentSemanticSignature === null || typeof candidate.currentSemanticSignature === "string") &&
    (candidate.latestChangeSignature === null || typeof candidate.latestChangeSignature === "string") &&
    (candidate.lastChangeSeverity === null || typeof candidate.lastChangeSeverity === "string") &&
    (candidate.lastChangeDirection === null || typeof candidate.lastChangeDirection === "string") &&
    (candidate.shortExplanation === null || typeof candidate.shortExplanation === "string") &&
    (candidate.lastMeaningfulChangeAt === null || typeof candidate.lastMeaningfulChangeAt === "string") &&
    typeof candidate.updatedAt === "string"
  );
}

export function isDecisionMemoryRecord(value: unknown): value is DecisionMemoryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    (candidate.decisionState === null || parseDecisionStateRecord(candidate.decisionState) !== null) &&
    (candidate.latestChange === null || isChangeIntelligenceView(candidate.latestChange)) &&
    isDecisionMemorySummary(candidate.latestSummary)
  );
}

export function parseDecisionMemoryRecord(value: unknown): DecisionMemoryRecord | null {
  if (isDecisionMemoryRecord(value)) {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const decisionState = parseDecisionStateRecord(candidate.decisionState);
  const latestChange = isChangeIntelligenceView(candidate.latestChange)
    ? candidate.latestChange
    : isChangeIntelligenceView(candidate.changeIntelligence)
      ? candidate.changeIntelligence
      : null;

  return buildLegacyDecisionMemoryRecord(decisionState, latestChange);
}

export function getDecisionMemoryFromContextJson(raw: Prisma.JsonValue | Prisma.InputJsonValue | null) {
  const context = toRecord(raw);
  return parseDecisionMemoryRecord(context?.[DECISION_MEMORY_KEY] ?? context);
}

export function mergeDecisionMemoryIntoContextJson(
  raw: Prisma.JsonValue | Prisma.InputJsonValue | null,
  memory: DecisionMemoryRecord
) {
  return toJsonInput({
    ...(toRecord(raw) ?? {}),
    [DECISION_MEMORY_KEY]: memory
  });
}

export async function writeWatchlistDecisionMemory(args: {
  watchlistItemId: string;
  currentContextJson: Prisma.JsonValue | null;
  memory: DecisionMemoryRecord;
}) {
  await prisma.watchlistItem.update({
    where: {
      id: args.watchlistItemId,
      userId: DEFAULT_USER_ID
    },
    data: {
      contextJson: mergeDecisionMemoryIntoContextJson(args.currentContextJson, args.memory)
    }
  });
}

export function getDecisionMemoryFromEvaluationStateJson(raw: Prisma.JsonValue | Prisma.InputJsonValue | null) {
  const state = toRecord(raw);
  return parseDecisionMemoryRecord(state?.[DECISION_MEMORY_KEY] ?? state);
}

export function mergeDecisionMemoryIntoEvaluationStateJson(
  raw: Prisma.JsonValue | Prisma.InputJsonValue | null,
  memory: DecisionMemoryRecord,
  extras: Record<string, unknown> = {}
) {
  return toJsonInput({
    ...(toRecord(raw) ?? {}),
    ...extras,
    [DECISION_MEMORY_KEY]: memory
  });
}

export async function writeAlertRuleDecisionMemory(args: {
  alertRuleId: string;
  currentEvaluationStateJson: Prisma.JsonValue | null;
  memory: DecisionMemoryRecord;
  extras?: Record<string, unknown>;
  lastEvaluatedAt?: Date;
}) {
  await prisma.alertRule.update({
    where: {
      id: args.alertRuleId,
      userId: DEFAULT_USER_ID
    },
    data: {
      lastEvaluatedAt: args.lastEvaluatedAt,
      evaluationStateJson: mergeDecisionMemoryIntoEvaluationStateJson(
        args.currentEvaluationStateJson,
        args.memory,
        args.extras ?? {}
      )
    }
  });
}
