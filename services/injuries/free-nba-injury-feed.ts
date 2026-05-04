import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type FreeNbaInjuryStatus = "available" | "probable" | "questionable" | "doubtful" | "out" | "unknown";

export type FreeNbaInjuryPlayer = {
  playerName: string;
  teamName: string;
  status: FreeNbaInjuryStatus;
  minutesImpact: number;
  usageImpact: number;
  netRatingImpact: number;
  offensiveImpact: number;
  defensiveImpact: number;
  volatilityImpact: number;
  source: "official-nba" | "espn";
  reason?: string | null;
  reportUrl?: string | null;
};

export type FreeNbaInjuryFeed = {
  ok: boolean;
  generatedAt: string;
  lastUpdatedAt: string | null;
  players: FreeNbaInjuryPlayer[];
  sources: {
    officialNba: {
      ok: boolean;
      reportUrl: string | null;
      lastUpdatedAt: string | null;
      playerCount: number;
      warnings: string[];
    };
    espn: {
      ok: boolean;
      url: string;
      playerCount: number;
      warnings: string[];
    };
  };
  warnings: string[];
};

const CACHE_KEY = "nba:free-injury-feed:v1";
const CACHE_TTL_SECONDS = 60 * 10;
const FETCH_TIMEOUT_MS = 9000;
const OFFICIAL_REPORT_PAGE = "https://official.nba.com/nba-injury-report-2025-26-season/";
const ESPN_INJURIES_URL = "https://www.espn.com/nba/injuries?_adblock=true";

const NBA_TEAMS = [
  "Atlanta Hawks",
  "Boston Celtics",
  "Brooklyn Nets",
  "Charlotte Hornets",
  "Chicago Bulls",
  "Cleveland Cavaliers",
  "Dallas Mavericks",
  "Denver Nuggets",
  "Detroit Pistons",
  "Golden State Warriors",
  "Houston Rockets",
  "Indiana Pacers",
  "LA Clippers",
  "Los Angeles Clippers",
  "Los Angeles Lakers",
  "Memphis Grizzlies",
  "Miami Heat",
  "Milwaukee Bucks",
  "Minnesota Timberwolves",
  "New Orleans Pelicans",
  "New York Knicks",
  "Oklahoma City Thunder",
  "Orlando Magic",
  "Philadelphia 76ers",
  "Phoenix Suns",
  "Portland Trail Blazers",
  "Sacramento Kings",
  "San Antonio Spurs",
  "Toronto Raptors",
  "Utah Jazz",
  "Washington Wizards"
];

const HIGH_IMPACT_PLAYERS = new Set([
  "nikola jokic", "joel embiid", "giannis antetokounmpo", "luka doncic", "shai gilgeous-alexander",
  "jayson tatum", "jaylen brown", "anthony edwards", "lebron james", "anthony davis", "stephen curry",
  "kevin durant", "devin booker", "jalen brunson", "donovan mitchell", "tyrese haliburton", "ja morant",
  "trae young", "damian lillard", "james harden", "kawhi leonard", "paul george", "zion williamson",
  "victor wembanyama", "cade cunningham", "paolo banchero", "lamelo ball", "de'aaron fox", "jalen williams",
  "chet holmgren", "kyrie irving", "jimmy butler", "bam adebayo", "tyrese maxey", "lauri markkanen"
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function dedupeKey(player: Pick<FreeNbaInjuryPlayer, "playerName" | "teamName">) {
  return `${normalizeNbaTeam(player.teamName)}:${player.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function statusFrom(value: unknown): FreeNbaInjuryStatus {
  const text = String(value ?? "").toLowerCase();
  if (/available|active|will play|full participant/.test(text)) return "available";
  if (/probable|plans to play|expected to play/.test(text)) return "probable";
  if (/questionable|day-to-day|day to day|game-time|game time|uncertain/.test(text)) return "questionable";
  if (/doubtful/.test(text)) return "doubtful";
  if (/\bout\b|ruled out|won't play|will not play|inactive|suspend|injured reserve|miss/.test(text)) return "out";
  return "unknown";
}

function displayName(value: string) {
  const text = value.trim().replace(/\s+/g, " ");
  const comma = text.match(/^([^,]+),\s*(.+)$/);
  if (comma) return `${comma[2]} ${comma[1]}`.trim();
  return text;
}

function likelyHighImpact(playerName: string, reason: string | null | undefined) {
  const key = playerName.toLowerCase().replace(/\s+jr\.?$/i, "").trim();
  return HIGH_IMPACT_PLAYERS.has(key) || /all-star|star|starter|leading scorer|high usage|minutes limit/i.test(reason ?? "");
}

function impactFor(playerName: string, status: FreeNbaInjuryStatus, reason?: string | null) {
  const star = likelyHighImpact(playerName, reason);
  const multiplier = star ? 1.45 : 1;
  if (status === "out") {
    return { minutesImpact: 30 * multiplier, usageImpact: 7.5 * multiplier, netRatingImpact: -3.8 * multiplier, offensiveImpact: -2.4 * multiplier, defensiveImpact: -1.4 * multiplier, volatilityImpact: 3.2 * multiplier };
  }
  if (status === "doubtful") {
    return { minutesImpact: 25 * multiplier, usageImpact: 5.8 * multiplier, netRatingImpact: -2.9 * multiplier, offensiveImpact: -1.9 * multiplier, defensiveImpact: -1.0 * multiplier, volatilityImpact: 2.6 * multiplier };
  }
  if (status === "questionable") {
    return { minutesImpact: 18 * multiplier, usageImpact: 3.8 * multiplier, netRatingImpact: -1.7 * multiplier, offensiveImpact: -1.1 * multiplier, defensiveImpact: -0.6 * multiplier, volatilityImpact: 2.1 * multiplier };
  }
  if (status === "probable") {
    return { minutesImpact: 4, usageImpact: 0.8, netRatingImpact: -0.25, offensiveImpact: -0.15, defensiveImpact: -0.1, volatilityImpact: 0.5 };
  }
  return { minutesImpact: 0, usageImpact: 0, netRatingImpact: 0, offensiveImpact: 0, defensiveImpact: 0, volatilityImpact: 0 };
}

function makePlayer(args: {
  playerName: string;
  teamName: string;
  status: FreeNbaInjuryStatus;
  source: FreeNbaInjuryPlayer["source"];
  reason?: string | null;
  reportUrl?: string | null;
}): FreeNbaInjuryPlayer {
  const impact = impactFor(args.playerName, args.status, args.reason);
  return {
    playerName: displayName(args.playerName),
    teamName: args.teamName,
    status: args.status,
    minutesImpact: Number(clamp(impact.minutesImpact, 0, 48).toFixed(2)),
    usageImpact: Number(clamp(impact.usageImpact, -20, 20).toFixed(2)),
    netRatingImpact: Number(clamp(impact.netRatingImpact, -15, 15).toFixed(2)),
    offensiveImpact: Number(clamp(impact.offensiveImpact, -15, 15).toFixed(2)),
    defensiveImpact: Number(clamp(impact.defensiveImpact, -15, 15).toFixed(2)),
    volatilityImpact: Number(clamp(impact.volatilityImpact, 0, 8).toFixed(2)),
    source: args.source,
    reason: args.reason ?? null,
    reportUrl: args.reportUrl ?? null
  };
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "SharkEdge/1.0 injury feed" }
    });
    if (!response.ok) return null;
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchArrayBuffer(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "SharkEdge/1.0 injury feed" }
    });
    if (!response.ok) return null;
    return response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

function officialTimestampFromUrl(url: string | null) {
  const match = url?.match(/Injury-Report_(\d{4})-(\d{2})-(\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf/i);
  if (!match) return null;
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const ampm = match[6].toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  const month = Number(match[2]);
  const offset = month >= 3 && month <= 11 ? "-04:00" : "-05:00";
  const iso = `${match[1]}-${match[2]}-${match[3]}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${offset}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latestOfficialReportUrl(html: string) {
  const links = [...html.matchAll(/href=["']([^"']*Injury-Report_[^"']+\.pdf)["']/gi)]
    .map((match) => decodeHtml(match[1]))
    .map((href) => href.startsWith("http") ? href : new URL(href, OFFICIAL_REPORT_PAGE).toString());
  return links.at(-1) ?? null;
}

function loosePdfText(buffer: ArrayBuffer) {
  const latin = Buffer.from(buffer).toString("latin1");
  const strings = [...latin.matchAll(/\(([^()]{2,250})\)/g)].map((match) => match[1]);
  const raw = strings.length > 20 ? strings.join("\n") : latin;
  return raw
    .replace(/\\r/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, " ")
    .replace(/\s+/g, " ");
}

function parseOfficialPdfText(text: string, reportUrl: string | null) {
  const players: FreeNbaInjuryPlayer[] = [];
  const statusPattern = "Available|Probable|Questionable|Doubtful|Out";
  const teamPattern = NBA_TEAMS.map((team) => team.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const teamRegex = new RegExp(`(${teamPattern})\\s+([^]+?)\\s+(${statusPattern})(?:\\s+([^]+?))?(?=\\s+(?:${teamPattern})\\s+|\\s+[A-Z][A-Za-z.'-]+,\\s+[A-Z]|$)`, "gi");
  for (const match of text.matchAll(teamRegex)) {
    const teamName = match[1].trim();
    const playerName = match[2].trim();
    const status = statusFrom(match[3]);
    const reason = (match[4] ?? "").slice(0, 180).trim() || null;
    if (!playerName || !teamName || playerName.length > 64) continue;
    players.push(makePlayer({ playerName, teamName, status, source: "official-nba", reason, reportUrl }));
  }
  return players;
}

async function fetchOfficialNbaPlayers() {
  const warnings: string[] = [];
  const html = await fetchText(OFFICIAL_REPORT_PAGE);
  if (!html) {
    return { ok: false, reportUrl: null, lastUpdatedAt: null, players: [] as FreeNbaInjuryPlayer[], warnings: ["official NBA injury report page did not fetch"] };
  }
  const reportUrl = latestOfficialReportUrl(html);
  const lastUpdatedAt = officialTimestampFromUrl(reportUrl);
  if (!reportUrl) {
    return { ok: false, reportUrl: null, lastUpdatedAt, players: [] as FreeNbaInjuryPlayer[], warnings: ["official NBA injury report PDF link was not found"] };
  }
  const pdf = await fetchArrayBuffer(reportUrl);
  if (!pdf) {
    return { ok: false, reportUrl, lastUpdatedAt, players: [] as FreeNbaInjuryPlayer[], warnings: ["official NBA injury report PDF did not fetch"] };
  }
  const players = parseOfficialPdfText(loosePdfText(pdf), reportUrl);
  if (!players.length) warnings.push("official NBA report fetched, but PDF text parser returned no player rows");
  return { ok: players.length > 0, reportUrl, lastUpdatedAt, players, warnings };
}

function stripTags(html: string) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEspnTextLines(lines: string[]) {
  const players: FreeNbaInjuryPlayer[] = [];
  let currentTeam: string | null = null;
  const teamSet = new Set(NBA_TEAMS.map((team) => team.toLowerCase()));
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+/g, " ").trim();
    if (teamSet.has(line.toLowerCase())) {
      currentTeam = line;
      continue;
    }
    if (!currentTeam) continue;
    const status = statusFrom(`${line} ${lines[index + 1] ?? ""} ${lines[index + 2] ?? ""}`);
    if (status === "unknown") continue;
    const next = lines[index + 1] ?? "";
    const next2 = lines[index + 2] ?? "";
    const candidate = /^[A-Z][A-Za-z .'-]{2,60}$/.test(line) ? line : null;
    if (!candidate || ["NAME", "POS", "STATUS", "COMMENT"].includes(candidate.toUpperCase())) continue;
    const reason = `${next} ${next2}`.slice(0, 220).trim();
    players.push(makePlayer({ playerName: candidate, teamName: currentTeam, status, source: "espn", reason }));
  }
  return players;
}

function parseEspnJson(html: string) {
  const players: FreeNbaInjuryPlayer[] = [];
  const embedded = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i)?.[1];
  if (!embedded) return players;
  try {
    const json = JSON.parse(decodeHtml(embedded));
    const seen = new Set<unknown>();
    const walk = (value: unknown, teamName: string | null = null) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      const row = value as Record<string, unknown>;
      const possibleTeam = typeof row.team === "string" ? row.team
        : typeof row.teamName === "string" ? row.teamName
          : typeof row.displayName === "string" && NBA_TEAMS.includes(row.displayName) ? row.displayName
            : teamName;
      const name = typeof row.name === "string" ? row.name
        : typeof row.displayName === "string" ? row.displayName
          : typeof row.fullName === "string" ? row.fullName
            : null;
      const status = statusFrom(row.status ?? row.injuryStatus ?? row.description ?? row.comment);
      if (name && possibleTeam && status !== "unknown" && !NBA_TEAMS.includes(name)) {
        players.push(makePlayer({ playerName: name, teamName: possibleTeam, status, source: "espn", reason: String(row.comment ?? row.description ?? "").slice(0, 220) }));
      }
      for (const child of Object.values(row)) {
        if (Array.isArray(child)) child.forEach((item) => walk(item, possibleTeam));
        else walk(child, possibleTeam);
      }
    };
    walk(json);
  } catch {
    return [];
  }
  return players;
}

async function fetchEspnPlayers() {
  const warnings: string[] = [];
  const html = await fetchText(ESPN_INJURIES_URL);
  if (!html) return { ok: false, players: [] as FreeNbaInjuryPlayer[], warnings: ["ESPN injuries page did not fetch"] };
  const players = [...parseEspnJson(html), ...parseEspnTextLines(stripTags(html))];
  if (!players.length) warnings.push("ESPN injuries page fetched, but parser returned no player rows");
  return { ok: players.length > 0, players, warnings };
}

function mergePlayers(primary: FreeNbaInjuryPlayer[], backup: FreeNbaInjuryPlayer[]) {
  const map = new Map<string, FreeNbaInjuryPlayer>();
  for (const player of backup) map.set(dedupeKey(player), player);
  for (const player of primary) map.set(dedupeKey(player), player);
  return [...map.values()].sort((left, right) => left.teamName.localeCompare(right.teamName) || left.playerName.localeCompare(right.playerName));
}

export async function getFreeNbaInjuryFeed(): Promise<FreeNbaInjuryFeed> {
  const cached = await readHotCache<FreeNbaInjuryFeed>(CACHE_KEY);
  if (cached) return cached;
  const [official, espn] = await Promise.all([fetchOfficialNbaPlayers(), fetchEspnPlayers()]);
  const players = mergePlayers(official.players, espn.players);
  const feed = {
    ok: players.length > 0,
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: official.lastUpdatedAt ?? new Date().toISOString(),
    players,
    sources: {
      officialNba: {
        ok: official.ok,
        reportUrl: official.reportUrl,
        lastUpdatedAt: official.lastUpdatedAt,
        playerCount: official.players.length,
        warnings: official.warnings
      },
      espn: {
        ok: espn.ok,
        url: ESPN_INJURIES_URL,
        playerCount: espn.players.length,
        warnings: espn.warnings
      }
    },
    warnings: [...official.warnings, ...espn.warnings]
  } satisfies FreeNbaInjuryFeed;
  await writeHotCache(CACHE_KEY, feed, CACHE_TTL_SECONDS);
  return feed;
}
