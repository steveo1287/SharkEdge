import { getLockedPickTickets } from "@/services/proof/locked-pick-tickets";
import { getTicketPlayerLinks } from "@/services/proof/ticket-player-links";
import { getMlbPlayerMarketDrivers, type MlbPlayerDriverMarket } from "@/services/players/mlb-player-market-drivers";
import { getMlbPlayerProfiles, type MlbPlayerProfileCard } from "@/services/players/mlb-player-profiles";

export type MlbPlayerCardGradeStatus = "PASS" | "WARN" | "FAIL";

export type MlbPlayerCardGradeCheck = {
  key: string;
  label: string;
  status: MlbPlayerCardGradeStatus;
  score: number;
  detail: string;
};

export type MlbPlayerCardGradeMarket = {
  market: MlbPlayerDriverMarket;
  drivers: number;
  topDriver: string | null;
  topScore: number | null;
};

const MARKETS: MlbPlayerDriverMarket[] = ["moneyline", "team_total", "first_five", "pitcher_strikeouts", "pitcher_outs", "nrfi_yrfi", "player_props"];

function pct(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function status(score: number): MlbPlayerCardGradeStatus {
  if (score >= 82) return "PASS";
  if (score >= 55) return "WARN";
  return "FAIL";
}

function letter(score: number) {
  if (score >= 97) return "A+";
  if (score >= 92) return "A";
  if (score >= 88) return "A-";
  if (score >= 82) return "B+";
  if (score >= 76) return "B";
  if (score >= 70) return "B-";
  if (score >= 64) return "C+";
  if (score >= 58) return "C";
  return "Needs buildout";
}

function roleCounts(profiles: MlbPlayerProfileCard[]) {
  return {
    batters: profiles.filter((profile) => profile.role === "BATTER").length,
    starters: profiles.filter((profile) => profile.role === "STARTER").length,
    relievers: profiles.filter((profile) => profile.role === "RELIEVER").length,
    pitchers: profiles.filter((profile) => profile.role === "PITCHER").length
  };
}

function coverageScore(profiles: MlbPlayerProfileCard[]) {
  const roles = roleCounts(profiles);
  const profileScore = Math.min(35, profiles.length * 0.2);
  const batterScore = Math.min(25, roles.batters * 0.35);
  const starterScore = Math.min(25, roles.starters * 1.5);
  const bullpenScore = Math.min(15, (roles.relievers + roles.pitchers) * 0.7);
  return Math.round(profileScore + batterScore + starterScore + bullpenScore);
}

function freshnessScore(profiles: MlbPlayerProfileCard[]) {
  if (!profiles.length) return 0;
  const high = profiles.filter((profile) => profile.confidenceTier === "HIGH").length;
  const medium = profiles.filter((profile) => profile.confidenceTier === "MEDIUM").length;
  return Math.round(Math.min(100, ((high * 1 + medium * 0.65) / profiles.length) * 100));
}

function traitDepthScore(profiles: MlbPlayerProfileCard[]) {
  if (!profiles.length) return 0;
  const withTraits = profiles.filter((profile) => profile.traits.filter((trait) => trait.score != null).length >= 5).length;
  return Math.round((withTraits / profiles.length) * 100);
}

function impactScore(profiles: MlbPlayerProfileCard[]) {
  if (!profiles.length) return 0;
  const withImpact = profiles.filter((profile) => profile.modelImpact.projectedRunImpact != null || profile.modelImpact.winProbabilityImpactPct != null).length;
  return Math.round((withImpact / profiles.length) * 100);
}

export async function getMlbPlayerCardGrade() {
  const [profilesData, ...driverBoards] = await Promise.all([
    getMlbPlayerProfiles({ limit: 250 }),
    ...MARKETS.map((market) => getMlbPlayerMarketDrivers({ market, limit: 30 }))
  ]);

  const profiles = profilesData.profiles;
  const markets: MlbPlayerCardGradeMarket[] = driverBoards.map((board) => ({
    market: board.market,
    drivers: board.count,
    topDriver: board.drivers[0]?.name ?? null,
    topScore: board.drivers[0]?.driverScore ?? null
  }));

  const tickets = await getLockedPickTickets(12);
  const ticketSample = tickets.tickets.slice(0, 6);
  const ticketLinks = await Promise.all(ticketSample.map((ticket) => getTicketPlayerLinks(ticket)));
  const ticketEdgeHitRate = pct(ticketLinks.filter((link) => link.edgeCount > 0).length, ticketLinks.length) ?? 0;

  const marketCoverage = Math.round((markets.filter((market) => market.drivers > 0).length / MARKETS.length) * 100);
  const avgTopDriverScore = avg(markets.map((market) => market.topScore ?? 0).filter((score) => score > 0));
  const coverage = coverageScore(profiles);
  const freshness = freshnessScore(profiles);
  const traitDepth = traitDepthScore(profiles);
  const impact = impactScore(profiles);

  const checks: MlbPlayerCardGradeCheck[] = [
    { key: "profile_coverage", label: "Profile coverage", score: coverage, status: status(coverage), detail: `${profiles.length} player cards loaded across batter/starter/bullpen roles.` },
    { key: "freshness", label: "Freshness confidence", score: freshness, status: status(freshness), detail: `${profiles.filter((profile) => profile.confidenceTier === "HIGH").length} HIGH confidence cards and ${profiles.filter((profile) => profile.confidenceTier === "MEDIUM").length} MEDIUM confidence cards.` },
    { key: "trait_depth", label: "Trait depth", score: traitDepth, status: status(traitDepth), detail: "Share of cards with at least five scored traits." },
    { key: "model_impact", label: "Model impact coverage", score: impact, status: status(impact), detail: "Share of cards with run or win-probability impact attached." },
    { key: "market_drivers", label: "Market driver coverage", score: marketCoverage, status: status(marketCoverage), detail: `${markets.filter((market) => market.drivers > 0).length}/${MARKETS.length} markets have ranked player drivers.` },
    { key: "driver_quality", label: "Top-driver quality", score: Math.round(avgTopDriverScore), status: status(avgTopDriverScore), detail: `Average top-driver score across active markets is ${avgTopDriverScore}.` },
    { key: "ticket_wiring", label: "Ticket player wiring", score: Math.round(ticketEdgeHitRate), status: status(ticketEdgeHitRate), detail: `${ticketLinks.filter((link) => link.edgeCount > 0).length}/${ticketLinks.length} sampled locked tickets returned player edges.` }
  ];

  const weightedScore = Math.round(
    checks.find((check) => check.key === "profile_coverage")!.score * 0.18 +
    checks.find((check) => check.key === "freshness")!.score * 0.14 +
    checks.find((check) => check.key === "trait_depth")!.score * 0.16 +
    checks.find((check) => check.key === "model_impact")!.score * 0.16 +
    checks.find((check) => check.key === "market_drivers")!.score * 0.14 +
    checks.find((check) => check.key === "driver_quality")!.score * 0.1 +
    checks.find((check) => check.key === "ticket_wiring")!.score * 0.12
  );

  const warnings = [...new Set([
    ...profilesData.warnings,
    ...driverBoards.flatMap((board) => board.warnings),
    ...tickets.warnings,
    ...ticketLinks.flatMap((link) => link.warnings)
  ])].slice(0, 10);

  return {
    ok: checks.every((check) => check.status !== "FAIL"),
    generatedAt: new Date().toISOString(),
    score: weightedScore,
    grade: letter(weightedScore),
    target: "A+",
    gapToAPlus: Math.max(0, 97 - weightedScore),
    summary: {
      profiles: profiles.length,
      ...roleCounts(profiles),
      highConfidence: profiles.filter((profile) => profile.confidenceTier === "HIGH").length,
      mediumConfidence: profiles.filter((profile) => profile.confidenceTier === "MEDIUM").length,
      ticketSampleSize: ticketLinks.length,
      ticketEdgeHitRate,
      activeDriverMarkets: markets.filter((market) => market.drivers > 0).length
    },
    checks,
    markets,
    nextBuildPriorities: checks
      .filter((check) => check.score < 92)
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
      .map((check) => ({ key: check.key, label: check.label, currentScore: check.score, needed: 92 - check.score })),
    warnings
  };
}
