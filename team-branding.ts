import type { LeagueKey, TeamRecord } from "@/lib/types/domain";

type BrandingPalette = {
  primary: string;
  secondary: string;
  ring: string;
};

const leaguePalettes: Partial<Record<LeagueKey, BrandingPalette>> = {
  NBA: { primary: "#0f172a", secondary: "#38bdf8", ring: "rgba(56,189,248,0.35)" },
  MLB: { primary: "#111827", secondary: "#34d399", ring: "rgba(52,211,153,0.35)" },
  NFL: { primary: "#111827", secondary: "#f59e0b", ring: "rgba(245,158,11,0.35)" },
  NHL: { primary: "#111827", secondary: "#a78bfa", ring: "rgba(167,139,250,0.35)" },
  NCAAB: { primary: "#0f172a", secondary: "#fb7185", ring: "rgba(251,113,133,0.35)" },
  NCAAF: { primary: "#0f172a", secondary: "#22c55e", ring: "rgba(34,197,94,0.35)" },
  UFC: { primary: "#111827", secondary: "#f43f5e", ring: "rgba(244,63,94,0.35)" },
  BOXING: { primary: "#111827", secondary: "#f97316", ring: "rgba(249,115,22,0.35)" }
};

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function colorFromHash(seed: number) {
  const hue = seed % 360;
  return `hsl(${hue} 84% 58%)`;
}

export function getTeamMonogram(team: TeamRecord) {
  const parts = team.name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return (team.abbreviation || team.name.slice(0, 2)).toUpperCase();
}

export function getTeamBranding(team: TeamRecord, leagueKey: LeagueKey) {
  const base = leaguePalettes[leagueKey] ?? {
    primary: "#0f172a",
    secondary: colorFromHash(hashString(team.name)),
    ring: "rgba(148,163,184,0.28)"
  };

  const fallback = colorFromHash(hashString(`${team.id}:${team.abbreviation}`));

  return {
    primary: base.primary,
    secondary: base.secondary || fallback,
    ring: base.ring,
    monogram: getTeamMonogram(team),
    background: `linear-gradient(135deg, ${base.primary} 0%, ${base.secondary} 100%)`
  };
}

export function getTeamLogoUrl(team: TeamRecord, leagueKey: LeagueKey) {
  const abbr = team.abbreviation?.toLowerCase();
  const espnId = team.externalIds?.espn;

  if (!abbr) {
    return null;
  }

  if (leagueKey === "NBA") return `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;
  if (leagueKey === "NFL") return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
  if (leagueKey === "MLB") return `https://a.espncdn.com/i/teamlogos/mlb/500/${abbr}.png`;
  if (leagueKey === "NHL") return `https://a.espncdn.com/i/teamlogos/nhl/500/${abbr}.png`;
  if (leagueKey === "NCAAB" && espnId) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;
  if (leagueKey === "NCAAF" && espnId) return `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png`;

  return null;
}
