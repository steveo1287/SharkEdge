import type { SimTwinSnapshot } from "@/services/sim/sim-twin";

export type SimTwinCommandState = "PRIORITY_REVIEW" | "MODEL_EDGE" | "SCENARIO_SWING" | "WATCH" | "LOW_PRIORITY";

export type SimTwinCommandQueueItem = {
  id: string;
  rank: number;
  gameId: string;
  league: string;
  eventLabel: string;
  href: string;
  commandScore: number;
  commandState: SimTwinCommandState;
  commandLabel: string;
  trustGrade: string;
  leverageScore: number;
  marketEdgePct: number | null;
  scenarioSwingPct: number;
  pathSwingPct: number;
  blockers: string[];
  reasons: string[];
};

export type SimTwinCommandQueue = {
  generatedAt: string;
  total: number;
  priorityReviewCount: number;
  modelEdgeCount: number;
  scenarioSwingCount: number;
  watchCount: number;
  lowPriorityCount: number;
  top: SimTwinCommandQueueItem | null;
  items: SimTwinCommandQueueItem[];
};

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function trustScore(grade: string) {
  if (grade === "A") return 30;
  if (grade === "B") return 24;
  if (grade === "C") return 16;
  if (grade === "D") return 8;
  return 2;
}

function maxScenarioSwing(twin: SimTwinSnapshot) {
  const swings = twin.scenarios.flatMap((scenario) => [
    Math.abs(scenario.deltaHomePct * 100),
    Math.abs(scenario.deltaSpread),
    Math.abs(scenario.deltaTotal)
  ]).filter((value) => Number.isFinite(value));

  return swings.length ? Math.max(...swings) : 0;
}

function blockersFor(twin: SimTwinSnapshot) {
  const blockers: string[] = [];
  if (twin.trust.grade === "D" || twin.trust.grade === "F") blockers.push("low-model-trust");
  if (twin.trust.sampleSize < 30) blockers.push("small-calibration-sample");
  if (twin.market.noVigHomePct == null) blockers.push("missing-market-baseline");
  if (twin.market.edgePct == null) blockers.push("missing-edge-comparison");
  if (!twin.scenarios.length) blockers.push("missing-scenarios");
  return blockers;
}

function stateFor(args: {
  score: number;
  trustGrade: string;
  leverageScore: number;
  marketEdgePct: number | null;
  scenarioSwingPct: number;
  blockers: string[];
}): SimTwinCommandState {
  const edgeAbs = Math.abs(args.marketEdgePct ?? 0);
  if (args.blockers.includes("low-model-trust") && args.score < 45) return "LOW_PRIORITY";
  if (args.trustGrade === "A" || args.trustGrade === "B") {
    if (args.leverageScore >= 7 && edgeAbs >= 2) return "PRIORITY_REVIEW";
    if (edgeAbs >= 3) return "MODEL_EDGE";
  }
  if (args.scenarioSwingPct >= 6 || args.leverageScore >= 7.5) return "SCENARIO_SWING";
  if (args.score >= 40) return "WATCH";
  return "LOW_PRIORITY";
}

function labelFor(state: SimTwinCommandState) {
  if (state === "PRIORITY_REVIEW") return "Priority review";
  if (state === "MODEL_EDGE") return "Model edge";
  if (state === "SCENARIO_SWING") return "Scenario swing";
  if (state === "WATCH") return "Watch";
  return "Low priority";
}

function reasonsFor(twin: SimTwinSnapshot, state: SimTwinCommandState, scenarioSwingPct: number, blockers: string[]) {
  const reasons: string[] = [];
  const edgeAbs = Math.abs(twin.market.edgePct ?? 0);
  if (state === "PRIORITY_REVIEW") reasons.push("High leverage, usable model trust, and meaningful model-market gap.");
  if (state === "MODEL_EDGE") reasons.push("Model-market disagreement is large enough for focused review.");
  if (state === "SCENARIO_SWING") reasons.push("Scenario deltas or season leverage create a large decision swing.");
  if (state === "WATCH") reasons.push("Useful twin context, but not enough evidence for top queue placement.");
  if (state === "LOW_PRIORITY") reasons.push("Limited trust, leverage, edge, or scenario swing in the current snapshot.");
  if (twin.seasonImpact.leverageScore >= 7) reasons.push(`Leverage ${twin.seasonImpact.leverageScore}/10 (${twin.seasonImpact.leverageLabel}).`);
  if (edgeAbs >= 2) reasons.push(`Model-market gap is ${edgeAbs.toFixed(2)} percentage points.`);
  if (scenarioSwingPct >= 4) reasons.push(`Largest scenario swing is ${scenarioSwingPct.toFixed(2)}.`);
  if (blockers.length) reasons.push(`Blockers: ${blockers.join(", ")}.`);
  return reasons;
}

export function buildSimTwinCommandQueue(twins: SimTwinSnapshot[]): SimTwinCommandQueue {
  const items = twins.map((twin) => {
    const blockers = blockersFor(twin);
    const edgeAbs = Math.abs(twin.market.edgePct ?? 0);
    const scenarioSwingPct = maxScenarioSwing(twin);
    const pathSwingPct = twin.seasonImpact.volatility.swingPct;
    const score = clamp(
      trustScore(twin.trust.grade) +
      twin.seasonImpact.leverageScore * 3.2 +
      Math.min(20, edgeAbs * 3) +
      Math.min(16, scenarioSwingPct * 1.5) +
      Math.min(10, pathSwingPct) -
      blockers.length * 6
    );
    const commandState = stateFor({
      score,
      trustGrade: twin.trust.grade,
      leverageScore: twin.seasonImpact.leverageScore,
      marketEdgePct: twin.market.edgePct,
      scenarioSwingPct,
      blockers
    });

    return {
      id: `${twin.league}:${twin.gameId}`,
      rank: 0,
      gameId: twin.gameId,
      league: twin.league,
      eventLabel: twin.eventLabel,
      href: twin.href,
      commandScore: round(score, 1),
      commandState,
      commandLabel: labelFor(commandState),
      trustGrade: twin.trust.grade,
      leverageScore: twin.seasonImpact.leverageScore,
      marketEdgePct: twin.market.edgePct,
      scenarioSwingPct: round(scenarioSwingPct, 2),
      pathSwingPct: round(pathSwingPct, 2),
      blockers,
      reasons: reasonsFor(twin, commandState, scenarioSwingPct, blockers)
    } satisfies SimTwinCommandQueueItem;
  })
    .sort((left, right) => right.commandScore - left.commandScore || right.leverageScore - left.leverageScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    generatedAt: new Date().toISOString(),
    total: items.length,
    priorityReviewCount: items.filter((item) => item.commandState === "PRIORITY_REVIEW").length,
    modelEdgeCount: items.filter((item) => item.commandState === "MODEL_EDGE").length,
    scenarioSwingCount: items.filter((item) => item.commandState === "SCENARIO_SWING").length,
    watchCount: items.filter((item) => item.commandState === "WATCH").length,
    lowPriorityCount: items.filter((item) => item.commandState === "LOW_PRIORITY").length,
    top: items[0] ?? null,
    items
  };
}
