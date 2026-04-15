import {
  buildOpportunityDecisionReplay
} from "@/services/opportunities/opportunity-decision-replay";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function testCorrectAggressiveReplay() {
  const replay = buildOpportunityDecisionReplay({
    actualActionState: "BET_NOW",
    actualTimingState: "WINDOW_OPEN",
    clvPct: 1.9,
    staleCopyConfidence: 78,
    repricingLikelihood: 72,
    waitImprovementLikelihood: 20,
    bestPriceStillAvailableAfterMinutes: 2,
    minutesToClose: 18,
    staleCopyCaptured: true
  });

  assert(replay.status === "READY", `expected READY, got ${replay.status}`);
  assert(
    replay.expectedActionState === "BET_NOW",
    `expected BET_NOW, got ${replay.expectedActionState}`
  );
  assert(
    replay.outcome === "CORRECT_AGGRESSIVE",
    `expected CORRECT_AGGRESSIVE, got ${replay.outcome}`
  );
  assert(
    typeof replay.replayScore === "number" && replay.replayScore >= 75,
    `expected strong replay score, got ${replay.replayScore}`
  );
}

function testMissedStaleCopyReplay() {
  const replay = buildOpportunityDecisionReplay({
    actualActionState: "WAIT",
    actualTimingState: "WAIT_FOR_PULLBACK",
    clvPct: 1.2,
    staleCopyConfidence: 82,
    repricingLikelihood: 76,
    waitImprovementLikelihood: 18,
    bestPriceStillAvailableAfterMinutes: 1,
    minutesToClose: 11,
    staleCopyCaptured: false
  });

  assert(replay.status === "READY", `expected READY, got ${replay.status}`);
  assert(
    replay.expectedActionState === "BET_NOW",
    `expected BET_NOW, got ${replay.expectedActionState}`
  );
  assert(
    replay.outcome === "MISSED_STALE_COPY",
    `expected MISSED_STALE_COPY, got ${replay.outcome}`
  );
  assert(
    typeof replay.replayScore === "number" && replay.replayScore < 70,
    `expected clipped replay score, got ${replay.replayScore}`
  );
}

function testCorrectPatientReplay() {
  const replay = buildOpportunityDecisionReplay({
    actualActionState: "WAIT",
    actualTimingState: "WAIT_FOR_PULLBACK",
    clvPct: -0.4,
    staleCopyConfidence: 20,
    repricingLikelihood: 28,
    waitImprovementLikelihood: 71,
    bestPriceStillAvailableAfterMinutes: 22,
    minutesToClose: 40,
    staleCopyCaptured: null
  });

  assert(replay.status === "READY", `expected READY, got ${replay.status}`);
  assert(
    replay.expectedActionState === "WAIT",
    `expected WAIT, got ${replay.expectedActionState}`
  );
  assert(
    replay.outcome === "CORRECT_PATIENT",
    `expected CORRECT_PATIENT, got ${replay.outcome}`
  );
}

function testFalseUrgencyReplay() {
  const replay = buildOpportunityDecisionReplay({
    actualActionState: "BET_NOW",
    actualTimingState: "WINDOW_OPEN",
    clvPct: -1.8,
    staleCopyConfidence: 14,
    repricingLikelihood: 22,
    waitImprovementLikelihood: 68,
    bestPriceStillAvailableAfterMinutes: 18,
    minutesToClose: 55,
    staleCopyCaptured: null
  });

  assert(replay.status === "READY", `expected READY, got ${replay.status}`);
  assert(
    replay.expectedActionState === "WAIT",
    `expected WAIT, got ${replay.expectedActionState}`
  );
  assert(
    replay.outcome === "FALSE_URGENCY",
    `expected FALSE_URGENCY, got ${replay.outcome}`
  );
}

function testInsufficientReplayData() {
  const replay = buildOpportunityDecisionReplay({
    actualActionState: "WATCH",
    actualTimingState: "MONITOR_ONLY"
  });

  assert(
    replay.status === "INSUFFICIENT_DATA",
    `expected INSUFFICIENT_DATA, got ${replay.status}`
  );
  assert(
    replay.outcome === "INSUFFICIENT_REPLAY_DATA",
    `expected INSUFFICIENT_REPLAY_DATA, got ${replay.outcome}`
  );
  assert(replay.replayScore === null, `expected null replay score, got ${replay.replayScore}`);
}

function run() {
  testCorrectAggressiveReplay();
  testMissedStaleCopyReplay();
  testCorrectPatientReplay();
  testFalseUrgencyReplay();
  testInsufficientReplayData();
  console.log("Opportunity decision replay tests passed.");
}

run();