import { invalidateHotCache, readHotCache, writeHotCache } from "@/lib/cache/live-cache";

const PROVIDER = "the-odds-api";
const MONTHLY_LIMIT = 500;
const REGULAR_STOP_AT = 450;
const SNAPSHOT_CACHE_KEY = `${PROVIDER}:latest-snapshot`;
const BUDGET_CACHE_TTL_SECONDS = 60 * 60 * 24 * 40;
const SNAPSHOT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 3;

const DEFAULT_SPORTS = [
  "basketball_nba",
  "icehockey_nhl",
  "baseball_mlb",
  "americanfootball_nfl",
  "americanfootball_ncaaf"
];

type PullMode = "regular" | "manual";
type BudgetState = { provider: string; month: string; used: number; limit: number; regularStopAt: number; updatedAt: string };
type SnapshotMeta = { provider: string; generatedAt: string; mode: PullMode; sports: string[]; requestsUsed: number; monthlyUsed: number; monthlyLimit: number; previousGeneratedAt?: string | null };
type OddsApiSnapshot = { meta: SnapshotMeta; events: unknown[] };
type MovementMap = Record<string, { previous?: number; current: number; delta: number }>;

function monthKey(date = new Date()) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }
function budgetKey(month = monthKey()) { return `${PROVIDER}:quota:${month}`; }
function getApiKey() { return process.env.THE_ODDS_API_KEY?.trim() || process.env.ODDS_API_KEY?.trim() || ""; }
export async function getOddsApiBudget(): Promise<BudgetState> { const key = budgetKey(); const existing = await readHotCache<BudgetState>(key); if (existing?.month === monthKey()) return existing; const fresh: BudgetState = { provider: PROVIDER, month: monthKey(), used: 0, limit: MONTHLY_LIMIT, regularStopAt: REGULAR_STOP_AT, updatedAt: new Date().toISOString() }; await writeHotCache(key, fresh, BUDGET_CACHE_TTL_SECONDS); return fresh; }
async function writeBudget(next: BudgetState) { await writeHotCache(budgetKey(next.month), next, BUDGET_CACHE_TTL_SECONDS); }
async function incrementBudget(amount: number) { const current = await getOddsApiBudget(); const next = { ...current, used: current.used + amount, updatedAt: new Date().toISOString() }; await writeBudget(next); return next; }
function parseSports(input?: string | null) { if (!input) return DEFAULT_SPORTS; return input.split(",").map((sport) => sport.trim()).filter(Boolean); }
function canPull(budget: BudgetState, requestedPulls: number, mode: PullMode) { if (budget.used + requestedPulls > budget.limit) return { ok: false, reason: `Monthly quota would exceed ${budget.limit}.` }; if (mode === "regular" && budget.used + requestedPulls > budget.regularStopAt) return { ok: false, reason: `Regular pulls stop at ${budget.regularStopAt}; manual mode required.` }; return { ok: true, reason: "ok" }; }
function priceKey(event: any, bookmaker: any, market: any, outcome: any) { return [event?.sport_key, event?.id, event?.home_team, event?.away_team, bookmaker?.key ?? bookmaker?.title, market?.key, outcome?.name, outcome?.point ?? ""].map((part) => String(part ?? "").toLowerCase().replace(/\s+/g, "-")).join("|"); }
function extractPrices(snapshot: OddsApiSnapshot | null | undefined) { const map: Record<string, number> = {}; for (const event of (snapshot?.events ?? []) as any[]) { for (const bookmaker of event?.bookmakers ?? []) { for (const market of bookmaker?.markets ?? []) { for (const outcome of market?.outcomes ?? []) { if (typeof outcome?.price === "number") map[priceKey(event, bookmaker, market, outcome)] = outcome.price; } } } } return map; }
function buildMovement(previous: OddsApiSnapshot | null | undefined, next: OddsApiSnapshot): MovementMap { const prev = extractPrices(previous); const curr = extractPrices(next); const movement: MovementMap = {}; for (const [key, current] of Object.entries(curr)) { const previousValue = prev[key]; if (typeof previousValue === "number" && previousValue !== current) movement[key] = { previous: previousValue, current, delta: current - previousValue }; else movement[key] = { current, delta: 0 }; } return movement; }
async function fetchSportOdds(sport: string, apiKey: string) { const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`); url.searchParams.set("apiKey", apiKey); url.searchParams.set("regions", "us"); url.searchParams.set("markets", "h2h,spreads,totals"); url.searchParams.set("oddsFormat", "american"); url.searchParams.set("dateFormat", "iso"); const response = await fetch(url.toString(), { cache: "no-store" }); if (!response.ok) { const text = await response.text().catch(() => ""); throw new Error(`The Odds API ${sport} failed ${response.status}: ${text.slice(0, 200)}`); } return response.json(); }
export async function readLatestOddsApiSnapshot() { return readHotCache<OddsApiSnapshot & { movement?: MovementMap }>(SNAPSHOT_CACHE_KEY); }
export async function runOddsApiSnapshotPull(args?: { mode?: PullMode; sportsCsv?: string | null }) { const mode = args?.mode ?? "regular"; const sports = parseSports(args?.sportsCsv); const apiKey = getApiKey(); if (!apiKey) return { ok: false, skipped: true, reason: "THE_ODDS_API_KEY is not configured in the environment.", budget: await getOddsApiBudget(), snapshot: await readLatestOddsApiSnapshot() }; const budget = await getOddsApiBudget(); const requestedPulls = sports.length; const allowed = canPull(budget, requestedPulls, mode); if (!allowed.ok) return { ok: false, skipped: true, reason: allowed.reason, budget, snapshot: await readLatestOddsApiSnapshot() };
  const previous = await readLatestOddsApiSnapshot();
  const fetched = await Promise.all(sports.map(async (sport) => ({ sport, events: await fetchSportOdds(sport, apiKey) })));
  const nextBudget = await incrementBudget(requestedPulls);
  const snapshotBase: OddsApiSnapshot = { meta: { provider: PROVIDER, generatedAt: new Date().toISOString(), mode, sports, requestsUsed: requestedPulls, monthlyUsed: nextBudget.used, monthlyLimit: nextBudget.limit, previousGeneratedAt: previous?.meta?.generatedAt ?? null }, events: fetched.flatMap((entry) => Array.isArray(entry.events) ? entry.events.map((event) => ({ ...(event as object), sport_key: entry.sport })) : []) };
  const snapshot = { ...snapshotBase, movement: buildMovement(previous, snapshotBase) };
  await writeHotCache(SNAPSHOT_CACHE_KEY, snapshot, SNAPSHOT_CACHE_TTL_SECONDS); await invalidateHotCache("board:v1:all");
  return { ok: true, skipped: false, reason: "snapshot refreshed", budget: nextBudget, snapshot };
}
