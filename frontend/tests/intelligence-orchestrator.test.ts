import assert from "node:assert/strict";

import {
  areCombatProfilesStale,
  isProjectionStale,
  isWeatherStale
} from "@/services/intelligence/intelligence-orchestrator";

const now = Date.now();

assert.equal(
  isWeatherStale({
    startTime: new Date(now + 4 * 3600000),
    league: { key: "NFL" },
    metadataJson: {
      weather: {
        observedAt: new Date(now - 4 * 3600000).toISOString()
      }
    }
  } as any),
  true
);

assert.equal(
  areCombatProfilesStale({
    league: { key: "UFC" },
    participantContexts: [
      {
        metadataJson: {
          combatProfileGeneratedAt: new Date(now - 30 * 3600000).toISOString()
        }
      }
    ]
  } as any),
  true
);

assert.equal(
  isProjectionStale({
    metadataJson: {
      intelligenceSnapshot: {
        bundleHash: "abc123"
      }
    },
    bundleHash: "def456"
  } as any),
  true
);

console.log("intelligence-orchestrator.test.ts passed");
