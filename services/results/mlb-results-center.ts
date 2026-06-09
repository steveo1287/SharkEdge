import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export type ResultsMarket = "overview" | "moneyline" | "nrfi" | "props" | "trends";
export type ResultsStatus = "WIN" | "LOSS" | "PUSH" | "PENDING" | "WATCH" | "ACTIONABLE" | "PASS" | "RESEARCH" | "WAIT";

export type ResultsSummary = {
  edgePicks: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  unitsNet: number | null;
  roiPct: number | null;
  winRatePct: number | null;
  avgModelProbabilityPct: number | null;
  avgEdgePct: number | null;
  avgClvCents: number | null;
  actualOddsCount: number;
  fallbackOddsCount: number;
};

export type ResultsLedgerRow = {
  id: string;
  market: ResultsMarket;
  marketLabel: string;
  eventLabel: string;
  pickLabel: string;
  sideLabel: string;
  result: ResultsStatus;
  modelProbability: number | null;
  marketProbability: number | null;
  edgePct: number | null;
  oddsAmerican: number | null;
  units: number | null;
  capturedAt: string | null;
  settledAt: string | null;
  lockStatus: "LOCKED" | "TRACKED" | "PROOF" | "PENDING";
  detailHref: string;
  note: string;
};

export type ResultsMarketCard = {
  key: ResultsMarket;
  label: string;
  href: string;
  summary: ResultsSummary;
  available: boolean;
  note: string;
};

export type ResultsCenterData = {
  ok: boolean;
  generatedAt: string;
  selectedMarket: ResultsMarket;
  title: string;
  subtitle: string;
  windowLabel: string;
  summary: ResultsSummary;
  marketCards: ResultsMarketCard[];
  rows: ResultsLedgerRow[];
  warnings: string[];
};

type InningLedgerQueryRow = {
  id: string;
  game_id: string;
  event_label: string;
  start_time: Date | string;
  market: string;
  line: number | string | null;
  side: string;
  projected_value: number | string;
  probability: number | string;
  confidence: number | string;
  captured_at: Date | string;
  result: string;
  actual_value: number | string | null;
  brier: number | string | null;
  log_loss: number | string | null;
  graded_at: Date | string | null;
};

type PlayerPropLedgerQueryRow = {
  id: string;
  game_id: string;
  event_label: string;
  start_time: Date | string;
  team: string;
  player_id: string;
  player_name: string;
  market: string;
  line: number | string;
  projected_value: number | string;
  probability_over: number | string | null;
  confidence: number | string;
  captured_at: Date | string;
  result: string;
  actual_value: number | string | null;
  brier: number | string | null;
  log_loss: number | string | null;
  graded_at: Date | string | null;
};

const RESULT_MARKETS: Array<{ key: ResultsMarket; label: string; href: string; note: string }> = [
  { key: "overview", label: "Overview", href: "/results", note: "Combined ledger snapshot." },
  { key: "moneyline", label: "Moneyline", href: "/results/moneyline", note: "Official MLB moneyline sim ledger." },
  { key: "nrfi", label: "NRFI", href: "/results/nrfi", note: "First-inning projection ledger." },
  { key: "props", label: "Props", href: "/results/props", note: "Player prop projection ledger." },
  { key: "trends", label: "Trends", href: "/results/trends", note: "SharkTrends proof and active qualifier board." }
];

const ZERO_SUMMARY: ResultsSummary = {
  edgePicks: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  pending: 0,
  unitsNet: null,
  roiPct: null,
  winRatePct: null,
  avgModelProbabilityPct: null,
  avgEdgePct: null,
  avgClvCents: null,
  actualOddsCount: 0,
  fallbackOddsCount: 0
};

export function normalizeResultsMarket(value: unknown): ResultsMarket {
  const normalized = String(value ?? "overview").trim().toLowerCase();
  if (normalized === "moneyline" || normalized === "nrfi" || normalized === "props" || normalized === "trends") return normalized;
  return "overview";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function iso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function payoutForWin(americanOdds: number | null | undefined) {
  if (typeof americanOdds !== "number" || !Number.isFinite(americanOdds) || americanOdds === 0) return 100 / 110;
  return americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds);
}

function unitsFor(result: ResultsStatus, americanOdds: number | null | undefined) {
  if (result === "WIN") return round(payoutForWin(americanOdds), 2);
  if (result === "LOSS") return -1;
  if (result === "PUSH") return 0;
  return null;
}

function normalizeResult(value: unknown): ResultsStatus {
  const result = String(value ?? "PENDING").toUpperCase();
  if (result === "WIN" || result === "LOSS" || result === "PUSH" || result === "PENDING") return result;
  if (result.includes("ACTION")) return "ACTIONABLE";
  if (result.includes("RESEARCH")) return "RESEARCH";
  if (result.includes("WATCH")) return "WATCH";
  if (result.includes("WAIT")) return "WAIT";
  if (result.includes("PASS")) return "PASS";
  return "PENDING";
}

function avg(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function buildSummary(rows: ResultsLedgerRow[]): ResultsSummary {
  const wins = rows.filter((row) => row.result === "WIN").length;
  const losses = rows.filter((row) => row.result === "LOSS").length;
  const pushes = rows.filter((row) => row.result === "PUSH").length;
  const pending = rows.filter((row) => row.result === "PENDING" || row.result === "WAIT" || row.result === "WATCH" || row.result === "RESEARCH" || row.result === "ACTIONABLE").length;
  const graded = wins + losses + pushes;
  const decisions = wins + losses;
  const unitValues = rows.map((row) => row.units).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const unitsNet = unitValues.length ? round(unitValues.reduce((sum, value) => sum + value, 0), 2) : null;

  return {
    edgePicks: rows.length,
    wins,
    losses,
    pushes,
    pending,
    unitsNet,
    roiPct: graded && unitsNet != null ? round(unitsNet / graded * 100, 1) : null,
    winRatePct: decisions ? round(wins / decisions * 100, 1) : null,
    avgModelProbabilityPct: round(avg(rows.map((row) => typeof row.modelProbability === "number" ? row.modelProbability * 100 : null)), 1),
    avgEdgePct: round(avg(rows.map((row) => row.edgePct)), 1),
    avgClvCents: round(avg(rows.map((row) => row.market === "trends" ? row.edgePct : null)), 1),
    actualOddsCount: rows.filter((row) => row.oddsAmerican != null).length,
    fallbackOddsCount: rows.filter((row) => row.result === "WIN" || row.result === "LOSS" || row.result === "PUSH").filter((row) => row.oddsAmerican == null).length
  };
}

function emptyMarketCard(key: ResultsMarket, warnings: string[] = []): ResultsMarketCard {
  const config = RESULT_MARKETS.find((item) => item.key === key)!;
  return { key, label: config.label, href: config.href, summary: ZERO_SUMMARY, available: false, note: warnings[0] ?? config.note };
}

function labelFromMarket(market: string) {
  return market
    .replace(/^hitter_/, "")
    .replace(/^pitcher_/, "Pitcher ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function probabilityEdge(modelProbability: number | null, marketProbability: number | null) {
  if (modelProbability == null || marketProbability == null) return null;
  return round((modelProbability - marketProbability) * 100, 1);
}

async function moneylineRows(): Promise<{ rows: ResultsLedgerRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const scorecard = await getSimModelScorecard({ market: "moneyline", windowDays: 30 });
    if (!scorecard.databaseReady) warnings.push(scorecard.error ?? "Moneyline database is not ready.");
    if (scorecard.error) warnings.push(scorecard.error);
    const recent = Array.isArray(scorecard.recent) ? scorecard.recent : [];

    const rows = recent
      .filter((row) => row && (row.side === "HOME" || row.side === "AWAY"))
      .slice(0, 80)
      .map((row): ResultsLedgerRow => {
        const homeModelProbability = numberValue(row.modelProbability);
        const homeMarketProbability = numberValue(row.marketProbability);
        const modelProbability = row.side === "AWAY" && homeModelProbability != null ? 1 - homeModelProbability : homeModelProbability;
        const marketProbability = row.side === "AWAY" && homeMarketProbability != null ? 1 - homeMarketProbability : homeMarketProbability;
        const result = normalizeResult(row.resultBucket);
        const oddsAmerican = numberValue(row.selectedAmericanOdds);
        return {
          id: `moneyline:${row.id}`,
          market: "moneyline",
          marketLabel: "Moneyline",
          eventLabel: row.eventLabel ?? row.gameId ?? "MLB game",
          pickLabel: `${row.side} ML`,
          sideLabel: String(row.side),
          result,
          modelProbability,
          marketProbability,
          edgePct: probabilityEdge(modelProbability, marketProbability),
          oddsAmerican,
          units: unitsFor(result, oddsAmerican),
          capturedAt: row.predictionTime ?? row.createdAt ?? null,
          settledAt: row.settledAt ?? null,
          lockStatus: row.resultBucket === "PENDING" ? "PENDING" : "LOCKED",
          detailHref: row.gameId ? `/game/${encodeURIComponent(row.gameId)}` : "/sim/mlb",
          note: row.roiExclusionReason ? `Excluded: ${row.roiExclusionReason}` : row.oddsSource ? `Odds source: ${row.oddsSource}` : "Official sim snapshot ledger"
        };
      });

    return { rows, warnings };
  } catch (error) {
    return { rows: [], warnings: [error instanceof Error ? error.message : "Moneyline result ledger failed to load."] };
  }
}

async function inningRows(): Promise<{ rows: ResultsLedgerRow[]; warnings: string[] }> {
  if (!hasUsableServerDatabaseUrl()) return { rows: [], warnings: ["No usable server database URL is configured."] };
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const ledgerRows = await prisma.$queryRaw<InningLedgerQueryRow[]>`
      SELECT id, game_id, event_label, start_time, market, line, side, projected_value,
        probability, confidence, captured_at, result, actual_value, brier, log_loss, graded_at
      FROM mlb_inning_market_projection_ledger
      WHERE captured_at >= ${since}
        AND market IN ('nrfi', 'yrfi')
      ORDER BY captured_at DESC
      LIMIT 150;
    `;

    const rows = ledgerRows.map((row): ResultsLedgerRow => {
      const probability = numberValue(row.probability);
      const result = normalizeResult(row.result);
      return {
        id: `nrfi:${row.id}`,
        market: "nrfi",
        marketLabel: row.market.toUpperCase(),
        eventLabel: row.event_label,
        pickLabel: row.market.toUpperCase(),
        sideLabel: row.side.replace(/_/g, " "),
        result,
        modelProbability: probability,
        marketProbability: null,
        edgePct: null,
        oddsAmerican: null,
        units: unitsFor(result, null),
        capturedAt: iso(row.captured_at),
        settledAt: iso(row.graded_at),
        lockStatus: result === "PENDING" ? "PENDING" : "LOCKED",
        detailHref: `/sim/mlb/${encodeURIComponent(row.game_id)}/nrfi-f5`,
        note: `Projected ${numberValue(row.projected_value) ?? "—"}; confidence ${round((numberValue(row.confidence) ?? 0) * 100, 1) ?? "—"}%`
      };
    });

    return { rows, warnings: [] };
  } catch (error) {
    return { rows: [], warnings: [error instanceof Error ? error.message : "NRFI ledger failed to load."] };
  }
}

async function propRows(): Promise<{ rows: ResultsLedgerRow[]; warnings: string[] }> {
  if (!hasUsableServerDatabaseUrl()) return { rows: [], warnings: ["No usable server database URL is configured."] };
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const ledgerRows = await prisma.$queryRaw<PlayerPropLedgerQueryRow[]>`
      SELECT id, game_id, event_label, start_time, team, player_id, player_name, market, line,
        projected_value, probability_over, confidence, captured_at, result, actual_value, brier, log_loss, graded_at
      FROM mlb_player_prop_projection_ledger
      WHERE captured_at >= ${since}
      ORDER BY captured_at DESC
      LIMIT 150;
    `;

    const rows = ledgerRows.map((row): ResultsLedgerRow => {
      const probability = numberValue(row.probability_over);
      const line = numberValue(row.line);
      const result = normalizeResult(row.result);
      return {
        id: `props:${row.id}`,
        market: "props",
        marketLabel: labelFromMarket(row.market),
        eventLabel: row.event_label,
        pickLabel: `${row.player_name} over ${line ?? "—"}`,
        sideLabel: row.team,
        result,
        modelProbability: probability,
        marketProbability: null,
        edgePct: null,
        oddsAmerican: null,
        units: unitsFor(result, null),
        capturedAt: iso(row.captured_at),
        settledAt: iso(row.graded_at),
        lockStatus: result === "PENDING" ? "PENDING" : "LOCKED",
        detailHref: row.game_id ? `/sim/mlb/${encodeURIComponent(row.game_id)}` : "/sim/mlb",
        note: `${labelFromMarket(row.market)} projection ${round(numberValue(row.projected_value), 2) ?? "—"}; actual ${round(numberValue(row.actual_value), 2) ?? "pending"}`
      };
    });

    return { rows, warnings: [] };
  } catch (error) {
    return { rows: [], warnings: [error instanceof Error ? error.message : "Player prop ledger failed to load."] };
  }
}

async function trendRows(): Promise<{ rows: ResultsLedgerRow[]; warnings: string[] }> {
  try {
    const snapshot = await buildTrendsCenterSnapshot();
    const rows = snapshot.promotionBoard.slice(0, 50).map((row): ResultsLedgerRow => {
      const action = normalizeResult(row.actionState);
      return {
        id: `trends:${row.id}`,
        market: "trends",
        marketLabel: row.market,
        eventLabel: row.name,
        pickLabel: row.primaryAction,
        sideLabel: `${row.league} · ${row.category}`,
        result: action,
        modelProbability: row.proof.winRatePct / 100,
        marketProbability: null,
        edgePct: row.proof.clvPct,
        oddsAmerican: null,
        units: typeof row.proof.profitUnits === "number" ? row.proof.profitUnits : null,
        capturedAt: snapshot.generatedAt,
        settledAt: null,
        lockStatus: "PROOF",
        detailHref: row.href,
        note: `${row.proof.record} · ${row.proof.roiPct}% ROI · ${row.proof.grade} proof · ${row.blockers.length ? `Blockers: ${row.blockers.join(", ")}` : "No hard blockers"}`
      };
    });

    return { rows, warnings: snapshot.operatorAlerts.map((alert) => `${alert.title}: ${alert.detail}`).slice(0, 3) };
  } catch (error) {
    return { rows: [], warnings: [error instanceof Error ? error.message : "Trend proof board failed to load."] };
  }
}

function cardFor(key: ResultsMarket, rows: ResultsLedgerRow[], warnings: string[] = []): ResultsMarketCard {
  const config = RESULT_MARKETS.find((item) => item.key === key)!;
  return {
    key,
    label: config.label,
    href: config.href,
    summary: buildSummary(rows),
    available: rows.length > 0,
    note: warnings[0] ?? config.note
  };
}

function aggregateSummary(cards: ResultsMarketCard[]) {
  const rows = cards.flatMap((card) => {
    const synthetic: ResultsLedgerRow[] = [];
    for (let index = 0; index < card.summary.wins; index += 1) synthetic.push({ id: `${card.key}:w:${index}`, market: card.key, marketLabel: card.label, eventLabel: card.label, pickLabel: "WIN", sideLabel: "", result: "WIN", modelProbability: null, marketProbability: null, edgePct: null, oddsAmerican: null, units: null, capturedAt: null, settledAt: null, lockStatus: "TRACKED", detailHref: card.href, note: "" });
    for (let index = 0; index < card.summary.losses; index += 1) synthetic.push({ id: `${card.key}:l:${index}`, market: card.key, marketLabel: card.label, eventLabel: card.label, pickLabel: "LOSS", sideLabel: "", result: "LOSS", modelProbability: null, marketProbability: null, edgePct: null, oddsAmerican: null, units: null, capturedAt: null, settledAt: null, lockStatus: "TRACKED", detailHref: card.href, note: "" });
    for (let index = 0; index < card.summary.pushes; index += 1) synthetic.push({ id: `${card.key}:p:${index}`, market: card.key, marketLabel: card.label, eventLabel: card.label, pickLabel: "PUSH", sideLabel: "", result: "PUSH", modelProbability: null, marketProbability: null, edgePct: null, oddsAmerican: null, units: null, capturedAt: null, settledAt: null, lockStatus: "TRACKED", detailHref: card.href, note: "" });
    for (let index = 0; index < card.summary.pending; index += 1) synthetic.push({ id: `${card.key}:pd:${index}`, market: card.key, marketLabel: card.label, eventLabel: card.label, pickLabel: "PENDING", sideLabel: "", result: "PENDING", modelProbability: null, marketProbability: null, edgePct: null, oddsAmerican: null, units: null, capturedAt: null, settledAt: null, lockStatus: "PENDING", detailHref: card.href, note: "" });
    return synthetic;
  });
  const summary = buildSummary(rows);
  const unitValues = cards.map((card) => card.summary.unitsNet).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const edgeValues = cards.map((card) => card.summary.avgEdgePct).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    ...summary,
    edgePicks: cards.reduce((sum, card) => sum + card.summary.edgePicks, 0),
    unitsNet: unitValues.length ? round(unitValues.reduce((sum, value) => sum + value, 0), 2) : summary.unitsNet,
    avgEdgePct: edgeValues.length ? round(avg(edgeValues), 1) : summary.avgEdgePct,
    actualOddsCount: cards.reduce((sum, card) => sum + card.summary.actualOddsCount, 0),
    fallbackOddsCount: cards.reduce((sum, card) => sum + card.summary.fallbackOddsCount, 0)
  };
}

function titleFor(market: ResultsMarket) {
  if (market === "moneyline") return "Moneyline Results";
  if (market === "nrfi") return "NRFI Results";
  if (market === "props") return "Player Prop Results";
  if (market === "trends") return "Trend Proof Results";
  return "Results Center";
}

function subtitleFor(market: ResultsMarket) {
  if (market === "moneyline") return "Official MLB moneyline picks against final results, captured odds, units, and edge proof.";
  if (market === "nrfi") return "First-inning NRFI/YRFI projection ledger with pending, hit, miss, and fallback-unit tracking.";
  if (market === "props") return "Player projection ledger for hits, total bases, runs, RBI, pitcher outs, strikeouts, and earned runs.";
  if (market === "trends") return "SharkTrends proof board ranked by verified sample, ROI, CLV, blockers, and active qualifiers.";
  return "A mobile-first ledger for every model lane: record, ROI, lock status, odds proof, and recent pick rows.";
}

export async function getResultsCenter(selectedMarket: ResultsMarket = "overview"): Promise<ResultsCenterData> {
  const market = normalizeResultsMarket(selectedMarket);
  const [moneyline, innings, props, trends] = await Promise.all([moneylineRows(), inningRows(), propRows(), trendRows()]);
  const moneylineCard = cardFor("moneyline", moneyline.rows, moneyline.warnings);
  const nrfiCard = cardFor("nrfi", innings.rows, innings.warnings);
  const propsCard = cardFor("props", props.rows, props.warnings);
  const trendsCard = cardFor("trends", trends.rows, trends.warnings);
  const cards = [moneylineCard, nrfiCard, propsCard, trendsCard];
  const selectedRows = market === "moneyline" ? moneyline.rows : market === "nrfi" ? innings.rows : market === "props" ? props.rows : market === "trends" ? trends.rows : [...moneyline.rows.slice(0, 20), ...innings.rows.slice(0, 20), ...props.rows.slice(0, 20), ...trends.rows.slice(0, 12)]
    .sort((left, right) => new Date(right.capturedAt ?? 0).getTime() - new Date(left.capturedAt ?? 0).getTime())
    .slice(0, 80);
  const selectedSummary = market === "overview" ? aggregateSummary(cards) : buildSummary(selectedRows);
  const warnings = [...moneyline.warnings, ...innings.warnings, ...props.warnings, ...trends.warnings].filter(Boolean);

  return {
    ok: cards.some((card) => card.available),
    generatedAt: new Date().toISOString(),
    selectedMarket: market,
    title: titleFor(market),
    subtitle: subtitleFor(market),
    windowLabel: "Last 30 days",
    summary: selectedSummary,
    marketCards: [
      { key: "overview", label: "Overview", href: "/results", summary: aggregateSummary(cards), available: cards.some((card) => card.available), note: "Combined result ledger." },
      ...cards
    ],
    rows: selectedRows,
    warnings: [...new Set(warnings)].slice(0, 5)
  };
}
