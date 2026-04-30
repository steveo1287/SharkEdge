import fs from "node:fs";
import path from "node:path";

type Row = Record<string, string>;

const SCHEDULE_CANDIDATES = [
  "Games.csv",
  "games.csv",
  "Games.json",
  "games.json",
  "LeagueSchedule25_26.csv",
  "LeagueSchedule24_25.csv",
  "LeagueSchedule23_24.csv",
  "schedule.csv",
  "schedule.json",
  "nba_schedule.csv",
  "nba_schedule.json",
  "hoopr_schedule.csv",
  "hoopr_schedule.json",
  "nba_api_games.json"
];

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function optionalArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
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
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsv(text: string): Row[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Row = {};
    headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
    return row;
  });
}

function readRows(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".json")) {
    const body = JSON.parse(text);
    const rows = Array.isArray(body) ? body : body.rows ?? body.data ?? body.games ?? body.schedule ?? [];
    return rows as Row[];
  }
  return parseCsv(text);
}

function loadSchedule(inputDir: string) {
  for (const candidate of SCHEDULE_CANDIDATES) {
    const filePath = path.join(inputDir, candidate);
    if (fs.existsSync(filePath)) return { filePath, rows: readRows(filePath) };
  }
  return { filePath: null, rows: [] as Row[] };
}

function normalizedLookup(row: Row, key: string) {
  const target = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const [rowKey, value] of Object.entries(row)) {
    if (rowKey.toLowerCase().replace(/[^a-z0-9]+/g, "") === target) return value;
  }
  return "";
}

function first(row: Row, keys: string[]) {
  for (const key of keys) {
    const exact = row[key];
    if (exact) return exact;
    const normalized = normalizedLookup(row, key);
    if (normalized) return normalized;
  }
  return "";
}

function rowGameId(row: Row) {
  return first(row, ["gameId", "GAME_ID", "game_id", "idGame", "Game_ID", "gameCode", "game"]);
}

function rowSeason(row: Row) {
  return first(row, ["season", "SEASON", "seasonYear", "season_year", "year"]);
}

function rowDate(row: Row) {
  return first(row, ["gameDate", "GAME_DATE", "game_date", "date", "Date", "gameDateEst", "GAME_DATE_EST"]);
}

function main() {
  const inputDir = path.resolve(argValue("input", path.join("data", "nba", "raw")));
  const outFile = path.resolve(argValue("out", path.join("data", "nba", "raw", "game_ids.txt")));
  const seasonFilter = optionalArg("season");
  const sinceFilter = optionalArg("since");
  const limit = Number(argValue("limit", "0"));
  const schedule = loadSchedule(inputDir);
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const row of schedule.rows) {
    const id = rowGameId(row).trim();
    if (!id || seen.has(id)) continue;
    if (seasonFilter && !rowSeason(row).includes(seasonFilter)) continue;
    if (sinceFilter) {
      const date = rowDate(row);
      if (date && date < sinceFilter) continue;
    }
    seen.add(id);
    ids.push(id);
    if (limit > 0 && ids.length >= limit) break;
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, ids.join("\n") + (ids.length ? "\n" : ""));
  console.log(JSON.stringify({ ok: ids.length > 0, source: schedule.filePath, rows: schedule.rows.length, ids: ids.length, outFile }, null, 2));
  if (!ids.length) process.exitCode = 1;
}

main();
