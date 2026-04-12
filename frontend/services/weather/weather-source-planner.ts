
import type { OpportunityView } from "@/lib/types/opportunity";
import type { WeatherJoinStatus, WeatherSourcePlanView } from "@/services/weather/provider-types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function deriveJoinStatus(text: string, applicable: boolean, joinedPatterns: RegExp[]): WeatherJoinStatus {
  if (!applicable) return "NOT_APPLICABLE";
  if (hasAny(text, joinedPatterns)) return "JOINED";
  if (/weather|wind|rain|snow|roof|park|temperature|humidity|forecast|storm|metar|airport|asos|station/.test(text)) {
    return "PAYLOAD_ONLY";
  }
  return "MISSING";
}

function isOutdoorLeague(league: OpportunityView["league"]) {
  return ["MLB", "NFL", "NCAAF"].includes(league);
}

function inferSensitivity(opportunity: OpportunityView): WeatherSourcePlanView["sensitivity"] {
  if (!isOutdoorLeague(opportunity.league)) return "NOT_APPLICABLE";

  const market = normalize(opportunity.marketType);
  const selection = normalize(opportunity.selectionLabel);
  if (
    /total|runs|points|passing|kicking|field goal|home run|hits|strikeout|longest|yard/.test(
      `${market} ${selection}`
    )
  ) {
    return "HIGH";
  }

  if (/moneyline|spread|side|first half/.test(market)) {
    return "MEDIUM";
  }

  return "LOW";
}

export function buildWeatherSourcePlan(opportunity: OpportunityView): WeatherSourcePlanView {
  const applicable = isOutdoorLeague(opportunity.league);
  const sensitivity = inferSensitivity(opportunity);

  const sourceText = normalize(
    [
      opportunity.triggerSummary,
      opportunity.killSummary,
      opportunity.sourceNote,
      opportunity.reasonSummary,
      ...opportunity.whyItShows,
      ...opportunity.whatCouldKillIt
    ].join(" | ")
  );

  const stationJoinStatus = deriveJoinStatus(sourceText, applicable, [
    /metar/,
    /asos/,
    /station/,
    /airport/,
    /wx station/,
    /obs/
  ]);

  const venueJoinStatus = deriveJoinStatus(sourceText, applicable, [
    /venue/,
    /stadium/,
    /park factor/,
    /roof open/,
    /roof closed/,
    /ballpark/,
    /altitude/
  ]);

  const primaryObservationProvider = applicable ? "METAR" : null;
  const primaryForecastProvider =
    applicable && sensitivity === "HIGH" ? "HRRR" : applicable ? "NWS" : null;
  const visualizationProvider = applicable ? "WINDY" : null;
  const settlementProvider = applicable ? "METAR" : null;

  let confidence = 0;
  if (!applicable) confidence = 0;
  else {
    confidence =
      (stationJoinStatus === "JOINED" ? 44 : stationJoinStatus === "PAYLOAD_ONLY" ? 28 : 10) +
      (venueJoinStatus === "JOINED" ? 34 : venueJoinStatus === "PAYLOAD_ONLY" ? 22 : 8) +
      (sensitivity === "HIGH" ? 14 : sensitivity === "MEDIUM" ? 8 : 4);
  }

  confidence = clamp(confidence, 0, 100);

  const providerNotes: string[] = [];
  if (applicable) {
    providerNotes.push("Use METAR/ASOS as the observation truth layer when station mapping is available.");
    providerNotes.push(
      sensitivity === "HIGH"
        ? "Use HRRR near start time for short-horizon forecast updates."
        : "Use NWS as the default forecast baseline."
    );
    providerNotes.push(
      "Use Windy as the visualization/model-comparison layer, not the sole canonical truth source."
    );
    if (stationJoinStatus !== "JOINED") {
      providerNotes.push("Station join is not fully wired yet, so weather confidence should be capped.");
    }
    if (venueJoinStatus !== "JOINED") {
      providerNotes.push("Venue/roof/park join is not fully wired yet, so park-weather effects are incomplete.");
    }
  }

  const summary = !applicable
    ? "Weather sourcing is not a primary driver for this league."
    : stationJoinStatus === "JOINED" && venueJoinStatus === "JOINED"
      ? "Weather stack is source-planned with station and venue joins available."
      : stationJoinStatus !== "MISSING" || venueJoinStatus !== "MISSING"
        ? "Weather stack has partial context but still needs full station and venue joins."
        : "Weather stack is planned, but live station and venue joins are still missing.";

  return {
    applicable,
    sensitivity,
    primaryObservationProvider,
    primaryForecastProvider,
    visualizationProvider,
    settlementProvider,
    stationJoinStatus,
    venueJoinStatus,
    sourceConfidence: confidence,
    summary,
    providerNotes
  };
}
