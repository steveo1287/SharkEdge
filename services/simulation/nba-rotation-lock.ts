import { readNbaWarehouseFeed } from "@/services/data/nba/warehouse-feed";

export type NbaRotationLockPlayer = {
  name: string;
  team: string;
  projectedMinutes: number;
  impactRating: number;
  usage: number;
  availability: "ACTIVE" | "QUESTIONABLE" | "DOUBTFUL" | "OUT" | "UNKNOWN";
  statusPenalty: number;
};

export type NbaRotationTeamLock = {
  teamName: string;
  projectedMinutesTotal: number;
  activeImpact: number;
  unavailableImpact: number;
  questionableImpact: number;
  topUsageActive: number;
  topUsageUnavailable: number;
  depthScore: number;
  lineupCertaintyScore: number;
  usageRedistributionScore: number;
  keyPlayersOut: string[];
  questionablePlayers: string[];
  rotationPlayers: NbaRotationLockPlayer[];
};

export type NbaRotationLock = {
  source: string;
  away: NbaRotationTeamLock;
  home: NbaRotationTeamLock;
  homeRotationEdge: number;
  lineupCertaintyScore: number;
  usageRedistributionScore: number;
  startersConfirmed: boolean;
  warnings: string[];
};

type Row = Record<string, unknown>;

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function availabilityFromRow(row: Row): NbaRotationLockPlayer["availability"] {
  const raw = text(row.availability, row.status, row.injuryStatus, row.injury_status, row.gameStatus, row.playerStatus)?.toUpperCase() ?? "";
  if (raw.includes("OUT") || raw.includes("INACTIVE") || raw.includes("SUSPENDED")) return "OUT";
  if (raw.includes("DOUBTFUL")) return "DOUBTFUL";
  if (raw.includes("QUESTIONABLE") || raw === "Q") return "QUESTIONABLE";
  if (raw.includes("ACTIVE") || raw.includes("PROBABLE") || raw.includes("AVAILABLE") || raw.includes("START")) return "ACTIVE";
  return "UNKNOWN";
}

function statusPenalty(status: NbaRotationLockPlayer["availability"]) {
  if (status === "OUT") return 1;
  if (status === "DOUBTFUL") return 0.75;
  if (status === "QUESTIONABLE") return 0.45;
  if (status === "UNKNOWN") return 0.18;
  return 0;
}

function teamPlayers(rows: Row[], teamName: string) {
  const key = normalizeName(teamName);
  return rows.filter((row) => {
    const candidates = [
      text(row.teamName), text(row.team), text(row.team_name), text(row.TEAM_NAME),
      text(row.teamAbbreviation), text(row.team_abbreviation), text(row.TEAM_ABBREVIATION)
    ].filter(Boolean) as string[];
    return candidates.some((candidate) => {
      const normalized = normalizeName(candidate);
      return normalized === key || normalized.endsWith(key) || key.endsWith(normalized);
    });
  });
}

function playerFromRow(row: Row, teamName: string, index: number): NbaRotationLockPlayer {
  const projectedMinutes = clamp(num(row.projectedMinutes, row.minutes, row.min, row.mpg, row.MIN, row.roleMinutes) ?? (index < 5 ? 30 - index * 2 : Math.max(8, 22 - index)), 0, 42);
  const impactRating = clamp(num(row.impactRating, row.epm, row.raptor, row.bpm, row.lebron, row.onOff, row.plusMinus, row.netOnOff) ?? 0, -12, 12);
  const usage = clamp(num(row.usage, row.usageRate, row.usg, row.USG_PCT) ?? (index < 5 ? 22 : 16), 0, 40);
  const availability = availabilityFromRow(row);
  return {
    name: text(row.playerName, row.name, row.player, row.PLAYER_NAME) ?? `Player ${index + 1}`,
    team: text(row.teamName, row.team, row.team_name, row.TEAM_NAME) ?? teamName,
    projectedMinutes,
    impactRating,
    usage,
    availability,
    statusPenalty: statusPenalty(availability)
  };
}

function buildFallbackPlayers(teamName: string): NbaRotationLockPlayer[] {
  return Array.from({ length: 8 }, (_, index) => ({
    name: `${teamName} rotation slot ${index + 1}`,
    team: teamName,
    projectedMinutes: index < 5 ? 30 - index * 2 : 16 - (index - 5) * 2,
    impactRating: index < 2 ? 2.2 - index * 0.6 : index < 5 ? 0.6 : -0.4,
    usage: index < 2 ? 25 - index * 2 : index < 5 ? 18 : 14,
    availability: "UNKNOWN" as const,
    statusPenalty: 0.18
  }));
}

function buildTeamLock(teamName: string, rows: Row[]): NbaRotationTeamLock {
  const realRows = teamPlayers(rows, teamName);
  const rotationPlayers = (realRows.length ? realRows : buildFallbackPlayers(teamName)).map((row, index) =>
    typeof row === "object" && "projectedMinutes" in row
      ? row as NbaRotationLockPlayer
      : playerFromRow(row as Row, teamName, index)
  ).sort((left, right) => right.projectedMinutes - left.projectedMinutes).slice(0, 12);

  const minuteTotal = rotationPlayers.reduce((sum, player) => sum + player.projectedMinutes, 0);
  const activePlayers = rotationPlayers.filter((player) => player.availability === "ACTIVE" || player.availability === "UNKNOWN");
  const unavailable = rotationPlayers.filter((player) => player.availability === "OUT" || player.availability === "DOUBTFUL");
  const questionable = rotationPlayers.filter((player) => player.availability === "QUESTIONABLE");

  const activeImpact = rotationPlayers.reduce((sum, player) => {
    const activeWeight = 1 - player.statusPenalty;
    return sum + player.impactRating * player.projectedMinutes * activeWeight;
  }, 0) / Math.max(1, minuteTotal);
  const unavailableImpact = unavailable.reduce((sum, player) => sum + Math.max(0, player.impactRating) * player.projectedMinutes, 0) / Math.max(1, minuteTotal);
  const questionableImpact = questionable.reduce((sum, player) => sum + Math.max(0, player.impactRating) * player.projectedMinutes * 0.45, 0) / Math.max(1, minuteTotal);
  const topUsageActive = activePlayers.slice(0, 5).reduce((sum, player) => sum + player.usage * player.projectedMinutes, 0) / Math.max(1, activePlayers.slice(0, 5).reduce((sum, player) => sum + player.projectedMinutes, 0));
  const topUsageUnavailable = unavailable.slice(0, 5).reduce((sum, player) => sum + player.usage * player.projectedMinutes, 0) / Math.max(1, unavailable.slice(0, 5).reduce((sum, player) => sum + player.projectedMinutes, 0));
  const depthScore = activePlayers.slice(5, 10).reduce((sum, player) => sum + player.impactRating * player.projectedMinutes, 0) / Math.max(1, activePlayers.slice(5, 10).reduce((sum, player) => sum + player.projectedMinutes, 0));
  const uncertaintyPenalty = rotationPlayers.reduce((sum, player) => sum + player.statusPenalty * Math.min(1, player.projectedMinutes / 30), 0) / Math.max(1, rotationPlayers.length);
  const lineupCertaintyScore = clamp(1 - uncertaintyPenalty, 0.1, 1);
  const usageRedistributionScore = clamp((topUsageUnavailable + questionableImpact * 8) / 30, 0, 1);

  return {
    teamName,
    projectedMinutesTotal: round(minuteTotal, 1),
    activeImpact: round(activeImpact, 3),
    unavailableImpact: round(unavailableImpact, 3),
    questionableImpact: round(questionableImpact, 3),
    topUsageActive: round(topUsageActive, 2),
    topUsageUnavailable: round(topUsageUnavailable, 2),
    depthScore: round(depthScore, 3),
    lineupCertaintyScore: round(lineupCertaintyScore, 3),
    usageRedistributionScore: round(usageRedistributionScore, 3),
    keyPlayersOut: unavailable.filter((player) => player.projectedMinutes >= 18 || player.usage >= 20 || player.impactRating >= 1.5).map((player) => player.name).slice(0, 5),
    questionablePlayers: questionable.filter((player) => player.projectedMinutes >= 16 || player.usage >= 18 || player.impactRating >= 1).map((player) => player.name).slice(0, 5),
    rotationPlayers
  };
}

export async function getNbaRotationLock(awayTeam: string, homeTeam: string): Promise<NbaRotationLock> {
  const feed = await readNbaWarehouseFeed("player").catch(() => ({ rows: [], warnings: ["player feed failed"] }));
  const rows = feed.rows ?? [];
  const away = buildTeamLock(awayTeam, rows);
  const home = buildTeamLock(homeTeam, rows);
  const homeRotationEdge = round((home.activeImpact - away.activeImpact) * 2.15 + (home.depthScore - away.depthScore) * 0.72 + (away.unavailableImpact - home.unavailableImpact) * 1.8 + (away.questionableImpact - home.questionableImpact) * 1.15, 3);
  const lineupCertaintyScore = round((away.lineupCertaintyScore + home.lineupCertaintyScore) / 2, 3);
  const usageRedistributionScore = round(Math.max(away.usageRedistributionScore, home.usageRedistributionScore), 3);
  const warnings = [
    ...(feed.warnings ?? []),
    rows.length ? null : "No real NBA player warehouse rows found; rotation lock is using conservative placeholders.",
    away.keyPlayersOut.length ? `${away.teamName} key absences: ${away.keyPlayersOut.join(", ")}` : null,
    home.keyPlayersOut.length ? `${home.teamName} key absences: ${home.keyPlayersOut.join(", ")}` : null,
    away.questionablePlayers.length ? `${away.teamName} questionable impact: ${away.questionablePlayers.join(", ")}` : null,
    home.questionablePlayers.length ? `${home.teamName} questionable impact: ${home.questionablePlayers.join(", ")}` : null,
    lineupCertaintyScore < 0.72 ? "NBA lineup certainty is below preferred threshold." : null,
    usageRedistributionScore > 0.28 ? "Usage redistribution risk is elevated." : null
  ].filter(Boolean) as string[];

  return {
    source: rows.length ? `nba-player-warehouse:${rows.length}` : "conservative-placeholder",
    away,
    home,
    homeRotationEdge,
    lineupCertaintyScore,
    usageRedistributionScore,
    startersConfirmed: lineupCertaintyScore >= 0.82 && usageRedistributionScore <= 0.22,
    warnings
  };
}
