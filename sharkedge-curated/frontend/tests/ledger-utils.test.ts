import assert from "node:assert/strict";

import {
  determineTrendCategory,
  packageTrendResult
} from "@/lib/trends/publisher";
import { calculateMarketExpectedValuePct } from "@/lib/utils/bet-intelligence";
import {
  calculateLineClv,
  calculateParlayToWin,
  calculatePriceClv,
  deriveBetResultFromLegs,
  formatEventLabelFromParticipants,
  gradeLegFromEvent
} from "@/lib/utils/ledger";
import { calculateLedgerNetUnits, calculateLedgerRoi } from "@/lib/utils/ledger-metrics";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("parlay payout compounds leg odds correctly", () => {
  const toWin = calculateParlayToWin(1, [-110, +150]);
  assert.equal(toWin, 3.77);
});

run("price clv is positive when the closing price moves toward the bettor", () => {
  assert.equal(calculatePriceClv(-110, -125), 3.17);
  assert.equal(calculatePriceClv(+150, +130), 3.48);
});

run("market EV uses consensus odds instead of faking a model number", () => {
  assert.equal(calculateMarketExpectedValuePct(+115, +102), 6.44);
  assert.equal(calculateMarketExpectedValuePct(-120, -110), -3.97);
});

run("line clv is side-aware for totals", () => {
  assert.equal(
    calculateLineClv({
      marketType: "total",
      selection: "Over 216.5",
      line: 216.5,
      closingLine: 219.5
    }),
    3
  );
  assert.equal(
    calculateLineClv({
      marketType: "total",
      selection: "Under 216.5",
      line: 216.5,
      closingLine: 214.5
    }),
    2
  );
});

run("event labels normalize team and fight participants generically", () => {
  assert.equal(
    formatEventLabelFromParticipants([
      {
        id: "a",
        competitorId: "team_a",
        role: "AWAY",
        sortOrder: 0,
        name: "Kansas City Chiefs",
        abbreviation: "KC",
        type: "TEAM",
        score: null,
        record: null,
        isWinner: null
      },
      {
        id: "b",
        competitorId: "team_b",
        role: "HOME",
        sortOrder: 1,
        name: "Buffalo Bills",
        abbreviation: "BUF",
        type: "TEAM",
        score: null,
        record: null,
        isWinner: null
      }
    ]),
    "Kansas City Chiefs @ Buffalo Bills"
  );

  assert.equal(
    formatEventLabelFromParticipants([
      {
        id: "a",
        competitorId: "fighter_a",
        role: "COMPETITOR_A",
        sortOrder: 0,
        name: "Alex Pereira",
        abbreviation: "POAT",
        type: "FIGHTER",
        score: null,
        record: null,
        isWinner: null
      },
      {
        id: "b",
        competitorId: "fighter_b",
        role: "COMPETITOR_B",
        sortOrder: 1,
        name: "Magomed Ankalaev",
        abbreviation: "ANKA",
        type: "FIGHTER",
        score: null,
        record: null,
        isWinner: null
      }
    ]),
    "Alex Pereira vs Magomed Ankalaev"
  );
});

run("grading handles moneylines, spreads, and totals without faking unsupported props", () => {
  const participants = [
    {
      id: "home",
      competitorId: "home",
      role: "HOME" as const,
      sortOrder: 1,
      name: "Boston Celtics",
      abbreviation: "BOS",
      type: "TEAM" as const,
      score: "118",
      record: null,
      isWinner: true
    },
    {
      id: "away",
      competitorId: "away",
      role: "AWAY" as const,
      sortOrder: 0,
      name: "Milwaukee Bucks",
      abbreviation: "MIL",
      type: "TEAM" as const,
      score: "110",
      record: null,
      isWinner: false
    }
  ];

  assert.equal(
    gradeLegFromEvent({
      marketType: "moneyline",
      selection: "Boston Celtics",
      eventStatus: "FINAL",
      participants
    }),
    "WIN"
  );

  assert.equal(
    gradeLegFromEvent({
      marketType: "spread",
      selection: "Milwaukee Bucks",
      line: 9.5,
      eventStatus: "FINAL",
      participants
    }),
    "WIN"
  );

  assert.equal(
    gradeLegFromEvent({
      marketType: "total",
      selection: "Over 225.5",
      side: "Over",
      line: 225.5,
      eventStatus: "FINAL",
      participants
    }),
    "WIN"
  );

  assert.equal(
    gradeLegFromEvent({
      marketType: "player_points",
      selection: "Jayson Tatum Over 29.5",
      line: 29.5,
      eventStatus: "FINAL",
      participants
    }),
    "OPEN"
  );
});

run("bet results and roi are derived from graded legs and honest profits", () => {
  assert.equal(deriveBetResultFromLegs(["WIN", "PUSH"]), "WIN");
  assert.equal(deriveBetResultFromLegs(["LOSS", "OPEN"]), "LOSS");
  assert.equal(deriveBetResultFromLegs(["PUSH", "PUSH"]), "PUSH");

  const bets = [
    { result: "WIN" as const, riskAmount: 1, toWin: 1.2, payout: 2.2 },
    { result: "LOSS" as const, riskAmount: 1, toWin: 0.91, payout: 0 },
    { result: "PUSH" as const, riskAmount: 1, toWin: 0.91, payout: 1 }
  ];

  assert.equal(calculateLedgerNetUnits(bets), 0.2);
  assert.equal(calculateLedgerRoi(bets), 6.7);
});

run("deterministic trend publisher categorizes real trends without paid AI", () => {
  const category = determineTrendCategory({
    id: "favorite-roi",
    title: "Favorite ROI",
    hitRate: 62.4,
    roi: 12.1,
    profitUnits: 14.2,
    sampleSize: 48,
    wins: 30,
    losses: 18,
    pushes: 0,
    streak: "W5",
    confidence: "moderate",
    warning: null,
    dateRange: "Last 365 days",
    contextLabel: "Favorite ROI | NBA",
    todayMatches: [],
    extra: {}
  });

  assert.equal(category, "Most Profitable");
});

run("published trend cards use deterministic titles and descriptions", () => {
  const card = packageTrendResult(
    {
      id: "ats",
      title: "ATS trend",
      hitRate: 58.3,
      roi: 7.4,
      profitUnits: 4.8,
      sampleSize: 24,
      wins: 14,
      losses: 10,
      pushes: 0,
      streak: "W3",
      confidence: "weak",
      warning: null,
      dateRange: "Last 90 days",
      contextLabel: "ATS trend | NBA | subject: Boston Celtics",
      todayMatches: [],
      extra: {}
    },
    {
      league: "NBA",
      team: "Boston Celtics",
      window: "90d",
      sample: 10
    }
  );

  assert.equal(card.title, "Boston Celtics Spread");
  assert.equal(card.category, "Systems");
  assert.match(card.description, /Boston Celtics is 14-10 across last 90 days/i);
});

console.log("All ledger tests passed.");
