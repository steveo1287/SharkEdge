import { invalidateHotCache, readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { upsertOddsIngestPayload } from "@/services/market-data/market-data-service";

const PROVIDER = "the-odds-api";
const INGEST_SOURCE = "theoddsapi";
const MONTHLY_LIMIT = numberEnv("ODDS_API_MONTHLY_LIMIT", 500);
const REGULAR_STOP_AT = numberEnv("ODDS_API_REGULAR_STOP_AT", numberEnv("ODDS_SAFE_STOP", 460));
const DAILY_REGULAR_LIMIT = numberEnv("ODDS_API_DAILY_REGULAR_LIMIT", 14);
const REGULAR_MIN_INTERVAL_MS = numberEnv("ODDS_API_REGULAR_MIN_INTERVAL_MINUTES", 120) * 60_000;
const REGULAR_MAX_SPORTS_PER_RUN = numberEnv("ODDS_API_REGULAR_MAX_SPORTS_PER_RUN", 2);
const ACTIVE_TIMEZONE = process.env.ODDS_API_ACTIVE_TIMEZONE?.trim() || "America/Chicago";
const ACTIVE_START_HOUR = numberEnv("ODDS_API_ACTIVE_START_HOUR", 10);
const ACTIVE_END_HOUR = numberEnv("ODDS_API_ACTIVE_END_HOUR", 23);
const SNAPSHOT_CACHE_KEY = `${PROVIDER}:latest-snapshot`;
const RUN_STATE_CACHE_KEY = `${PROVIDER}:regular-run-state`;
const BUDGET_CACHE_TTL_SECONDS = 60 * 60 * 24 * 40;
const SNAPSHOT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 3;
const RUN_STATE_CACHE_TTL_SECONDS = 60 * 60 * 24 * 45;

const DEFAULT_REGULAR_SPORTS = [
  "basketball_nba",
  "baseball_mlb",
  "icehockey_nhl"
];

type PullMode = "regular" | "manual";
type BudgetState = {
  provider: string;
  month: string;
  used: number;
  limit: number;
  regularStopAt: number;
  updatedAt: string;
};
type DailyState = { provider: string; day: string; used: number; limit: number; updatedAt: string };
type RegularRunState = { provider: string; lastRunAt: string | null; cursor: number; updatedAt: string };
type SnapshotMeta = {
  provider: string;
  generatedAt: string;
  mode: PullMode;
  sports: string[];
  requestsUsed: number;
  monthlyUsed: number;
  monthlyLimit: number;
  dailyRegularUsed?: number;
  previousGeneratedAt?: string | null;
};
type OddsApiSnapshot = { meta: SnapshotMeta; events: unknown[] };
type MovementMap = Record<string, { previous?: number; current: number; delta: number }>;
type SportFetchResult = { sport: string; events: OddsApiEvent[]; requestCost: number | null; monthlyUsed: number | null };
type OddsApiOutcome = { name?: string; price?: number; point?: number | null };
type OddsApiMarket = { key?: string; outcomes?: OddsApiOutcome[] };
type OddsApiBookmaker = { key?: string; title?: string; last_update?: string; markets?: OddsApiMarket[] };
type OddsApiEvent = {
  id?: string;
  sport_key?: string;
  sport_title?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: OddsApiBookmaker[];
};
type IngestMarket = {
  marketType: "moneyline" | "spread" | "total";
  marketLabel: string;
  selection: string;
  side: string;
  line?: number | null;
  oddsAmerican: number | null;
  teamSide?: "home" | "away";
};

type IngestResult = {
  attemptedEvents: number;
  writtenEvents: number;
  skippedEvents: number;
  touchedMarkets: number;
  errors: Array<{ eventKey: string; reason: string }>;
};

function numberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function budgetKey(month = monthKey()) {
  return `${PROVIDER}:quota:${month}`;
}

function dailyKey(day = dayKey()) {
  return `${PROVIDER}:daily:${day}`;
}

function getApiKey() {
  return process.env.THE_ODDS_API_KEY?.trim() || process.env.ODDS_API_KEY?.trim() || "";
}

function parseSports(input?: string | null) {
  const raw = input || process.env.ODDS_API_REGULAR_SPORTS || DEFAULT_REGULAR_SPORTS.join(",");
  return raw.split(",").map((sport) => sport.trim()).filter(Boolean);
}

function zonedHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ACTIVE_TIMEZONE, hour: "numeric", hour12: false }).formatToParts(date);
  const parsed = Number(parts.find((part) => part.type === "hour")?.value ?? "");
  return parsed === 24 ? 0 : parsed;
}

function isInsideActiveWindow(date = new Date()) {
  const hour = zonedHour(date);
  if (ACTIVE_START_HOUR <= ACTIVE_END_HOUR) return hour >= ACTIVE_START_HOUR && hour <= ACTIVE_END_HOUR;
  return hour >= ACTIVE_START_HOUR || hour <= ACTIVE_END_HOUR;
}

function parseHeaderNumber(headers: Headers, name: string) {
  const raw = headers.get(name) ?? headers.get(name.toLowerCase());
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceKey(event: any, bookmaker: any, market: any, outcome: any) {
  return [event?.sport_key, event?.id, event?.home_team, event?.away_team, bookmaker?.key ?? bookmaker?.title, market?.key, outcome?.name, outcome?.point ?? ""].map((part) => String(part ?? "").toLowerCase().replace(/\s+/g, "-")).join("|");
}

function extractPrices(snapshot: OddsApiSnapshot | null | undefined) {
  const map: Record<string, number> = {};
  for (const event of (snapshot?.events ?? []) as any[]) {
    for (const bookmaker of event?.bookmakers ?? []) {
      for (const market of bookmaker?.markets ?? []) {
        for (const outcome of market?.outcomes ?? []) {
          if (typeof outcome?.price === "number") map[priceKey(event, bookmaker, market, outcome)] = outcome.price;
        }
      }
    }
  }
  return map;
}

function buildMovement(previous: OddsApiSnapshot | null | undefined, next: OddsApiSnapshot): MovementMap {
  const prev = extractPrices(previous);
  const curr = extractPrices(next);
  const movement: MovementMap = {};
  for (const [key, current] of Object.entries(curr)) {
    const previousValue = prev[key];
    movement[key] = typeof previousValue === "number" && previousValue !== current ? { previous: previousValue, current, delta: current - previousValue } : { current, delta: 0 };
  }
  return movement;
}

function rotateSports(sports: string[], cursor: number, maxSports: number) {
  if (!sports.length) return [];
  const count = Math.max(1, Math.min(maxSports, sports.length));
  return Array.from({ length: count }, (_, index) => sports[(cursor + index) % sports.length]);
}

function canPullMonthly(budget: BudgetState, requestedPulls: number, mode: PullMode) {
  if (budget.used + requestedPulls > budget.limit) return { ok: false, reason: `Monthly quota would exceed ${budget.limit}.` };
  if (mode === "regular" && budget.used + requestedPulls > budget.regularStopAt) return { ok: false, reason: `Regular pulls stop at ${budget.regularStopAt}; manual mode required.` };
  return { ok: true, reason: "ok" };
}

async function writeBudget(next: BudgetState) { await writeHotCache(budgetKey(next.month), next, BUDGET_CACHE_TTL_SECONDS); }
async function writeDaily(next: DailyState) { await writeHotCache(dailyKey(next.day), next, BUDGET_CACHE_TTL_SECONDS); }

async function incrementBudget(amount: number, actualMonthlyUsed: number | null) {
  const current = await getOddsApiBudget();
  const calculatedUsed = current.used + amount;
  const used = actualMonthlyUsed == null ? calculatedUsed : Math.max(calculatedUsed, actualMonthlyUsed);
  const next = { ...current, used, updatedAt: new Date().toISOString() };
  await writeBudget(next);
  return next;
}

async function incrementDaily(amount: number) {
  const current = await getOddsApiDailyBudget();
  const next = { ...current, used: current.used + amount, updatedAt: new Date().toISOString() };
  await writeDaily(next);
  return next;
}

async function getRegularRunState() {
  return await readHotCache<RegularRunState>(RUN_STATE_CACHE_KEY) ?? { provider: PROVIDER, lastRunAt: null, cursor: 0, updatedAt: new Date().toISOString() };
}

async function writeRegularRunState(next: RegularRunState) { await writeHotCache(RUN_STATE_CACHE_KEY, next, RUN_STATE_CACHE_TTL_SECONDS); }

async function fetchSportOdds(sport: string, apiKey: string): Promise<SportFetchResult> {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", process.env.ODDS_API_REGIONS?.trim() || "us");
  url.searchParams.set("markets", process.env.ODDS_API_MARKETS?.trim() || "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  const bookmakers = process.env.ODDS_API_BOOKMAKERS?.trim();
  if (bookmakers) url.searchParams.set("bookmakers", bookmakers);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const requestCost = parseHeaderNumber(response.headers, "x-requests-last");
  const monthlyUsed = parseHeaderNumber(response.headers, "x-requests-used");

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`The Odds API ${sport} failed ${response.status}: ${text.slice(0, 200)}`);
  }

  const events = await response.json();
  return { sport, events: Array.isArray(events) ? events : [], requestCost, monthlyUsed };
}

function teamSideFor(event: OddsApiEvent, name?: string): "home" | "away" | null {
  if (!name) return null;
  if (name === event.home_team) return "home";
  if (name === event.away_team) return "away";
  return null;
}

function marketLabel(key?: string) {
  if (key === "h2h") return "Moneyline";
  if (key === "spreads") return "Spread";
  if (key === "totals") return "Total";
  return key ?? "Market";
}

function convertOutcome(event: OddsApiEvent, market: OddsApiMarket, outcome: OddsApiOutcome): IngestMarket | null {
  if (typeof outcome.price !== "number" || !outcome.name) return null;
  const side = teamSideFor(event, outcome.name);
  if (market.key === "h2h") {
    if (!side) return null;
    return { marketType: "moneyline", marketLabel: marketLabel(market.key), selection: outcome.name, side, oddsAmerican: outcome.price, teamSide: side };
  }
  if (market.key === "spreads") {
    if (!side) return null;
    return { marketType: "spread", marketLabel: marketLabel(market.key), selection: outcome.name, side, line: typeof outcome.point === "number" ? outcome.point : null, oddsAmerican: outcome.price, teamSide: side };
  }
  if (market.key === "totals") {
    const totalSide = outcome.name.toLowerCase().includes("over") ? "over" : outcome.name.toLowerCase().includes("under") ? "under" : null;
    if (!totalSide) return null;
    return { marketType: "total", marketLabel: marketLabel(market.key), selection: outcome.name, side: totalSide, line: typeof outcome.point === "number" ? outcome.point : null, oddsAmerican: outcome.price };
  }
  return null;
}

function convertBookmaker(event: OddsApiEvent, bookmaker: OddsApiBookmaker, generatedAt: string) {
  const markets = (bookmaker.markets ?? []).flatMap((market) => (market.outcomes ?? []).map((outcome) => convertOutcome(event, market, outcome)).filter((row): row is IngestMarket => Boolean(row)));
  if (!markets.length) return null;
  return { book: bookmaker.title || bookmaker.key || "Unknown Book", fetchedAt: bookmaker.last_update || generatedAt, markets };
}

async function persistFetchedOdds(fetched: SportFetchResult[], generatedAt: string): Promise<IngestResult> {
  const result: IngestResult = { attemptedEvents: 0, writtenEvents: 0, skippedEvents: 0, touchedMarkets: 0, errors: [] };
  for (const entry of fetched) {
    for (const event of entry.events) {
      result.attemptedEvents += 1;
      const eventKey = event.id || `${entry.sport}:${event.away_team}@${event.home_team}:${event.commence_time}`;
      if (!event.id || !event.home_team || !event.away_team || !event.commence_time) {
        result.skippedEvents += 1;
        result.errors.push({ eventKey, reason: "Missing event id/team/time fields from The Odds API." });
        continue;
      }
      const lines = (event.bookmakers ?? []).map((bookmaker) => convertBookmaker(event, bookmaker, generatedAt)).filter((line): line is NonNullable<ReturnType<typeof convertBookmaker>> => Boolean(line));
      if (!lines.length) {
        result.skippedEvents += 1;
        continue;
      }
      try {
        const saved = await upsertOddsIngestPayload({
          sport: entry.sport,
          eventKey: event.id,
          homeTeam: event.home_team,
          awayTeam: event.away_team,
          commenceTime: event.commence_time,
          source: INGEST_SOURCE,
          lines,
          sourceMeta: { provider: PROVIDER, sportKey: entry.sport, sportTitle: event.sport_title, generatedAt }
        });
        result.writtenEvents += 1;
        result.touchedMarkets += saved.touchedMarketIds.length;
      } catch (error) {
        result.skippedEvents += 1;
        result.errors.push({ eventKey, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return result;
}

export async function getOddsApiBudget(): Promise<BudgetState> {
  const existing = await readHotCache<BudgetState>(budgetKey());
  if (existing?.month === monthKey()) {
    if (existing.limit === MONTHLY_LIMIT && existing.regularStopAt === REGULAR_STOP_AT) return existing;
    const reconciled = { ...existing, limit: MONTHLY_LIMIT, regularStopAt: REGULAR_STOP_AT, updatedAt: new Date().toISOString() };
    await writeBudget(reconciled);
    return reconciled;
  }
  const fresh: BudgetState = { provider: PROVIDER, month: monthKey(), used: 0, limit: MONTHLY_LIMIT, regularStopAt: REGULAR_STOP_AT, updatedAt: new Date().toISOString() };
  await writeBudget(fresh);
  return fresh;
}

export async function getOddsApiDailyBudget(): Promise<DailyState> {
  const existing = await readHotCache<DailyState>(dailyKey());
  if (existing?.day === dayKey()) {
    if (existing.limit === DAILY_REGULAR_LIMIT) return existing;
    const reconciled = { ...existing, limit: DAILY_REGULAR_LIMIT, updatedAt: new Date().toISOString() };
    await writeDaily(reconciled);
    return reconciled;
  }
  const fresh: DailyState = { provider: PROVIDER, day: dayKey(), used: 0, limit: DAILY_REGULAR_LIMIT, updatedAt: new Date().toISOString() };
  await writeDaily(fresh);
  return fresh;
}

export async function readLatestOddsApiSnapshot() { return readHotCache<OddsApiSnapshot & { movement?: MovementMap }>(SNAPSHOT_CACHE_KEY); }

export async function getOddsApiPullPlan(args?: { mode?: PullMode; sportsCsv?: string | null }) {
  const mode = args?.mode ?? "regular";
  const fullSports = parseSports(args?.sportsCsv);
  const budget = await getOddsApiBudget();
  const daily = await getOddsApiDailyBudget();
  const runState = await getRegularRunState();
  const now = new Date();

  if (mode === "manual") return { ok: true, mode, sports: fullSports, reason: "manual pull requested", budget, daily, runState, guardrails: currentGuardrails() };
  if (!isInsideActiveWindow(now)) return { ok: false, mode, sports: [] as string[], reason: `Outside active window ${ACTIVE_START_HOUR}:00-${ACTIVE_END_HOUR}:00 ${ACTIVE_TIMEZONE}.`, budget, daily, runState, guardrails: currentGuardrails() };
  if (runState.lastRunAt && now.getTime() - new Date(runState.lastRunAt).getTime() < REGULAR_MIN_INTERVAL_MS) return { ok: false, mode, sports: [] as string[], reason: `Regular minimum interval is ${Math.round(REGULAR_MIN_INTERVAL_MS / 60_000)} minutes.`, budget, daily, runState, guardrails: currentGuardrails() };
  const remainingDaily = Math.max(0, daily.limit - daily.used);
  if (remainingDaily <= 0) return { ok: false, mode, sports: [] as string[], reason: `Daily regular Odds API budget is exhausted (${daily.used}/${daily.limit}).`, budget, daily, runState, guardrails: currentGuardrails() };
  const sports = rotateSports(fullSports, runState.cursor, Math.min(REGULAR_MAX_SPORTS_PER_RUN, remainingDaily));
  return { ok: true, mode, sports, reason: "regular pull allowed", budget, daily, runState, guardrails: currentGuardrails() };
}

function currentGuardrails() {
  return { monthlyLimit: MONTHLY_LIMIT, regularStopAt: REGULAR_STOP_AT, dailyRegularLimit: DAILY_REGULAR_LIMIT, regularMinIntervalMinutes: Math.round(REGULAR_MIN_INTERVAL_MS / 60_000), regularMaxSportsPerRun: REGULAR_MAX_SPORTS_PER_RUN, activeTimezone: ACTIVE_TIMEZONE, activeStartHour: ACTIVE_START_HOUR, activeEndHour: ACTIVE_END_HOUR, defaultRegularSports: parseSports(null), regions: process.env.ODDS_API_REGIONS?.trim() || "us", markets: process.env.ODDS_API_MARKETS?.trim() || "h2h,spreads,totals", bookmakers: process.env.ODDS_API_BOOKMAKERS?.trim() || "all" };
}

export async function runOddsApiSnapshotPull(args?: { mode?: PullMode; sportsCsv?: string | null }) {
  const mode = args?.mode ?? "regular";
  const apiKey = getApiKey();
  const plan = await getOddsApiPullPlan(args);
  const snapshot = await readLatestOddsApiSnapshot();

  if (!apiKey) return { ok: false, skipped: true, reason: "THE_ODDS_API_KEY or ODDS_API_KEY is not configured in the environment.", budget: plan.budget, daily: plan.daily, guardrails: plan.guardrails, snapshot };
  if (!plan.ok) return { ok: false, skipped: true, reason: plan.reason, budget: plan.budget, daily: plan.daily, guardrails: plan.guardrails, snapshot };
  const allowed = canPullMonthly(plan.budget, plan.sports.length, mode);
  if (!allowed.ok) return { ok: false, skipped: true, reason: allowed.reason, budget: plan.budget, daily: plan.daily, guardrails: plan.guardrails, snapshot };

  const fetched = await Promise.all(plan.sports.map((sport) => fetchSportOdds(sport, apiKey)));
  const requestCost = fetched.reduce((total, entry) => total + (entry.requestCost ?? 1), 0);
  const providerMonthlyUsed = fetched.reduce<number | null>((max, entry) => entry.monthlyUsed == null ? max : max == null ? entry.monthlyUsed : Math.max(max, entry.monthlyUsed), null);
  const nextBudget = await incrementBudget(requestCost, providerMonthlyUsed);
  const nextDaily = mode === "regular" ? await incrementDaily(requestCost) : plan.daily;

  if (mode === "regular") {
    await writeRegularRunState({ provider: PROVIDER, lastRunAt: new Date().toISOString(), cursor: (plan.runState.cursor + plan.sports.length) % Math.max(1, parseSports(args?.sportsCsv).length), updatedAt: new Date().toISOString() });
  }

  const generatedAt = new Date().toISOString();
  const snapshotBase: OddsApiSnapshot = { meta: { provider: PROVIDER, generatedAt, mode, sports: plan.sports, requestsUsed: requestCost, monthlyUsed: nextBudget.used, monthlyLimit: nextBudget.limit, dailyRegularUsed: nextDaily.used, previousGeneratedAt: snapshot?.meta?.generatedAt ?? null }, events: fetched.flatMap((entry) => entry.events.map((event) => ({ ...event, sport_key: entry.sport }))) };
  const nextSnapshot = { ...snapshotBase, movement: buildMovement(snapshot, snapshotBase) };
  const ingest = await persistFetchedOdds(fetched, generatedAt);
  await writeHotCache(SNAPSHOT_CACHE_KEY, nextSnapshot, SNAPSHOT_CACHE_TTL_SECONDS);
  await invalidateHotCache("board:v1:all");

  return { ok: true, skipped: false, reason: "snapshot refreshed and persisted", budget: nextBudget, daily: nextDaily, guardrails: plan.guardrails, ingest, snapshot: nextSnapshot };
}
