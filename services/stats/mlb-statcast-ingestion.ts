import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type CsvRow = Record<string, string>;

type TeamAgg = {
  teamAbbr: string;
  battedBalls: number;
  hardHits: number;
  barrels: number;
  xwobaSum: number;
  xwobaCount: number;
  swings: number;
  whiffs: number;
  chaseSwings: number;
  chaseOpportunities: number;
  pitchesSeen: number;
  plateAppearances: number;
  vsLeft: SplitAgg;
  vsRight: SplitAgg;
};

type PlayerAgg = TeamAgg & {
  playerId: string;
  playerName: string;
  pitcherPitches: number;
  pitcherWhiffs: number;
  pitcherChases: number;
  pitcherChaseOpps: number;
  pitchMix: Record<string, { count: number; velocitySum: number }>;
  leveragePitches: number;
  highLeveragePitches: number;
};

type SplitAgg = {
  battedBalls: number;
  xwobaSum: number;
  xwobaCount: number;
  hardHits: number;
  barrels: number;
  swings: number;
  whiffs: number;
};

type StatcastIngestResult = {
  startDate: string;
  endDate: string;
  rowsFetched: number;
  teamsUpdated: number;
  playersUpdated: number;
  warnings: string[];
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTeam(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function emptySplit(): SplitAgg {
  return {
    battedBalls: 0,
    xwobaSum: 0,
    xwobaCount: 0,
    hardHits: 0,
    barrels: 0,
    swings: 0,
    whiffs: 0
  };
}

function emptyTeam(teamAbbr: string): TeamAgg {
  return {
    teamAbbr,
    battedBalls: 0,
    hardHits: 0,
    barrels: 0,
    xwobaSum: 0,
    xwobaCount: 0,
    swings: 0,
    whiffs: 0,
    chaseSwings: 0,
    chaseOpportunities: 0,
    pitchesSeen: 0,
    plateAppearances: 0,
    vsLeft: emptySplit(),
    vsRight: emptySplit()
  };
}

function emptyPlayer(playerId: string, playerName: string, teamAbbr: string): PlayerAgg {
  return {
    ...emptyTeam(teamAbbr),
    playerId,
    playerName,
    pitcherPitches: 0,
    pitcherWhiffs: 0,
    pitcherChases: 0,
    pitcherChaseOpps: 0,
    pitchMix: {},
    leveragePitches: 0,
    highLeveragePitches: 0
  };
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function parseCsv(csv: string): CsvRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

async function fetchCsv(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "SharkEdge/2.0 statcast-ingest",
        accept: "text/csv,*/*"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function savantCsvUrl(startDate: string, endDate: string) {
  const params = new URLSearchParams({
    all: "true",
    hfPT: "",
    hfAB: "",
    hfGT: "R|",
    hfPR: "",
    hfZ: "",
    stadium: "",
    hfBBL: "",
    hfNewZones: "",
    hfPull: "",
    hfC: "",
    hfSea: "",
    hfSit: "",
    player_type: "batter",
    hfOuts: "",
    opponent: "",
    pitcher_throws: "",
    batter_stands: "",
    hfSA: "",
    game_date_gt: startDate,
    game_date_lt: endDate,
    hfInfield: "",
    team: "",
    position: "",
    hfOutfield: "",
    hfRO: "",
    home_road: "",
    game_pk: "",
    min_pitches: "0",
    min_results: "0",
    group_by: "name",
    sort_col: "pitches",
    player_event_sort: "api_p_release_speed",
    sort_order: "desc",
    min_pas: "0",
    type: "details"
  });
  return `https://baseballsavant.mlb.com/statcast_search/csv?${params.toString()}`;
}

function isSwing(description: string) {
  const value = description.toLowerCase();
  return value.includes("swinging") || value.includes("foul") || value.includes("hit_into_play") || value.includes("foul_tip");
}

function isWhiff(description: string) {
  const value = description.toLowerCase();
  return value.includes("swinging_strike") || value.includes("foul_tip");
}

function isBattedBall(row: CsvRow) {
  return readNumber(row.launch_speed) !== null && readNumber(row.launch_angle) !== null;
}

function isBarrel(row: CsvRow) {
  const launchSpeedAngle = readNumber(row.launch_speed_angle);
  if (launchSpeedAngle !== null) return launchSpeedAngle === 6;
  const exitVelocity = readNumber(row.launch_speed);
  const launchAngle = readNumber(row.launch_angle);
  return exitVelocity !== null && launchAngle !== null && exitVelocity >= 98 && launchAngle >= 26 && launchAngle <= 30;
}

function isChaseOpportunity(row: CsvRow) {
  const zone = readNumber(row.zone);
  return zone !== null && zone > 9;
}

function addBattedBall(agg: TeamAgg | PlayerAgg, row: CsvRow) {
  const exitVelocity = readNumber(row.launch_speed);
  const xwoba = readNumber(row.estimated_woba_using_speedangle) ?? readNumber(row.estimated_woba_using_speed_angle);
  agg.battedBalls += 1;
  if (exitVelocity !== null && exitVelocity >= 95) agg.hardHits += 1;
  if (isBarrel(row)) agg.barrels += 1;
  if (xwoba !== null) {
    agg.xwobaSum += xwoba;
    agg.xwobaCount += 1;
  }
}

function addToSplit(split: SplitAgg, row: CsvRow) {
  const description = row.description ?? "";
  const exitVelocity = readNumber(row.launch_speed);
  const xwoba = readNumber(row.estimated_woba_using_speedangle) ?? readNumber(row.estimated_woba_using_speed_angle);
  if (isBattedBall(row)) {
    split.battedBalls += 1;
    if (exitVelocity !== null && exitVelocity >= 95) split.hardHits += 1;
    if (isBarrel(row)) split.barrels += 1;
    if (xwoba !== null) {
      split.xwobaSum += xwoba;
      split.xwobaCount += 1;
    }
  }
  if (isSwing(description)) split.swings += 1;
  if (isWhiff(description)) split.whiffs += 1;
}

function summarizeSplit(split: SplitAgg) {
  return {
    battedBalls: split.battedBalls,
    xwoba: split.xwobaCount ? Number((split.xwobaSum / split.xwobaCount).toFixed(4)) : null,
    hardHitRate: split.battedBalls ? Number((split.hardHits / split.battedBalls).toFixed(4)) : null,
    barrelRate: split.battedBalls ? Number((split.barrels / split.battedBalls).toFixed(4)) : null,
    whiffRate: split.swings ? Number((split.whiffs / split.swings).toFixed(4)) : null
  };
}

function summarizeTeam(agg: TeamAgg) {
  return {
    statcast: {
      teamAbbr: agg.teamAbbr,
      battedBalls: agg.battedBalls,
      plateAppearances: agg.plateAppearances,
      pitchesSeen: agg.pitchesSeen,
      xwoba: agg.xwobaCount ? Number((agg.xwobaSum / agg.xwobaCount).toFixed(4)) : null,
      hardHitRate: agg.battedBalls ? Number((agg.hardHits / agg.battedBalls).toFixed(4)) : null,
      barrelRate: agg.battedBalls ? Number((agg.barrels / agg.battedBalls).toFixed(4)) : null,
      chaseRate: agg.chaseOpportunities ? Number((agg.chaseSwings / agg.chaseOpportunities).toFixed(4)) : null,
      whiffRate: agg.swings ? Number((agg.whiffs / agg.swings).toFixed(4)) : null,
      platoonSplits: {
        vsLeft: summarizeSplit(agg.vsLeft),
        vsRight: summarizeSplit(agg.vsRight)
      },
      dataQuality: {
        source: "baseball_savant_statcast_csv",
        hasXwoba: agg.xwobaCount > 0,
        hasPitchLevelRows: agg.pitchesSeen > 0
      }
    }
  };
}

function summarizePlayer(agg: PlayerAgg) {
  const mix: Record<string, { usage: number; avgVelocity: number | null; count: number }> = {};
  for (const [pitchType, value] of Object.entries(agg.pitchMix)) {
    mix[pitchType] = {
      count: value.count,
      usage: agg.pitcherPitches ? Number((value.count / agg.pitcherPitches).toFixed(4)) : 0,
      avgVelocity: value.count ? Number((value.velocitySum / value.count).toFixed(2)) : null
    };
  }

  return {
    statcast: {
      playerId: agg.playerId,
      playerName: agg.playerName,
      teamAbbr: agg.teamAbbr,
      battedBalls: agg.battedBalls,
      plateAppearances: agg.plateAppearances,
      pitchesSeen: agg.pitchesSeen,
      xwoba: agg.xwobaCount ? Number((agg.xwobaSum / agg.xwobaCount).toFixed(4)) : null,
      hardHitRate: agg.battedBalls ? Number((agg.hardHits / agg.battedBalls).toFixed(4)) : null,
      barrelRate: agg.battedBalls ? Number((agg.barrels / agg.battedBalls).toFixed(4)) : null,
      chaseRate: agg.chaseOpportunities ? Number((agg.chaseSwings / agg.chaseOpportunities).toFixed(4)) : null,
      whiffRate: agg.swings ? Number((agg.whiffs / agg.swings).toFixed(4)) : null,
      platoonSplits: {
        vsLeft: summarizeSplit(agg.vsLeft),
        vsRight: summarizeSplit(agg.vsRight)
      },
      pitching: {
        pitches: agg.pitcherPitches,
        whiffRateAllowed: agg.pitcherPitches ? Number((agg.pitcherWhiffs / agg.pitcherPitches).toFixed(4)) : null,
        chaseRateInduced: agg.pitcherChaseOpps ? Number((agg.pitcherChases / agg.pitcherChaseOpps).toFixed(4)) : null,
        pitchMix: mix,
        highLeverageShare: agg.leveragePitches ? Number((agg.highLeveragePitches / agg.leveragePitches).toFixed(4)) : null
      },
      dataQuality: {
        source: "baseball_savant_statcast_csv",
        hasXwoba: agg.xwobaCount > 0,
        hasPitchMix: Object.keys(mix).length > 0
      }
    }
  };
}

async function findMlbLeague() {
  return prisma.league.findUnique({ where: { key: "MLB" } });
}

async function teamByAbbreviation(leagueId: string) {
  const teams = await prisma.team.findMany({ where: { leagueId } });
  return new Map(teams.map((team) => [normalizeTeam(team.abbreviation), team]));
}

async function playerByMlbIdOrName(leagueId: string) {
  const players = await prisma.player.findMany({ where: { leagueId } });
  const byKey = new Map<string, typeof players[number]>();
  for (const player of players) {
    const externalIds = player.externalIds as JsonRecord | null;
    const mlb = readString(externalIds?.mlb);
    if (mlb) byKey.set(`id:${mlb}`, player);
    byKey.set(`name:${player.name.toLowerCase()}`, player);
  }
  return byKey;
}

function mergeStatcast(existing: unknown, patch: JsonRecord) {
  const record = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as JsonRecord) : {};
  return { ...record, ...patch };
}

export async function ingestMlbStatcastQuality(args: { lookbackDays?: number } = {}): Promise<StatcastIngestResult> {
  const league = await findMlbLeague();
  const warnings: string[] = [];
  const lookbackDays = Math.max(1, Math.min(14, args.lookbackDays ?? 7));
  const end = new Date();
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  if (!league) return { startDate, endDate, rowsFetched: 0, teamsUpdated: 0, playersUpdated: 0, warnings: ["MLB league missing."] };

  let rows: CsvRow[] = [];
  try {
    const csv = await fetchCsv(savantCsvUrl(startDate, endDate));
    rows = parseCsv(csv);
  } catch (err) {
    warnings.push(`Statcast fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return { startDate, endDate, rowsFetched: 0, teamsUpdated: 0, playersUpdated: 0, warnings };
  }

  const teams = await teamByAbbreviation(league.id);
  const players = await playerByMlbIdOrName(league.id);
  const teamAggs = new Map<string, TeamAgg>();
  const playerAggs = new Map<string, PlayerAgg>();

  for (const row of rows) {
    const batterTeam = normalizeTeam(row.batter_team);
    const pitcherTeam = normalizeTeam(row.pitcher_team);
    const description = row.description ?? "";
    const stand = (row.stand ?? "").toUpperCase();
    const throws = (row.p_throws ?? "").toUpperCase();
    const zone = readNumber(row.zone);
    const pitchType = readString(row.pitch_type) ?? "UNK";
    const velocity = readNumber(row.release_speed);
    const batterId = readString(row.batter);
    const pitcherId = readString(row.pitcher);
    const playerName = readString(row.player_name) ?? "Unknown";
    const isPitch = Boolean(description || row.pitch_type || row.zone);
    const swing = isSwing(description);
    const whiff = isWhiff(description);
    const chaseOpportunity = isChaseOpportunity(row);
    const chaseSwing = chaseOpportunity && swing;

    if (batterTeam) {
      const agg = teamAggs.get(batterTeam) ?? emptyTeam(batterTeam);
      agg.pitchesSeen += isPitch ? 1 : 0;
      if (row.events) agg.plateAppearances += 1;
      if (swing) agg.swings += 1;
      if (whiff) agg.whiffs += 1;
      if (chaseOpportunity) agg.chaseOpportunities += 1;
      if (chaseSwing) agg.chaseSwings += 1;
      if (isBattedBall(row)) addBattedBall(agg, row);
      if (throws === "L") addToSplit(agg.vsLeft, row);
      if (throws === "R") addToSplit(agg.vsRight, row);
      teamAggs.set(batterTeam, agg);
    }

    if (batterId) {
      const key = `id:${batterId}`;
      const agg = playerAggs.get(key) ?? emptyPlayer(batterId, playerName, batterTeam);
      agg.pitchesSeen += isPitch ? 1 : 0;
      if (row.events) agg.plateAppearances += 1;
      if (swing) agg.swings += 1;
      if (whiff) agg.whiffs += 1;
      if (chaseOpportunity) agg.chaseOpportunities += 1;
      if (chaseSwing) agg.chaseSwings += 1;
      if (isBattedBall(row)) addBattedBall(agg, row);
      if (throws === "L") addToSplit(agg.vsLeft, row);
      if (throws === "R") addToSplit(agg.vsRight, row);
      playerAggs.set(key, agg);
    }

    if (pitcherId) {
      const key = `id:${pitcherId}`;
      const agg = playerAggs.get(key) ?? emptyPlayer(pitcherId, playerName, pitcherTeam);
      agg.pitcherPitches += isPitch ? 1 : 0;
      if (whiff) agg.pitcherWhiffs += 1;
      if (chaseOpportunity) agg.pitcherChaseOpps += 1;
      if (chaseSwing) agg.pitcherChases += 1;
      const pitch = agg.pitchMix[pitchType] ?? { count: 0, velocitySum: 0 };
      pitch.count += 1;
      pitch.velocitySum += velocity ?? 0;
      agg.pitchMix[pitchType] = pitch;
      const inning = readNumber(row.inning);
      const leverageSignal = inning !== null && inning >= 7;
      if (leverageSignal) agg.leveragePitches += 1;
      if (leverageSignal && zone !== null) agg.highLeveragePitches += 1;
      playerAggs.set(key, agg);
    }
  }

  let teamsUpdated = 0;
  for (const [abbr, agg] of teamAggs.entries()) {
    const team = teams.get(abbr);
    if (!team) continue;
    const latest = await prisma.teamGameStat.findFirst({
      where: { teamId: team.id },
      orderBy: { updatedAt: "desc" }
    });
    if (!latest) continue;
    await prisma.teamGameStat.update({
      where: { id: latest.id },
      data: { statsJson: toJson(mergeStatcast(latest.statsJson, summarizeTeam(agg))) }
    });
    teamsUpdated += 1;
  }

  let playersUpdated = 0;
  for (const [key, agg] of playerAggs.entries()) {
    const player = players.get(key) ?? players.get(`name:${agg.playerName.toLowerCase()}`);
    if (!player) continue;
    const latest = await prisma.playerGameStat.findFirst({
      where: { playerId: player.id },
      orderBy: { updatedAt: "desc" }
    });
    if (!latest) continue;
    await prisma.playerGameStat.update({
      where: { id: latest.id },
      data: { statsJson: toJson(mergeStatcast(latest.statsJson, summarizePlayer(agg))) }
    });
    playersUpdated += 1;
  }

  if (!rows.length) warnings.push("Statcast CSV returned no rows.");
  if (!teamsUpdated) warnings.push("No team rows matched Statcast abbreviations.");
  if (!playersUpdated) warnings.push("No player rows matched Statcast player ids/names.");

  return { startDate, endDate, rowsFetched: rows.length, teamsUpdated, playersUpdated, warnings };
}
