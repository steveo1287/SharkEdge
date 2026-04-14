import type { LeagueKey, TeamRecord } from "@/lib/types/domain";

const ESPN_LOGO_PATHS: Partial<Record<LeagueKey, string>> = {
  NBA: "nba/500",
  NCAAB: "ncaa/500",
  MLB: "mlb/500",
  NHL: "nhl/500",
  NFL: "nfl/500",
  NCAAF: "ncaa/500"
};

const LEAGUE_GRADIENTS: Partial<Record<LeagueKey, string>> = {
  NBA: "from-sky-500/20 via-cyan-500/10 to-transparent",
  NCAAB: "from-blue-500/20 via-sky-500/10 to-transparent",
  MLB: "from-emerald-500/20 via-teal-500/10 to-transparent",
  NHL: "from-slate-300/15 via-sky-500/10 to-transparent",
  NFL: "from-violet-500/20 via-sky-500/10 to-transparent",
  NCAAF: "from-amber-500/20 via-orange-500/10 to-transparent",
  UFC: "from-rose-500/20 via-orange-500/10 to-transparent",
  BOXING: "from-fuchsia-500/20 via-rose-500/10 to-transparent"
};

export function getTeamInitials(team: Pick<TeamRecord, "abbreviation" | "name">) {
  if (team.abbreviation?.trim()) return team.abbreviation.trim().slice(0, 4).toUpperCase();
  return team.name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export function getTeamLogoUrl(team: Pick<TeamRecord, "externalIds">, leagueKey: LeagueKey) {
  const espnId = team.externalIds?.espn;
  const path = ESPN_LOGO_PATHS[leagueKey];
  if (!espnId || !path) return null;
  return `https://a.espncdn.com/i/teamlogos/${path}/${espnId}.png`;
}

export function getLeagueGradient(leagueKey: LeagueKey) {
  return LEAGUE_GRADIENTS[leagueKey] ?? "from-sky-500/15 via-white/5 to-transparent";
}

export function getStatusTone(status: string) {
  if (status === "LIVE") return "text-emerald-300 border-emerald-400/20 bg-emerald-500/10";
  if (status === "FINAL") return "text-slate-200 border-white/10 bg-white/[0.04]";
  if (status === "POSTPONED" || status === "CANCELED") return "text-amber-200 border-amber-400/20 bg-amber-500/10";
  return "text-sky-200 border-sky-400/20 bg-sky-500/10";
}

export function formatCompactTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "TBD";
  return new Date(parsed).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatCompactDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Date TBD";
  return new Date(parsed).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "—";
  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
}
