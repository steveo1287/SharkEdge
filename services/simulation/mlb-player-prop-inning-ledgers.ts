import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type {
  MlbHitterPerGameProjection,
  MlbInningMarketProjection,
  MlbPlayerStatProjectionGame,
  MlbStarterPerGameProjection
} from "@/services/simulation/mlb-player-stat-inning-engine";

export type MlbPlayerPropProjectionRow = {
  gameId: string;
  eventLabel: string;
  startTime: Date | string;
  team: string;
  playerId: string;
  playerName: string;
  market: string;
  line: number;
  projectedValue: number;
  probabilityOver: number | null;
  confidence: number;
  projectionJson?: unknown;
};

export type MlbInningProjectionRow = {
  gameId: string;
  eventLabel: string;
  startTime: Date | string;
  market: string;
  line: number | null;
  side: string;
  projectedValue: number;
  probability: number;
  confidence: number;
  projectionJson?: unknown;
};

export type MlbPlayerActualStatRow = {
  playerId: string;
  statsJson: unknown;
};

export type MlbTeamActualStatRow = {
  team: string;
  statsJson: unknown;
};

export type MlbPropGradeResult = "WIN" | "LOSS" | "PUSH" | "PENDING";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function statValue(statsJson: unknown, keys: string[]) {
  const stats = isRecord(statsJson) ? statsJson : {};
  for (const key of keys) {
    const direct = numberFrom(stats[key]);
    if (direct !== null) return direct;
  }
  const batting = isRecord(stats.batting) ? stats.batting : {};
  const pitching = isRecord(stats.pitching) ? stats.pitching : {};
  const running = isRecord(stats.running) ? stats.running : {};
  for (const key of keys) {
    const values = [numberFrom(batting[key]), numberFrom(pitching[key]), numberFrom(running[key])];
    const found = values.find((value) => value !== null);
    if (found !== undefined) return found;
  }
  return null;
}

function probabilityOverNormal(mean: number, line: number, sd: number) {
  const z = (mean - line) / Math.max(0.001, sd);
  return clamp(1 / (1 + Math.exp(-1.7 * z)), 0.03, 0.97);
}

function gradeOver(actual: number | null, line: number): MlbPropGradeResult {
  if (actual === null) return "PENDING";
  if (actual > line) return "WIN";
  if (actual < line) return "LOSS";
  return "PUSH";
}

function gradeProbability(actual: number | null, side: string, line: number | null): MlbPropGradeResult {
  if (actual === null) return "PENDING";
  if (line === null) return actual > 0 ? "WIN" : "LOSS";
  if (side.toUpperCase() === "OVER") return gradeOver(actual, line);
  if (side.toUpperCase() === "UNDER") {
    if (actual < line) return "WIN";
    if (actual > line) return "LOSS";
    return "PUSH";
  }
  return actual > line ? "WIN" : actual < line ? "LOSS" : "PUSH";
}

function brier(probability: number | null, result: MlbPropGradeResult) {
  if (probability === null || result === "PENDING" || result === "PUSH") return null;
  const outcome = result === "WIN" ? 1 : 0;
  return round((clamp(probability, 0.001, 0.999) - outcome) ** 2, 6);
}

function logLoss(probability: number | null, result: MlbPropGradeResult) {
  if (probability === null || result === "PENDING" || result === "PUSH") return null;
  const p = clamp(probability, 0.001, 0.999);
  return round(result === "WIN" ? -Math.log(p) : -Math.log(1 - p), 6);
}

export function buildMlbPlayerPropProjectionRows(args: {
  gameId: string;
  eventLabel: string;
  startTime: Date | string;
  projections: MlbPlayerStatProjectionGame;
}): MlbPlayerPropProjectionRow[] {
  const hitters = [...args.projections.awayHitters, ...args.projections.homeHitters];
  const starters = [args.projections.awayStarter, args.projections.homeStarter].filter((starter): starter is MlbStarterPerGameProjection => Boolean(starter));
  const rows: MlbPlayerPropProjectionRow[] = [];

  const addHitter = (hitter: MlbHitterPerGameProjection, market: string, line: number, projectedValue: number, sd: number) => {
    rows.push({
      gameId: args.gameId,
      eventLabel: args.eventLabel,
      startTime: args.startTime,
      team: hitter.team,
      playerId: hitter.playerId,
      playerName: hitter.playerName,
      market,
      line,
      projectedValue: round(projectedValue, 4),
      probabilityOver: round(probabilityOverNormal(projectedValue, line, sd), 4),
      confidence: hitter.confidence,
      projectionJson: hitter
    });
  };

  for (const hitter of hitters) {
    addHitter(hitter, "hitter_hits", 0.5, hitter.expectedHits, 0.72);
    addHitter(hitter, "hitter_total_bases", 1.5, hitter.expectedTotalBases, 1.15);
    addHitter(hitter, "hitter_runs", 0.5, hitter.expectedRuns, 0.75);
    addHitter(hitter, "hitter_rbi", 0.5, hitter.expectedRbi, 0.78);
    addHitter(hitter, "hitter_stolen_bases", 0.5, hitter.stolenBaseProbability, 0.36);
  }

  for (const starter of starters) {
    rows.push({ gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, team: starter.team, playerId: starter.pitcherId, playerName: starter.pitcherName, market: "pitcher_outs", line: 17.5, projectedValue: starter.expectedOuts, probabilityOver: starter.over17_5OutsProbability, confidence: starter.confidence, projectionJson: starter });
    rows.push({ gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, team: starter.team, playerId: starter.pitcherId, playerName: starter.pitcherName, market: "pitcher_strikeouts", line: 4.5, projectedValue: starter.expectedStrikeouts, probabilityOver: starter.over4_5StrikeoutsProbability, confidence: starter.confidence, projectionJson: starter });
    rows.push({ gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, team: starter.team, playerId: starter.pitcherId, playerName: starter.pitcherName, market: "pitcher_earned_runs", line: 2.5, projectedValue: starter.expectedEarnedRuns, probabilityOver: round(probabilityOverNormal(starter.expectedEarnedRuns, 2.5, 1.25), 4), confidence: starter.confidence, projectionJson: starter });
  }

  return rows;
}

export function buildMlbInningProjectionRows(args: {
  gameId: string;
  eventLabel: string;
  startTime: Date | string;
  projection: MlbInningMarketProjection;
}): MlbInningProjectionRow[] {
  return [
    { gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, market: "nrfi", line: null, side: "NO_RUN_FIRST_INNING", projectedValue: 0, probability: args.projection.nrfiProbability, confidence: 0.62, projectionJson: args.projection },
    { gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, market: "yrfi", line: null, side: "RUN_FIRST_INNING", projectedValue: 1, probability: args.projection.yrfiProbability, confidence: 0.62, projectionJson: args.projection },
    { gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, market: "first_five_total", line: 4.5, side: "OVER", projectedValue: args.projection.firstFiveTotalRuns, probability: args.projection.firstFiveOver4_5Probability, confidence: 0.64, projectionJson: args.projection },
    { gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, market: "first_five_home_ml", line: null, side: "HOME", projectedValue: args.projection.firstFiveHomeRuns - args.projection.firstFiveAwayRuns, probability: args.projection.firstFiveHomeWinProbability, confidence: 0.6, projectionJson: args.projection },
    { gameId: args.gameId, eventLabel: args.eventLabel, startTime: args.startTime, market: "first_five_away_ml", line: null, side: "AWAY", projectedValue: args.projection.firstFiveAwayRuns - args.projection.firstFiveHomeRuns, probability: args.projection.firstFiveAwayWinProbability, confidence: 0.6, projectionJson: args.projection }
  ];
}

export function actualPlayerStatForMarket(row: Pick<MlbPlayerPropProjectionRow, "market">, statsJson: unknown) {
  switch (row.market) {
    case "hitter_hits": return statValue(statsJson, ["hits", "H"]);
    case "hitter_total_bases": return statValue(statsJson, ["totalBases", "TB"]);
    case "hitter_runs": return statValue(statsJson, ["runs", "R"]);
    case "hitter_rbi": return statValue(statsJson, ["rbi", "RBI", "runsBattedIn"]);
    case "hitter_stolen_bases": return statValue(statsJson, ["stolenBases", "SB"]);
    case "pitcher_outs": {
      const outs = statValue(statsJson, ["outs", "pitcherOuts"]);
      if (outs !== null) return outs;
      const ip = statValue(statsJson, ["inningsPitched", "IP"]);
      return ip === null ? null : Math.round(ip * 3);
    }
    case "pitcher_strikeouts": return statValue(statsJson, ["strikeouts", "SO", "K"]);
    case "pitcher_earned_runs": return statValue(statsJson, ["earnedRuns", "ER"]);
    default: return null;
  }
}

function teamStat(statsJson: unknown, keys: string[]) {
  return statValue(statsJson, keys);
}

export function actualInningStatForMarket(row: Pick<MlbInningProjectionRow, "market" | "side">, args: { awayStatsJson?: unknown; homeStatsJson?: unknown; resultJson?: unknown } = {}) {
  const result = isRecord(args.resultJson) ? args.resultJson : {};
  const innings = Array.isArray(result.innings) ? result.innings : [];
  const first = isRecord(innings[0]) ? innings[0] : null;
  const firstAway = numberFrom(first?.away) ?? numberFrom(first?.awayRuns) ?? teamStat(args.awayStatsJson, ["firstInningRuns", "runs1", "r1"]);
  const firstHome = numberFrom(first?.home) ?? numberFrom(first?.homeRuns) ?? teamStat(args.homeStatsJson, ["firstInningRuns", "runs1", "r1"]);
  const f5Away = numberFrom(result.firstFiveAwayRuns) ?? teamStat(args.awayStatsJson, ["firstFiveRuns", "f5Runs", "runsFirstFive"]);
  const f5Home = numberFrom(result.firstFiveHomeRuns) ?? teamStat(args.homeStatsJson, ["firstFiveRuns", "f5Runs", "runsFirstFive"]);

  switch (row.market) {
    case "nrfi":
    case "yrfi":
      return firstAway === null || firstHome === null ? null : firstAway + firstHome;
    case "first_five_total":
      return f5Away === null || f5Home === null ? null : f5Away + f5Home;
    case "first_five_home_ml":
      return f5Away === null || f5Home === null ? null : f5Home > f5Away ? 1 : 0;
    case "first_five_away_ml":
      return f5Away === null || f5Home === null ? null : f5Away > f5Home ? 1 : 0;
    default:
      return null;
  }
}

export function gradeMlbPlayerPropRow(row: MlbPlayerPropProjectionRow, statsJson: unknown) {
  const actual = actualPlayerStatForMarket(row, statsJson);
  const result = gradeOver(actual, row.line);
  return { actual, result, brier: brier(row.probabilityOver, result), logLoss: logLoss(row.probabilityOver, result) };
}

export function gradeMlbInningProjectionRow(row: MlbInningProjectionRow, args: { awayStatsJson?: unknown; homeStatsJson?: unknown; resultJson?: unknown } = {}) {
  const actual = actualInningStatForMarket(row, args);
  const result = row.market === "nrfi"
    ? actual === null ? "PENDING" : actual === 0 ? "WIN" : "LOSS"
    : row.market === "yrfi"
      ? actual === null ? "PENDING" : actual > 0 ? "WIN" : "LOSS"
      : row.market.endsWith("_ml")
        ? actual === null ? "PENDING" : actual === 1 ? "WIN" : "LOSS"
        : gradeProbability(actual, row.side, row.line);
  return { actual, result: result as MlbPropGradeResult, brier: brier(row.probability, result as MlbPropGradeResult), logLoss: logLoss(row.probability, result as MlbPropGradeResult) };
}

export async function ensureMlbPlayerPropInningLedgers() {
  if (!hasUsableServerDatabaseUrl()) return false;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_player_prop_projection_ledger (
      id TEXT PRIMARY KEY,
      projection_key TEXT NOT NULL UNIQUE,
      game_id TEXT NOT NULL,
      event_label TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      team TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      market TEXT NOT NULL,
      line DOUBLE PRECISION NOT NULL,
      projected_value DOUBLE PRECISION NOT NULL,
      probability_over DOUBLE PRECISION,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      result TEXT NOT NULL DEFAULT 'PENDING',
      actual_value DOUBLE PRECISION,
      brier DOUBLE PRECISION,
      log_loss DOUBLE PRECISION,
      projection_json JSONB,
      result_json JSONB,
      graded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS mlb_inning_market_projection_ledger (
      id TEXT PRIMARY KEY,
      projection_key TEXT NOT NULL UNIQUE,
      game_id TEXT NOT NULL,
      event_label TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      market TEXT NOT NULL,
      line DOUBLE PRECISION,
      side TEXT NOT NULL,
      projected_value DOUBLE PRECISION NOT NULL,
      probability DOUBLE PRECISION NOT NULL,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      result TEXT NOT NULL DEFAULT 'PENDING',
      actual_value DOUBLE PRECISION,
      brier DOUBLE PRECISION,
      log_loss DOUBLE PRECISION,
      projection_json JSONB,
      result_json JSONB,
      graded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_player_prop_projection_game_idx ON mlb_player_prop_projection_ledger (game_id, market, captured_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_player_prop_projection_player_idx ON mlb_player_prop_projection_ledger (player_id, market, captured_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_player_prop_projection_result_idx ON mlb_player_prop_projection_ledger (result, start_time);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_inning_market_projection_game_idx ON mlb_inning_market_projection_ledger (game_id, market, captured_at DESC);`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mlb_inning_market_projection_result_idx ON mlb_inning_market_projection_ledger (result, start_time);`);
  return true;
}

function projectionKey(parts: Array<string | number | null | undefined>) {
  return parts.map((part) => String(part ?? "na").replace(/[^a-zA-Z0-9_.:-]+/g, "-")).join(":");
}

export async function persistMlbPlayerPropProjectionRows(rows: MlbPlayerPropProjectionRow[]) {
  if (!rows.length) return { inserted: 0 };
  await ensureMlbPlayerPropInningLedgers();
  let inserted = 0;
  for (const row of rows) {
    const key = projectionKey(["MLB", row.gameId, row.playerId, row.market, row.line, new Date(row.startTime).toISOString().slice(0, 13)]);
    await prisma.$executeRaw`
      INSERT INTO mlb_player_prop_projection_ledger (
        id, projection_key, game_id, event_label, start_time, team, player_id, player_name, market, line,
        projected_value, probability_over, confidence, projection_json
      ) VALUES (
        ${crypto.randomUUID()}, ${key}, ${row.gameId}, ${row.eventLabel}, ${new Date(row.startTime)}, ${row.team}, ${row.playerId}, ${row.playerName}, ${row.market}, ${row.line},
        ${row.projectedValue}, ${row.probabilityOver}, ${row.confidence}, ${safeJson(row.projectionJson)}::jsonb
      )
      ON CONFLICT (projection_key) DO UPDATE SET
        projected_value = EXCLUDED.projected_value,
        probability_over = EXCLUDED.probability_over,
        confidence = EXCLUDED.confidence,
        projection_json = EXCLUDED.projection_json,
        captured_at = now(),
        updated_at = now();
    `;
    inserted += 1;
  }
  return { inserted };
}

export async function persistMlbInningProjectionRows(rows: MlbInningProjectionRow[]) {
  if (!rows.length) return { inserted: 0 };
  await ensureMlbPlayerPropInningLedgers();
  let inserted = 0;
  for (const row of rows) {
    const key = projectionKey(["MLB", row.gameId, row.market, row.side, row.line ?? "none", new Date(row.startTime).toISOString().slice(0, 13)]);
    await prisma.$executeRaw`
      INSERT INTO mlb_inning_market_projection_ledger (
        id, projection_key, game_id, event_label, start_time, market, line, side,
        projected_value, probability, confidence, projection_json
      ) VALUES (
        ${crypto.randomUUID()}, ${key}, ${row.gameId}, ${row.eventLabel}, ${new Date(row.startTime)}, ${row.market}, ${row.line}, ${row.side},
        ${row.projectedValue}, ${row.probability}, ${row.confidence}, ${safeJson(row.projectionJson)}::jsonb
      )
      ON CONFLICT (projection_key) DO UPDATE SET
        projected_value = EXCLUDED.projected_value,
        probability = EXCLUDED.probability,
        confidence = EXCLUDED.confidence,
        projection_json = EXCLUDED.projection_json,
        captured_at = now(),
        updated_at = now();
    `;
    inserted += 1;
  }
  return { inserted };
}
