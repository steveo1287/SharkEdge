import {
  buildVerifiedSportInputAudit,
  verifiedField,
  type VerifiedSportInputAudit
} from "@/services/verification/verified-sport-inputs";

type NflTeamEvidence = {
  teamId?: string | null;
  teamName?: string | null;
  activeRosterCount?: number | null;
  inactiveListVerified?: boolean | null;
  startingQbId?: string | null;
  offensiveLineStarterCount?: number | null;
  skillStarterCount?: number | null;
  defensiveStarterCount?: number | null;
  injuryReportUpdatedAt?: string | null;
  depthChartUpdatedAt?: string | null;
  pacePlaysPerGame?: number | null;
  passRateOverExpected?: number | null;
  offensiveEpaPerPlay?: number | null;
  defensiveEpaPerPlay?: number | null;
  pressureRate?: number | null;
  explosivePlayRate?: number | null;
};

export type NflVerifiedInputGateArgs = {
  eventId: string;
  gameDate?: string | null;
  venue?: string | null;
  roofType?: string | null;
  surface?: string | null;
  weatherObservedAt?: string | null;
  weatherSummary?: string | null;
  home: NflTeamEvidence;
  away: NflTeamEvidence;
  source?: string | null;
  checkedAt?: string;
};

function teamFields(prefix: "home" | "away", team: NflTeamEvidence, source: string | null) {
  const label = prefix === "home" ? "Home" : "Away";
  return [
    verifiedField({ key: `${prefix}.teamId`, label: `${label} stable team ID`, value: team.teamId, source }),
    verifiedField({ key: `${prefix}.teamName`, label: `${label} team`, value: team.teamName, source }),
    verifiedField({ key: `${prefix}.roster`, label: `${label} active roster`, value: team.activeRosterCount, source }),
    verifiedField({ key: `${prefix}.inactiveLock`, label: `${label} inactive list`, value: team.inactiveListVerified, source }),
    verifiedField({ key: `${prefix}.qb`, label: `${label} starting quarterback`, value: team.startingQbId, source }),
    verifiedField({ key: `${prefix}.ol`, label: `${label} offensive-line starters`, value: team.offensiveLineStarterCount, source }),
    verifiedField({ key: `${prefix}.skillStarters`, label: `${label} RB/WR/TE starters`, value: team.skillStarterCount, source }),
    verifiedField({ key: `${prefix}.defenseStarters`, label: `${label} defensive starters`, value: team.defensiveStarterCount, source }),
    verifiedField({ key: `${prefix}.injuryReport`, label: `${label} injury report timestamp`, value: team.injuryReportUpdatedAt, source }),
    verifiedField({ key: `${prefix}.depthChart`, label: `${label} depth chart timestamp`, value: team.depthChartUpdatedAt, source }),
    verifiedField({ key: `${prefix}.pace`, label: `${label} pace`, value: team.pacePlaysPerGame, source, required: false }),
    verifiedField({ key: `${prefix}.proe`, label: `${label} pass rate over expected`, value: team.passRateOverExpected, source, required: false }),
    verifiedField({ key: `${prefix}.offEpa`, label: `${label} offensive EPA/play`, value: team.offensiveEpaPerPlay, source, required: false }),
    verifiedField({ key: `${prefix}.defEpa`, label: `${label} defensive EPA/play`, value: team.defensiveEpaPerPlay, source, required: false }),
    verifiedField({ key: `${prefix}.pressure`, label: `${label} pressure rate`, value: team.pressureRate, source, required: false }),
    verifiedField({ key: `${prefix}.explosive`, label: `${label} explosive-play rate`, value: team.explosivePlayRate, source, required: false })
  ];
}

export function buildNflVerifiedInputAudit(args: NflVerifiedInputGateArgs): VerifiedSportInputAudit {
  const source = args.source ?? "NFL verified inputs";
  const fields = [
    verifiedField({ key: "game.date", label: "Official game date", value: args.gameDate, source }),
    verifiedField({ key: "game.venue", label: "Venue", value: args.venue, source }),
    verifiedField({ key: "game.roof", label: "Roof type", value: args.roofType, source, required: false }),
    verifiedField({ key: "game.surface", label: "Playing surface", value: args.surface, source, required: false }),
    verifiedField({ key: "weather.summary", label: "Weather", value: args.weatherSummary, source, required: false, observedAt: args.weatherObservedAt }),
    ...teamFields("away", args.away, source),
    ...teamFields("home", args.home, source)
  ];

  return buildVerifiedSportInputAudit({
    sport: "NFL",
    eventId: args.eventId,
    fields,
    checkedAt: args.checkedAt
  });
}

export function nflFinalSimulationPublishable(audit: VerifiedSportInputAudit) {
  if (audit.sport !== "NFL" || audit.state === "BLOCKED") return false;
  const requiredAtLock = new Set([
    "away.roster",
    "away.inactiveLock",
    "away.qb",
    "away.ol",
    "away.skillStarters",
    "away.defenseStarters",
    "home.roster",
    "home.inactiveLock",
    "home.qb",
    "home.ol",
    "home.skillStarters",
    "home.defenseStarters"
  ]);
  return audit.fields
    .filter((field) => requiredAtLock.has(field.key))
    .every((field) => field.state === "VERIFIED");
}
