
import type {
  OpportunityTrendIntelligenceView,
  OpportunityTrendLensConfidence,
  OpportunityTrendLensView,
  OpportunityView
} from "@/lib/types/opportunity";
import {
  buildFeedNativeTrendContext,
  type FeedNativeLensAssessment
} from "@/services/trends/feed-native-context";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 0) {
  return Number(value.toFixed(digits));
}

function confidenceFromAssessment(
  score: number,
  evidenceCount: number,
  sourceStatus: FeedNativeLensAssessment["sourceStatus"]
): OpportunityTrendLensConfidence {
  const joinedBoost = sourceStatus === "JOINED" ? 8 : sourceStatus === "PAYLOAD_ONLY" ? 3 : 0;
  const adjusted = score + joinedBoost + (evidenceCount >= 2 ? 4 : 0);

  if (adjusted >= 72 && evidenceCount >= 2) return "HIGH";
  if (adjusted >= 50 && evidenceCount >= 1) return "MEDIUM";
  return "LOW";
}

function buildLens(assessment: FeedNativeLensAssessment): OpportunityTrendLensView {
  return {
    key: assessment.key,
    label: assessment.label,
    state: assessment.stateHint,
    confidence: confidenceFromAssessment(
      assessment.scoreHint,
      assessment.evidence.length,
      assessment.sourceStatus
    ),
    score: clamp(round(assessment.scoreHint), 0, 100),
    summary: assessment.summary,
    evidence: assessment.evidence,
    tags: assessment.tags,
    sourceStatus: assessment.sourceStatus,
    sourceCoverage:
      assessment.sourceStatus === "JOINED"
        ? "HIGH"
        : assessment.sourceStatus === "PAYLOAD_ONLY"
          ? "MEDIUM"
          : assessment.sourceStatus === "MISSING"
            ? "LOW"
            : "LOW"
  };
}

function summarize(
  lenses: OpportunityTrendLensView[],
  sourceCoverageScore: number,
  sourceSummary: string
) {
  const active = lenses.filter((lens) => lens.state !== "NOT_APPLICABLE");
  const supportive = active.filter((lens) => lens.state === "SUPPORTIVE");
  const contrary = active.filter((lens) => lens.state === "CONTRARY");
  const pending = active.filter((lens) => lens.state === "PENDING_DATA");
  const joined = active.filter((lens) => lens.sourceStatus === "JOINED");
  const payloadOnly = active.filter((lens) => lens.sourceStatus === "PAYLOAD_ONLY");

  const intelligenceScore = active.length
    ? active.reduce((sum, lens) => sum + lens.score, 0) / active.length
    : 0;

  const reliabilityRaw = active.length
    ? active.reduce((sum, lens) => {
        const confidenceWeight =
          lens.confidence === "HIGH" ? 1 : lens.confidence === "MEDIUM" ? 0.75 : 0.5;
        const sourceWeight =
          lens.sourceStatus === "JOINED"
            ? 1
            : lens.sourceStatus === "PAYLOAD_ONLY"
              ? 0.8
              : lens.sourceStatus === "MISSING"
                ? 0.45
                : 0.5;

        return sum + lens.score * confidenceWeight * sourceWeight;
      }, 0) / active.length
    : 0;

  const topLens = [...active].sort((a, b) => b.score - a.score)[0] ?? null;
  const tags = Array.from(new Set(active.flatMap((lens) => lens.tags)));

  const summary =
    supportive.length > contrary.length && joined.length >= 2
      ? "Trend stack is supportive across multiple joined matchup lenses."
      : supportive.length > contrary.length
        ? "Trend stack is supportive, but part of it still relies on payload-only context."
        : contrary.length > 0
          ? "Trend stack has at least one lens pushing against the bet and needs a cleaner price."
          : pending.length >= 2
            ? "Trend stack is wired, but several lenses still need deeper live joins."
            : payloadOnly.length >= 2
              ? "Trend stack has partial context, but not enough joined evidence yet."
              : "Trend stack is neutral and should be treated as context, not conviction.";

  return {
    intelligenceScore: clamp(round(intelligenceScore), 0, 100),
    reliabilityScore: clamp(round(reliabilityRaw + sourceCoverageScore * 0.18), 0, 100),
    sourceCoverageScore,
    sourceSummary,
    summary,
    topAngle: topLens?.summary ?? null,
    activeLensCount: active.length,
    supportiveLensCount: supportive.length,
    contraryLensCount: contrary.length,
    pendingLensCount: pending.length,
    tags
  };
}

export function buildOpportunityTrendIntelligence(
  opportunity: OpportunityView
): OpportunityTrendIntelligenceView {
  const context = buildFeedNativeTrendContext(opportunity);

  const lenses = [
    buildLens(context.weather),
    buildLens(context.playerVsPlayer),
    buildLens(context.teamVsTeam),
    buildLens(context.coachVsCoach),
    buildLens(context.playstyleVsPlaystyle)
  ];

  const summary = summarize(
    lenses,
    context.sourceCoverageScore,
    context.sourceSummary
  );

  return {
    ...summary,
    lenses
  };
}
