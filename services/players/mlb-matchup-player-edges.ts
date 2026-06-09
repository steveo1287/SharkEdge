import { getMlbPlayerProfiles, type MlbPlayerProfileCard } from "@/services/players/mlb-player-profiles";

export type MlbMatchupTeamProfile = {
  team: string;
  topBats: MlbPlayerProfileCard[];
  topArms: MlbPlayerProfileCard[];
  lineupScore: number | null;
  starterScore: number | null;
  bullpenScore: number | null;
  runImpact: number | null;
  winImpactPct: number | null;
  xFactors: string[];
  risks: string[];
};

export type MlbMatchupPlayerEdgeBoard = {
  ok: boolean;
  generatedAt: string;
  awayTeam: string | null;
  homeTeam: string | null;
  away: MlbMatchupTeamProfile | null;
  home: MlbMatchupTeamProfile | null;
  edgeSummary: string[];
  marketLinks: Array<{ market: string; note: string; players: string[] }>;
  warnings: string[];
};

function avg(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return Number((nums.reduce((sum, value) => sum + value, 0) / nums.length).toFixed(1));
}

function sum(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!nums.length) return null;
  return Number(nums.reduce((total, value) => total + value, 0).toFixed(2));
}

function signed(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}` : "—";
}

function topTrait(profile: MlbPlayerProfileCard) {
  return [...profile.traits].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
}

function riskTrait(profile: MlbPlayerProfileCard) {
  return [...profile.traits].sort((a, b) => (a.score ?? 101) - (b.score ?? 101))[0];
}

function buildTeam(team: string, profiles: MlbPlayerProfileCard[]): MlbMatchupTeamProfile {
  const teamProfiles = profiles.filter((profile) => profile.team.toLowerCase() === team.toLowerCase());
  const bats = teamProfiles.filter((profile) => profile.role === "BATTER").sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const starters = teamProfiles.filter((profile) => profile.role === "STARTER").sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const relievers = teamProfiles.filter((profile) => profile.role === "RELIEVER" || profile.role === "PITCHER").sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const topBats = bats.slice(0, 5);
  const topArms = [...starters.slice(0, 2), ...relievers.slice(0, 3)].slice(0, 5);
  const lineupScore = avg(topBats.slice(0, 5).map((profile) => profile.overall));
  const starterScore = avg(starters.slice(0, 2).map((profile) => profile.overall));
  const bullpenScore = avg(relievers.slice(0, 5).map((profile) => profile.overall));
  const runImpact = sum([...topBats.slice(0, 5), ...starters.slice(0, 1)].map((profile) => profile.modelImpact.projectedRunImpact));
  const winImpactPct = sum([...topBats.slice(0, 5), ...starters.slice(0, 1)].map((profile) => profile.modelImpact.winProbabilityImpactPct));
  const xFactors = [...topBats.slice(0, 3), ...topArms.slice(0, 2)].map((profile) => {
    const trait = topTrait(profile);
    return `${profile.name}: ${trait?.label ?? "overall"} ${trait?.score ?? profile.overall ?? "—"}`;
  });
  const risks = [...teamProfiles]
    .map((profile) => ({ profile, trait: riskTrait(profile) }))
    .filter((item) => (item.trait?.score ?? 100) < 60 || item.profile.confidenceTier === "LOW" || item.profile.confidenceTier === "DATA_GAP")
    .sort((a, b) => (a.trait?.score ?? 100) - (b.trait?.score ?? 100))
    .slice(0, 4)
    .map((item) => `${item.profile.name}: ${item.trait?.label ?? "confidence"} ${item.trait?.score ?? item.profile.confidenceTier}`);

  return { team, topBats, topArms, lineupScore, starterScore, bullpenScore, runImpact, winImpactPct, xFactors, risks };
}

function marketLinks(away: MlbMatchupTeamProfile | null, home: MlbMatchupTeamProfile | null) {
  const allPlayers = [...(away?.topBats ?? []), ...(away?.topArms ?? []), ...(home?.topBats ?? []), ...(home?.topArms ?? [])];
  const topBats = allPlayers.filter((profile) => profile.role === "BATTER").slice(0, 6).map((profile) => profile.name);
  const topStarters = allPlayers.filter((profile) => profile.role === "STARTER").slice(0, 4).map((profile) => profile.name);
  return [
    { market: "Moneyline", note: "Use top bats, starter quality, and aggregate run impact as explanation context.", players: [...topBats.slice(0, 3), ...topStarters.slice(0, 2)] },
    { market: "Team totals", note: "Lineup score and damage bats are the primary player-card drivers.", players: topBats.slice(0, 5) },
    { market: "First five", note: "Starter score plus early-lineup pressure should dominate the explanation.", players: topStarters.slice(0, 4) },
    { market: "Pitcher props", note: "Strikeout, stamina, run-prevention, and freshness traits drive K/outs angles.", players: topStarters.slice(0, 4) },
    { market: "NRFI/YRFI", note: "Top-order bats and starter damage-avoidance should be surfaced together.", players: [...topBats.slice(0, 4), ...topStarters.slice(0, 2)] }
  ];
}

function summary(away: MlbMatchupTeamProfile | null, home: MlbMatchupTeamProfile | null) {
  if (!away || !home) return ["Add away and home team filters to build a matchup player-edge board."];
  const lines = [
    `${away.team} lineup ${away.lineupScore ?? "—"} vs ${home.team} lineup ${home.lineupScore ?? "—"}.`,
    `${away.team} starter ${away.starterScore ?? "—"} / bullpen ${away.bullpenScore ?? "—"}; ${home.team} starter ${home.starterScore ?? "—"} / bullpen ${home.bullpenScore ?? "—"}.`,
    `Player-card impact: ${away.team} ${signed(away.runImpact)} runs / ${signed(away.winImpactPct, "%")}; ${home.team} ${signed(home.runImpact)} runs / ${signed(home.winImpactPct, "%")}.`
  ];
  return lines;
}

export async function getMlbMatchupPlayerEdges(args: { away?: string | null; home?: string | null }): Promise<MlbMatchupPlayerEdgeBoard> {
  const awayTeam = args.away?.trim() || null;
  const homeTeam = args.home?.trim() || null;
  const data = await getMlbPlayerProfiles({ limit: 250 });
  const away = awayTeam ? buildTeam(awayTeam, data.profiles) : null;
  const home = homeTeam ? buildTeam(homeTeam, data.profiles) : null;
  const warnings = [...data.warnings];
  if (awayTeam && away && !away.topBats.length && !away.topArms.length) warnings.push(`No player cards found for away team ${awayTeam}.`);
  if (homeTeam && home && !home.topBats.length && !home.topArms.length) warnings.push(`No player cards found for home team ${homeTeam}.`);
  return {
    ok: data.ok,
    generatedAt: new Date().toISOString(),
    awayTeam,
    homeTeam,
    away,
    home,
    edgeSummary: summary(away, home),
    marketLinks: marketLinks(away, home),
    warnings
  };
}
