import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { getSimModelScorecard } from "@/services/sim/mlb-moneyline-scorecard";
import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export type ResultsMarket = "overview" | "moneyline" | "nrfi" | "props" | "trends";
export type ResultsStatus = "WIN" | "LOSS" | "PUSH" | "PENDING" | "WATCH" | "ACTIONABLE" | "PASS" | "RESEARCH" | "WAIT";

export type ResultsSummary = { edgePicks: number; wins: number; losses: number; pushes: number; pending: number; unitsNet: number | null; roiPct: number | null; winRatePct: number | null; avgModelProbabilityPct: number | null; avgEdgePct: number | null; avgClvCents: number | null; actualOddsCount: number; fallbackOddsCount: number };
export type ResultsLedgerRow = { id: string; market: ResultsMarket; marketLabel: string; eventLabel: string; pickLabel: string; sideLabel: string; result: ResultsStatus; modelProbability: number | null; marketProbability: number | null; edgePct: number | null; oddsAmerican: number | null; units: number | null; capturedAt: string | null; settledAt: string | null; lockStatus: "LOCKED" | "TRACKED" | "PROOF" | "PENDING"; detailHref: string; note: string };
export type ResultsMarketCard = { key: ResultsMarket; label: string; href: string; summary: ResultsSummary; available: boolean; note: string };
export type ResultsCenterData = { ok: boolean; generatedAt: string; selectedMarket: ResultsMarket; title: string; subtitle: string; windowLabel: string; summary: ResultsSummary; marketCards: ResultsMarketCard[]; rows: ResultsLedgerRow[]; warnings: string[] };

type RowBundle = { rows: ResultsLedgerRow[]; warnings: string[] };

const ZERO: ResultsSummary = { edgePicks: 0, wins: 0, losses: 0, pushes: 0, pending: 0, unitsNet: null, roiPct: null, winRatePct: null, avgModelProbabilityPct: null, avgEdgePct: null, avgClvCents: null, actualOddsCount: 0, fallbackOddsCount: 0 };
const MARKETS: Array<{ key: ResultsMarket; label: string; href: string; note: string }> = [
  { key: "overview", label: "Overview", href: "/results", note: "Combined result ledger." },
  { key: "moneyline", label: "Moneyline", href: "/results/moneyline", note: "Official MLB moneyline sim ledger." },
  { key: "nrfi", label: "NRFI", href: "/results/nrfi", note: "First-inning projection ledger." },
  { key: "props", label: "Props", href: "/results/props", note: "Player prop projection ledger." },
  { key: "trends", label: "Trends", href: "/results/trends", note: "Trend proof board." }
];

export function normalizeResultsMarket(value: unknown): ResultsMarket {
  const v = String(value ?? "overview").trim().toLowerCase();
  return v === "moneyline" || v === "nrfi" || v === "props" || v === "trends" ? v : "overview";
}

function n(value: unknown) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "bigint") return Number(value); if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return null; }
function r(value: number | null | undefined, digits = 2) { return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null; }
function iso(value: unknown) { if (!value) return null; const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function avg(values: Array<number | null | undefined>) { const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)); return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null; }
function result(value: unknown): ResultsStatus { const v = String(value ?? "PENDING").toUpperCase(); if (v === "WIN" || v === "LOSS" || v === "PUSH" || v === "PENDING") return v; if (v.includes("ACTION")) return "ACTIONABLE"; if (v.includes("RESEARCH")) return "RESEARCH"; if (v.includes("WATCH")) return "WATCH"; if (v.includes("WAIT")) return "WAIT"; if (v.includes("PASS")) return "PASS"; return "PENDING"; }
function winPayout(american: number | null) { if (!american) return 100 / 110; return american > 0 ? american / 100 : 100 / Math.abs(american); }
function unitsFor(status: ResultsStatus, american: number | null) { if (status === "WIN") return r(winPayout(american), 2); if (status === "LOSS") return -1; if (status === "PUSH") return 0; return null; }
function edge(model: number | null, market: number | null) { return model == null || market == null ? null : r((model - market) * 100, 1); }
function marketName(value: string) { return value.replace(/^hitter_/, "").replace(/^pitcher_/, "Pitcher ").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }

function summary(rows: ResultsLedgerRow[]): ResultsSummary {
  const wins = rows.filter((row) => row.result === "WIN").length;
  const losses = rows.filter((row) => row.result === "LOSS").length;
  const pushes = rows.filter((row) => row.result === "PUSH").length;
  const pending = rows.filter((row) => row.result === "PENDING" || row.result === "WAIT" || row.result === "WATCH" || row.result === "RESEARCH" || row.result === "ACTIONABLE").length;
  const units = rows.map((row) => row.units).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const unitTotal = units.length ? r(units.reduce((sum, value) => sum + value, 0), 2) : null;
  const graded = wins + losses + pushes;
  return { edgePicks: rows.length, wins, losses, pushes, pending, unitsNet: unitTotal, roiPct: graded && unitTotal != null ? r(unitTotal / graded * 100, 1) : null, winRatePct: wins + losses ? r(wins / (wins + losses) * 100, 1) : null, avgModelProbabilityPct: r(avg(rows.map((row) => row.modelProbability == null ? null : row.modelProbability * 100)), 1), avgEdgePct: r(avg(rows.map((row) => row.edgePct)), 1), avgClvCents: r(avg(rows.filter((row) => row.market === "trends").map((row) => row.edgePct)), 1), actualOddsCount: rows.filter((row) => row.oddsAmerican != null).length, fallbackOddsCount: rows.filter((row) => (row.result === "WIN" || row.result === "LOSS" || row.result === "PUSH") && row.oddsAmerican == null).length };
}

async function moneylineRows(): Promise<RowBundle> {
  try {
    const board: any = await getSimModelScorecard({ market: "moneyline", windowDays: 30 });
    const warnings = [board.error].filter((value): value is string => typeof value === "string" && value.length > 0);
    const rows = (Array.isArray(board.recent) ? board.recent : []).filter((row: any) => row.side === "HOME" || row.side === "AWAY").slice(0, 80).map((row: any): ResultsLedgerRow => { const homeModel = n(row.modelProbability); const homeMarket = n(row.marketProbability); const model = row.side === "AWAY" && homeModel != null ? 1 - homeModel : homeModel; const market = row.side === "AWAY" && homeMarket != null ? 1 - homeMarket : homeMarket; const status = result(row.resultBucket); const american = n(row.selectedAmericanOdds); return { id: `moneyline:${row.id}`, market: "moneyline", marketLabel: "Moneyline", eventLabel: row.eventLabel ?? row.gameId ?? "MLB game", pickLabel: `${row.side} ML`, sideLabel: String(row.side), result: status, modelProbability: model, marketProbability: market, edgePct: edge(model, market), oddsAmerican: american, units: unitsFor(status, american), capturedAt: row.predictionTime ?? row.createdAt ?? null, settledAt: row.settledAt ?? null, lockStatus: status === "PENDING" ? "PENDING" : "LOCKED", detailHref: row.gameId ? `/game/${encodeURIComponent(row.gameId)}` : "/sim/mlb", note: row.oddsSource ? `Odds source: ${row.oddsSource}` : "Official sim snapshot ledger" }; });
    return { rows, warnings };
  } catch (error) { return { rows: [], warnings: [error instanceof Error ? error.message : "Moneyline result ledger failed to load."] }; }
}

async function inningRows(): Promise<RowBundle> {
  if (!hasUsableServerDatabaseUrl()) return { rows: [], warnings: ["No usable server database URL is configured."] };
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ledger = await prisma.$queryRaw<any[]>`SELECT id, game_id, event_label, market, side, projected_value, probability, confidence, captured_at, result, graded_at FROM mlb_inning_market_projection_ledger WHERE captured_at >= ${since} AND market IN ('nrfi','yrfi') ORDER BY captured_at DESC LIMIT 150`;
    return { rows: ledger.map((row): ResultsLedgerRow => { const status = result(row.result); return { id: `nrfi:${row.id}`, market: "nrfi", marketLabel: String(row.market).toUpperCase(), eventLabel: row.event_label, pickLabel: String(row.market).toUpperCase(), sideLabel: String(row.side).replace(/_/g, " "), result: status, modelProbability: n(row.probability), marketProbability: null, edgePct: null, oddsAmerican: null, units: unitsFor(status, null), capturedAt: iso(row.captured_at), settledAt: iso(row.graded_at), lockStatus: status === "PENDING" ? "PENDING" : "LOCKED", detailHref: `/sim/mlb/${encodeURIComponent(row.game_id)}/nrfi-f5`, note: `Projection ${n(row.projected_value) ?? "—"}` }; }), warnings: [] };
  } catch (error) { return { rows: [], warnings: [error instanceof Error ? error.message : "NRFI ledger failed to load."] }; }
}

async function propRows(): Promise<RowBundle> {
  if (!hasUsableServerDatabaseUrl()) return { rows: [], warnings: ["No usable server database URL is configured."] };
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ledger = await prisma.$queryRaw<any[]>`SELECT id, game_id, event_label, team, player_name, market, line, projected_value, probability_over, captured_at, result, actual_value, graded_at FROM mlb_player_prop_projection_ledger WHERE captured_at >= ${since} ORDER BY captured_at DESC LIMIT 150`;
    return { rows: ledger.map((row): ResultsLedgerRow => { const status = result(row.result); const line = n(row.line); return { id: `props:${row.id}`, market: "props", marketLabel: marketName(row.market), eventLabel: row.event_label, pickLabel: `${row.player_name} over ${line ?? "—"}`, sideLabel: row.team, result: status, modelProbability: n(row.probability_over), marketProbability: null, edgePct: null, oddsAmerican: null, units: unitsFor(status, null), capturedAt: iso(row.captured_at), settledAt: iso(row.graded_at), lockStatus: status === "PENDING" ? "PENDING" : "LOCKED", detailHref: row.game_id ? `/sim/mlb/${encodeURIComponent(row.game_id)}` : "/sim/mlb", note: `${marketName(row.market)} projection ${n(row.projected_value) ?? "—"}` }; }), warnings: [] };
  } catch (error) { return { rows: [], warnings: [error instanceof Error ? error.message : "Player prop ledger failed to load."] }; }
}

async function trendRows(): Promise<RowBundle> {
  try {
    const snap: any = await buildTrendsCenterSnapshot();
    const rows = (snap.promotionBoard ?? []).slice(0, 50).map((row: any): ResultsLedgerRow => { const status = result(row.actionState); return { id: `trends:${row.id}`, market: "trends", marketLabel: row.market, eventLabel: row.name, pickLabel: row.primaryAction, sideLabel: `${row.league} · ${row.category}`, result: status, modelProbability: row.proof?.winRatePct == null ? null : row.proof.winRatePct / 100, marketProbability: null, edgePct: n(row.proof?.clvPct), oddsAmerican: null, units: n(row.proof?.profitUnits), capturedAt: snap.generatedAt, settledAt: null, lockStatus: "PROOF", detailHref: row.href, note: `${row.proof?.record ?? "—"} · ${row.proof?.roiPct ?? "—"}% ROI` }; });
    return { rows, warnings: [] };
  } catch (error) { return { rows: [], warnings: [error instanceof Error ? error.message : "Trend proof board failed to load."] }; }
}

function card(key: ResultsMarket, rows: ResultsLedgerRow[], warnings: string[]): ResultsMarketCard { const config = MARKETS.find((item) => item.key === key)!; return { key, label: config.label, href: config.href, summary: summary(rows), available: rows.length > 0, note: warnings[0] ?? config.note }; }
function title(market: ResultsMarket) { return market === "moneyline" ? "Moneyline Results" : market === "nrfi" ? "NRFI Results" : market === "props" ? "Player Prop Results" : market === "trends" ? "Trend Proof Results" : "Results Center"; }
function subtitle(market: ResultsMarket) { return market === "overview" ? "Record, ROI, lock status, odds proof, and recent rows across the model ledger." : "Market-specific result ledger with captured rows, settlement state, units, and proof notes."; }
function combined(cards: ResultsMarketCard[]) { const out = { ...ZERO }; for (const c of cards) { out.edgePicks += c.summary.edgePicks; out.wins += c.summary.wins; out.losses += c.summary.losses; out.pushes += c.summary.pushes; out.pending += c.summary.pending; out.actualOddsCount += c.summary.actualOddsCount; out.fallbackOddsCount += c.summary.fallbackOddsCount; } const unitValues = cards.map((c) => c.summary.unitsNet).filter((value): value is number => typeof value === "number" && Number.isFinite(value)); out.unitsNet = unitValues.length ? r(unitValues.reduce((sum, value) => sum + value, 0), 2) : null; out.roiPct = out.wins + out.losses + out.pushes && out.unitsNet != null ? r(out.unitsNet / (out.wins + out.losses + out.pushes) * 100, 1) : null; out.winRatePct = out.wins + out.losses ? r(out.wins / (out.wins + out.losses) * 100, 1) : null; return out; }

export async function getResultsCenter(selectedMarket: ResultsMarket = "overview"): Promise<ResultsCenterData> {
  const market = normalizeResultsMarket(selectedMarket);
  const [ml, inn, props, trends] = await Promise.all([moneylineRows(), inningRows(), propRows(), trendRows()]);
  const cards = [card("moneyline", ml.rows, ml.warnings), card("nrfi", inn.rows, inn.warnings), card("props", props.rows, props.warnings), card("trends", trends.rows, trends.warnings)];
  const rows = market === "moneyline" ? ml.rows : market === "nrfi" ? inn.rows : market === "props" ? props.rows : market === "trends" ? trends.rows : [...ml.rows.slice(0, 20), ...inn.rows.slice(0, 20), ...props.rows.slice(0, 20), ...trends.rows.slice(0, 12)].sort((a, b) => new Date(b.capturedAt ?? 0).getTime() - new Date(a.capturedAt ?? 0).getTime()).slice(0, 80);
  const warnings = [...ml.warnings, ...inn.warnings, ...props.warnings, ...trends.warnings].filter(Boolean);
  return { ok: cards.some((item) => item.available), generatedAt: new Date().toISOString(), selectedMarket: market, title: title(market), subtitle: subtitle(market), windowLabel: "Last 30 days", summary: market === "overview" ? combined(cards) : summary(rows), marketCards: [{ key: "overview", label: "Overview", href: "/results", summary: combined(cards), available: cards.some((item) => item.available), note: "Combined result ledger." }, ...cards], rows, warnings: [...new Set(warnings)].slice(0, 5) };
}
