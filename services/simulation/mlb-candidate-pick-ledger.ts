import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbIntelV7Ledgers } from "@/services/simulation/mlb-intel-v7-ledgers";
import { americanProfit, computeMlbSnapshotSettlementMath, type MlbSettlementResultLabel } from "@/services/simulation/mlb-settlement-math";

export type MlbCandidatePick = {
  eligible: boolean;
  reason: string | null;
  action: string | null;
  market: "moneyline" | "total" | null;
  side: "HOME" | "AWAY" | "OVER" | "UNDER" | null;
  rawProbability: number | null;
  calibratedProbability: number | null;
  marketNoVigProbability: number | null;
  edge: number | null;
  currentAmericanOdds: number | null;
  gateStatus: "candidate_shadow" | "official_allowed" | "blocked";
  gateBlockers: string[];
};

type SnapshotRow = {
  id: string;
  game_id: string;
  event_label: string;
  away_team: string;
  home_team: string;
  start_time: Date | string;
  captured_at: Date | string;
  model_version: string | null;
  model_home_win_pct: number | string;
  model_away_win_pct: number | string;
  model_spread: number | string | null;
  model_total: number | string | null;
  market_home_win_pct: number | string | null;
  market_total: number | string | null;
  final_home_score: number | string | null;
  final_away_score: number | string | null;
  home_won: boolean | null;
  prediction_json: unknown;
  graded_at: Date | string | null;
};

export type MlbCandidateBackfillSummary = {
  ok: boolean;
  databaseReady: boolean;
  dryRun: boolean;
  scanned: number;
  eligible: number;
  upserted: number;
  graded: number;
  skipped: number;
  errors: string[];
  samples: Array<{ gameId: string; eventLabel: string; action: string | null; market: string | null; side: string | null; result: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJson(value: unknown) {
  if (isRecord(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function get(source: unknown, path: string) {
  let current: unknown = source;
  for (const part of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function american(value: unknown) {
  const odds = num(value);
  if (odds == null || odds === 0 || Math.abs(odds) < 100 || Math.abs(odds) > 10000) return null;
  return Math.round(odds);
}

function round(value: number | null | undefined, digits = 4) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function bool(value: unknown) {
  return value === true || String(value).toLowerCase() === "true";
}

function topSignal(payload: Record<string, unknown> | null) {
  const signal = get(payload, "topSignal");
  return isRecord(signal) ? signal : null;
}

function actionPayload(signal: Record<string, unknown> | null) {
  const action = signal?.takeAction;
  return isRecord(action) ? action : null;
}

function sideProbabilityFromHome(side: "HOME" | "AWAY", homeProbability: number | null) {
  if (homeProbability == null) return null;
  return side === "HOME" ? homeProbability : 1 - homeProbability;
}

function totalProbability(action: Record<string, unknown> | null, side: "OVER" | "UNDER") {
  return num(get(action, side === "OVER" ? "totalProbability.over.probability" : "totalProbability.under.probability"));
}

function totalOdds(action: Record<string, unknown> | null, side: "OVER" | "UNDER") {
  return american(get(action, side === "OVER" ? "totalProbability.over.americanOdds" : "totalProbability.under.americanOdds"));
}

function moneylineOdds(payload: Record<string, unknown> | null, side: "HOME" | "AWAY") {
  const paths = side === "HOME"
    ? ["mlbIntel.market.homeOddsAmerican", "mlbIntel.market.homeMoneyline", "market.homeMoneyline", "topSignal.homeOddsAmerican", "topSignal.homeMoneyline"]
    : ["mlbIntel.market.awayOddsAmerican", "mlbIntel.market.awayMoneyline", "market.awayMoneyline", "topSignal.awayOddsAmerican", "topSignal.awayMoneyline"];
  for (const path of paths) {
    const odds = american(get(payload, path));
    if (odds != null) return odds;
  }
  return null;
}

function gateBlockers(payload: Record<string, unknown> | null) {
  const candidates = [
    get(payload, "v8PromotionGate.blockers"),
    get(payload, "mlbIntel.gatedPolicy.v8PromotionGate.blockers"),
    get(payload, "mlbIntel.premiumPolicy.blockers"),
    get(payload, "mlbIntel.premiumPolicy.warnings")
  ];
  return candidates.flatMap((value) => Array.isArray(value) ? value.map(String) : []).slice(0, 10);
}

export function extractMlbCandidatePickFromSnapshot(row: {
  prediction_json: unknown;
  model_home_win_pct?: unknown;
  model_away_win_pct?: unknown;
  market_home_win_pct?: unknown;
  model_total?: unknown;
  market_total?: unknown;
}): MlbCandidatePick {
  const payload = parseJson(row.prediction_json);
  const signal = topSignal(payload);
  const action = actionPayload(signal);
  const actionName = String(action?.action ?? signal?.action ?? "").toUpperCase() || null;
  const roiEligible = bool(action?.roiEligible) || actionName === "ATTACK" || actionName === "PLAY";
  const rawMarket = String(signal?.market ?? "").toLowerCase();
  const blockers = gateBlockers(payload);

  if (!(actionName === "ATTACK" || actionName === "PLAY") || !roiEligible) {
    return { eligible: false, reason: "not ATTACK/PLAY roi eligible", action: actionName, market: null, side: null, rawProbability: null, calibratedProbability: null, marketNoVigProbability: null, edge: null, currentAmericanOdds: null, gateStatus: "blocked", gateBlockers: blockers };
  }

  if (rawMarket === "home_ml" || rawMarket === "away_ml") {
    const side = rawMarket === "home_ml" ? "HOME" : "AWAY";
    const rawHome = num(row.model_home_win_pct);
    const calibratedHome = num(get(payload, "mlbIntel.calibration.calibratedHomeWinPct")) ?? rawHome;
    const marketHome = num(row.market_home_win_pct) ?? num(get(payload, "mlbIntel.market.homeNoVigProbability"));
    const calibratedProbability = sideProbabilityFromHome(side, calibratedHome);
    const marketNoVigProbability = sideProbabilityFromHome(side, marketHome);
    return {
      eligible: calibratedProbability != null,
      reason: calibratedProbability == null ? "missing probability" : null,
      action: actionName,
      market: "moneyline",
      side,
      rawProbability: sideProbabilityFromHome(side, rawHome),
      calibratedProbability,
      marketNoVigProbability,
      edge: calibratedProbability != null && marketNoVigProbability != null ? round(calibratedProbability - marketNoVigProbability) : null,
      currentAmericanOdds: moneylineOdds(payload, side),
      gateStatus: blockers.length ? "candidate_shadow" : "candidate_shadow",
      gateBlockers: blockers
    };
  }

  if (rawMarket === "over" || rawMarket === "under") {
    const side = rawMarket === "over" ? "OVER" : "UNDER";
    const probability = totalProbability(action, side) ?? num(get(signal, "probability"));
    return {
      eligible: probability != null,
      reason: probability == null ? "missing total probability" : null,
      action: actionName,
      market: "total",
      side,
      rawProbability: probability,
      calibratedProbability: probability,
      marketNoVigProbability: null,
      edge: num(get(signal, "edge")),
      currentAmericanOdds: totalOdds(action, side),
      gateStatus: "candidate_shadow",
      gateBlockers: blockers
    };
  }

  return { eligible: false, reason: rawMarket ? `unsupported market ${rawMarket}` : "missing market", action: actionName, market: null, side: null, rawProbability: null, calibratedProbability: null, marketNoVigProbability: null, edge: null, currentAmericanOdds: null, gateStatus: "blocked", gateBlockers: blockers };
}

function resultFor(row: SnapshotRow, pick: MlbCandidatePick) {
  const home = num(row.final_home_score);
  const away = num(row.final_away_score);
  if (!row.graded_at || home == null || away == null || !pick.side) return { result: "PENDING", brier: null, logLoss: null, roi: null, profitLoss: null };
  let result: MlbSettlementResultLabel;
  let outcome: 0 | 1 | null = null;

  if (pick.market === "moneyline" && (pick.side === "HOME" || pick.side === "AWAY")) {
    if (home === away) result = "PUSH";
    else {
      const homeWon = home > away;
      const won = pick.side === "HOME" ? homeWon : !homeWon;
      result = won ? "WIN" : "LOSS";
      outcome = won ? 1 : 0;
    }
  } else if (pick.market === "total" && (pick.side === "OVER" || pick.side === "UNDER")) {
    const marketTotal = num(row.market_total);
    if (marketTotal == null) return { result: "PENDING", brier: null, logLoss: null, roi: null, profitLoss: null };
    const actualTotal = home + away;
    if (actualTotal === marketTotal) result = "PUSH";
    else {
      const won = pick.side === "OVER" ? actualTotal > marketTotal : actualTotal < marketTotal;
      result = won ? "WIN" : "LOSS";
      outcome = won ? 1 : 0;
    }
  } else {
    return { result: "PENDING", brier: null, logLoss: null, roi: null, profitLoss: null };
  }

  const probability = pick.calibratedProbability;
  const brier = outcome == null || probability == null ? null : (probability - outcome) ** 2;
  const logLoss = outcome == null || probability == null ? null : outcome === 1 ? -Math.log(Math.max(0.001, probability)) : -Math.log(Math.max(0.001, 1 - probability));
  const profitLoss = americanProfit(result, pick.currentAmericanOdds);
  return { result, brier: round(brier, 6), logLoss: round(logLoss, 6), roi: result === "PUSH" ? 0 : round(profitLoss, 4), profitLoss: round(profitLoss, 4) };
}

async function ensureCandidateColumns() {
  await ensureMlbIntelV7Ledgers();
  await prisma.$executeRawUnsafe(`ALTER TABLE mlb_official_pick_ledger ADD COLUMN IF NOT EXISTS gate_status TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE mlb_official_pick_ledger ADD COLUMN IF NOT EXISTS gate_blockers JSONB;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE mlb_official_pick_ledger ADD COLUMN IF NOT EXISTS current_american_odds DOUBLE PRECISION;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE mlb_official_pick_ledger ADD COLUMN IF NOT EXISTS closing_american_odds DOUBLE PRECISION;`);
}

export async function backfillMlbCandidatePickLedger(options: { limit?: number; dryRun?: boolean } = {}): Promise<MlbCandidateBackfillSummary> {
  const databaseReady = hasUsableServerDatabaseUrl();
  const dryRun = options.dryRun === true;
  const limit = Math.max(1, Math.min(10000, Math.round(options.limit ?? 5000)));
  const summary: MlbCandidateBackfillSummary = { ok: databaseReady, databaseReady, dryRun, scanned: 0, eligible: 0, upserted: 0, graded: 0, skipped: 0, errors: [], samples: [] };
  if (!databaseReady) {
    summary.errors.push("No usable server database URL is configured.");
    return summary;
  }
  if (!dryRun) await ensureCandidateColumns();

  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT id, game_id, event_label, away_team, home_team, start_time, captured_at, model_version,
      model_home_win_pct, model_away_win_pct, model_spread, model_total, market_home_win_pct, market_total,
      final_home_score, final_away_score, home_won, prediction_json, graded_at
    FROM sim_prediction_snapshots
    WHERE UPPER(league) = 'MLB'
      AND prediction_json IS NOT NULL
    ORDER BY captured_at DESC
    LIMIT ${limit};
  `;
  summary.scanned = rows.length;

  for (const row of rows) {
    try {
      const pick = extractMlbCandidatePickFromSnapshot(row);
      if (!pick.eligible || !pick.market || !pick.side || pick.calibratedProbability == null) {
        summary.skipped += 1;
        continue;
      }
      summary.eligible += 1;
      const graded = resultFor(row, pick);
      const id = `candidate:${row.id}:${pick.market}:${pick.side}`;
      const modelVersion = `${row.model_version ?? "sim_prediction_snapshot"}:candidate`;
      const predictionPayload = parseJson(row.prediction_json) ?? {};
      if (!dryRun) {
        await prisma.$executeRaw`
          INSERT INTO mlb_official_pick_ledger (
            id, game_id, event_label, away_team, home_team, start_time, market, side, model_version,
            captured_at, released_at, raw_probability, calibrated_probability, market_no_vig_probability, edge,
            market_open_odds, current_american_odds, result, brier, log_loss, roi, profit_loss,
            prediction_json, result_json, graded_at, gate_status, gate_blockers
          ) VALUES (
            ${id}, ${row.game_id}, ${row.event_label}, ${row.away_team}, ${row.home_team}, ${new Date(row.start_time)}, ${pick.market}, ${pick.side}, ${modelVersion},
            ${new Date(row.captured_at)}, ${new Date(row.captured_at)}, ${pick.rawProbability ?? pick.calibratedProbability}, ${pick.calibratedProbability}, ${pick.marketNoVigProbability}, ${pick.edge},
            ${pick.currentAmericanOdds}, ${pick.currentAmericanOdds}, ${graded.result}, ${graded.brier}, ${graded.logLoss}, ${graded.roi}, ${graded.profitLoss},
            ${JSON.stringify({ ...predictionPayload, candidatePick: pick })}::jsonb,
            ${JSON.stringify({ sourceSnapshotId: row.id, candidate: true })}::jsonb,
            ${row.graded_at ? new Date(row.graded_at) : null}, ${pick.gateStatus}, ${JSON.stringify(pick.gateBlockers)}::jsonb
          )
          ON CONFLICT (game_id, market, side, model_version) DO UPDATE SET
            captured_at = EXCLUDED.captured_at,
            raw_probability = EXCLUDED.raw_probability,
            calibrated_probability = EXCLUDED.calibrated_probability,
            market_no_vig_probability = EXCLUDED.market_no_vig_probability,
            edge = EXCLUDED.edge,
            market_open_odds = EXCLUDED.market_open_odds,
            current_american_odds = EXCLUDED.current_american_odds,
            result = EXCLUDED.result,
            brier = EXCLUDED.brier,
            log_loss = EXCLUDED.log_loss,
            roi = EXCLUDED.roi,
            profit_loss = EXCLUDED.profit_loss,
            prediction_json = EXCLUDED.prediction_json,
            result_json = EXCLUDED.result_json,
            graded_at = EXCLUDED.graded_at,
            gate_status = EXCLUDED.gate_status,
            gate_blockers = EXCLUDED.gate_blockers,
            updated_at = now();
        `;
      }
      summary.upserted += 1;
      if (graded.result !== "PENDING") summary.graded += 1;
      if (summary.samples.length < 10) summary.samples.push({ gameId: row.game_id, eventLabel: row.event_label, action: pick.action, market: pick.market, side: pick.side, result: graded.result });
    } catch (error) {
      summary.errors.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  summary.ok = summary.errors.length === 0 || summary.upserted > 0;
  return summary;
}
