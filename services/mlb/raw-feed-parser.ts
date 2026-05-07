export type RawFeedRow = Record<string, unknown>;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"' && inQuotes) {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

export function parseCsvRows(csv: string): RawFeedRow[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export function rowsFromRawFeedBody(body: unknown, keys: string[]): RawFeedRow[] {
  if (Array.isArray(body)) return body as RawFeedRow[];
  const value = body as Record<string, unknown>;
  for (const key of keys) {
    const rows = value?.[key];
    if (Array.isArray(rows)) return rows as RawFeedRow[];
  }
  return [];
}

export async function fetchRawFeedRows(url: string, keys: string[]) {
  const response = await fetch(url, { cache: "no-store", headers: { "user-agent": "SharkEdge/1.0" } });
  if (!response.ok) throw new Error(`Raw MLB feed failed: HTTP ${response.status}`);
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return rowsFromRawFeedBody(JSON.parse(trimmed), keys);
  return parseCsvRows(text);
}

export function pick(row: RawFeedRow, ...keys: string[]) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]+/g, ""), value]));
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
    const match = normalized.get(key.toLowerCase().replace(/[^a-z0-9]+/g, ""));
    if (match !== undefined && match !== null && String(match).trim() !== "") return match;
  }
  return undefined;
}
