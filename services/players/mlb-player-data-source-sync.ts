import { calibrateMlbPlayerRatings } from "@/services/players/mlb-player-rating-calibrator";
import { ingestMlbPlayerDataV2 } from "@/services/players/mlb-player-data-ingest-v2";
import type { MlbBatterStatInput, MlbPitcherStatInput, MlbPlayerDataPipePayload } from "@/services/players/mlb-player-data-pipe";

export type MlbPlayerDataSourceKind = "combined" | "batters" | "pitchers";

export type MlbPlayerDataSourceConfig = {
  name: string;
  url: string;
  kind: MlbPlayerDataSourceKind;
};

export type MlbPlayerDataSourceSyncResult = {
  ok: boolean;
  generatedAt: string;
  sources: Array<{
    name: string;
    kind: MlbPlayerDataSourceKind;
    ok: boolean;
    fetched: boolean;
    batters: number;
    pitchers: number;
    qualityScore: number | null;
    qualityGrade: string | null;
    ratingsWritten: number;
    warnings: string[];
  }>;
  totals: { batters: number; pitchers: number; ratingsWritten: number; sources: number; failed: number };
  calibration: Awaited<ReturnType<typeof calibrateMlbPlayerRatings>> | null;
  warnings: string[];
};

function splitList(value: string | undefined) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function getConfiguredMlbPlayerDataSources(): MlbPlayerDataSourceConfig[] {
  const sources: MlbPlayerDataSourceConfig[] = [];
  const combined = splitList(process.env.MLB_PLAYER_STATS_URLS ?? process.env.MLB_PLAYER_STATS_URL);
  const batters = splitList(process.env.MLB_BATTER_STATS_URLS ?? process.env.MLB_BATTER_STATS_URL);
  const pitchers = splitList(process.env.MLB_PITCHER_STATS_URLS ?? process.env.MLB_PITCHER_STATS_URL);
  for (const [index, url] of combined.entries()) sources.push({ name: `combined-${index + 1}`, url, kind: "combined" });
  for (const [index, url] of batters.entries()) sources.push({ name: `batters-${index + 1}`, url, kind: "batters" });
  for (const [index, url] of pitchers.entries()) sources.push({ name: `pitchers-${index + 1}`, url, kind: "pitchers" });
  return sources;
}

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function s(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value != null) return value;
  }
  return null;
}

function year(value: unknown) {
  const num = n(value);
  return Number.isInteger(num) && num! > 1800 ? num! : new Date().getUTCFullYear();
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayFrom(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(asObject(item))) : [];
}

function payloadArrays(raw: unknown, kind: MlbPlayerDataSourceKind) {
  if (Array.isArray(raw)) return { batters: kind === "batters" ? arrayFrom(raw) : [], pitchers: kind === "pitchers" ? arrayFrom(raw) : [] };
  const obj = asObject(raw);
  if (!obj) return { batters: [], pitchers: [] };
  return {
    batters: arrayFrom(obj.batters ?? obj.hitters ?? obj.batterStats ?? obj.players),
    pitchers: arrayFrom(obj.pitchers ?? obj.pitcherStats ?? obj.arms)
  };
}

function batter(row: Record<string, unknown>, fallbackSource: string): MlbBatterStatInput {
  return {
    playerId: s(pick(row, ["playerId", "mlbamId", "mlbId", "id", "player_id"])) ?? "",
    playerName: s(pick(row, ["playerName", "fullName", "name", "player_name"])) ?? "",
    team: s(pick(row, ["team", "teamAbbrev", "teamCode", "team_abbreviation"])) ?? "",
    season: year(pick(row, ["season", "year"])),
    snapshotDate: s(pick(row, ["snapshotDate", "date", "asOf", "capturedAt"])),
    primaryPosition: s(pick(row, ["primaryPosition", "position", "pos"])),
    bats: s(pick(row, ["bats", "batSide", "bat_hand"])),
    throws: s(pick(row, ["throws", "throwSide", "throw_hand"])),
    plateAppearances: n(pick(row, ["plateAppearances", "pa", "PA"])),
    avg: n(pick(row, ["avg", "battingAverage", "AVG"])),
    obp: n(pick(row, ["obp", "OBP"])),
    slg: n(pick(row, ["slg", "SLG"])),
    iso: n(pick(row, ["iso", "ISO"])),
    woba: n(pick(row, ["woba", "wOBA"])),
    xwoba: n(pick(row, ["xwoba", "xwOBA"])),
    kRate: n(pick(row, ["kRate", "strikeoutRate", "k_pct", "kPercent"])),
    bbRate: n(pick(row, ["bbRate", "walkRate", "bb_pct", "bbPercent"])),
    hardHitRate: n(pick(row, ["hardHitRate", "hard_hit_rate", "hardHitPct"])),
    barrelRate: n(pick(row, ["barrelRate", "barrel_rate", "barrelPct"])),
    vsLhpOps: n(pick(row, ["vsLhpOps", "opsVsLhp", "ops_vs_lhp"])),
    vsRhpOps: n(pick(row, ["vsRhpOps", "opsVsRhp", "ops_vs_rhp"])),
    sprintSpeed: n(pick(row, ["sprintSpeed", "sprint_speed"])),
    defensiveValue: n(pick(row, ["defensiveValue", "def", "fieldingRuns"])),
    recentWoba: n(pick(row, ["recentWoba", "last14Woba", "last30Woba"])),
    recentOps: n(pick(row, ["recentOps", "last14Ops", "last30Ops"])),
    source: s(row.source) ?? fallbackSource,
    raw: row
  };
}

function pitcher(row: Record<string, unknown>, fallbackSource: string): MlbPitcherStatInput {
  return {
    pitcherId: s(pick(row, ["pitcherId", "playerId", "mlbamId", "mlbId", "id", "pitcher_id"])) ?? "",
    pitcherName: s(pick(row, ["pitcherName", "playerName", "fullName", "name", "pitcher_name"])) ?? "",
    team: s(pick(row, ["team", "teamAbbrev", "teamCode", "team_abbreviation"])) ?? "",
    season: year(pick(row, ["season", "year"])),
    snapshotDate: s(pick(row, ["snapshotDate", "date", "asOf", "capturedAt"])),
    throws: s(pick(row, ["throws", "throwSide", "throw_hand"])),
    innings: n(pick(row, ["innings", "ip", "IP"])),
    starts: n(pick(row, ["starts", "gs", "GS"])),
    reliefAppearances: n(pick(row, ["reliefAppearances", "reliefApps", "gamesRelief"])),
    era: n(pick(row, ["era", "ERA"])),
    xera: n(pick(row, ["xera", "xERA"])),
    fip: n(pick(row, ["fip", "FIP"])),
    xfip: n(pick(row, ["xfip", "xFIP"])),
    kRate: n(pick(row, ["kRate", "strikeoutRate", "k_pct", "kPercent"])),
    bbRate: n(pick(row, ["bbRate", "walkRate", "bb_pct", "bbPercent"])),
    kMinusBbRate: n(pick(row, ["kMinusBbRate", "kbbRate", "k_minus_bb"])),
    hrPer9: n(pick(row, ["hrPer9", "hr9", "HR9"])),
    groundBallRate: n(pick(row, ["groundBallRate", "gbRate", "gb_pct"])),
    pitchCountAvg: n(pick(row, ["pitchCountAvg", "avgPitchCount", "pitchesPerStart"])),
    recentWorkload: n(pick(row, ["recentWorkload", "last7Pitches", "last5DaysPitches"])),
    velocity: n(pick(row, ["velocity", "fastballVelocity", "fbVelo"])),
    stuffPlus: n(pick(row, ["stuffPlus", "stuff_plus"])),
    source: s(row.source) ?? fallbackSource,
    raw: row
  };
}

async function fetchJson(source: MlbPlayerDataSourceConfig) {
  const response = await fetch(source.url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`${source.name} returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function syncMlbPlayerDataSources(args: { calibrate?: boolean; season?: number | null; source?: string | null } = {}): Promise<MlbPlayerDataSourceSyncResult> {
  const configured = getConfiguredMlbPlayerDataSources();
  const results: MlbPlayerDataSourceSyncResult["sources"] = [];
  const warnings: string[] = [];
  let totalBatters = 0;
  let totalPitchers = 0;
  let ratingsWritten = 0;
  if (!configured.length) warnings.push("No player stat source URLs configured. Set MLB_PLAYER_STATS_URLS, MLB_BATTER_STATS_URLS, or MLB_PITCHER_STATS_URLS.");

  for (const source of configured) {
    try {
      const raw = await fetchJson(source);
      const arrays = payloadArrays(raw, source.kind);
      const payload: MlbPlayerDataPipePayload = {
        source: args.source ?? source.name,
        capturedAt: new Date().toISOString(),
        batters: arrays.batters.map((row) => batter(row, source.name)),
        pitchers: arrays.pitchers.map((row) => pitcher(row, source.name))
      };
      const ingest = await ingestMlbPlayerDataV2(payload);
      totalBatters += ingest.ingest?.inserted.batters ?? 0;
      totalPitchers += ingest.ingest?.inserted.pitchers ?? 0;
      ratingsWritten += ingest.ingest?.inserted.ratings ?? 0;
      results.push({
        name: source.name,
        kind: source.kind,
        ok: ingest.ok,
        fetched: true,
        batters: ingest.ingest?.inserted.batters ?? 0,
        pitchers: ingest.ingest?.inserted.pitchers ?? 0,
        qualityScore: ingest.quality.score,
        qualityGrade: ingest.quality.grade,
        ratingsWritten: ingest.ingest?.inserted.ratings ?? 0,
        warnings: ingest.warnings
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown source sync error.";
      warnings.push(`${source.name}: ${message}`);
      results.push({ name: source.name, kind: source.kind, ok: false, fetched: false, batters: 0, pitchers: 0, qualityScore: null, qualityGrade: null, ratingsWritten: 0, warnings: [message] });
    }
  }

  const calibration = args.calibrate ? await calibrateMlbPlayerRatings({ mode: "write", season: args.season, source: args.source ?? "calibrated-stat-pipe-v1" }) : null;
  if (calibration) ratingsWritten += calibration.calibrated.ratingsWritten;
  const failed = results.filter((item) => !item.ok).length;
  return {
    ok: configured.length > 0 && failed === 0,
    generatedAt: new Date().toISOString(),
    sources: results,
    totals: { batters: totalBatters, pitchers: totalPitchers, ratingsWritten, sources: configured.length, failed },
    calibration,
    warnings: [...warnings, ...(calibration?.warnings ?? [])]
  };
}
