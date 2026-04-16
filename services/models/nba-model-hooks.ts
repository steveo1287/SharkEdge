import type {
  LeagueKey,
  MatchupParticipantView,
  NbaModelFactorView,
  NbaModelHookView
} from "@/lib/types/domain";
import { getLeagueSnapshots } from "@/services/stats/stats-service";

type BuildNbaModelHookArgs = {
  leagueKey: LeagueKey;
  participants: MatchupParticipantView[];
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function readMetric(participant: MatchupParticipantView, labels: string[]) {
  const normalizedLabels = labels.map((label) => normalize(label));
  const metric = [...participant.stats, ...participant.boxscore, ...participant.leaders].find((entry) =>
    normalizedLabels.includes(normalize(entry.label))
  );

  if (!metric) {
    return null;
  }

  const parsed = Number(String(metric.value).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value: number | null, fallback = "--") {
  return typeof value === "number" ? String(Number(value.toFixed(1))) : fallback;
}

export async function buildNbaModelHook(
  args: BuildNbaModelHookArgs
): Promise<NbaModelHookView | null> {
  if (args.leagueKey !== "NBA") {
    return null;
  }

  const away =
    args.participants.find((participant) => participant.role === "AWAY") ??
    args.participants.find((participant) => participant.role === "COMPETITOR_A") ??
    null;
  const home =
    args.participants.find((participant) => participant.role === "HOME") ??
    args.participants.find((participant) => participant.role === "COMPETITOR_B") ??
    null;

  if (!away || !home) {
    return {
      available: false,
      source: "nba-hook",
      adjustedEfficiencyMargin: null,
      awayNetRating: null,
      homeNetRating: null,
      tempo: null,
      injuryImpactPoints: null,
      factors: [],
      note: "NBA model hooks are waiting on recognizable away/home participants."
    };
  }

  const snapshots = await getLeagueSnapshots("NBA");
  const standings = snapshots[0]?.standings ?? [];
  const awayStanding = standings.find(
    (entry) =>
      normalize(entry.team.name) === normalize(away.name) ||
      normalize(entry.team.abbreviation) === normalize(away.abbreviation)
  );
  const homeStanding = standings.find(
    (entry) =>
      normalize(entry.team.name) === normalize(home.name) ||
      normalize(entry.team.abbreviation) === normalize(home.abbreviation)
  );

  const awayNetRating = awayStanding?.netRating ?? readMetric(away, ["net rating", "point differential"]);
  const homeNetRating = homeStanding?.netRating ?? readMetric(home, ["net rating", "point differential"]);
  const awayTempo = readMetric(away, ["pace", "tempo"]);
  const homeTempo = readMetric(home, ["pace", "tempo"]);
  const tempo =
    typeof awayTempo === "number" && typeof homeTempo === "number"
      ? Number(((awayTempo + homeTempo) / 2).toFixed(1))
      : awayTempo ?? homeTempo ?? null;

  const factors: NbaModelFactorView[] = [
    {
      label: "eFG%",
      awayValue: formatValue(readMetric(away, ["efg", "efg%"])),
      homeValue: formatValue(readMetric(home, ["efg", "efg%"]))
    },
    {
      label: "TOV%",
      awayValue: formatValue(readMetric(away, ["turnover %", "turnover rate", "tov%"])),
      homeValue: formatValue(readMetric(home, ["turnover %", "turnover rate", "tov%"]))
    },
    {
      label: "ORB%",
      awayValue: formatValue(readMetric(away, ["off reb %", "orb%", "offensive rebound %"])),
      homeValue: formatValue(readMetric(home, ["off reb %", "orb%", "offensive rebound %"]))
    },
    {
      label: "FTr",
      awayValue: formatValue(readMetric(away, ["free throw rate", "ftr"])),
      homeValue: formatValue(readMetric(home, ["free throw rate", "ftr"]))
    }
  ].filter((factor) => factor.awayValue !== "--" || factor.homeValue !== "--");

  const adjustedEfficiencyMargin =
    typeof homeNetRating === "number" && typeof awayNetRating === "number"
      ? Number((homeNetRating - awayNetRating).toFixed(1))
      : null;

  const available =
    adjustedEfficiencyMargin !== null ||
    tempo !== null ||
    factors.length > 0 ||
    typeof awayNetRating === "number" ||
    typeof homeNetRating === "number";

  return {
    available,
    source: "nba standings + matchup context",
    adjustedEfficiencyMargin,
    awayNetRating: typeof awayNetRating === "number" ? Number(awayNetRating.toFixed(1)) : null,
    homeNetRating: typeof homeNetRating === "number" ? Number(homeNetRating.toFixed(1)) : null,
    tempo,
    injuryImpactPoints: null,
    factors,
    note: available
      ? "NBA hook is using real standings net rating and matchup stat context where the feed exposes it. Injury impact stays off until a cleaner player-value model lands."
      : "NBA hook is wired, but this matchup does not expose enough clean efficiency context yet."
  };
}
