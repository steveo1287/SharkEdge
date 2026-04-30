import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";
import type { MlbPlayerHistoryProfile } from "@/services/simulation/mlb-player-history";

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_KEY_WINDOW = "mlb:savant-team-history:window:v1";
const CACHE_KEY_FORM = "mlb:savant-team-history:form:v1";
const CACHE_TTL_WINDOW = 60 * 60 * 3; // 3 h — season-level signals
const CACHE_TTL_FORM = 60 * 60 * 1;   // 1 h — recent form refreshes faster

// Days of history for each fetch
const WINDOW_DAYS = 45;
const FORM_DAYS = 14;

// ─── League baselines (2024-25 calibration) ───────────────────────────────────

const LG_XWOBA = 0.315;
const LG_BARREL_PCT = 0.075;
const LG_HARD_HIT_PCT = 0.385;
const LG_K_PCT = 0.227;
const LG_BB_PCT = 0.083;

// ─── Types ────────────────────────────────────────────────────────────────────

type CsvRow = Record<string, string>;

type SplitAgg = { battedBalls: number; xwobaSum: number; xwobaCount: number };

type TeamBatAgg = {
  pa: number;
  battedBalls: number;
  hardHits: number;
  barrels: number;
  xwobaSum: number;
  xwobaCount: number;
  strikeouts: number;
  walks: number;
  vsLeft: SplitAgg;
  vsRight: SplitAgg;
  clutch: SplitAgg; // inning 7+
};

type TeamPitchAgg = {
  // starter = pitcher inning ≤ 5, bullpen = inning > 5
  starterBattedBalls: number;
  starterXwobaSum: number;
  starterXwobaCount: number;
  bullpenBattedBalls: number;
  bullpenXwobaSum: number;
  bullpenXwobaCount: number;
};

type TeamStats = {
  batAgg: TeamBatAgg;
  pitchAgg: TeamPitchAgg;
};

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') { current += '"'; i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(current); current = ""; continue; }
    current += ch;
  }
  out.push(current);
  return out;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  // Guard against HTML error responses
  if (lines[0].trim().startsWith("<!")) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.length < headers.length / 2) continue;
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j]?.trim() ?? "";
    rows.push(row);
  }
  return rows;
}

function readNum(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) ? n : null;
}

// ─── URL builder (mirrors existing mlb-statcast-ingestion.ts pattern) ────────

function savantUrl(startDate: string, endDate: string): string {
  const params = new URLSearchParams({
    all: "true",
    hfGT: "R|",       // regular season only
    player_type: "batter",
    game_date_gt: startDate,
    game_date_lt: endDate,
    hfInfield: "",
    team: "",
    position: "",
    hfRO: "",
    home_road: "",
    min_pitches: "0",
    min_results: "0",
    group_by: "name",
    sort_col: "pitches",
    sort_order: "desc",
    min_pas: "0",
    type: "details",
  });
  return `https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`;
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

async function fetchCsv(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SharkEdge/2.0 savant-team-feed", accept: "text/csv,*/*" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

function emptyBatAgg(): TeamBatAgg {
  const emptySplit = (): SplitAgg => ({ battedBalls: 0, xwobaSum: 0, xwobaCount: 0 });
  return {
    pa: 0, battedBalls: 0, hardHits: 0, barrels: 0,
    xwobaSum: 0, xwobaCount: 0, strikeouts: 0, walks: 0,
    vsLeft: emptySplit(), vsRight: emptySplit(), clutch: emptySplit(),
  };
}

function emptyPitchAgg(): TeamPitchAgg {
  return {
    starterBattedBalls: 0, starterXwobaSum: 0, starterXwobaCount: 0,
    bullpenBattedBalls: 0, bullpenXwobaSum: 0, bullpenXwobaCount: 0,
  };
}

function addBattedBallToSplit(split: SplitAgg, xwoba: number | null, exitVelo: number | null) {
  split.battedBalls += 1;
  if (xwoba !== null) { split.xwobaSum += xwoba; split.xwobaCount += 1; }
  void exitVelo; // only used in team agg for hard-hit
}

function aggregateRows(rows: CsvRow[]): Map<string, TeamStats> {
  const teamMap = new Map<string, TeamStats>();

  const getTeam = (abbr: string): TeamStats => {
    const key = abbr.toUpperCase();
    if (!teamMap.has(key)) teamMap.set(key, { batAgg: emptyBatAgg(), pitchAgg: emptyPitchAgg() });
    return teamMap.get(key)!;
  };

  for (const row of rows) {
    const batterTeam = row.batter_team?.trim().toUpperCase();
    const pitcherTeam = row.pitcher_team?.trim().toUpperCase();
    const xwoba = readNum(row.estimated_woba_using_speedangle) ?? readNum(row.estimated_woba_using_speed_angle);
    const exitVelo = readNum(row.launch_speed);
    const pThrows = (row.p_throws ?? "").trim().toUpperCase();
    const inning = readNum(row.inning) ?? 0;
    const events = row.events?.trim() ?? "";
    const isBattedBall = exitVelo !== null && exitVelo > 0;
    const isHardHit = exitVelo !== null && exitVelo >= 95;
    // Barrel: launch_speed_angle === 6 (Statcast standard) or approximation
    const lsa = readNum(row.launch_speed_angle);
    const isBarrel = lsa === 6 || (exitVelo !== null && exitVelo >= 98 && (() => {
      const la = readNum(row.launch_angle);
      return la !== null && la >= 26 && la <= 30;
    })());

    // ── Batting team aggregation ────────────────────────────────────────────
    if (batterTeam) {
      const { batAgg } = getTeam(batterTeam);

      if (events) {
        batAgg.pa += 1;
        if (events.includes("strikeout")) batAgg.strikeouts += 1;
        if (events === "walk" || events === "hit_by_pitch") batAgg.walks += 1;
      }

      if (isBattedBall) {
        batAgg.battedBalls += 1;
        if (isHardHit) batAgg.hardHits += 1;
        if (isBarrel) batAgg.barrels += 1;
        if (xwoba !== null) { batAgg.xwobaSum += xwoba; batAgg.xwobaCount += 1; }

        // Platoon splits
        if (pThrows === "L") addBattedBallToSplit(batAgg.vsLeft, xwoba, exitVelo);
        if (pThrows === "R") addBattedBallToSplit(batAgg.vsRight, xwoba, exitVelo);

        // Clutch (late innings)
        if (inning >= 7) addBattedBallToSplit(batAgg.clutch, xwoba, exitVelo);
      }
    }

    // ── Pitching team aggregation ───────────────────────────────────────────
    if (pitcherTeam && isBattedBall) {
      const { pitchAgg } = getTeam(pitcherTeam);
      const isStarter = inning <= 5;
      if (isStarter) {
        pitchAgg.starterBattedBalls += 1;
        if (xwoba !== null) { pitchAgg.starterXwobaSum += xwoba; pitchAgg.starterXwobaCount += 1; }
      } else {
        pitchAgg.bullpenBattedBalls += 1;
        if (xwoba !== null) { pitchAgg.bullpenXwobaSum += xwoba; pitchAgg.bullpenXwobaCount += 1; }
      }
    }
  }

  return teamMap;
}

// ─── Abbreviation → normalized team name map ─────────────────────────────────
// Baseball Savant uses standard MLB abbreviations. We store profiles under
// normalizeMlbTeam(fullName) so lookups from the sim pipeline work correctly.
// The abbr map lets us also store under the abbreviation as a fallback.

const ABBR_TO_FULL: Record<string, string> = {
  ARI: "Arizona Diamondbacks",  ATL: "Atlanta Braves",       BAL: "Baltimore Orioles",
  BOS: "Boston Red Sox",        CHC: "Chicago Cubs",          CWS: "Chicago White Sox",
  CIN: "Cincinnati Reds",       CLE: "Cleveland Guardians",   COL: "Colorado Rockies",
  DET: "Detroit Tigers",        HOU: "Houston Astros",        KC:  "Kansas City Royals",
  KCR: "Kansas City Royals",    LAA: "Los Angeles Angels",    LAD: "Los Angeles Dodgers",
  MIA: "Miami Marlins",         MIL: "Milwaukee Brewers",     MIN: "Minnesota Twins",
  NYM: "New York Mets",         NYY: "New York Yankees",      OAK: "Oakland Athletics",
  PHI: "Philadelphia Phillies", PIT: "Pittsburgh Pirates",    SD:  "San Diego Padres",
  SDP: "San Diego Padres",      SEA: "Seattle Mariners",      SF:  "San Francisco Giants",
  SFG: "San Francisco Giants",  STL: "St. Louis Cardinals",   TB:  "Tampa Bay Rays",
  TBR: "Tampa Bay Rays",        TEX: "Texas Rangers",         TOR: "Toronto Blue Jays",
  WSH: "Washington Nationals",  WSN: "Washington Nationals",
};

// ─── Edge computation ────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function r2(v: number) { return Number(v.toFixed(2)); }

function xwoba(agg: { xwobaSum: number; xwobaCount: number }): number | null {
  return agg.xwobaCount >= 5 ? agg.xwobaSum / agg.xwobaCount : null;
}

function splitXwoba(split: SplitAgg): number | null {
  return split.xwobaCount >= 5 ? split.xwobaSum / split.xwobaCount : null;
}

function computeLeagueAvgs(teamMap: Map<string, TeamStats>) {
  let xwobaSum = 0, xwobaCount = 0;
  let barrelSum = 0, barrelCount = 0;
  let hardHitSum = 0, hardHitCount = 0;
  let kSum = 0, bbSum = 0, paSum = 0;
  let spXwobaSum = 0, spXwobaCount = 0;
  let bpXwobaSum = 0, bpXwobaCount = 0;

  for (const { batAgg, pitchAgg } of teamMap.values()) {
    const tx = xwoba(batAgg);
    if (tx !== null) { xwobaSum += tx; xwobaCount += 1; }
    if (batAgg.battedBalls >= 10) {
      barrelSum += batAgg.barrels / batAgg.battedBalls;
      hardHitSum += batAgg.hardHits / batAgg.battedBalls;
      barrelCount += 1;
      hardHitCount += 1;
    }
    if (batAgg.pa >= 10) {
      kSum += batAgg.strikeouts;
      bbSum += batAgg.walks;
      paSum += batAgg.pa;
    }
    const sx = xwoba({ xwobaSum: pitchAgg.starterXwobaSum, xwobaCount: pitchAgg.starterXwobaCount });
    if (sx !== null) { spXwobaSum += sx; spXwobaCount += 1; }
    const bx = xwoba({ xwobaSum: pitchAgg.bullpenXwobaSum, xwobaCount: pitchAgg.bullpenXwobaCount });
    if (bx !== null) { bpXwobaSum += bx; bpXwobaCount += 1; }
  }

  return {
    xwoba: xwobaCount ? xwobaSum / xwobaCount : LG_XWOBA,
    barrelPct: barrelCount ? barrelSum / barrelCount : LG_BARREL_PCT,
    hardHitPct: hardHitCount ? hardHitSum / hardHitCount : LG_HARD_HIT_PCT,
    kPct: paSum ? kSum / paSum : LG_K_PCT,
    bbPct: paSum ? bbSum / paSum : LG_BB_PCT,
    spXwoba: spXwobaCount ? spXwobaSum / spXwobaCount : LG_XWOBA,
    bpXwoba: bpXwobaCount ? bpXwobaSum / bpXwobaCount : LG_XWOBA + 0.03,
  };
}

function buildProfile(
  abbr: string,
  window: TeamStats,
  form: TeamStats | undefined,
  lgWindow: ReturnType<typeof computeLeagueAvgs>,
  lgForm: ReturnType<typeof computeLeagueAvgs> | undefined,
): MlbPlayerHistoryProfile {
  const fullName = ABBR_TO_FULL[abbr] ?? abbr;
  const { batAgg, pitchAgg } = window;

  const teamXwoba = xwoba(batAgg) ?? lgWindow.xwoba;
  const teamBarrelPct = batAgg.battedBalls ? batAgg.barrels / batAgg.battedBalls : lgWindow.barrelPct;
  const teamHardHitPct = batAgg.battedBalls ? batAgg.hardHits / batAgg.battedBalls : lgWindow.hardHitPct;
  const teamKPct = batAgg.pa ? batAgg.strikeouts / batAgg.pa : lgWindow.kPct;
  const teamBbPct = batAgg.pa ? batAgg.walks / batAgg.pa : lgWindow.bbPct;

  const spXwobaAllowed = xwoba({ xwobaSum: pitchAgg.starterXwobaSum, xwobaCount: pitchAgg.starterXwobaCount })
    ?? lgWindow.spXwoba;
  const bpXwobaAllowed = xwoba({ xwobaSum: pitchAgg.bullpenXwobaSum, xwobaCount: pitchAgg.bullpenXwobaCount })
    ?? lgWindow.bpXwoba;

  const vsLeftXwoba = splitXwoba(batAgg.vsLeft);
  const vsRightXwoba = splitXwoba(batAgg.vsRight);
  const clutchXwoba = splitXwoba(batAgg.clutch) ?? teamXwoba;

  // ── Edges (positive = home/team advantage over league) ─────────────────────
  const batterVsStarterEdge = r2(clamp((teamXwoba - lgWindow.xwoba) * 14, -2.5, 2.5));
  const pitcherVsLineupEdge = r2(clamp((lgWindow.spXwoba - spXwobaAllowed) * 14, -2.5, 2.5));
  const hardContactTrend = r2(clamp(
    (teamBarrelPct - lgWindow.barrelPct) * 20 + (teamHardHitPct - lgWindow.hardHitPct) * 5,
    -2.0, 2.0,
  ));
  const strikeoutWalkTrend = r2(clamp(
    (lgWindow.kPct - teamKPct) * 10 + (teamBbPct - lgWindow.bbPct) * 12,
    -1.8, 1.8,
  ));
  const platoonHistoryEdge = vsLeftXwoba !== null && vsRightXwoba !== null
    ? r2(clamp((vsRightXwoba - vsLeftXwoba) * 6, -1.8, 1.8))
    : 0;
  const clutchRecentEdge = r2(clamp((clutchXwoba - teamXwoba) * 8, -1.4, 1.6));
  const bullpenWindowEdge = r2(clamp((lgWindow.bpXwoba - bpXwobaAllowed) * 10, -2.2, 2.2));

  // ── Form edges (recent window vs season window) ──────────────────────────
  let recentHitterForm = 0;
  let recentPitcherForm = 0;
  let bullpenRecentForm = bullpenWindowEdge;

  if (form && lgForm) {
    const formXwoba = xwoba(form.batAgg) ?? teamXwoba;
    const formSpXwoba = xwoba({ xwobaSum: form.pitchAgg.starterXwobaSum, xwobaCount: form.pitchAgg.starterXwobaCount })
      ?? spXwobaAllowed;
    const formBpXwoba = xwoba({ xwobaSum: form.pitchAgg.bullpenXwobaSum, xwobaCount: form.pitchAgg.bullpenXwobaCount })
      ?? bpXwobaAllowed;

    // How much better/worse is recent form vs season baseline
    recentHitterForm = r2(clamp((formXwoba - teamXwoba) * 16, -2.5, 2.8));
    recentPitcherForm = r2(clamp((spXwobaAllowed - formSpXwoba) * 16, -2.6, 2.6));
    bullpenRecentForm = r2(clamp((bpXwobaAllowed - formBpXwoba) * 12, -2.2, 2.2));
  }

  const historySample = Math.min(999, batAgg.pa);

  return {
    teamName: fullName,
    source: "real",
    batterVsStarterEdge,
    pitcherVsLineupEdge,
    recentHitterForm,
    recentPitcherForm,
    bullpenRecentForm,
    platoonHistoryEdge,
    clutchRecentEdge,
    strikeoutWalkTrend,
    hardContactTrend,
    baseRunningTrend: 0, // sprint speed requires separate Savant endpoint
    historySample,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function fetchWindow(days: number): Promise<Map<string, TeamStats> | null> {
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const url = savantUrl(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  try {
    const csv = await fetchCsv(url);
    const rows = parseCsv(csv);
    if (rows.length < 10) return null;
    return aggregateRows(rows);
  } catch {
    return null;
  }
}

export async function fetchSavantTeamHistoryProfiles(): Promise<Record<string, MlbPlayerHistoryProfile> | null> {
  // Try both caches first
  const [cachedWindow, cachedForm] = await Promise.all([
    readHotCache<Record<string, MlbPlayerHistoryProfile>>(CACHE_KEY_WINDOW),
    readHotCache<Record<string, MlbPlayerHistoryProfile>>(CACHE_KEY_FORM),
  ]);
  if (cachedWindow) return cachedWindow;

  // Fetch both windows in parallel
  const [windowMap, formMap] = await Promise.all([
    fetchWindow(WINDOW_DAYS),
    cachedForm ? Promise.resolve(null) : fetchWindow(FORM_DAYS),
  ]);

  if (!windowMap) return null;

  const lgWindow = computeLeagueAvgs(windowMap);
  const lgForm = formMap ? computeLeagueAvgs(formMap) : undefined;

  const profiles: Record<string, MlbPlayerHistoryProfile> = {};

  for (const [abbr, stats] of windowMap.entries()) {
    const formStats = formMap?.get(abbr);
    const profile = buildProfile(abbr, stats, formStats, lgWindow, lgForm);
    const fullName = ABBR_TO_FULL[abbr] ?? abbr;
    // Store under normalized full name (primary lookup) and normalized abbr (fallback)
    profiles[normalizeMlbTeam(fullName)] = profile;
    profiles[normalizeMlbTeam(abbr)] = profile;
  }

  if (Object.keys(profiles).length >= 15) {
    await writeHotCache(CACHE_KEY_WINDOW, profiles, CACHE_TTL_WINDOW);
    if (formMap) await writeHotCache(CACHE_KEY_FORM, profiles, CACHE_TTL_FORM);
  }

  return Object.keys(profiles).length ? profiles : null;
}
