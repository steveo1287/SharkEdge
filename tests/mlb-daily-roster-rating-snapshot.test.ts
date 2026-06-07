import assert from "node:assert/strict";

import { buildDailyMlbRosterRatingSnapshots } from "@/services/simulation/mlb-daily-roster-rating-snapshot";

const teams = [
  "LAA", "ARI", "BAL", "BOS", "CHC", "CIN", "CLE", "COL", "DET", "HOU",
  "KC", "LAD", "WSH", "NYM", "OAK", "PIT", "SD", "SEA", "SF", "STL",
  "TB", "TEX", "TOR", "MIN", "PHI", "ATL", "CWS", "MIA", "NYY", "MIL"
].map((abbr, index) => ({ id: 100 + index, abbreviation: abbr, teamCode: abbr, name: `${abbr} Team`, active: true }));

function rosterFor(teamId: number) {
  const teamIndex = teamId - 100;
  return Array.from({ length: 20 }, (_, index) => {
    const pitcher = index >= 10;
    const id = teamId * 1000 + index;
    return {
      person: {
        id,
        fullName: `${teams[teamIndex].abbreviation} ${pitcher ? "Pitcher" : "Hitter"} ${index}`,
        batSide: { code: index % 3 === 0 ? "L" : index % 3 === 1 ? "R" : "S" },
        pitchHand: { code: index % 2 === 0 ? "R" : "L" }
      },
      jerseyNumber: String(index + 1),
      position: pitcher ? { abbreviation: "P", type: "Pitcher" } : { abbreviation: index === 0 ? "C" : "OF", type: "Fielder" },
      status: { code: "A", description: "Active" }
    };
  });
}

const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/v1/teams?") && url.includes("sportId=1")) {
    return { ok: true, json: async () => ({ teams }) } as Response;
  }
  const match = url.match(/\/api\/v1\/teams\/(\d+)\/roster/);
  if (match) {
    return { ok: true, json: async () => ({ roster: rosterFor(Number(match[1])) }) } as Response;
  }
  throw new Error(`Unexpected fetch URL ${url}`);
}) as typeof fetch;

try {
  const report = await buildDailyMlbRosterRatingSnapshots({
    season: 2026,
    rosterType: "active",
    includeStatsApiStats: false,
    persist: false,
    fetchConcurrency: 8
  });

  assert.equal(report.modelVersion, "mlb-daily-roster-rating-snapshot-v1");
  assert.equal(report.persisted, false);
  assert.equal(report.teamsExpected, 30);
  assert.equal(report.teamsCovered, 30);
  assert.equal(report.playersSeen, 600);
  assert.equal(report.hittersRated, 300);
  assert.equal(report.pitchersRated, 300);
  assert.equal(report.ok, true);
  assert.equal(report.teams.every((team) => team.rosterComplete), true);
  assert.ok(report.ratings.hitters.every((row) => row.metrics_json?.sourceKind === "REAL_STATS"));
  assert.ok(report.ratings.pitchers.every((row) => row.metrics_json?.sourceKind === "REAL_STATS"));
  assert.ok(report.ratings.warnings.some((warning) => warning.includes("No market/outcome calibration rows")));
} finally {
  globalThis.fetch = originalFetch;
}

console.log("mlb-daily-roster-rating-snapshot.test.ts passed");
