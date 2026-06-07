import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  deriveMlbMicroGameAdjustment,
  type MlbBatterMicroTendency,
  type MlbMicroGameAdjustment,
  type MlbPitcherMicroTendency
} from "@/services/simulation/mlb-micro-tendency-model";
import type { MlbEliteTeamRating } from "@/services/simulation/mlb-elite-rating-system";

export type MlbV8MicroTeamLike = {
  team: string;
  lineup: {
    confirmed?: boolean;
    batting_order_json?: unknown;
    starting_pitcher_id?: string | null;
    starting_pitcher_name?: string | null;
  } | null;
};

export type MlbV8MicroTendencyInput = {
  gameId: string;
  awayTeam: MlbV8MicroTeamLike;
  homeTeam: MlbV8MicroTeamLike;
  baseAwayRuns: number;
  baseHomeRuns: number;
  awayOffenseScore: number;
  homeOffenseScore: number;
  awayStarterScore: number;
  homeStarterScore: number;
  awayBullpenScore: number;
  homeBullpenScore: number;
  parkFactorRuns?: number;
  parkFactorHr?: number;
  weatherRunFactor?: number;
  umpireZoneFactor?: number;
};

export type MlbV8MicroTendencyResult = {
  applied: boolean;
  reason: string;
  feedSource: string | null;
  batterCount: number;
  pitcherCount: number;
  awayRuns: number;
  homeRuns: number;
  dataQuality: number;
  adjustment: MlbMicroGameAdjustment | null;
  warnings: string[];
};

export type MlbV8MicroFeedCache = {
  source: string;
  loadedAt: string;
  batters: MlbBatterMicroTendency[];
  pitchers: MlbPitcherMicroTendency[];
};

let cachedFeed: MlbV8MicroFeedCache | null = null;

function configuredPath(envName: string, fallback: string) {
  const value = process.env[envName];
  return value && value.trim() ? value.trim() : path.join(process.cwd(), fallback);
}

function readJsonArray<T>(filePath: string): T[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? parsed as T[] : [];
}

export function resetMlbV8MicroTendencyFeedCache() {
  cachedFeed = null;
}

export function loadMlbV8MicroTendencyFeed(): MlbV8MicroFeedCache {
  if (cachedFeed) return cachedFeed;
  const batterPath = configuredPath("MLB_BATTER_MICRO_TENDENCIES_PATH", "data/mlb/micro/batter-micro-tendencies.json");
  const pitcherPath = configuredPath("MLB_PITCHER_MICRO_TENDENCIES_PATH", "data/mlb/micro/pitcher-micro-tendencies.json");
  const batters = readJsonArray<MlbBatterMicroTendency>(batterPath);
  const pitchers = readJsonArray<MlbPitcherMicroTendency>(pitcherPath);
  cachedFeed = {
    source: `${batterPath} | ${pitcherPath}`,
    loadedAt: new Date().toISOString(),
    batters,
    pitchers
  };
  return cachedFeed;
}

function normalizeLineupJson(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asEliteTeamLike(team: MlbV8MicroTeamLike, offenseScore: number, starterScore: number, bullpenScore: number): MlbEliteTeamRating {
  return {
    team: team.team,
    context: {
      team: team.team,
      lineup: team.lineup ? {
        confirmed: Boolean(team.lineup.confirmed),
        batting_order_json: normalizeLineupJson(team.lineup.batting_order_json),
        starting_pitcher_id: team.lineup.starting_pitcher_id ?? null,
        starting_pitcher_name: team.lineup.starting_pitcher_name ?? null,
        available_relievers_json: [],
        unavailable_relievers_json: [],
        source: "mlb-v8-player-impact-context",
        captured_at: new Date().toISOString()
      } : null,
      hitters: [],
      pitchers: []
    },
    offenseScore,
    contactScore: offenseScore,
    powerScore: offenseScore,
    disciplineScore: offenseScore,
    platoonScore: offenseScore,
    speedScore: 70,
    defenseScore: 70,
    starterScore,
    bullpenScore,
    bullpenFatiguePenalty: 0,
    confirmedLineup: Boolean(team.lineup?.confirmed),
    reliability: 0.7,
    uncertainty: 0.3,
    warnings: []
  };
}

export function applyMlbV8MicroTendencyAdjustment(input: MlbV8MicroTendencyInput): MlbV8MicroTendencyResult {
  const feed = loadMlbV8MicroTendencyFeed();
  if (!feed.batters.length || !feed.pitchers.length) {
    return {
      applied: false,
      reason: "micro tendency feed missing or empty",
      feedSource: feed.source,
      batterCount: feed.batters.length,
      pitcherCount: feed.pitchers.length,
      awayRuns: input.baseAwayRuns,
      homeRuns: input.baseHomeRuns,
      dataQuality: 0,
      adjustment: null,
      warnings: ["Build real micro feeds first with scripts/build-mlb-micro-feeds-from-statcast.ts."]
    };
  }

  const away = asEliteTeamLike(input.awayTeam, input.awayOffenseScore, input.awayStarterScore, input.awayBullpenScore);
  const home = asEliteTeamLike(input.homeTeam, input.homeOffenseScore, input.homeStarterScore, input.homeBullpenScore);
  const adjustment = deriveMlbMicroGameAdjustment({
    away,
    home,
    batterTendencies: feed.batters,
    pitcherTendencies: feed.pitchers,
    baseAwayRuns: input.baseAwayRuns,
    baseHomeRuns: input.baseHomeRuns,
    parkFactorRuns: input.parkFactorRuns,
    parkFactorHr: input.parkFactorHr,
    weatherRunFactor: input.weatherRunFactor,
    umpireZoneFactor: input.umpireZoneFactor
  });

  const applied = adjustment.dataQuality >= 55 && adjustment.warnings.length === 0;
  return {
    applied,
    reason: applied ? "micro tendency adjustment applied" : "micro tendency adjustment generated but failed data-quality gate",
    feedSource: feed.source,
    batterCount: feed.batters.length,
    pitcherCount: feed.pitchers.length,
    awayRuns: applied ? adjustment.adjustedAwayRuns : input.baseAwayRuns,
    homeRuns: applied ? adjustment.adjustedHomeRuns : input.baseHomeRuns,
    dataQuality: adjustment.dataQuality,
    adjustment,
    warnings: adjustment.warnings
  };
}
