import type { LeagueKey } from "@/lib/types/domain";
import { getSimAccuracySummary } from "@/services/simulation/sim-accuracy-ledger";

type GuardLeague = Extract<LeagueKey, "NBA" | "MLB">;
type SimTier = "attack" | "watch" | "pass" | "thin" | string;

export type SimAccuracyGuardrail = {
  league: GuardLeague;
  bucket: string;
  count: number;
  avgPredicted: number;
  actualRate: number;
  brier: number;
  state: "healthy" | "watch" | "poor" | "insufficient";
  note: string;
};

export type SimAccuracyGuardrailMap = Record<string, SimAccuracyGuardrail>;

export type GuardedSimDecision = {
  tier: SimTier;
  originalTier: SimTier;
  confidence: number | null;
  downgraded: boolean;
  noBet: boolean;
  guardrail: SimAccuracyGuardrail | null;
  reasons: string[];
};

const MIN_BUCKET_SAMPLE = 25;
const WATCH_GAP = 0.08;
const POOR_GAP = 0.15;
const WATCH_BRIER = 0.24;
const POOR_BRIER = 0.3;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

export function simProbabilityBucket(probability: number) {
  const lower = Math.floor(clamp(probability, 0, 0.999) * 10) * 10;
  return `${lower}-${lower + 10}%`;
}

function guardrailKey(league: GuardLeague, bucket: string) {
  return `${league}:${bucket}`;
}

function classifyBucket(args: { count: number; avgPredicted: number; actualRate: number; brier: number }) {
  if (args.count < MIN_BUCKET_SAMPLE) return "insufficient" as const;
  const overconfidenceGap = args.avgPredicted - args.actualRate;
  if (overconfidenceGap >= POOR_GAP || args.brier >= POOR_BRIER) return "poor" as const;
  if (overconfidenceGap >= WATCH_GAP || args.brier >= WATCH_BRIER) return "watch" as const;
  return "healthy" as const;
}

function bucketNote(args: { bucket: string; count: number; avgPredicted: number; actualRate: number; brier: number; state: SimAccuracyGuardrail["state"] }) {
  if (args.state === "insufficient") {
    return `${args.bucket} bucket has ${args.count}/${MIN_BUCKET_SAMPLE} graded samples; accuracy guard blocks action until this bucket has enough evidence.`;
  }
  if (args.state === "poor") {
    return `${args.bucket} bucket is overconfident: predicted ${round(args.avgPredicted * 100, 1)}%, actual ${round(args.actualRate * 100, 1)}%, Brier ${round(args.brier, 3)}.`;
  }
  if (args.state === "watch") {
    return `${args.bucket} bucket needs caution: predicted ${round(args.avgPredicted * 100, 1)}%, actual ${round(args.actualRate * 100, 1)}%, Brier ${round(args.brier, 3)}.`;
  }
  return `${args.bucket} bucket is currently healthy: predicted ${round(args.avgPredicted * 100, 1)}%, actual ${round(args.actualRate * 100, 1)}%, Brier ${round(args.brier, 3)}.`;
}

export async function getSimAccuracyGuardrails(): Promise<SimAccuracyGuardrailMap> {
  const summary = await getSimAccuracySummary(1).catch(() => null);
  if (!summary?.ok) return {};

  const entries = summary.byLeague.flatMap((league) =>
    league.calibrationBuckets.map((bucket) => {
      const leagueKey = league.league as GuardLeague;
      const state = classifyBucket(bucket);
      const guardrail: SimAccuracyGuardrail = {
        league: leagueKey,
        bucket: bucket.bucket,
        count: bucket.count,
        avgPredicted: bucket.avgPredicted,
        actualRate: bucket.actualRate,
        brier: bucket.brier,
        state,
        note: bucketNote({ ...bucket, state })
      };
      return [guardrailKey(leagueKey, bucket.bucket), guardrail] as const;
    })
  );

  return Object.fromEntries(entries);
}

export function applySimAccuracyGuardrail(args: {
  league: GuardLeague;
  tier: SimTier | null | undefined;
  probability: number;
  confidence: number | null | undefined;
  noBet?: boolean | null;
  reasons?: string[];
  guardrails: SimAccuracyGuardrailMap;
}): GuardedSimDecision {
  const originalTier = String(args.tier ?? "pass") as SimTier;
  const bucket = simProbabilityBucket(args.probability);
  const guardrail = args.guardrails[guardrailKey(args.league, bucket)] ?? null;
  const reasons = [...(args.reasons ?? [])];
  let tier: SimTier = originalTier;
  let confidence = typeof args.confidence === "number" ? args.confidence : null;
  let noBet = Boolean(args.noBet);
  let downgraded = false;

  if (!guardrail) {
    const note = `Accuracy guard: ${args.league}:${bucket} bucket has no graded history; action is blocked until this probability range is proven.`;
    if (originalTier === "attack") {
      tier = "watch";
      noBet = true;
      downgraded = true;
      confidence = confidence == null ? null : round(clamp(confidence - 0.1, 0, 1), 3);
      reasons.unshift(note);
    } else if (originalTier === "watch") {
      noBet = true;
      confidence = confidence == null ? null : round(clamp(confidence - 0.05, 0, 1), 3);
      reasons.unshift(note);
    }
  } else if (guardrail.state === "insufficient") {
    const note = `Accuracy guard: ${guardrail.note}`;
    if (originalTier === "attack") {
      tier = "watch";
      noBet = true;
      downgraded = true;
      confidence = confidence == null ? null : round(clamp(confidence - 0.08, 0, 1), 3);
      reasons.unshift(note);
    } else if (originalTier === "watch") {
      noBet = true;
      confidence = confidence == null ? null : round(clamp(confidence - 0.04, 0, 1), 3);
      reasons.unshift(note);
    }
  } else if (guardrail.state !== "healthy") {
    const note = `Accuracy guard: ${guardrail.note}`;

    if (originalTier === "attack") {
      tier = guardrail.state === "poor" ? "pass" : "watch";
      noBet = guardrail.state === "poor";
      downgraded = true;
      confidence = confidence == null ? null : round(clamp(confidence - (guardrail.state === "poor" ? 0.18 : 0.09), 0, 1), 3);
      reasons.unshift(note);
    } else if (originalTier === "watch" && guardrail.state === "poor") {
      tier = "pass";
      noBet = true;
      downgraded = true;
      confidence = confidence == null ? null : round(clamp(confidence - 0.12, 0, 1), 3);
      reasons.unshift(note);
    }
  }

  return {
    tier,
    originalTier,
    confidence,
    downgraded,
    noBet,
    guardrail,
    reasons
  };
}
