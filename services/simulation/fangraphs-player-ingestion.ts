import { normalizeMlbPlayerRows, rowsFromMlbPlayerBody, type MlbPlayerAnalyticsRow } from "@/services/simulation/mlb-player-analytics-pipeline";
import { parseCsvRows, pick } from "@/services/mlb/raw-feed-parser";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function fangraphsToPlayerRow(row: Record<string, unknown>) {
  const playerName = pick(row, "Name", "PlayerName", "playerName", "player", "name", "player_name");
  const teamName = pick(row, "Team", "teamName", "team", "TeamName", "team_name", "Tm");
  const ip = n(pick(row, "IP", "Innings", "projectedInnings", "projected_ip")) ?? 0;
  const pa = n(pick(row, "PA", "projectedPa", "projected_pa", "TBF")) ?? 0;
  const position = String(pick(row, "Pos", "Position", "position", "playerType") ?? "");
  const isPitcher = ip > 0 || /P|SP|RP/i.test(position);
  const playerType = isPitcher ? (ip >= 3 ? "starter" : "reliever") : "hitter";
  return {
    playerName,
    teamName,
    playerType,
    role: pick(row, "Role", "role", "Pos", "Position") ?? playerType,
    bats: pick(row, "Bats", "bats"),
    throws: pick(row, "Throws", "throws"),
    status: pick(row, "Status", "status", "Injury Status", "injuryStatus") ?? "available",
    projectedPa: isPitcher ? 0 : pa,
    projectedInnings: ip,
    lineupSpot: n(pick(row, "LineupSpot", "lineupSpot", "BattingOrder")) ?? 0,
    wrcPlus: n(pick(row, "wRC+", "wRCPlus", "wrcPlus")) ?? undefined,
    xwoba: n(pick(row, "xwOBA", "xwoba", "wOBA", "woba")) ?? undefined,
    isoPower: n(pick(row, "ISO", "isoPower")) ?? undefined,
    kRate: n(pick(row, "K%", "KRate", "kRate", "K%+", "K_PCT", "k_pct")) ?? undefined,
    bbRate: n(pick(row, "BB%", "BBRate", "bbRate", "BB%+", "BB_PCT", "bb_pct")) ?? undefined,
    hardHitRate: n(pick(row, "HardHit%", "Hard%", "hardHitRate")) ?? undefined,
    barrelRate: n(pick(row, "Barrel%", "barrelRate")) ?? undefined,
    stolenBaseValue: n(pick(row, "BsR", "Spd", "stolenBaseValue")) ?? undefined,
    defenseValue: n(pick(row, "Def", "DRS", "OAA", "defenseValue")) ?? undefined,
    pitcherEra: n(pick(row, "ERA", "pitcherEra")) ?? undefined,
    pitcherWhip: n(pick(row, "WHIP", "pitcherWhip")) ?? undefined,
    pitcherEraMinus: n(pick(row, "ERA-", "ERA_MINUS", "pitcherEraMinus")) ?? undefined,
    pitcherXFip: n(pick(row, "xFIP", "FIP", "SIERA", "pitcherXFip")) ?? undefined,
    pitcherKRate: n(pick(row, "K%", "pitcherKRate")) ?? undefined,
    pitcherBbRate: n(pick(row, "BB%", "pitcherBbRate")) ?? undefined,
    groundBallRate: n(pick(row, "GB%", "groundBallRate")) ?? undefined,
    platoonVsLhp: n(pick(row, "wRC+ vs L", "vs_lhp", "platoonVsLhp")) ?? undefined,
    platoonVsRhp: n(pick(row, "wRC+ vs R", "vs_rhp", "platoonVsRhp")) ?? undefined,
    fatigueRisk: n(pick(row, "Fatigue", "fatigueRisk")) ?? 0,
    leverageIndex: n(pick(row, "pLI", "gmLI", "leverageIndex")) ?? undefined
  };
}

async function fetchTextOrJson(url: string) {
  if (url.startsWith("file://")) return readFile(fileURLToPath(url), "utf8");
  const response = await fetch(url, { cache: "no-store", headers: { "user-agent": "SharkEdge/1.0" } });
  if (!response.ok) throw new Error(`FanGraphs player upstream failed: ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) return JSON.parse(text);
  return text;
}

export async function ingestFangraphsPlayerFeed(url: string): Promise<MlbPlayerAnalyticsRow[]> {
  const body = await fetchTextOrJson(url);
  const rows = typeof body === "string" ? parseCsvRows(body).map(fangraphsToPlayerRow) : rowsFromMlbPlayerBody(body).map(fangraphsToPlayerRow);
  return normalizeMlbPlayerRows(rows);
}
