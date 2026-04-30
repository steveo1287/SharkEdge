import assert from "node:assert/strict";

import { buildNbaInputQualityReport, type NbaGameInputQualityInput } from "@/services/nba/nba-input-quality";
import type {
  NbaPlayerAvailability,
  NbaPlayerGameProfile,
  NbaPlayerImpactRating,
  NbaSourceAttribution,
  NbaTeamAdvancedProfile
} from "@/services/nba/nba-source-types";

const now = new Date("2026-04-30T14:00:00.000Z");

function source(overrides: Partial<NbaSourceAttribution> = {}): NbaSourceAttribution {
  return {
    sourceKey: "internal",
    sourceLabel: "Test source",
    fetchedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    confidence: "HIGH",
    licenseRisk: "LOW",
    notes: [],
    ...overrides
  };
}

function teamProfile(teamId: string): NbaTeamAdvancedProfile {
  return {
    teamId,
    offensiveRating: 118.4,
    defensiveRating: 111.2,
    netRating: 7.2,
    pace: 99.4,
    effectiveFieldGoalPct: 0.566,
    turnoverPct: 12.7,
    offensiveReboundPct: 27.8,
    freeThrowRate: 0.244,
    rollingNetRatingLast5: 8.1,
    rollingNetRatingLast10: 6.4,
    source: source()
  };
}

function playerProfiles(teamId: string, count = 16): NbaPlayerGameProfile[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `${teamId}-player-${index}`,
    teamId,
    gamesIncluded: 8,
    averageMinutes: index < 8 ? 24 + index : 12,
    usageRate: 18 + index,
    pointsPerGame: 8 + index,
    reboundsPerGame: 3 + index / 2,
    assistsPerGame: 2 + index / 3,
    threesPerGame: 1 + index / 10,
    source: source()
  }));
}

function availability(teamId: string, gameId: string, count = 10, withMinutes = true): NbaPlayerAvailability[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `${teamId}-player-${index}`,
    teamId,
    gameId,
    status: index === 0 ? "QUESTIONABLE" : "AVAILABLE",
    expectedMinutes: withMinutes ? (index < 8 ? 22 + index : 8) : null,
    baselineMinutes: index < 8 ? 24 + index : 10,
    minutesUncertainty: index === 0 ? 8 : 2,
    source: source()
  }));
}

function impactRatings(teamId: string, count = 12): NbaPlayerImpactRating[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `${teamId}-player-${index}`,
    season: "2025-26",
    offensiveImpactPer100: 0.5 + index / 10,
    defensiveImpactPer100: -0.2 + index / 20,
    totalImpactPer100: 0.3 + index / 8,
    source: source()
  }));
}

function fullInput(overrides: Partial<NbaGameInputQualityInput> = {}): NbaGameInputQualityInput {
  const base: NbaGameInputQualityInput = {
    gameId: "nba-game-1",
    leagueKey: "NBA",
    odds: {
      generatedAt: now.toISOString(),
      freshnessMinutes: 4,
      sportsbookCount: 5,
      hasMoneyline: true,
      hasSpread: true,
      hasTotal: true,
      hasPlayerProps: true,
      source: source({ sourceKey: "licensed_odds", sourceLabel: "Licensed odds feed" })
    },
    marketAnchor: {
      total: 226.5,
      spreadHome: -3.5,
      homeMoneylineOdds: -155,
      awayMoneylineOdds: 135
    },
    teamProfiles: {
      home: teamProfile("home"),
      away: teamProfile("away")
    },
    playerProfiles: [...playerProfiles("home", 8), ...playerProfiles("away", 8)],
    availability: [...availability("home", "nba-game-1", 5), ...availability("away", "nba-game-1", 5)],
    impactRatings: [...impactRatings("home", 6), ...impactRatings("away", 6)],
    participantContext: {
      homeRestDays: 2,
      awayRestDays: 1,
      homeBackToBack: false,
      awayBackToBack: true,
      homeTravelProxyScore: 0.2,
      awayTravelProxyScore: 1.1
    },
    calibration: {
      gamesTracked: 50,
      brierScore: 0.21,
      spreadMae: 9.8,
      totalMae: 12.2,
      clvSamples: 30
    },
    now
  };

  return {
    ...base,
    ...overrides,
    teamProfiles: overrides.teamProfiles ?? base.teamProfiles,
    participantContext: overrides.participantContext ?? base.participantContext
  };
}

async function run(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function main() {
  await run("full NBA input returns GREEN and allows strong verdicts", () => {
    const report = buildNbaInputQualityReport(fullInput());

    assert.equal(report.grade, "GREEN");
    assert.equal(report.actionGate, "ALLOW_STRONG");
    assert.equal(report.confidenceCap, "HIGH");
    assert.equal(report.canIssueStrongBet, true);
  });

  await run("NBA game with odds but missing team stats cannot issue STRONG_BET", () => {
    const report = buildNbaInputQualityReport(
      fullInput({
        teamProfiles: {
          home: null,
          away: null
        }
      })
    );

    assert.equal(report.canIssueStrongBet, false);
    assert.notEqual(report.actionGate, "ALLOW_STRONG");
    assert.ok(report.warnings.some((warning) => warning.includes("advanced team profiles")));
  });

  await run("stale NBA odds force PASS", () => {
    const report = buildNbaInputQualityReport(
      fullInput({
        odds: {
          generatedAt: new Date("2026-04-30T12:30:00.000Z").toISOString(),
          freshnessMinutes: 90,
          sportsbookCount: 5,
          hasMoneyline: true,
          hasSpread: true,
          hasTotal: true,
          hasPlayerProps: true,
          source: source({ sourceKey: "licensed_odds", sourceLabel: "Licensed odds feed" })
        }
      })
    );

    assert.equal(report.actionGate, "PASS");
    assert.equal(report.confidenceCap, "PASS");
    assert.ok(report.caps.some((cap) => cap.includes("No fresh odds")));
  });

  await run("missing market anchor returns projection only", () => {
    const report = buildNbaInputQualityReport(fullInput({ marketAnchor: null }));

    assert.equal(report.actionGate, "PROJECTION_ONLY");
    assert.equal(report.canIssueBetVerdict, false);
    assert.equal(report.projectionOnly, true);
  });

  await run("missing injury feed emits warning and caps confidence", () => {
    const report = buildNbaInputQualityReport(fullInput({ availability: [] }));

    assert.ok(report.warnings.some((warning) => warning.includes("injury/availability")));
    assert.ok(report.caps.some((cap) => cap.includes("Missing injury feed")));
    assert.notEqual(report.confidenceCap, "HIGH");
  });

  await run("missing projected minutes blocks strong player-prop confidence", () => {
    const report = buildNbaInputQualityReport(
      fullInput({
        availability: [...availability("home", "nba-game-1", 5, false), ...availability("away", "nba-game-1", 5, false)]
      })
    );

    assert.equal(report.confidenceCap, "LOW");
    assert.equal(report.canIssueStrongBet, false);
    assert.ok(report.caps.some((cap) => cap.includes("projected minutes")));
  });

  await run("missing player impact disables injury point adjustment", () => {
    const report = buildNbaInputQualityReport(fullInput({ impactRatings: [] }));

    assert.ok(report.caps.some((cap) => cap.includes("injury point adjustments disabled")));
    assert.ok(report.warnings.some((warning) => warning.includes("player-impact")));
  });

  await run("high risk source emits source warning", () => {
    const report = buildNbaInputQualityReport(
      fullInput({
        teamProfiles: {
          home: teamProfile("home"),
          away: {
            ...teamProfile("away"),
            source: source({
              sourceKey: "nba_stats",
              sourceLabel: "NBA Stats adapter",
              licenseRisk: "HIGH"
            })
          }
        }
      })
    );

    assert.ok(report.sourceWarnings.some((warning) => warning.includes("HIGH license risk")));
  });

  console.log("All NBA input quality tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
